import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { colors, spacing, typography, borderRadius, transitions, faviconFallback, effects } from '../shared/theme';
import { formatMarkdown } from '../shared/markdown';
import { ScanlineOverlay } from '../ui/components/ScanlineOverlay';
import { TypewriterText } from '../ui/components/TypewriterText';
import { MicroLabel } from '../ui/components/MicroLabel';
import { ScrambleText } from '../ui/components/ScrambleText';

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
        const [tabsRes, groupsRes, providerRes] = await Promise.all([
            sendMessage('getTabs'),
            sendMessage('getGroupedByDomain'),
            sendMessage('getAIProvider')
        ]);

        if (tabsRes.success) setTabs(tabsRes.data);
        if (groupsRes.success) setGroups(groupsRes.data);
        if (providerRes.success) setProvider(providerRes.data.provider);
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

    const askAI = useCallback(async () => {
        if (!chatInput.trim() || provider === 'none') return;

        const userMessage = chatInput;
        setChatInput('');
        setChatMessages(prev => [...prev, { role: 'user', content: userMessage }]);
        setLoading(true);

        try {
            const tabContext = tabs.map(t => {
                try {
                    return `${t.title} (${new URL(t.url).hostname})`;
                } catch {
                    return t.title;
                }
            }).join(', ');
            const prompt = `Context: User has ${tabs.length} tabs open: ${tabContext}\n\nUser question: ${userMessage}`;

            const response = await sendMessage('askAI', { prompt });

            if (response.success) {
                setChatMessages(prev => [...prev, { role: 'assistant', content: response.data.response }]);
            } else {
                setChatMessages(prev => [...prev, { role: 'assistant', content: `Error: ${response.error}` }]);
            }
        } catch (err: any) {
            setChatMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}` }]);
        }
        setLoading(false);
    }, [chatInput, provider, tabs, sendMessage]);

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
                    <span style={{ ...styles.statItem, color: provider === 'none' ? colors.error : colors.primary }}>
                        AI: {getProviderDisplay()}
                    </span>
                </div>
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
        background: colors.bgDarker,
        color: colors.textSecondary,
        fontFamily: typography.fontFamily,
        fontSize: typography.sizeLg,
        display: 'flex',
        flexDirection: 'column',
    },
    header: {
        padding: spacing.lg,
        borderBottom: `1px solid ${colors.borderMedium}`,
        background: 'rgba(33, 33, 33, 0.85)',
        backdropFilter: effects.glassLight,
        WebkitBackdropFilter: effects.glassLight,
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
        fontSize: typography.sizeDisplay,
        fontWeight: typography.semibold,
        color: colors.primary,
        letterSpacing: typography.letterNormal,
    },
    settingsBtn: {
        background: 'transparent',
        border: 'none',
        color: colors.textDim,
        cursor: 'pointer',
        padding: spacing.sm,
        borderRadius: borderRadius.sm,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: `all ${transitions.fast}`,
    },
    closeBtn: {
        background: 'transparent',
        border: 'none',
        color: colors.textDim,
        cursor: 'pointer',
        padding: spacing.sm,
        borderRadius: borderRadius.sm,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: `all ${transitions.fast}`,
    },
    stats: {
        fontSize: typography.sizeMd,
        color: colors.textDim,
        display: 'flex',
        alignItems: 'center',
        gap: spacing.sm,
    },
    statItem: {
        display: 'flex',
        alignItems: 'center',
        gap: spacing.xs,
    },
    statDivider: {
        color: colors.borderLight,
    },
    viewToggle: {
        display: 'flex',
        padding: `${spacing.sm}px ${spacing.lg}px`,
        gap: spacing.sm,
        borderBottom: `1px solid ${colors.borderMedium}`,
        flexShrink: 0,
    },
    toggleBtn: {
        flex: 1,
        padding: `${spacing.sm}px ${spacing.md}px`,
        background: colors.bgCardHover,
        border: `1px solid ${colors.borderLight}`,
        borderRadius: borderRadius.md,
        color: colors.textDim,
        cursor: 'pointer',
        fontSize: typography.sizeBase,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        transition: `all ${transitions.fast}`,
    },
    toggleActive: {
        background: colors.primary,
        color: colors.bgDarkest,
        borderColor: colors.primary,
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
        background: colors.bgCard,
        borderRadius: borderRadius.lg,
        overflow: 'hidden',
        border: `1px solid ${colors.borderDark}`,
    },
    groupHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: `${spacing.md}px ${spacing.md}px`,
        background: colors.bgCardHover,
        cursor: 'pointer',
        width: '100%',
        border: 'none',
        color: 'inherit',
        textAlign: 'left',
        transition: `background ${transitions.fast}`,
    },
    groupName: {
        fontWeight: typography.medium,
        color: colors.primary,
        display: 'flex',
        alignItems: 'center',
    },
    groupCount: {
        fontSize: typography.sizeMd,
        color: colors.textDimmer,
        background: colors.borderMedium,
        padding: `2px ${spacing.sm}px`,
        borderRadius: borderRadius.full,
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
        background: colors.bgCardHover,
    },
    tabItemActive: {
        borderLeft: `3px solid ${colors.primary}`,
        paddingLeft: spacing.sm - 3,
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
        borderTop: `1px solid ${colors.borderMedium}`,
        background: colors.bgCard,
        flexShrink: 0,
    },
    chatHeader: {
        padding: `${spacing.md}px ${spacing.lg}px`,
        fontSize: typography.sizeBase,
        fontWeight: typography.medium,
        color: colors.primary,
        borderBottom: `1px solid ${colors.borderMedium}`,
        display: 'flex',
        alignItems: 'center',
        gap: spacing.sm,
    },
    presetRow: {
        display: 'flex',
        gap: spacing.xs,
        padding: `${spacing.sm}px ${spacing.lg}px`,
        borderBottom: `1px solid ${colors.borderDark}`,
        background: colors.bgDarker,
        flexWrap: 'wrap',
    },
    presetBtn: {
        display: 'flex',
        alignItems: 'center',
        gap: spacing.xs,
        padding: `${spacing.xs}px ${spacing.sm}px`,
        background: colors.bgCard,
        border: `1px solid ${colors.borderLight}`,
        borderRadius: borderRadius.sm,
        color: colors.textDim,
        fontSize: typography.sizeSm,
        cursor: 'pointer',
        transition: `all ${transitions.fast}`,
        whiteSpace: 'nowrap',
    },
    providerBadge: {
        marginLeft: 'auto',
        fontSize: typography.sizeSm,
        color: colors.textDim,
        background: colors.bgCardHover,
        padding: `2px ${spacing.sm}px`,
        borderRadius: borderRadius.sm,
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
        background: 'rgba(95, 184, 120, 0.12)',
        backdropFilter: effects.glassSubtle,
        WebkitBackdropFilter: effects.glassSubtle,
        padding: `${spacing.sm}px ${spacing.md}px`,
        borderRadius: borderRadius.md,
        marginBottom: spacing.sm,
        fontSize: typography.sizeBase,
        lineHeight: 1.5,
        borderLeft: `3px solid ${colors.primary}`,
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
        background: colors.primary,
        animation: 'pulse 1.4s infinite ease-in-out',
    },
    chatInputRow: {
        display: 'flex',
        padding: spacing.lg,
        gap: spacing.sm,
        borderTop: `1px solid ${colors.borderMedium}`,
    },
    chatInput: {
        flex: 1,
        padding: `${spacing.md}px ${spacing.md}px`,
        background: colors.bgDarker,
        border: `1px solid ${colors.borderLight}`,
        borderRadius: borderRadius.md,
        color: colors.textPrimary,
        fontSize: typography.sizeLg,
        outline: 'none',
        transition: `border-color ${transitions.fast}`,
    },
    sendBtn: {
        padding: `${spacing.md}px ${spacing.lg}px`,
        background: colors.primary,
        border: 'none',
        borderRadius: borderRadius.md,
        color: colors.bgDarkest,
        cursor: 'pointer',
        fontWeight: typography.medium,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: `all ${transitions.fast}`,
    },
    sendBtnDisabled: {
        background: colors.borderLight,
        color: colors.textDimmest,
        cursor: 'not-allowed',
    },
};

// Add keyframe animation
const styleSheet = document.createElement('style');
styleSheet.textContent = `
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
        border-color: ${colors.primary} !important;
    }
    button:focus-visible {
        outline: 2px solid ${colors.primary};
        outline-offset: 2px;
    }
    .settingsBtn:hover, .closeBtn:hover {
        color: ${colors.textSecondary};
        background: ${colors.bgCardHover};
    }
    .closeBtn:hover {
        color: ${colors.error};
    }
    ::-webkit-scrollbar {
        width: 6px;
    }
    ::-webkit-scrollbar-track {
        background: transparent;
    }
    ::-webkit-scrollbar-thumb {
        background: ${colors.borderLight};
        border-radius: 3px;
    }
    ::-webkit-scrollbar-thumb:hover {
        background: ${colors.textDimmest};
    }
`;
document.head.appendChild(styleSheet);

const container = document.getElementById('root');
if (container) {
    const root = createRoot(container);
    root.render(<Sidepanel />);
}
