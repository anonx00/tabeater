import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { colors, spacing, typography, borderRadius, transitions, faviconFallback, scanlineOverlay } from '../shared/theme';
import { formatMarkdown } from '../shared/markdown';
import { ScanlineOverlay } from '../ui/components/ScanlineOverlay';
import { TypewriterText } from '../ui/components/TypewriterText';
import { MicroLabel } from '../ui/components/MicroLabel';
import { ScrambleText } from '../ui/components/ScrambleText';
import * as webllm from '@mlc-ai/web-llm';

// WebLLM Model ID - Default to Llama 3.2 3B for best quality
const WEBLLM_MODEL_ID = 'Llama-3.2-3B-Instruct-q4f16_1-MLC';

// Global WebLLM engine for this page context
let webllmEngine: webllm.MLCEngineInterface | null = null;
let webllmInitializing = false;

interface TabInfo {
    id: number;
    title: string;
    url: string;
    favIconUrl?: string;
    active: boolean;
    windowId: number;
}

interface TabGroup {
    id: string;
    name: string;
    tabs: TabInfo[];
}

interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

interface APIUsageStats {
    totalCalls: number;
    todayCalls: number;
    hourCalls: number;
    estimatedCost: number;
    limits: {
        maxPerHour: number;
        maxPerDay: number;
    };
    nearLimit: boolean;
    provider: string;
}

