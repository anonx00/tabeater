import React, { useState, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { colors, spacing, typography, borderRadius, transitions, shadows } from '../shared/theme';
import { UndoToast } from '../ui/components/UndoToast';
import { EmptyState } from '../ui/components/EmptyState';
import * as webllm from '@mlc-ai/web-llm';

// WebLLM Model ID - Default to 3B model for reliability
const WEBLLM_MODEL_ID = 'Llama-3.2-3B-Instruct-q4f16_1-MLC';

// Global WebLLM engine for popup context
let webllmEngine: webllm.MLCEngineInterface | null = null;
let webllmInitializing = false;

interface TabInfo {
    id: number;
    title: string;
    url: string;
    favIconUrl?: string;
    active: boolean;
}

interface LicenseStatus {
    status: 'trial' | 'pro' | 'expired' | 'none';
    paid: boolean;
    usageRemaining: number;
    dailyLimit?: number;
    trialEndDate?: string;
    canUse: boolean;
}

interface TabHealth {
    tabId: number;
    title: string;
    url: string;
    favicon?: string;
    staleDays: number;
    category: string;
    isStale: boolean;
    isDuplicate: boolean;
    recommendation: 'keep' | 'close' | 'review';
    reason: string;
}

interface TabAnalytics {
    topDomains: { domain: string; count: number; percentage: number }[];
    categoryBreakdown: { category: string; count: number; percentage: number }[];
    avgTabAge: number;
    oldestTabDays: number;
    healthScore: number;
    healthLabel: 'Excellent' | 'Good' | 'Fair' | 'Needs Attention';
    insights: string[];
}

interface AutoPilotReport {
    totalTabs: number;
    totalMemoryMB: number;
    staleCount: number;
    duplicateCount: number;
    categoryGroups: { [key: string]: TabHealth[] };
    recommendations: {
        closeSuggestions: TabHealth[];
        groupSuggestions: { name: string; tabIds: number[] }[];
        memoryHogs: TabHealth[];
    };
    analytics?: TabAnalytics;
    aiInsights?: string;
}

type View = 'tabs' | 'duplicates' | 'upgrade' | 'actions' | 'analytics';

// Logo - Glowing folder with indicator
const Logo: React.FC<{ size?: number }> = ({ size = 24 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <defs>
            <filter id="logoGlow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="0.5" result="blur"/>
                <feMerge>
                    <feMergeNode in="blur"/>
                    <feMergeNode in="SourceGraphic"/>
                </feMerge>
            </filter>
        </defs>
        <g filter="url(#logoGlow)">
            <path d="M3 6.5V19C3 19.8 3.7 20.5 4.5 20.5H19.5C20.3 20.5 21 19.8 21 19V8.5C21 7.7 20.3 7 19.5 7H12L10 4.5H4.5C3.7 4.5 3 5.2 3 6V6.5Z"
                  fill="none" stroke={colors.phosphorGreen} strokeWidth="1.5" strokeLinejoin="round"/>
            <rect x="5.5" y="10" width="4" height="4" fill={colors.phosphorGreen}/>
            <line x1="5.5" y1="16.5" x2="18" y2="16.5" stroke={colors.phosphorGreen} strokeWidth="1" opacity="0.7"/>
            <line x1="5.5" y1="18.5" x2="14" y2="18.5" stroke={colors.phosphorGreen} strokeWidth="0.8" opacity="0.5"/>
        </g>
    </svg>
);

const faviconFallback = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="${colors.textDim}"><rect x="2" y="2" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="8" cy="8" r="2" fill="currentColor"/></svg>`)}`;

const Popup = () => {
    const [tabs, setTabs] = useState<TabInfo[]>([]);
    const [duplicates, setDuplicates] = useState<TabInfo[][]>([]);
    const [view, setView] = useState<View>('tabs');
    const [loading, setLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [provider, setProvider] = useState<string>('webllm');
    const [license, setLicense] = useState<LicenseStatus | null>(null);
    const [autoPilotReport, setAutoPilotReport] = useState<AutoPilotReport | null>(null);
    const [statusMessage, setStatusMessage] = useState<string>('');
    const [hoveredTab, setHoveredTab] = useState<number | null>(null);
    const [undoAction, setUndoAction] = useState<{ message: string; action: () => void } | null>(null);
    const [grouping, setGrouping] = useState<boolean>(false);
    const [focusScore, setFocusScore] = useState<number | null>(null);
    const [quickReport, setQuickReport] = useState<AutoPilotReport | null>(null);

    useEffect(() => {
        loadTabs();
        checkProvider();
        checkLicense();
        loadQuickReport();
    }, []);

    const sendMessage = useCallback(async (action: string, payload?: any) => {
        return await chrome.runtime.sendMessage({ action, payload });
    }, []);

    const loadTabs = useCallback(async () => {
        const response = await sendMessage('getWindowTabs');
        if (response.success) setTabs(response.data);
    }, [sendMessage]);

    const checkProvider = useCallback(async () => {
        // Local AI is the only provider now
        setProvider('webllm');
    }, []);

    const checkLicense = useCallback(async () => {
        const response = await sendMessage('getLicenseStatus', { forceRefresh: true });
        if (response.success) setLicense(response.data);
    }, [sendMessage]);

    const loadQuickReport = useCallback(async () => {
        const response = await sendMessage('getQuickFocusScore');
        if (response.success) {
            setFocusScore(response.data.focusScore);
            setQuickReport(response.data.report);
        }
    }, [sendMessage]);

    const showStatus = useCallback((message: string, duration = 3000) => {
        setStatusMessage(message);
        setTimeout(() => setStatusMessage(''), duration);
    }, []);

    const closeTab = useCallback(async (tabId: number) => {
        setTabs(prev => prev.filter(t => t.id !== tabId));
        await sendMessage('closeTab', { tabId });
    }, [sendMessage]);

    const findDuplicates = useCallback(async () => {
        setView('duplicates');
        const response = await sendMessage('getDuplicates');
        if (response.success) setDuplicates(response.data);
    }, [sendMessage]);

    const closeDuplicates = useCallback(async () => {
        const tabsToClose: number[] = [];
        for (const group of duplicates) {
            tabsToClose.push(...group.slice(1).map(t => t.id));
        }
        setTabs(prev => prev.filter(t => !tabsToClose.includes(t.id)));
        await sendMessage('closeTabs', { tabIds: tabsToClose });
        setUndoAction({
            message: `Closed ${tabsToClose.length} duplicate tabs`,
            action: () => { loadTabs(); findDuplicates(); }
        });
        setTimeout(() => { loadTabs(); findDuplicates(); }, 100);
    }, [duplicates, sendMessage, loadTabs, findDuplicates]);

    // Initialize WebLLM in popup context (engine persists while popup is open)
    const initWebLLM = useCallback(async (): Promise<boolean> => {
        // Engine already loaded - reuse it
        if (webllmEngine) {
            console.log('[WebLLM] Reusing existing engine');
            return true;
        }

        // Wait if another init is in progress
        if (webllmInitializing) {
            while (webllmInitializing) {
                await new Promise(r => setTimeout(r, 100));
            }
            return webllmEngine !== null;
        }

        webllmInitializing = true;
        try {
            // Get selected model from storage
            const stored = await chrome.storage.local.get(['webllmModel']);
            const modelId = stored.webllmModel || WEBLLM_MODEL_ID;

            // Show initial status
            setStatusMessage('Starting AI...');

            let isDownloading = false;
            let lastProgress = 0;
            webllmEngine = await webllm.CreateMLCEngine(modelId, {
                initProgressCallback: (progress) => {
                    const text = progress.text || '';
                    // Only mark as downloading if actually fetching (not from cache)
                    if (text.includes('Fetching') && !text.includes('cache')) {
                        isDownloading = true;
                    }

                    // Show progress only for actual downloads
                    if (isDownloading) {
                        const pct = Math.round(progress.progress * 100);
                        if (pct >= lastProgress + 5 || pct === 100) {
                            lastProgress = pct;
                            setStatusMessage(`Downloading: ${pct}%`);
                        }
                    } else if (text.includes('Loading')) {
                        // Show brief loading message for cached model
                        setStatusMessage('Loading AI...');
                    }
                },
            });

            // Mark as ready in storage so options page knows
            await chrome.storage.local.set({ webllmReady: true });

            webllmInitializing = false;
            setStatusMessage(''); // Clear status when done
            console.log('[WebLLM] Engine ready');
            return true;
        } catch (err) {
            console.error('[WebLLM Popup] Init failed:', err);
            webllmInitializing = false;
            setStatusMessage('');
            return false;
        }
    }, []);

    const smartOrganize = useCallback(async () => {
        if (provider === 'none') {
            showStatus('Configure AI in settings first');
            return;
        }
        setGrouping(true);
        setLoading(true);
        showStatus('Organizing tabs...');

        try {
            // If WebLLM, do AI locally then send grouping to service worker
            if (provider === 'webllm') {
                // Only show "Loading AI" if engine isn't ready yet
                if (!webllmEngine) {
                    showStatus('Loading AI...');
                }
                const ok = await initWebLLM();
                if (!ok) {
                    showStatus('Failed to load Local AI');
                    setLoading(false);
                    setGrouping(false);
                    return;
                }

                showStatus('Grouping tabs...');

                // Build tab list with full context for better grouping
                const tabList = tabs.map((t, idx) => {
                    try {
                        return `${idx}: ${t.title} (${new URL(t.url).hostname})`;
                    } catch {
                        return `${idx}: ${t.title}`;
                    }
                }).join('\n');

                // Calculate target groups based on tab count
                const minGroups = Math.max(2, Math.ceil(tabs.length / 8));
                const maxGroups = Math.min(8, Math.ceil(tabs.length / 3));

                // Clear, explicit prompt that prevents nested arrays
                const prompt = `You are a tab organizer. Group these ${tabs.length} browser tabs by topic/activity.

TABS:
${tabList}

RULES:
- Create ${minGroups} to ${maxGroups} groups
- Group similar sites together (e.g., all streaming sites, all dev tools, all social media)
- Use SHORT group names (1 word, max 6 letters): Work, Code, Social, Video, Mail, Shop, News, Dev, Docs, Chat
- Each tab index can only appear in ONE group
- Output ONLY a JSON array, no explanation

OUTPUT FORMAT (flat array, NOT nested):
[{"name":"Code","ids":[0,1,5]},{"name":"Video","ids":[2,3]},{"name":"Mail","ids":[4,6]}]

JSON:`;

                try {
                    // Large token limit to prevent truncation
                    const dynamicMaxTokens = Math.min(4000, Math.max(1500, tabs.length * 50));

                    const response = await webllmEngine!.chat.completions.create({
                        messages: [
                            {
                                role: 'system',
                                content: 'You output ONLY valid JSON arrays. No markdown, no explanation, no code blocks. Just raw JSON starting with [ and ending with ].'
                            },
                            { role: 'user', content: prompt }
                        ],
                        max_tokens: dynamicMaxTokens,
                        temperature: 0.1,  // Low temperature for consistent output
                    });

                    const aiText = response.choices[0]?.message?.content?.trim() || '';
                    console.log('[Local AI] Raw response:', aiText);

                    // Extract JSON from response using multiple methods
                    let groups = null;

                    // Method 1: Find JSON array in response (most reliable)
                    const jsonStart = aiText.indexOf('[');
                    const jsonEnd = aiText.lastIndexOf(']');
                    if (jsonStart >= 0 && jsonEnd > jsonStart) {
                        try {
                            let jsonStr = aiText.substring(jsonStart, jsonEnd + 1);
                            // Fix common issues
                            jsonStr = jsonStr.replace(/,\s*}/g, '}').replace(/,\s*\]/g, ']');
                            groups = JSON.parse(jsonStr);
                            console.log('[Local AI] JSON extracted successfully');
                        } catch (e) {
                            console.log('[Local AI] JSON parse failed:', e);
                        }
                    }

                    // Method 2: Try full response as JSON
                    if (!groups) {
                        try {
                            groups = JSON.parse(aiText);
                            console.log('[Local AI] Direct parse succeeded');
                        } catch (e) {
                            console.log('[Local AI] Direct parse failed');
                        }
                    }

                    // Helper: get array of indices from group (handles ids, tabIds, tabs, etc.)
                    const getGroupIds = (g: any): number[] => {
                        const arr = g.ids || g.tabIds || g.tabs || g.indices || [];
                        return Array.isArray(arr) ? arr : [];
                    };

                    // Validate and map indices to real tab IDs
                    if (groups && Array.isArray(groups) && groups.length > 0) {
                        // Fix nested arrays: [[{...}], [{...}]] -> [{...}, {...}]
                        if (Array.isArray(groups[0]) && groups[0].length > 0) {
                            console.log('[Local AI] Flattening nested array structure');
                            groups = groups.flat().filter((g: any) => g && typeof g === 'object');
                        }

                        const usedIndices = new Set<number>();

                        // Map indices to real tab IDs (same logic as Gemini)
                        const validGroups = groups
                            .filter((g: any) =>
                                g &&
                                typeof g.name === 'string' &&
                                g.name.length > 0 &&
                                getGroupIds(g).length >= 2  // Require at least 2 tabs like Gemini
                            )
                            .map((g: any) => {
                                // Convert indices to real tab IDs
                                const groupIds = getGroupIds(g);
                                const realTabIds = groupIds
                                    .map((idx: any) => {
                                        const index = typeof idx === 'string' ? parseInt(idx, 10) : idx;
                                        if (typeof index === 'number' && !isNaN(index) && index >= 0 && index < tabs.length && !usedIndices.has(index)) {
                                            usedIndices.add(index);
                                            return tabs[index].id;
                                        }
                                        return null;
                                    })
                                    .filter((id: number | null): id is number => id !== null);

                                return {
                                    name: g.name.substring(0, 6),  // Max 6 chars like Gemini
                                    tabIds: realTabIds
                                };
                            })
                            .filter(g => g.tabIds.length >= 2);  // Require at least 2 tabs like Gemini

                        if (validGroups.length > 0) {
                            console.log('[Local AI] Valid groups:', validGroups);
                            const groupRes = await sendMessage('applyTabGroups', { groups: validGroups });
                            if (groupRes.success) {
                                showStatus(`Created ${validGroups.length} groups`);
                            } else {
                                showStatus(groupRes.error || 'Grouping failed');
                            }
                        } else {
                            console.log('[Local AI] No valid groups after filtering');
                            showStatus('AI could not match tabs - try again');
                        }
                    } else {
                        console.log('[Local AI] Failed to extract JSON from:', aiText.substring(0, 200));
                        showStatus('AI failed - try again');
                    }
                } catch (aiErr: any) {
                    console.error('[Local AI] Error:', aiErr);
                    showStatus('AI error - try again');
                }
            } else {
                // Use service worker for cloud providers
                const response = await sendMessage('smartOrganize');
                if (response.success) {
                    showStatus(response.data.message);
                } else {
                    showStatus(response.error || 'Organization failed');
                }
            }
            loadTabs();
        } catch (err: any) {
            showStatus(err.message || 'Organization failed');
        }

        setLoading(false);
        setGrouping(false);
    }, [provider, tabs, sendMessage, loadTabs, showStatus, initWebLLM]);

    const handleUpgrade = useCallback(async () => {
        setLoading(true);
        const response = await sendMessage('getCheckoutUrl');
        if (response.success) chrome.tabs.create({ url: response.data.url });
        setLoading(false);
    }, [sendMessage]);

    const runActions = useCallback(async () => {
        if (!license?.paid) {
            setView('upgrade');
            return;
        }
        setLoading(true);
        setView('actions');
        setAutoPilotReport(null);
        const response = await sendMessage('autoPilotAnalyze');
        if (response.success) {
            setAutoPilotReport(response.data);
        } else if (response.error?.includes('TRIAL_EXPIRED') || response.error?.includes('LIMIT_REACHED')) {
            setView('upgrade');
        }
        setLoading(false);
        checkLicense();
    }, [license, sendMessage, checkLicense]);

    const executeCleanup = useCallback(async () => {
        if (!autoPilotReport) return;
        setLoading(true);
        const tabIds = autoPilotReport.recommendations.closeSuggestions.map(t => t.tabId);
        await sendMessage('autoPilotCleanup', { tabIds });
        showStatus(`Cleaned ${tabIds.length} tabs`);
        await loadTabs();
        await runActions();
    }, [autoPilotReport, sendMessage, loadTabs, runActions, showStatus]);

    const executeGrouping = useCallback(async () => {
        if (!autoPilotReport) return;
        setLoading(true);
        await sendMessage('autoPilotGroup', { groups: autoPilotReport.recommendations.groupSuggestions });
        showStatus('Tabs organized');
        await loadTabs();
        await runActions();
    }, [autoPilotReport, sendMessage, loadTabs, runActions, showStatus]);

    const showAnalytics = useCallback(async () => {
        if (!license?.paid) {
            setView('upgrade');
            return;
        }
        setLoading(true);
        setView('analytics');
        const response = await sendMessage('autoPilotAnalyzeWithAI');
        if (response.success) {
            setAutoPilotReport(response.data);
        }
        setLoading(false);
    }, [license, sendMessage]);

    const filteredTabs = searchQuery
        ? tabs.filter(t => t.title.toLowerCase().includes(searchQuery.toLowerCase()) || t.url.toLowerCase().includes(searchQuery.toLowerCase()))
        : tabs;

    const getHostname = (url: string) => {
        try { return new URL(url).hostname.replace('www.', ''); } catch { return url; }
    };

    const getScoreColor = (score: number) => {
        if (score >= 80) return colors.phosphorGreen;
        if (score >= 60) return colors.signalAmber;
        return colors.criticalRed;
    };

    const isAllClear = autoPilotReport &&
        autoPilotReport.recommendations.closeSuggestions.length === 0 &&
        autoPilotReport.recommendations.groupSuggestions.length === 0 &&
        autoPilotReport.duplicateCount === 0;

    return (
        <div style={s.container}>
            {/* Header */}
            <header style={s.header}>
                <div style={s.headerLeft}>
                    <Logo size={24} />
                    <div style={s.brandWrap}>
                        <span style={s.logoText}>TABEATER</span>
                        <span style={s.logoSub}>// SYSTEM</span>
                    </div>
                    {license?.paid && <span style={s.proBadge}>PRO</span>}
                </div>
                <div style={s.headerRight}>
                    {focusScore !== null && (
                        <div style={s.scorePill}>
                            <span style={{ ...s.scoreValue, color: getScoreColor(focusScore) }}>{focusScore}</span>
                        </div>
                    )}
                    <button style={s.iconBtn} onClick={async () => {
                        try {
                            const win = await chrome.windows.getCurrent();
                            if (win.id) { await chrome.sidePanel.open({ windowId: win.id }); window.close(); }
                        } catch { /* ignore */ }
                    }} title="Open Sidebar">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/>
                        </svg>
                    </button>
                    <button style={s.iconBtn} onClick={() => chrome.runtime.openOptionsPage()} title="Settings">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
                        </svg>
                    </button>
                </div>
            </header>

            {/* Status - fixed height to prevent layout shifts */}
            <div style={{
                ...s.statusBar,
                opacity: statusMessage ? 1 : 0,
                height: statusMessage ? 'auto' : 0,
                padding: statusMessage ? `${spacing.sm}px ${spacing.lg}px` : 0,
                overflow: 'hidden',
                transition: 'opacity 0.15s ease',
            }}>
                {statusMessage || '\u00A0'}
            </div>

            {/* Hero Action - refined */}
            <div style={s.heroSection}>
                {(() => {
                    const hasCleanupNeeded = quickReport && (quickReport.recommendations.closeSuggestions.length > 0 || quickReport.duplicateCount > 0);
                    const hasGroupingNeeded = quickReport && quickReport.recommendations.groupSuggestions.length > 0;
                    const isClean = quickReport && !hasCleanupNeeded && !hasGroupingNeeded;

                    if (loading || grouping) {
                        return (
                            <button className="hero-btn" style={s.heroBtn} disabled>
                                <div style={s.spinner} />
                                <span className="mgs-text">{grouping ? 'ORGANIZING' : 'ANALYZING'}</span>
                            </button>
                        );
                    }

                    if (isClean) {
                        return (
                            <button className="hero-btn" style={{ ...s.heroBtn, ...s.heroBtnSuccess }} onClick={showAnalytics}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M20 6L9 17l-5-5"/>
                                </svg>
                                <span className="mgs-text">SYSTEM CLEAR</span>
                            </button>
                        );
                    }

                    if (hasCleanupNeeded) {
                        const count = (quickReport?.recommendations.closeSuggestions.length || 0) + (quickReport?.duplicateCount || 0);
                        return (
                            <button className="hero-btn" style={{ ...s.heroBtn, ...s.heroBtnWarning }} onClick={license?.paid ? runActions : () => setView('upgrade')}>
                                <span style={s.heroBadge}>{count}</span>
                                <span className="mgs-text">OPTIMIZE</span>
                            </button>
                        );
                    }

                    if (hasGroupingNeeded) {
                        return (
                            <button className="hero-btn" style={s.heroBtn} onClick={smartOrganize}>
                                <span style={s.heroBadge}>{quickReport?.recommendations.groupSuggestions.length}</span>
                                <span className="mgs-text">ORGANIZE</span>
                            </button>
                        );
                    }

                    return (
                        <button className="hero-btn" style={s.heroBtn} onClick={license?.paid ? runActions : smartOrganize}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
                            </svg>
                            <span className="mgs-text">SCAN</span>
                            <span style={s.heroCount}>{tabs.length}</span>
                        </button>
                    );
                })()}

                <div style={s.actionRow}>
                    <button className="action-btn" style={s.actionBtn} onClick={smartOrganize} disabled={loading || grouping} title="Smart Group">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                        </svg>
                        <span>Group</span>
                    </button>
                    <button className="action-btn" style={s.actionBtn} onClick={findDuplicates} disabled={loading} title="Duplicates">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V6a2 2 0 0 1 2-2h10"/>
                        </svg>
                        <span>Dupes</span>
                    </button>
                    <button className="action-btn" style={s.actionBtn} onClick={showAnalytics} disabled={loading} title="Analytics">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M18 20V10M12 20V4M6 20v-6"/>
                        </svg>
                        <span>Stats</span>
                    </button>
                </div>
            </div>

            {/* Setup Banner - subtle */}
            {provider === 'none' && view === 'tabs' && (
                <div style={s.setupBanner}>
                    <div style={s.setupContent}>
                        <span style={s.setupTitle}>AI not configured</span>
                        <span style={s.setupDesc}>Connect a provider for smart features</span>
                    </div>
                    <button style={s.setupBtn} onClick={() => chrome.runtime.openOptionsPage()}>Setup</button>
                </div>
            )}

            {/* Search - minimal */}
            {view === 'tabs' && (
                <div style={s.searchWrap}>
                    <input
                        type="text"
                        placeholder="Search tabs..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={s.searchInput}
                    />
                    {searchQuery && (
                        <button style={s.searchClear} onClick={() => setSearchQuery('')}>×</button>
                    )}
                </div>
            )}

            {/* Tab List - clean */}
            {view === 'tabs' && (
                <div style={s.tabList}>
                    {filteredTabs.length === 0 ? (
                        <EmptyState type={searchQuery ? 'no-results' : 'no-tabs'} />
                    ) : (
                        filteredTabs.map(tab => (
                            <div
                                key={tab.id}
                                style={{ ...s.tabItem, ...(hoveredTab === tab.id ? s.tabItemHover : {}), ...(tab.active ? s.tabItemActive : {}) }}
                                onMouseEnter={() => setHoveredTab(tab.id)}
                                onMouseLeave={() => setHoveredTab(null)}
                            >
                                <img src={tab.favIconUrl || faviconFallback} style={s.favicon} alt="" onError={(e) => { e.currentTarget.src = faviconFallback; }} />
                                <div style={s.tabInfo}>
                                    <div style={s.tabTitle}>{tab.title || 'Untitled'}</div>
                                    <div style={s.tabUrl}>{getHostname(tab.url)}</div>
                                </div>
                                <button style={{ ...s.closeBtn, opacity: hoveredTab === tab.id ? 1 : 0 }} onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}>
                                    ×
                                </button>
                            </div>
                        ))
                    )}
                </div>
            )}

            {/* Duplicates View */}
            {view === 'duplicates' && (
                <div style={s.panel}>
                    <div style={s.panelHeader}>
                        <span style={s.panelTitle}>Duplicates</span>
                        {duplicates.length > 0 && (
                            <button style={s.panelAction} onClick={closeDuplicates}>Close All</button>
                        )}
                    </div>
                    <div style={s.panelContent}>
                        {duplicates.length === 0 ? (
                            <div style={s.emptyState}>
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={colors.phosphorGreen} strokeWidth="1.5">
                                    <path d="M20 6L9 17l-5-5"/>
                                </svg>
                                <div style={s.emptyTitle}>No duplicates</div>
                                <div style={s.emptyDesc}>All tabs are unique</div>
                            </div>
                        ) : (
                            duplicates.map((group, i) => (
                                <div key={i} style={s.listItem}>
                                    <img src={group[0]?.favIconUrl || faviconFallback} style={s.favicon} alt="" />
                                    <div style={s.listInfo}>
                                        <div style={s.listTitle}>{group[0]?.title}</div>
                                        <div style={s.listMeta}>{group.length} copies</div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                    <button style={s.backBtn} onClick={() => setView('tabs')}>← Back</button>
                </div>
            )}

            {/* Actions View */}
            {view === 'actions' && (
                <div style={s.panel}>
                    <div style={s.panelHeader}>
                        <span style={s.panelTitle}>Actions</span>
                    </div>
                    <div style={s.panelContent}>
                        {loading ? (
                            <div style={s.loadingState}>
                                <div style={s.spinner} />
                                <span>Analyzing...</span>
                            </div>
                        ) : isAllClear ? (
                            <div style={s.emptyState}>
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={colors.phosphorGreen} strokeWidth="1.5">
                                    <path d="M20 6L9 17l-5-5"/>
                                </svg>
                                <div style={s.emptyTitle}>All clear</div>
                                <div style={s.emptyDesc}>Tabs are optimized</div>
                            </div>
                        ) : autoPilotReport ? (
                            <div style={s.actionCards}>
                                {autoPilotReport.recommendations.closeSuggestions.length > 0 && (
                                    <div style={s.actionCard}>
                                        <div style={s.cardHeader}>
                                            <span style={s.cardTitle}>Cleanup</span>
                                            <span style={s.cardBadge}>{autoPilotReport.recommendations.closeSuggestions.length}</span>
                                        </div>
                                        <p style={s.cardDesc}>Stale and duplicate tabs to close</p>
                                        <button style={s.cardBtn} onClick={executeCleanup}>Clean</button>
                                    </div>
                                )}
                                {autoPilotReport.recommendations.groupSuggestions.length > 0 && (
                                    <div style={s.actionCard}>
                                        <div style={s.cardHeader}>
                                            <span style={s.cardTitle}>Organize</span>
                                            <span style={s.cardBadge}>{autoPilotReport.recommendations.groupSuggestions.length}</span>
                                        </div>
                                        <p style={s.cardDesc}>Suggested tab groups</p>
                                        <button style={s.cardBtn} onClick={executeGrouping}>Group</button>
                                    </div>
                                )}
                                {autoPilotReport.duplicateCount > 0 && (
                                    <div style={s.actionCard}>
                                        <div style={s.cardHeader}>
                                            <span style={s.cardTitle}>Duplicates</span>
                                            <span style={s.cardBadge}>{autoPilotReport.duplicateCount}</span>
                                        </div>
                                        <p style={s.cardDesc}>Duplicate tabs found</p>
                                        <button style={s.cardBtn} onClick={findDuplicates}>Review</button>
                                    </div>
                                )}
                            </div>
                        ) : null}
                    </div>
                    <button style={s.backBtn} onClick={() => setView('tabs')}>← Back</button>
                </div>
            )}

            {/* Analytics View */}
            {view === 'analytics' && (
                <div style={s.panel}>
                    <div style={s.panelHeader}>
                        <span style={s.panelTitle}>Analytics</span>
                    </div>
                    <div style={s.panelContent}>
                        {loading ? (
                            <div style={s.loadingState}>
                                <div style={s.spinner} />
                                <span>Analyzing...</span>
                            </div>
                        ) : autoPilotReport?.analytics ? (
                            <>
                                <div style={s.scoreCard}>
                                    <div style={s.scoreRing}>
                                        <svg width="100" height="100" viewBox="0 0 100 100">
                                            <circle cx="50" cy="50" r="42" fill="none" stroke={colors.borderIdle} strokeWidth="6"/>
                                            <circle
                                                cx="50" cy="50" r="42" fill="none"
                                                stroke={getScoreColor(autoPilotReport.analytics.healthScore)}
                                                strokeWidth="6"
                                                strokeLinecap="round"
                                                strokeDasharray={`${(autoPilotReport.analytics.healthScore / 100) * 264} 264`}
                                                transform="rotate(-90 50 50)"
                                            />
                                        </svg>
                                        <div style={s.scoreInner}>
                                            <span style={{ ...s.scoreNum, color: getScoreColor(autoPilotReport.analytics.healthScore) }}>
                                                {autoPilotReport.analytics.healthScore}
                                            </span>
                                        </div>
                                    </div>
                                    <span style={{ ...s.scoreLabel, color: getScoreColor(autoPilotReport.analytics.healthScore) }}>
                                        {autoPilotReport.analytics.healthLabel}
                                    </span>
                                </div>
                                <div style={s.statsGrid}>
                                    <div style={s.statItem}>
                                        <span style={s.statValue}>{autoPilotReport.totalTabs}</span>
                                        <span style={s.statLabel}>Tabs</span>
                                    </div>
                                    <div style={s.statItem}>
                                        <span style={s.statValue}>{autoPilotReport.analytics.avgTabAge}d</span>
                                        <span style={s.statLabel}>Avg Age</span>
                                    </div>
                                    <div style={s.statItem}>
                                        <span style={s.statValue}>{autoPilotReport.staleCount}</span>
                                        <span style={s.statLabel}>Stale</span>
                                    </div>
                                    <div style={s.statItem}>
                                        <span style={s.statValue}>{autoPilotReport.duplicateCount}</span>
                                        <span style={s.statLabel}>Dupes</span>
                                    </div>
                                </div>
                            </>
                        ) : null}
                    </div>
                    <button style={s.backBtn} onClick={() => setView('tabs')}>← Back</button>
                </div>
            )}

            {/* Upgrade View */}
            {view === 'upgrade' && (
                <div style={s.panel}>
                    <div style={s.upgradeContent}>
                        <div style={s.upgradeHeader}>
                            <span style={s.upgradeTitle}>Upgrade to Pro</span>
                            <span style={s.upgradePrice}>AUD $2</span>
                            <span style={s.upgradePriceNote}>/month</span>
                        </div>
                        <ul style={s.upgradeFeatures}>
                            <li>Local AI (100% private)</li>
                            <li>Unlimited AI scans</li>
                            <li>Auto Pilot mode</li>
                            <li>Up to 3 devices</li>
                        </ul>
                        <button style={s.upgradeBtn} onClick={handleUpgrade} disabled={loading}>
                            {loading ? 'Loading...' : 'Get Pro'}
                        </button>
                        <button style={s.refreshLink} onClick={checkLicense}>Already purchased? Refresh</button>
                    </div>
                    <button style={s.backBtn} onClick={() => setView('tabs')}>← Back</button>
                </div>
            )}

            {/* Undo Toast */}
            {undoAction && (
                <UndoToast
                    message={undoAction.message}
                    onUndo={undoAction.action}
                    onDismiss={() => setUndoAction(null)}
                />
            )}
        </div>
    );
};

// Styles - Premium Minimal
const s: { [key: string]: React.CSSProperties } = {
    container: {
        width: 380,
        maxHeight: 520,
        background: colors.voidBlack,
        color: colors.textPrimary,
        fontFamily: typography.fontFamily,
        fontSize: typography.sizeBase,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: `${spacing.md}px ${spacing.lg}px`,
        borderBottom: `1px solid ${colors.borderIdle}`,
        background: colors.panelGrey,
    },
    headerLeft: {
        display: 'flex',
        alignItems: 'center',
        gap: spacing.sm,
    },
    headerRight: {
        display: 'flex',
        alignItems: 'center',
        gap: spacing.xs,
    },
    brandWrap: {
        display: 'flex',
        flexDirection: 'column',
    },
    logoText: {
        fontFamily: typography.fontMono,
        fontSize: 12,
        fontWeight: typography.bold,
        color: colors.textPrimary,
        letterSpacing: '0.15em',
    },
    logoSub: {
        fontFamily: typography.fontMono,
        fontSize: 8,
        color: colors.textDim,
        letterSpacing: '0.1em',
    },
    proBadge: {
        fontFamily: typography.fontMono,
        fontSize: 8,
        fontWeight: typography.bold,
        color: colors.voidBlack,
        background: colors.accentCyan,
        padding: '2px 5px',
        borderRadius: 2,
        marginLeft: spacing.xs,
    },
    scorePill: {
        padding: '3px 8px',
        background: colors.surfaceDark,
        borderRadius: borderRadius.sm,
    },
    scoreValue: {
        fontFamily: typography.fontMono,
        fontSize: 12,
        fontWeight: typography.bold,
    },
    iconBtn: {
        width: 28,
        height: 28,
        background: 'transparent',
        border: `1px solid ${colors.borderIdle}`,
        borderRadius: borderRadius.sm,
        color: colors.textMuted,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: transitions.fast,
    },
    statusBar: {
        background: colors.surfaceDark,
        color: colors.textSecondary,
        padding: `${spacing.sm}px ${spacing.lg}px`,
        fontFamily: typography.fontMono,
        fontSize: 10,
        letterSpacing: '0.05em',
        borderBottom: `1px solid ${colors.borderIdle}`,
    },
    heroSection: {
        padding: spacing.lg,
        background: colors.panelGrey,
        borderBottom: `1px solid ${colors.borderIdle}`,
    },
    heroBtn: {
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        padding: `${spacing.md}px ${spacing.lg}px`,
        background: colors.surfaceLight,
        border: `1px solid ${colors.borderIdle}`,
        borderRadius: borderRadius.md,
        color: colors.textPrimary,
        fontFamily: typography.fontMono,
        fontSize: 12,
        fontWeight: typography.semibold,
        letterSpacing: '0.1em',
        cursor: 'pointer',
        transition: transitions.normal,
    },
    heroBtnSuccess: {
        background: 'rgba(0, 255, 136, 0.1)',
        borderColor: 'rgba(0, 255, 136, 0.3)',
        color: colors.phosphorGreen,
    },
    heroBtnWarning: {
        background: 'rgba(255, 170, 0, 0.08)',
        borderColor: 'rgba(255, 170, 0, 0.25)',
        color: colors.signalAmber,
    },
    heroBadge: {
        fontFamily: typography.fontMono,
        fontSize: 11,
        fontWeight: typography.bold,
        padding: '2px 6px',
        background: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 3,
    },
    heroCount: {
        fontFamily: typography.fontMono,
        fontSize: 10,
        color: colors.textMuted,
        marginLeft: spacing.xs,
    },
    spinner: {
        width: 14,
        height: 14,
        border: `2px solid ${colors.borderIdle}`,
        borderTopColor: colors.accentCyan,
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
    },
    actionRow: {
        display: 'flex',
        gap: spacing.sm,
        marginTop: spacing.sm,
    },
    actionBtn: {
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        padding: `${spacing.sm}px`,
        background: 'transparent',
        border: `1px solid ${colors.borderIdle}`,
        borderRadius: borderRadius.sm,
        color: colors.textMuted,
        fontFamily: typography.fontFamily,
        fontSize: 11,
        cursor: 'pointer',
        transition: transitions.fast,
    },
    setupBanner: {
        display: 'flex',
        alignItems: 'center',
        gap: spacing.md,
        padding: `${spacing.sm}px ${spacing.lg}px`,
        background: colors.surfaceDark,
        borderBottom: `1px solid ${colors.borderIdle}`,
    },
    setupContent: {
        flex: 1,
    },
    setupTitle: {
        display: 'block',
        fontFamily: typography.fontMono,
        fontSize: 11,
        color: colors.textSecondary,
    },
    setupDesc: {
        display: 'block',
        fontSize: 10,
        color: colors.textDim,
        marginTop: 2,
    },
    setupBtn: {
        padding: `${spacing.xs}px ${spacing.md}px`,
        background: 'transparent',
        border: `1px solid ${colors.borderIdle}`,
        borderRadius: borderRadius.sm,
        color: colors.textMuted,
        fontFamily: typography.fontMono,
        fontSize: 10,
        cursor: 'pointer',
    },
    searchWrap: {
        display: 'flex',
        alignItems: 'center',
        padding: `${spacing.sm}px ${spacing.lg}px`,
        background: colors.surfaceDark,
        borderBottom: `1px solid ${colors.borderIdle}`,
    },
    searchInput: {
        flex: 1,
        background: 'transparent',
        border: 'none',
        outline: 'none',
        color: colors.textPrimary,
        fontSize: 13,
        fontFamily: typography.fontFamily,
    },
    searchClear: {
        background: 'transparent',
        border: 'none',
        color: colors.textDim,
        cursor: 'pointer',
        fontSize: 16,
        padding: 4,
    },
    tabList: {
        flex: 1,
        overflowY: 'auto',
    },
    tabItem: {
        display: 'flex',
        alignItems: 'center',
        gap: spacing.md,
        padding: `${spacing.sm}px ${spacing.lg}px`,
        cursor: 'default',
        transition: transitions.fast,
        borderBottom: `1px solid ${colors.borderIdle}`,
    },
    tabItemHover: {
        background: colors.surfaceDark,
    },
    tabItemActive: {
        borderLeft: `2px solid ${colors.accentCyan}`,
        paddingLeft: spacing.lg - 2,
    },
    favicon: {
        width: 16,
        height: 16,
        borderRadius: 2,
        flexShrink: 0,
    },
    tabInfo: {
        flex: 1,
        minWidth: 0,
    },
    tabTitle: {
        fontSize: 13,
        color: colors.textSecondary,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
    },
    tabUrl: {
        fontSize: 11,
        color: colors.textDim,
        marginTop: 1,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
    },
    closeBtn: {
        width: 20,
        height: 20,
        background: 'transparent',
        border: 'none',
        color: colors.textDim,
        cursor: 'pointer',
        fontSize: 14,
        transition: transitions.fast,
    },
    panel: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
    },
    panelHeader: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: `${spacing.md}px ${spacing.lg}px`,
        borderBottom: `1px solid ${colors.borderIdle}`,
        background: colors.panelGrey,
    },
    panelTitle: {
        fontFamily: typography.fontMono,
        fontSize: 12,
        fontWeight: typography.semibold,
        color: colors.textPrimary,
        letterSpacing: '0.05em',
    },
    panelAction: {
        padding: `${spacing.xs}px ${spacing.sm}px`,
        background: 'transparent',
        border: `1px solid ${colors.criticalRed}`,
        borderRadius: borderRadius.sm,
        color: colors.criticalRed,
        fontFamily: typography.fontMono,
        fontSize: 10,
        cursor: 'pointer',
    },
    panelContent: {
        flex: 1,
        overflowY: 'auto',
        padding: spacing.lg,
    },
    backBtn: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        padding: spacing.md,
        margin: spacing.lg,
        marginTop: 0,
        background: 'transparent',
        border: `1px solid ${colors.borderIdle}`,
        borderRadius: borderRadius.sm,
        color: colors.textMuted,
        fontSize: 12,
        cursor: 'pointer',
    },
    emptyState: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.xxxl,
        textAlign: 'center',
    },
    emptyTitle: {
        fontFamily: typography.fontMono,
        fontSize: 12,
        color: colors.textSecondary,
        marginTop: spacing.md,
    },
    emptyDesc: {
        fontSize: 11,
        color: colors.textDim,
        marginTop: spacing.xs,
    },
    listItem: {
        display: 'flex',
        alignItems: 'center',
        gap: spacing.md,
        padding: spacing.md,
        background: colors.surfaceDark,
        borderRadius: borderRadius.sm,
        marginBottom: spacing.sm,
    },
    listInfo: {
        flex: 1,
        minWidth: 0,
    },
    listTitle: {
        fontSize: 12,
        color: colors.textSecondary,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
    },
    listMeta: {
        fontFamily: typography.fontMono,
        fontSize: 10,
        color: colors.signalAmber,
        marginTop: 2,
    },
    loadingState: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.xxxl,
        gap: spacing.md,
        color: colors.textMuted,
        fontSize: 12,
    },
    actionCards: {
        display: 'flex',
        flexDirection: 'column',
        gap: spacing.sm,
    },
    actionCard: {
        padding: spacing.md,
        background: colors.surfaceDark,
        borderRadius: borderRadius.sm,
        border: `1px solid ${colors.borderIdle}`,
    },
    cardHeader: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: spacing.xs,
    },
    cardTitle: {
        fontFamily: typography.fontMono,
        fontSize: 11,
        fontWeight: typography.semibold,
        color: colors.textPrimary,
    },
    cardBadge: {
        fontFamily: typography.fontMono,
        fontSize: 10,
        color: colors.accentCyan,
        background: 'rgba(0, 212, 255, 0.1)',
        padding: '2px 6px',
        borderRadius: 3,
    },
    cardDesc: {
        fontSize: 11,
        color: colors.textDim,
        marginBottom: spacing.sm,
    },
    cardBtn: {
        padding: `${spacing.xs}px ${spacing.md}px`,
        background: 'transparent',
        border: `1px solid ${colors.borderIdle}`,
        borderRadius: borderRadius.sm,
        color: colors.textSecondary,
        fontFamily: typography.fontMono,
        fontSize: 10,
        cursor: 'pointer',
    },
    scoreCard: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        marginBottom: spacing.xl,
    },
    scoreRing: {
        position: 'relative',
        width: 100,
        height: 100,
    },
    scoreInner: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
    scoreNum: {
        fontFamily: typography.fontMono,
        fontSize: 28,
        fontWeight: typography.bold,
    },
    scoreLabel: {
        fontFamily: typography.fontMono,
        fontSize: 10,
        fontWeight: typography.semibold,
        marginTop: spacing.sm,
        letterSpacing: '0.1em',
    },
    statsGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: spacing.sm,
    },
    statItem: {
        background: colors.surfaceDark,
        borderRadius: borderRadius.sm,
        padding: spacing.md,
        textAlign: 'center',
    },
    statValue: {
        display: 'block',
        fontFamily: typography.fontMono,
        fontSize: 16,
        fontWeight: typography.bold,
        color: colors.textPrimary,
    },
    statLabel: {
        display: 'block',
        fontSize: 9,
        color: colors.textDim,
        marginTop: 2,
        textTransform: 'uppercase',
    },
    upgradeContent: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.xxl,
        textAlign: 'center',
    },
    upgradeHeader: {
        marginBottom: spacing.lg,
    },
    upgradeTitle: {
        display: 'block',
        fontFamily: typography.fontMono,
        fontSize: 14,
        fontWeight: typography.semibold,
        color: colors.textPrimary,
        marginBottom: spacing.sm,
    },
    upgradePrice: {
        fontFamily: typography.fontMono,
        fontSize: 32,
        fontWeight: typography.bold,
        color: colors.textPrimary,
    },
    upgradePriceNote: {
        display: 'block',
        fontSize: 11,
        color: colors.textDim,
        marginTop: 2,
    },
    upgradeFeatures: {
        listStyle: 'none',
        padding: 0,
        margin: `${spacing.md}px 0 ${spacing.lg}px`,
        textAlign: 'left',
        fontSize: 12,
        color: colors.textSecondary,
        lineHeight: 2,
    },
    upgradeBtn: {
        width: '100%',
        padding: spacing.md,
        background: colors.accentCyan,
        border: 'none',
        borderRadius: borderRadius.sm,
        color: colors.voidBlack,
        fontFamily: typography.fontMono,
        fontSize: 12,
        fontWeight: typography.bold,
        cursor: 'pointer',
        marginBottom: spacing.sm,
    },
    refreshLink: {
        background: 'transparent',
        border: 'none',
        color: colors.textDim,
        fontSize: 11,
        cursor: 'pointer',
        padding: spacing.sm,
    },
};

// Inject CSS
const styleSheet = document.createElement('style');
styleSheet.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap');

    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }

    @keyframes mgs-flicker {
        0%, 100% { opacity: 1; }
        92% { opacity: 1; }
        93% { opacity: 0.8; }
        94% { opacity: 1; }
        96% { opacity: 0.9; }
        97% { opacity: 1; }
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    input::placeholder { color: ${colors.textDim}; }

    button:hover:not(:disabled) {
        border-color: ${colors.borderHover} !important;
        color: ${colors.textSecondary} !important;
        transform: translateY(-1px);
    }
    button:active:not(:disabled) {
        opacity: 0.9;
        transform: translateY(0);
    }
    button:disabled { opacity: 0.5; cursor: not-allowed; }

    /* Hero button glow on hover */
    .hero-btn:hover:not(:disabled) {
        box-shadow: 0 0 12px rgba(0, 212, 255, 0.2);
    }

    /* Action buttons lift */
    .action-btn {
        transition: all 0.15s ease;
    }
    .action-btn:hover:not(:disabled) {
        transform: translateY(-2px);
        background: rgba(255, 255, 255, 0.02);
    }

    /* Tab item highlight */
    .tab-item:hover {
        background: ${colors.surfaceDark};
    }

    .mgs-text {
        animation: mgs-flicker 8s infinite;
    }

    ::-webkit-scrollbar { width: 4px; }
    ::-webkit-scrollbar-track { background: ${colors.voidBlack}; }
    ::-webkit-scrollbar-thumb { background: ${colors.borderIdle}; border-radius: 2px; }
    ::-webkit-scrollbar-thumb:hover { background: ${colors.borderHover}; }
`;
document.head.appendChild(styleSheet);

const container = document.getElementById('root');
if (container) createRoot(container).render(<Popup />);