const Sidepanel = () => {
    const [tabs, setTabs] = useState<TabInfo[]>([]);
    const [groups, setGroups] = useState<TabGroup[]>([]);
    const [view, setView] = useState<'list' | 'grouped'>('grouped');
    const [chatInput, setChatInput] = useState('');
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const [loading, setLoading] = useState(false);
    const [provider, setProvider] = useState('none');
    const [hoveredTab, setHoveredTab] = useState<number | null>(null);
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
    const [apiStats, setApiStats] = useState<APIUsageStats | null>(null);
    const [showStats, setShowStats] = useState(false);
    const chatEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        initializeAndLoad();

        // Event-driven updates instead of polling
        const handleTabUpdated = () => {
            loadData();
        };

        const handleTabCreated = () => {
            loadData();
        };

        const handleTabRemoved = () => {
            loadData();
        };

        const handleTabActivated = () => {
            loadData();
        };

        // Listen to Chrome tab events
        chrome.tabs.onUpdated.addListener(handleTabUpdated);
        chrome.tabs.onCreated.addListener(handleTabCreated);
        chrome.tabs.onRemoved.addListener(handleTabRemoved);
        chrome.tabs.onActivated.addListener(handleTabActivated);

        // Cleanup listeners on unmount
        return () => {
            chrome.tabs.onUpdated.removeListener(handleTabUpdated);
            chrome.tabs.onCreated.removeListener(handleTabCreated);
            chrome.tabs.onRemoved.removeListener(handleTabRemoved);
            chrome.tabs.onActivated.removeListener(handleTabActivated);
        };
    }, []);

    useEffect(() => {
        // Auto-scroll to bottom of chat when new messages arrive
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatMessages]);

    // Expand all groups by default
    useEffect(() => {
        if (groups.length > 0 && expandedGroups.size === 0) {
            setExpandedGroups(new Set(groups.map(g => g.id)));
        }
    }, [groups]);

    const sendMessage = useCallback(async (action: string, payload?: any) => {
        const response = await chrome.runtime.sendMessage({ action, payload });
        return response;
    }, []);

    const initializeAndLoad = async () => {
        await sendMessage('reinitializeAI');
        await loadData();
    };

    const loadData = async () => {
        const [tabsRes, groupsRes, providerRes, statsRes] = await Promise.all([
            sendMessage('getTabs'),
            sendMessage('getGroupedByDomain'),
            sendMessage('getAIProvider'),
            sendMessage('getAPIUsageStats')
        ]);

        if (tabsRes.success) setTabs(tabsRes.data);
        if (groupsRes.success) setGroups(groupsRes.data);
        if (statsRes.success) setApiStats(statsRes.data);

        // Check if WebLLM is preferred (stored in local storage)
        const stored = await chrome.storage.local.get(['aiConfig', 'webllmReady']);
        if (stored.aiConfig?.preferWebLLM || stored.webllmReady) {
            setProvider('webllm');
        } else if (providerRes.success) {
            setProvider(providerRes.data.provider);
        }
    };

    const switchToTab = useCallback((tabId: number, windowId: number) => {
        chrome.windows.update(windowId, { focused: true });
        chrome.tabs.update(tabId, { active: true });
    }, []);

    const closeTab = useCallback(async (tabId: number) => {
        // Optimistic UI update
        setTabs(prev => prev.filter(t => t.id !== tabId));
        setGroups(prev => prev.map(g => ({
            ...g,
            tabs: g.tabs.filter(t => t.id !== tabId)
        })).filter(g => g.tabs.length > 0));

        // Perform actual close
        await sendMessage('closeTab', { tabId });
    }, [sendMessage]);

    const toggleGroup = useCallback((groupId: string) => {
        setExpandedGroups(prev => {
            const next = new Set(prev);
            if (next.has(groupId)) {
                next.delete(groupId);
            } else {
                next.add(groupId);
            }
            return next;
        });
    }, []);

    // Initialize WebLLM in this page context
    const initWebLLM = useCallback(async (): Promise<boolean> => {
        if (webllmEngine) return true;
        if (webllmInitializing) {
            // Wait for existing initialization
            while (webllmInitializing) {
                await new Promise(r => setTimeout(r, 100));
            }
            return webllmEngine !== null;
        }

        webllmInitializing = true;
        try {
            webllmEngine = await webllm.CreateMLCEngine(WEBLLM_MODEL_ID, {
                initProgressCallback: (progress) => {
                    console.log('[WebLLM Sidepanel]', progress.text);
                },
            });
            webllmInitializing = false;
            return true;
        } catch (err) {
            console.error('[WebLLM Sidepanel] Init failed:', err);
            webllmInitializing = false;
            return false;
        }
    }, []);

    // Use WebLLM directly for inference
    const askWebLLM = useCallback(async (prompt: string): Promise<string> => {
        if (!webllmEngine) {
            const ok = await initWebLLM();
            if (!ok) throw new Error('Failed to initialize Local AI');
        }

        const response = await webllmEngine!.chat.completions.create({
            messages: [
                {
                    role: 'system',
                    content: `You are TabEater, a helpful browser tab assistant.
Rules:
- Give SHORT, direct answers (2-3 sentences max)
- Never repeat yourself
- Never use numbered lists with more than 5 items
- If asked about tabs, briefly summarize what you see
- Be conversational, not robotic`
                },
                { role: 'user', content: prompt }
            ],
            max_tokens: 200,
            temperature: 0.7,
            frequency_penalty: 1.5,  // Strongly penalize repetition
            presence_penalty: 1.0,   // Encourage new topics
        });

        let content = response.choices[0]?.message?.content || 'No response';

        // Post-process: detect and cut off repetition
        const lines = content.split('\n');
        const seenLines = new Set<string>();
        const uniqueLines: string[] = [];
        let repetitionCount = 0;

        for (const line of lines) {
            const normalized = line.trim().toLowerCase();
            if (normalized.length < 5) {
                uniqueLines.push(line);
                continue;
            }
            if (seenLines.has(normalized)) {
                repetitionCount++;
                if (repetitionCount > 2) break; // Stop after 2 repeated lines
            } else {
                seenLines.add(normalized);
                uniqueLines.push(line);
                repetitionCount = 0;
            }
        }

        return uniqueLines.join('\n').trim() || 'I can help you organize your tabs. What would you like to know?';
    }, [initWebLLM]);

    const askAI = useCallback(async () => {
        if (!chatInput.trim()) return;
        if (provider === 'none') {
            setChatMessages(prev => [...prev, { role: 'assistant', content: 'Please configure an AI provider in Settings first.' }]);
            return;
        }

        const userMessage = chatInput;
        setChatInput('');
        setChatMessages(prev => [...prev, { role: 'user', content: userMessage }]);
        setLoading(true);

        try {
            // Limit tab context to first 15 tabs for small models
            const limitedTabs = tabs.slice(0, 15);
            const tabContext = limitedTabs.map(t => {
                try {
                    const host = new URL(t.url).hostname.replace('www.', '');
                    return `${t.title.substring(0, 30)} (${host})`;
                } catch {
                    return t.title.substring(0, 30);
                }
            }).join('; ');

            const prompt = `You have ${tabs.length} tabs. Here are some: ${tabContext}${tabs.length > 15 ? '...' : ''}\n\nQuestion: ${userMessage}\n\nAnswer briefly:`;

            let aiResponse: string;

            // Use WebLLM directly if it's the provider (runs in page context)
            if (provider === 'webllm') {
                aiResponse = await askWebLLM(prompt);
            } else {
                // Use service worker for cloud providers
                const response = await sendMessage('askAI', { prompt });
                if (response.success) {
                    aiResponse = response.data.response;
                } else {
                    throw new Error(response.error || 'AI request failed');
                }
            }

            setChatMessages(prev => [...prev, { role: 'assistant', content: aiResponse }]);

            // Refresh stats after AI call
            const statsRes = await sendMessage('getAPIUsageStats');
            if (statsRes.success) setApiStats(statsRes.data);
        } catch (err: any) {
            setChatMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}` }]);
        }
        setLoading(false);
    }, [chatInput, provider, tabs, sendMessage, askWebLLM]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            askAI();
        }
    }, [askAI]);

    const getHostname = (url: string) => {
        try {
            return new URL(url).hostname;
        } catch {
            return url;
        }
    };

    const getProviderDisplay = () => {
        const labels: Record<string, string> = {
            webllm: 'Local AI',
            nano: 'Nano',
            gemini: 'Gemini',
            openai: 'OpenAI',
            anthropic: 'Claude',
            none: 'Not configured'
        };
        return labels[provider] || provider;
    };

    const presetPrompts = [
        { label: 'Organize', prompt: 'Analyze my tabs and suggest how to organize them into groups', icon: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z' },
        { label: 'Duplicates', prompt: 'Find and list any duplicate or similar tabs I have open', icon: 'M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z' },
        { label: 'Priority', prompt: 'Which tabs should I focus on first based on my current tabs?', icon: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z' },
        { label: 'Cleanup', prompt: 'Which tabs can I safely close without losing important work?', icon: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16' },
    ];

    const handlePresetClick = (prompt: string) => {
        setChatInput(prompt);
    };

    return (
        <div style={styles.container}>
            {/* Header */}
            <header style={styles.header}>
                <div style={styles.headerTop}>
                    <div>
                        <h1 style={styles.title}>
                            <ScrambleText text="TabEater" speed={40} scrambleIterations={2} />
                        </h1>
                        <MicroLabel label="ACTIVE" value={`${tabs.length} tabs`} />
                    </div>
                    <div style={{ display: 'flex', gap: spacing.sm }}>
                        <button
                            style={styles.settingsBtn}
                            onClick={() => chrome.runtime.openOptionsPage()}
                            title="Settings"
                            aria-label="Open Settings"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="3" />
                                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                            </svg>
                        </button>
                        <button
                            style={styles.closeBtn}
                            onClick={() => window.close()}
                            title="Close Sidebar"
                            aria-label="Close Sidebar"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M18 6 6 18M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>
                <div style={styles.stats}>
                    <span style={styles.statItem}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                        </svg>
                        {tabs.length} tabs
                    </span>
                    <span style={styles.statDivider}>|</span>
                    <span style={styles.statItem}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                        </svg>
                        {groups.length} domains
                    </span>
                    <span style={styles.statDivider}>|</span>
                    <button
                        style={styles.statsToggle}
                        onClick={() => setShowStats(!showStats)}
                        title="View API usage stats"
                    >
                        <span style={{ color: provider === 'none' ? colors.error : colors.primary }}>
                            AI: {getProviderDisplay()}
                        </span>
                        {apiStats && provider !== 'none' && provider !== 'nano' && (
                            <span style={apiStats.nearLimit ? styles.statWarning : styles.statNormal}>
                                {apiStats.todayCalls}/{apiStats.limits.maxPerDay}
                            </span>
                        )}
                    </button>
                </div>
                {/* API Usage Stats Panel */}
                {showStats && apiStats && (
                    <div style={styles.statsPanel}>
                        <div style={styles.statsPanelHeader}>
                            <span>Session Stats</span>
                            <span style={styles.statsPanelProvider}>{apiStats.provider.toUpperCase()}</span>
                        </div>
                        <div style={styles.statsPanelGrid}>
                            <div style={styles.statsPanelItem}>
                                <span style={styles.statsPanelLabel}>This Hour</span>
                                <span style={styles.statsPanelValue}>{apiStats.hourCalls}/{apiStats.limits.maxPerHour}</span>
                            </div>
                            <div style={styles.statsPanelItem}>
                                <span style={styles.statsPanelLabel}>Today</span>
                                <span style={styles.statsPanelValue}>{apiStats.todayCalls}/{apiStats.limits.maxPerDay}</span>
                            </div>
                            <div style={styles.statsPanelItem}>
                                <span style={styles.statsPanelLabel}>Total Calls</span>
                                <span style={styles.statsPanelValue}>{apiStats.totalCalls}</span>
                            </div>
                            <div style={styles.statsPanelItem}>
                                <span style={styles.statsPanelLabel}>Est. Cost</span>
                                <span style={styles.statsPanelValue}>
                                    {apiStats.provider === 'nano' ? 'FREE' : `$${(apiStats.estimatedCost / 100).toFixed(4)}`}
                                </span>
                            </div>
                        </div>
                        {apiStats.nearLimit && (
                            <div style={styles.statsPanelWarning}>
                                ⚠ Approaching rate limit
                            </div>
                        )}
                    </div>
                )}
            </header>

            {/* View Toggle */}
            <div style={styles.viewToggle}>
                <button
                    style={{ ...styles.toggleBtn, ...(view === 'grouped' ? styles.toggleActive : {}) }}
                    onClick={() => setView('grouped')}
                    aria-pressed={view === 'grouped'}
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                    By Domain
                </button>
                <button
                    style={{ ...styles.toggleBtn, ...(view === 'list' ? styles.toggleActive : {}) }}
                    onClick={() => setView('list')}
                    aria-pressed={view === 'list'}
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="8" y1="6" x2="21" y2="6" />
                        <line x1="8" y1="12" x2="21" y2="12" />
                        <line x1="8" y1="18" x2="21" y2="18" />
                        <line x1="3" y1="6" x2="3.01" y2="6" />
                        <line x1="3" y1="12" x2="3.01" y2="12" />
                        <line x1="3" y1="18" x2="3.01" y2="18" />
                    </svg>
                    All Tabs
                </button>
            </div>

            {/* Content Area */}
            <div style={styles.content}>
                {view === 'grouped' && (
                    <div style={styles.groupList}>
                        {groups.length === 0 ? (
                            <div style={styles.emptyState}>No tabs open</div>
                        ) : (
                            groups.map(group => (
                                <div key={group.id} style={styles.group}>
                                    <button
                                        style={styles.groupHeader}
                                        onClick={() => toggleGroup(group.id)}
                                        aria-expanded={expandedGroups.has(group.id)}
                                    >
                                        <span style={styles.groupName}>
                                            <svg
                                                width="10"
                                                height="10"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="2"
                                                style={{
                                                    transform: expandedGroups.has(group.id) ? 'rotate(90deg)' : 'rotate(0deg)',
                                                    transition: `transform ${transitions.fast}`,
                                                    marginRight: spacing.sm,
                                                }}
                                            >
                                                <path d="m9 18 6-6-6-6" />
                                            </svg>
                                            {group.name}
                                        </span>
                                        <span style={styles.groupCount}>{group.tabs.length}</span>
                                    </button>
                                    {expandedGroups.has(group.id) && (
                                        <div style={styles.groupTabs}>
                                            {group.tabs.map(tab => (
                                                <div
                                                    key={tab.id}
                                                    style={{
                                                        ...styles.tabItem,
                                                        ...(hoveredTab === tab.id ? styles.tabItemHover : {}),
                                                        ...(tab.active ? styles.tabItemActive : {}),
                                                    }}
                                                    onClick={() => switchToTab(tab.id, tab.windowId)}
                                                    onMouseEnter={() => setHoveredTab(tab.id)}
                                                    onMouseLeave={() => setHoveredTab(null)}
                                                    role="button"
                                                    tabIndex={0}
                                                    onKeyDown={(e) => e.key === 'Enter' && switchToTab(tab.id, tab.windowId)}
                                                >
                                                    <img
                                                        src={tab.favIconUrl || faviconFallback}
                                                        style={styles.favicon}
                                                        alt=""
                                                        onError={(e) => { e.currentTarget.src = faviconFallback; }}
                                                    />
                                                    <span style={styles.tabTitle}>{tab.title || 'Untitled'}</span>
                                                    <button
                                                        style={{
                                                            ...styles.tabCloseBtn,
                                                            opacity: hoveredTab === tab.id ? 1 : 0,
                                                        }}
                                                        onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                                                        aria-label={`Close ${tab.title}`}
                                                    >
                                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                            <path d="M18 6 6 18M6 6l12 12" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                )}

                {view === 'list' && (
                    <div style={styles.tabList}>
                        {tabs.length === 0 ? (
                            <div style={styles.emptyState}>No tabs open</div>
                        ) : (
                            tabs.map(tab => (
                                <div
                                    key={tab.id}
                                    style={{
                                        ...styles.tabItemFull,
                                        ...(hoveredTab === tab.id ? styles.tabItemHover : {}),
                                        ...(tab.active ? styles.tabItemActive : {}),
                                    }}
                                    onClick={() => switchToTab(tab.id, tab.windowId)}
                                    onMouseEnter={() => setHoveredTab(tab.id)}
                                    onMouseLeave={() => setHoveredTab(null)}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={(e) => e.key === 'Enter' && switchToTab(tab.id, tab.windowId)}
                                >
                                    <img
                                        src={tab.favIconUrl || faviconFallback}
                                        style={styles.favicon}
                                        alt=""
                                        onError={(e) => { e.currentTarget.src = faviconFallback; }}
                                    />
                                    <div style={styles.tabInfo}>
                                        <div style={styles.tabTitleFull}>{tab.title || 'Untitled'}</div>
                                        <div style={styles.tabUrl}>{getHostname(tab.url)}</div>
                                    </div>
                                    <button
                                        style={{
                                            ...styles.tabCloseBtn,
                                            opacity: hoveredTab === tab.id ? 1 : 0,
                                        }}
                                        onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                                        aria-label={`Close ${tab.title}`}
                                    >
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                            <path d="M18 6 6 18M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>

            {/* Chat Section */}
            <div style={styles.chatSection}>
                <div style={styles.chatHeader}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                    AI Assistant
                    {provider !== 'none' && <span style={styles.providerBadge}>{getProviderDisplay()}</span>}
                </div>
                {/* Preset Prompts */}
                {provider !== 'none' && chatMessages.length === 0 && (
                    <div style={styles.presetRow}>
                        {presetPrompts.map(({ label, prompt, icon }) => (
                            <button
                                key={label}
                                style={styles.presetBtn}
                                onClick={() => handlePresetClick(prompt)}
                                title={prompt}
                            >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d={icon} />
                                </svg>
                                {label}
                            </button>
                        ))}
                    </div>
                )}
                <div style={styles.chatMessages}>
                    {chatMessages.length === 0 && (
                        <div style={styles.chatPlaceholder}>
                            {provider === 'none'
                                ? 'Configure AI in settings to use the assistant'
                                : 'Select a quick action above or type your question...'}
                        </div>
                    )}
                    {chatMessages.map((msg, i) => {
                        const isLastAssistantMessage = msg.role === 'assistant' &&
                            i === chatMessages.length - 1 &&
                            !loading;

                        return (
                            <div
                                key={i}
                                style={msg.role === 'user' ? styles.userMessage : styles.assistantMessage}
                            >
                                {msg.role === 'assistant' ? (
                                    isLastAssistantMessage ? (
                                        <TypewriterText text={msg.content} speed={20}>
                                            {(text) => formatMarkdown(text)}
                                        </TypewriterText>
                                    ) : (
                                        formatMarkdown(msg.content)
                                    )
                                ) : (
                                    msg.content
                                )}
                            </div>
                        );
                    })}
                    {loading && (
                        <div style={styles.loadingMessage}>
                            <div style={styles.loadingDots}>
                                <span style={styles.dot} />
                                <span style={{ ...styles.dot, animationDelay: '0.2s' }} />
                                <span style={{ ...styles.dot, animationDelay: '0.4s' }} />
                            </div>
                        </div>
                    )}
                    <div ref={chatEndRef} />
                </div>
                <div style={styles.chatInputRow}>
                    <input
                        type="text"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={provider === 'none' ? 'AI not configured...' : 'Ask about your tabs...'}
                        disabled={provider === 'none'}
                        style={styles.chatInput}
                        aria-label="Chat input"
                    />
                    <button
                        style={{
                            ...styles.sendBtn,
                            ...(provider === 'none' || loading || !chatInput.trim() ? styles.sendBtnDisabled : {}),
                        }}
                        onClick={askAI}
                        disabled={provider === 'none' || loading || !chatInput.trim()}
                        aria-label="Send message"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="22" y1="2" x2="11" y2="13" />
                            <polygon points="22 2 15 22 11 13 2 9 22 2" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* MGS Scanline Overlay */}
            <ScanlineOverlay />
        </div>
    );
};

const styles: { [key: string]: React.CSSProperties } = {
    container: {
        height: '100vh',
        background: colors.voidBlack,
        color: colors.textSecondary,
        fontFamily: typography.fontFamily,
        fontSize: typography.sizeLg,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
    },
    header: {
        padding: spacing.lg,
        borderBottom: `1px solid ${colors.borderIdle}`,
        background: colors.panelGrey,
        flexShrink: 0,
    },
    headerTop: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacing.sm,
    },
    title: {
        margin: 0,
        fontFamily: typography.fontMono,
        fontSize: typography.sizeDisplay,
        fontWeight: typography.bold,
        color: colors.phosphorGreen,
        letterSpacing: '0.1em',
    },
    settingsBtn: {
        background: 'transparent',
        border: `1px solid ${colors.borderIdle}`,
        color: colors.textDim,
        cursor: 'pointer',
        padding: spacing.sm,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: `all ${transitions.fast}`,
    },
    closeBtn: {
        background: 'transparent',
        border: `1px solid ${colors.borderIdle}`,
        color: colors.textDim,
        cursor: 'pointer',
        padding: spacing.sm,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: `all ${transitions.fast}`,
    },
    stats: {
        fontFamily: typography.fontMono,
        fontSize: typography.sizeXs,
        color: colors.textDim,
        display: 'flex',
        alignItems: 'center',
        gap: spacing.sm,
        letterSpacing: '0.05em',
    },
    statItem: {
        display: 'flex',
        alignItems: 'center',
        gap: spacing.xs,
    },
    statDivider: {
        color: colors.borderIdle,
    },
    statsToggle: {
        display: 'flex',
        alignItems: 'center',
        gap: spacing.sm,
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        fontFamily: typography.fontMono,
        fontSize: typography.sizeXs,
        color: colors.textDim,
        padding: 0,
    },
    statWarning: {
        color: colors.warning,
        fontWeight: typography.medium,
    },
    statNormal: {
        color: colors.textDim,
    },
    statsPanel: {
        marginTop: spacing.md,
        padding: spacing.md,
        background: colors.voidBlack,
        border: `1px solid ${colors.borderIdle}`,
    },
    statsPanelHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacing.md,
        fontFamily: typography.fontMono,
        fontSize: typography.sizeXs,
        color: colors.phosphorGreen,
        textTransform: 'uppercase' as const,
        letterSpacing: '0.1em',
    },
    statsPanelProvider: {
        color: colors.textDim,
        border: `1px solid ${colors.borderIdle}`,
        padding: `2px ${spacing.sm}px`,
    },
    statsPanelGrid: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: spacing.sm,
    },
    statsPanelItem: {
        display: 'flex',
        flexDirection: 'column' as const,
        gap: 2,
    },
    statsPanelLabel: {
        fontFamily: typography.fontMono,
        fontSize: typography.sizeXs,
        color: colors.textDim,
        textTransform: 'uppercase' as const,
        letterSpacing: '0.05em',
    },
    statsPanelValue: {
        fontFamily: typography.fontMono,
        fontSize: typography.sizeSm,
        color: colors.textPrimary,
    },
    statsPanelWarning: {
        marginTop: spacing.md,
        padding: spacing.sm,
        background: 'rgba(255, 170, 0, 0.1)',
        border: `1px solid ${colors.warning}`,
        color: colors.warning,
        fontFamily: typography.fontMono,
        fontSize: typography.sizeXs,
        textAlign: 'center' as const,
    },
    viewToggle: {
        display: 'flex',
        padding: `${spacing.sm}px ${spacing.lg}px`,
        gap: spacing.sm,
        borderBottom: `1px solid ${colors.borderIdle}`,
        flexShrink: 0,
        background: colors.panelGrey,
    },
    toggleBtn: {
        flex: 1,
        padding: `${spacing.sm}px ${spacing.md}px`,
        background: 'transparent',
        border: `1px solid ${colors.borderIdle}`,
        color: colors.textDim,
        cursor: 'pointer',
        fontFamily: typography.fontMono,
        fontSize: typography.sizeXs,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        transition: `all ${transitions.fast}`,
    },
    toggleActive: {
        background: colors.phosphorGreen,
        color: colors.voidBlack,
        borderColor: colors.phosphorGreen,
    },
    content: {
        flex: 1,
        overflowY: 'auto',
        padding: `${spacing.sm}px ${spacing.lg}px`,
    },
    groupList: {
        display: 'flex',
        flexDirection: 'column',
        gap: spacing.md,
    },
    group: {
        background: colors.panelGrey,
        overflow: 'hidden',
        border: `1px solid ${colors.borderIdle}`,
    },
    groupHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: `${spacing.md}px ${spacing.md}px`,
        background: 'transparent',
        cursor: 'pointer',
        width: '100%',
        border: 'none',
        color: 'inherit',
        textAlign: 'left',
        transition: `background ${transitions.fast}`,
    },
    groupName: {
        fontFamily: typography.fontMono,
        fontWeight: typography.medium,
        color: colors.phosphorGreen,
        display: 'flex',
        alignItems: 'center',
        fontSize: typography.sizeSm,
        letterSpacing: '0.05em',
    },
    groupCount: {
        fontFamily: typography.fontMono,
        fontSize: typography.sizeXs,
        color: colors.textDim,
        background: colors.voidBlack,
        border: `1px solid ${colors.borderIdle}`,
        padding: `2px ${spacing.sm}px`,
    },
    groupTabs: {
        padding: spacing.xs,
    },
    tabList: {
        display: 'flex',
        flexDirection: 'column',
        gap: spacing.xs,
    },
    tabItem: {
        display: 'flex',
        alignItems: 'center',
        padding: `${spacing.sm}px ${spacing.sm}px`,
        borderRadius: borderRadius.sm,
        cursor: 'pointer',
        gap: spacing.sm,
        transition: `background ${transitions.fast}`,
    },
    tabItemFull: {
        display: 'flex',
        alignItems: 'center',
        padding: spacing.md,
        borderRadius: borderRadius.md,
        cursor: 'pointer',
        gap: spacing.md,
        background: colors.bgCard,
        transition: `background ${transitions.fast}`,
    },
    tabItemHover: {
        background: colors.surfaceLight,
    },
    tabItemActive: {
        borderLeft: `2px solid ${colors.phosphorGreen}`,
        paddingLeft: spacing.sm - 2,
    },
    favicon: {
        width: 16,
        height: 16,
        borderRadius: borderRadius.sm,
        flexShrink: 0,
        objectFit: 'contain',
    },
    tabTitle: {
        flex: 1,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        fontSize: typography.sizeBase,
    },
    tabTitleFull: {
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        fontSize: typography.sizeLg,
    },
    tabInfo: {
        flex: 1,
        minWidth: 0,
    },
    tabUrl: {
        fontSize: typography.sizeMd,
        color: colors.textDimmer,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        marginTop: 2,
    },
    tabCloseBtn: {
        width: 22,
        height: 22,
        background: 'transparent',
        border: 'none',
        color: colors.textDim,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: borderRadius.sm,
        flexShrink: 0,
        transition: `opacity ${transitions.fast}`,
    },
    emptyState: {
        textAlign: 'center',
        color: colors.textDimmest,
        padding: spacing.xxxl,
        fontSize: typography.sizeLg,
    },
    chatSection: {
        borderTop: `1px solid ${colors.borderIdle}`,
        background: colors.panelGrey,
        flexShrink: 0,
    },
    chatHeader: {
        padding: `${spacing.md}px ${spacing.lg}px`,
        fontFamily: typography.fontMono,
        fontSize: typography.sizeSm,
        fontWeight: typography.medium,
        color: colors.phosphorGreen,
        letterSpacing: '0.05em',
        borderBottom: `1px solid ${colors.borderIdle}`,
        display: 'flex',
        alignItems: 'center',
        gap: spacing.sm,
    },
    presetRow: {
        display: 'flex',
        gap: spacing.xs,
        padding: `${spacing.sm}px ${spacing.lg}px`,
        borderBottom: `1px solid ${colors.borderIdle}`,
        background: colors.voidBlack,
        flexWrap: 'wrap',
    },
    presetBtn: {
        display: 'flex',
        alignItems: 'center',
        gap: spacing.xs,
        padding: `${spacing.xs}px ${spacing.sm}px`,
        background: 'transparent',
        border: `1px solid ${colors.borderIdle}`,
        color: colors.textDim,
        fontFamily: typography.fontMono,
        fontSize: typography.sizeXs,
        textTransform: 'uppercase',
        cursor: 'pointer',
        transition: `all ${transitions.fast}`,
        whiteSpace: 'nowrap',
    },
    providerBadge: {
        marginLeft: 'auto',
        fontFamily: typography.fontMono,
        fontSize: typography.sizeXs,
        color: colors.textDim,
        border: `1px solid ${colors.borderIdle}`,
        padding: `2px ${spacing.sm}px`,
    },
    chatMessages: {
        height: 140,
        overflowY: 'auto',
        padding: spacing.lg,
    },
    chatPlaceholder: {
        color: colors.textDimmest,
        fontSize: typography.sizeBase,
        textAlign: 'center',
        padding: spacing.lg,
    },
    userMessage: {
        background: colors.bgCardHover,
        padding: `${spacing.sm}px ${spacing.md}px`,
        borderRadius: borderRadius.md,
        marginBottom: spacing.sm,
        fontSize: typography.sizeBase,
        lineHeight: 1.5,
    },
    assistantMessage: {
        background: colors.successBg,
        padding: `${spacing.sm}px ${spacing.md}px`,
        marginBottom: spacing.sm,
        fontSize: typography.sizeBase,
        lineHeight: 1.5,
        borderLeft: `2px solid ${colors.phosphorGreen}`,
    },
    loadingMessage: {
        padding: spacing.md,
        display: 'flex',
        justifyContent: 'center',
    },
    loadingDots: {
        display: 'flex',
        gap: spacing.xs,
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: colors.phosphorGreen,
        animation: 'pulse 1.4s infinite ease-in-out',
    },
    chatInputRow: {
        display: 'flex',
        padding: spacing.lg,
        gap: spacing.sm,
        borderTop: `1px solid ${colors.borderIdle}`,
    },
    chatInput: {
        flex: 1,
        padding: `${spacing.md}px ${spacing.md}px`,
        background: colors.voidBlack,
        border: `1px solid ${colors.borderIdle}`,
        color: colors.textPrimary,
        fontSize: typography.sizeBase,
        fontFamily: typography.fontFamily,
        outline: 'none',
        transition: `border-color ${transitions.fast}`,
    },
    sendBtn: {
        padding: `${spacing.md}px ${spacing.lg}px`,
        background: colors.phosphorGreen,
        border: 'none',
        color: colors.voidBlack,
        cursor: 'pointer',
        fontWeight: typography.medium,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: `all ${transitions.fast}`,
    },
    sendBtnDisabled: {
        background: colors.borderIdle,
        color: colors.textDim,
        cursor: 'not-allowed',
    },
};

// Add keyframe animation and CSS
const styleSheet = document.createElement('style');
styleSheet.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap');

    @keyframes pulse {
        0%, 80%, 100% {
            transform: scale(0.6);
            opacity: 0.5;
        }
        40% {
            transform: scale(1);
            opacity: 1;
        }
    }
    input:focus {
        border-color: ${colors.phosphorGreen} !important;
    }
    button:focus-visible {
        outline: 1px solid ${colors.phosphorGreen};
    }
    button:hover:not(:disabled) {
        border-color: ${colors.borderHover} !important;
    }
    ::-webkit-scrollbar {
        width: 4px;
    }
    ::-webkit-scrollbar-track {
        background: ${colors.voidBlack};
    }
    ::-webkit-scrollbar-thumb {
        background: ${colors.borderIdle};
    }
    ::-webkit-scrollbar-thumb:hover {
        background: ${colors.borderHover};
    }
`;
document.head.appendChild(styleSheet);

const container = document.getElementById('root');
if (container) {
    const root = createRoot(container);
    root.render(<Sidepanel />);
}
