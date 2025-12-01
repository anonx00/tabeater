import React, { useState, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { colors, spacing, typography, borderRadius, transitions, shadows, faviconFallback, commonStyles, effects } from '../shared/theme';
import { UndoToast } from '../ui/components/UndoToast';
import { SkeletonLoader } from '../ui/components/SkeletonLoader';
import { EmptyState } from '../ui/components/EmptyState';
import { ScanlineOverlay } from '../ui/components/ScanlineOverlay';
import { MicroLabel } from '../ui/components/MicroLabel';
import { MemoryGauge } from '../ui/components/MemoryGauge';
import { ScrambleText } from '../ui/components/ScrambleText';
import { formatMarkdown, formatInsights } from '../shared/markdown';

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

type View = 'tabs' | 'duplicates' | 'upgrade' | 'autopilot' | 'analytics' | 'memory';

interface TabMemoryInfo {
    tabId: number;
    actualMB: number;  // Real memory from Chrome API
    url: string;
    title: string;
    isAudible: boolean;
    hasMedia: boolean;
    processId?: number;
}

interface MemoryReport {
    totalMB: number;
    tabs: TabMemoryInfo[];
    heavyTabs: TabMemoryInfo[];
    systemMemory?: {
        availableMB: number;
        capacityMB: number;
        usedMB: number;
    };
    browserMemoryMB: number;
}

const Popup = () => {
    const [tabs, setTabs] = useState<TabInfo[]>([]);
    const [duplicates, setDuplicates] = useState<TabInfo[][]>([]);
    const [view, setView] = useState<View>('tabs');
    const [loading, setLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [provider, setProvider] = useState<string>('none');
    const [license, setLicense] = useState<LicenseStatus | null>(null);
    const [autoPilotReport, setAutoPilotReport] = useState<AutoPilotReport | null>(null);
    const [statusMessage, setStatusMessage] = useState<string>('');
    const [hoveredTab, setHoveredTab] = useState<number | null>(null);
    const [hoveredButton, setHoveredButton] = useState<string | null>(null);
    const [undoAction, setUndoAction] = useState<{ message: string; action: () => void } | null>(null);
    const [closedTabs, setClosedTabs] = useState<{ id: number; title: string; url: string; index: number }[]>([]);
    const [memoryUsageMB, setMemoryUsageMB] = useState<number>(0);
    const [systemMemoryMB, setSystemMemoryMB] = useState<number | null>(null);
    const [memoryReport, setMemoryReport] = useState<MemoryReport | null>(null);
    const [hasAdvancedMemory, setHasAdvancedMemory] = useState<boolean>(true);
    const [isCloudAI, setIsCloudAI] = useState<boolean>(false);
    const [grouping, setGrouping] = useState<boolean>(false);

    useEffect(() => {
        loadTabs();
        checkProvider();
        checkLicense();
        updateMemoryUsage();
        checkAdvancedMemory();
        checkAIPrivacy();

        // Update memory every 3 seconds for real-time tracking
        const memoryInterval = setInterval(() => {
            updateMemoryUsage();
        }, 3000);

        return () => clearInterval(memoryInterval);
    }, []);

    useEffect(() => {
        // Update memory when tabs change
        updateMemoryUsage();
    }, [tabs]);

    const sendMessage = useCallback(async (action: string, payload?: any) => {
        return await chrome.runtime.sendMessage({ action, payload });
    }, []);

    const loadTabs = useCallback(async () => {
        const response = await sendMessage('getWindowTabs');
        if (response.success) setTabs(response.data);
    }, [sendMessage]);

    const checkProvider = useCallback(async () => {
        const response = await sendMessage('getAIProvider');
        if (response.success) setProvider(response.data.provider);
    }, [sendMessage]);

    const checkLicense = useCallback(async () => {
        const response = await sendMessage('getLicenseStatus', { forceRefresh: true });
        if (response.success) setLicense(response.data);
    }, [sendMessage]);

    const updateMemoryUsage = useCallback(async () => {
        const response = await sendMessage('getMemoryReport');
        if (response.success) {
            setMemoryUsageMB(response.data.totalMB);
            if (response.data.systemMemory) {
                setSystemMemoryMB(response.data.systemMemory.capacityMB);
            }
            setMemoryReport(response.data);
        }
    }, [sendMessage]);

    const checkAdvancedMemory = useCallback(async () => {
        const response = await sendMessage('hasAdvancedMemory');
        if (response.success) {
            setHasAdvancedMemory(response.data.available);
        }
    }, [sendMessage]);

    const requestAdvancedMemory = useCallback(async () => {
        const response = await sendMessage('requestAdvancedMemory');
        if (response.success && response.data.granted) {
            setHasAdvancedMemory(true);
            await updateMemoryUsage();
        }
    }, [sendMessage, updateMemoryUsage]);

    const checkAIPrivacy = useCallback(async () => {
        const response = await sendMessage('getAIPrivacyInfo');
        if (response.success) {
            setIsCloudAI(!response.data.isLocal);
        }
    }, [sendMessage]);

    const showMemoryOptimizer = useCallback(async () => {
        setView('memory');
        setLoading(true);
        await updateMemoryUsage();
        setLoading(false);
    }, [updateMemoryUsage]);

    const closeMemoryHogs = useCallback(async () => {
        if (!memoryReport) return;
        const tabIds = memoryReport.heavyTabs.slice(0, 5).map(t => t.tabId);

        setTabs(prev => prev.filter(t => !tabIds.includes(t.id)));
        await sendMessage('closeTabs', { tabIds });

        setUndoAction({
            message: `Closed ${tabIds.length} memory-heavy tabs`,
            action: () => {
                loadTabs();
            }
        });

        await updateMemoryUsage();
    }, [memoryReport, sendMessage, loadTabs, updateMemoryUsage]);

    const closeTab = useCallback(async (tabId: number) => {
        // Optimistic UI update
        const tabToClose = tabs.find(t => t.id === tabId);
        if (tabToClose) {
            setTabs(prev => prev.filter(t => t.id !== tabId));

            // Perform actual close
            await sendMessage('closeTab', { tabId });
        }
    }, [sendMessage, tabs]);

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

        // Optimistic UI update
        setTabs(prev => prev.filter(t => !tabsToClose.includes(t.id)));

        // Perform actual close
        await sendMessage('closeTabs', { tabIds: tabsToClose });

        // Show undo toast
        setUndoAction({
            message: `Closed ${tabsToClose.length} duplicate tabs`,
            action: () => {
                // Reload tabs to restore (they won't actually reopen, but UI will refresh)
                loadTabs();
                findDuplicates();
            }
        });

        // Refresh after a moment
        setTimeout(() => {
            loadTabs();
            findDuplicates();
        }, 100);
    }, [duplicates, sendMessage, loadTabs, findDuplicates]);

    const showStatus = useCallback((message: string, duration = 3000) => {
        setStatusMessage(message);
        setTimeout(() => setStatusMessage(''), duration);
    }, []);

    const smartOrganize = useCallback(async () => {
        if (provider === 'none') {
            showStatus('Configure AI in settings first');
            return;
        }
        setGrouping(true);
        setLoading(true);
        showStatus('Analyzing tabs with AI...');
        const response = await sendMessage('smartOrganize');
        if (response.success) {
            showStatus(response.data.message);
            loadTabs();
        } else {
            showStatus(response.error || 'Organization failed');
        }
        setLoading(false);
        setGrouping(false);
    }, [provider, sendMessage, loadTabs, showStatus]);


    const handleUpgrade = useCallback(async () => {
        setLoading(true);
        const response = await sendMessage('getCheckoutUrl');
        if (response.success) chrome.tabs.create({ url: response.data.url });
        setLoading(false);
    }, [sendMessage]);

    const runAutoPilot = useCallback(async () => {
        if (!license?.paid) {
            setView('upgrade');
            return;
        }
        setLoading(true);
        setView('autopilot');
        setAutoPilotReport(null);
        const response = await sendMessage('autoPilotAnalyzeWithAI');
        if (response.success) {
            setAutoPilotReport(response.data);
        } else {
            if (response.error?.includes('TRIAL_EXPIRED') || response.error?.includes('LIMIT_REACHED')) {
                setView('upgrade');
            }
        }
        setLoading(false);
        checkLicense();
    }, [license, sendMessage, checkLicense]);

    const executeCleanup = useCallback(async () => {
        if (!autoPilotReport) return;
        setLoading(true);
        const tabIds = autoPilotReport.recommendations.closeSuggestions.map(t => t.tabId);
        await sendMessage('autoPilotCleanup', { tabIds });
        await loadTabs();
        await runAutoPilot();
    }, [autoPilotReport, sendMessage, loadTabs, runAutoPilot]);

    const executeGrouping = useCallback(async () => {
        if (!autoPilotReport) return;
        setLoading(true);
        await sendMessage('autoPilotGroup', { groups: autoPilotReport.recommendations.groupSuggestions });
        await loadTabs();
        await runAutoPilot();
    }, [autoPilotReport, sendMessage, loadTabs, runAutoPilot]);

    const filteredTabs = searchQuery
        ? tabs.filter(t => t.title.toLowerCase().includes(searchQuery.toLowerCase()) || t.url.toLowerCase().includes(searchQuery.toLowerCase()))
        : tabs;

    const getHostname = (url: string) => {
        try { return new URL(url).hostname; } catch { return url; }
    };

    const getProviderDisplay = () => {
        const labels: Record<string, string> = {
            nano: 'NANO',
            gemini: 'GEMINI',
            openai: 'OPENAI',
            anthropic: 'CLAUDE',
            none: 'NO AI'
        };
        return labels[provider] || provider.toUpperCase();
    };

    const getLicenseTag = () => {
        if (!license) return null;
        if (license.paid) return <span style={styles.tagPro}>PRO</span>;
        if (license.status === 'trial') return <span style={styles.tagTrial}>{license.usageRemaining}/{license.dailyLimit || 20} today</span>;
        return null;
    };

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

    const getHealthScoreColor = (score: number) => {
        if (score >= 80) return colors.success;
        if (score >= 60) return colors.accent;
        if (score >= 40) return colors.warning;
        return colors.error;
    };

    const buttonLabels: Record<string, { label: string; title: string; icon: string }> = {
        auto: { label: 'Pilot', title: 'Auto Pilot - AI-powered cleanup', icon: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5' },
        group: { label: grouping ? 'Grouping...' : 'Group', title: 'Smart Group - Organize by purpose', icon: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z' },
        stats: { label: 'Stats', title: 'Analytics - View insights', icon: 'M18 20V10M12 20V4M6 20v-6' },
    };

    return (
        <div style={styles.container}>
            {/* Header */}
            <header style={styles.header}>
                <div style={styles.headerMain}>
                    <div style={styles.logoSection}>
                        <div style={styles.logo}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <circle cx="12" cy="12" r="10"/>
                                <path d="M8 12l2 2 4-4"/>
                            </svg>
                        </div>
                        <div>
                            <div style={styles.title}>
                                <ScrambleText text="TabEater" speed={40} scrambleIterations={2} />
                            </div>
                            <div style={styles.subtitle}>
                                <MicroLabel label="TABS" value={tabs.length} />
                                {provider !== 'none' && (
                                    <span style={{ margin: `0 ${spacing.xs}px`, color: colors.textDimmer }}>·</span>
                                )}
                                {provider !== 'none' && (
                                    <MicroLabel
                                        label={isCloudAI ? "CLOUD" : "LOCAL"}
                                        value={getProviderDisplay()}
                                        style={isCloudAI ? { color: colors.warning } : { color: colors.success }}
                                    />
                                )}
                            </div>
                        </div>
                    </div>
                    {getLicenseTag()}
                </div>
                {statusMessage && (
                    <div style={styles.statusBar}>
                        <span style={styles.statusIcon}>*</span>
                        {statusMessage}
                    </div>
                )}

                {/* Memory Gauge */}
                <div
                    style={{...styles.memoryBar, cursor: 'pointer'}}
                    onClick={showMemoryOptimizer}
                    title="Click to optimize memory"
                >
                    <MemoryGauge
                        currentMB={memoryUsageMB}
                        maxMB={systemMemoryMB || 4096}
                        compact={true}
                    />
                </div>
            </header>

            {/* Actions */}
            <div style={styles.actions}>
                {Object.entries(buttonLabels).map(([key, { label, title, icon }]) => (
                    <button
                        key={key}
                        style={{
                            ...styles.btn,
                            ...(key === 'auto' && license?.paid ? styles.btnPrimary : {}),
                            ...(key === 'stats' && license?.paid ? styles.btnAccent : {}),
                            ...(hoveredButton === key ? styles.btnHover : {}),
                        }}
                        onClick={() => {
                            if (key === 'auto') runAutoPilot();
                            else if (key === 'group') smartOrganize();
                            else if (key === 'stats') showAnalytics();
                        }}
                        onMouseEnter={() => setHoveredButton(key)}
                        onMouseLeave={() => setHoveredButton(null)}
                        disabled={loading}
                        title={title}
                        aria-label={title}
                    >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 4 }}>
                            <path d={icon} />
                        </svg>
                        {label}
                    </button>
                ))}
                <button
                    style={{
                        ...styles.btnIcon,
                        ...(hoveredButton === 'sidepanel' ? styles.btnIconHover : {}),
                    }}
                    onClick={() => chrome.sidePanel.open({ windowId: chrome.windows.WINDOW_ID_CURRENT })}
                    onMouseEnter={() => setHoveredButton('sidepanel')}
                    onMouseLeave={() => setHoveredButton(null)}
                    title="Open Command Center"
                    aria-label="Open Side Panel"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                        <line x1="9" y1="3" x2="9" y2="21"/>
                    </svg>
                </button>
                <button
                    style={{
                        ...styles.btnIcon,
                        ...(hoveredButton === 'settings' ? styles.btnIconHover : {}),
                    }}
                    onClick={() => chrome.runtime.openOptionsPage()}
                    onMouseEnter={() => setHoveredButton('settings')}
                    onMouseLeave={() => setHoveredButton(null)}
                    title="Settings"
                    aria-label="Open Settings"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="3" />
                        <path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
                    </svg>
                </button>
            </div>

            {/* Onboarding - Show when no AI provider configured */}
            {provider === 'none' && view === 'tabs' && (
                <div style={{
                    padding: spacing.md,
                    background: colors.primaryBg,
                    borderBottom: `1px solid ${colors.primary}`,
                }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: spacing.sm,
                        marginBottom: spacing.sm,
                    }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={colors.primary} strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                            <path d="M12 16v-4M12 8h.01" />
                        </svg>
                        <span style={{ color: colors.primary, fontWeight: typography.semibold }}>
                            Set Up AI for Smart Features
                        </span>
                    </div>
                    <p style={{ color: colors.textDim, fontSize: typography.sizeSm, marginBottom: spacing.sm }}>
                        Enable Gemini Nano for free, private AI or configure a cloud provider in Settings.
                    </p>
                    <button
                        style={{
                            ...styles.btnRefresh,
                            width: '100%',
                            justifyContent: 'center',
                            background: colors.primary,
                            color: colors.bgDarkest,
                            fontWeight: typography.semibold,
                            border: 'none',
                        }}
                        onClick={() => chrome.runtime.openOptionsPage()}
                    >
                        Open Settings
                    </button>
                </div>
            )}

            {/* Search - Only show in tabs view */}
            {view === 'tabs' && (
                <div style={styles.searchWrap}>
                    <div style={styles.searchContainer}>
                        <svg style={styles.searchIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="11" cy="11" r="8" />
                            <path d="m21 21-4.35-4.35" />
                        </svg>
                        <input
                            type="text"
                            placeholder="Search tabs..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={styles.search}
                            aria-label="Search tabs"
                        />
                        {searchQuery && (
                            <button
                                style={styles.searchClear}
                                onClick={() => setSearchQuery('')}
                                aria-label="Clear search"
                            >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M18 6 6 18M6 6l12 12" />
                                </svg>
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Tab List View */}
            {view === 'tabs' && (
                <div style={styles.tabList}>
                    {filteredTabs.length === 0 ? (
                        <EmptyState
                            type={searchQuery ? 'no-results' : 'no-tabs'}
                            message={searchQuery ? 'No tabs match your search' : undefined}
                        />
                    ) : (
                        filteredTabs.map(tab => (
                            <div
                                key={tab.id}
                                style={{
                                    ...styles.tabItem,
                                    ...(hoveredTab === tab.id ? styles.tabItemHover : {}),
                                    ...(tab.active ? styles.tabItemActive : {}),
                                }}
                                onMouseEnter={() => setHoveredTab(tab.id)}
                                onMouseLeave={() => setHoveredTab(null)}
                            >
                                <img
                                    src={tab.favIconUrl || faviconFallback}
                                    style={styles.favicon}
                                    alt=""
                                    onError={(e) => { e.currentTarget.src = faviconFallback; }}
                                />
                                <div style={styles.tabInfo}>
                                    <div style={styles.tabTitle}>{tab.title || 'Untitled'}</div>
                                    <div style={styles.tabUrl}>{getHostname(tab.url)}</div>
                                </div>
                                <button
                                    style={{
                                        ...styles.closeBtn,
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

            {/* Duplicates View */}
            {view === 'duplicates' && (
                <div style={styles.panel}>
                    <div style={styles.panelHeader}>
                        <span>Duplicate Tabs</span>
                        {duplicates.length > 0 && (
                            <button
                                style={{
                                    ...styles.btnDanger,
                                    ...(hoveredButton === 'closeAll' ? styles.btnDangerHover : {}),
                                }}
                                onClick={closeDuplicates}
                                onMouseEnter={() => setHoveredButton('closeAll')}
                                onMouseLeave={() => setHoveredButton(null)}
                                title="Keeps first tab, closes duplicates"
                            >
                                Close Duplicates (Keep 1)
                            </button>
                        )}
                    </div>
                    <div style={styles.panelContent}>
                        {duplicates.length === 0 ? (
                            <EmptyState type="no-duplicates" />
                        ) : (
                            duplicates.map((group, i) => (
                                <div key={i} style={styles.dupeItem}>
                                    <img
                                        src={group[0]?.favIconUrl || faviconFallback}
                                        style={styles.favicon}
                                        alt=""
                                        onError={(e) => { e.currentTarget.src = faviconFallback; }}
                                    />
                                    <div style={styles.dupeInfo}>
                                        <div style={styles.dupeTitle}>{group[0]?.title}</div>
                                        <div style={styles.dupeCount}>
                                            {group.length} copies • Will keep 1, close {group.length - 1}
                                        </div>
                                    </div>
                                    <span style={{
                                        padding: '2px 6px',
                                        background: colors.successBg,
                                        color: colors.success,
                                        fontSize: typography.sizeXs,
                                        borderRadius: borderRadius.sm,
                                        fontWeight: typography.semibold,
                                    }}>
                                        KEEP 1
                                    </span>
                                </div>
                            ))
                        )}
                    </div>
                    <button style={styles.btnBack} onClick={() => setView('tabs')}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="m15 18-6-6 6-6" />
                        </svg>
                        Back to tabs
                    </button>
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

            {/* Auto Pilot View */}
            {view === 'autopilot' && (
                <div style={styles.panel}>
                    <div style={styles.panelHeader}>
                        <span>Auto Pilot</span>
                        <span style={styles.tagPro}>PRO</span>
                    </div>
                    <div style={styles.panelContent}>
                        {loading ? (
                            <div style={styles.loadingContainer}>
                                <div style={styles.loadingSpinner} />
                                <span>Analyzing tabs...</span>
                            </div>
                        ) : autoPilotReport ? (
                            <>
                                <div style={styles.statsRow}>
                                    <div style={styles.stat}>
                                        <div style={styles.statNum}>{autoPilotReport.totalTabs}</div>
                                        <div style={styles.statLabel}>Total</div>
                                    </div>
                                    <div style={styles.stat}>
                                        <div style={{ ...styles.statNum, color: autoPilotReport.staleCount > 0 ? colors.warning : colors.success }}>
                                            {autoPilotReport.staleCount}
                                        </div>
                                        <div style={styles.statLabel}>Stale</div>
                                    </div>
                                    <div style={styles.stat}>
                                        <div style={{ ...styles.statNum, color: autoPilotReport.duplicateCount > 0 ? colors.error : colors.success }}>
                                            {autoPilotReport.duplicateCount}
                                        </div>
                                        <div style={styles.statLabel}>Dupes</div>
                                    </div>
                                </div>

                                {autoPilotReport.aiInsights && (
                                    <div style={styles.insightBox}>
                                        <div style={styles.insightLabel}>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M12 2v20M2 12h20M6 6l12 12M6 18L18 6" />
                                            </svg>
                                            AI INSIGHTS
                                        </div>
                                        <div style={styles.insightText}>
                                            {formatMarkdown(autoPilotReport.aiInsights)}
                                        </div>
                                    </div>
                                )}

                                {autoPilotReport.recommendations.closeSuggestions.length > 0 && (
                                    <div style={styles.section}>
                                        <div style={styles.sectionHead}>
                                            <span>Suggested to Close ({autoPilotReport.recommendations.closeSuggestions.length})</span>
                                            <button style={styles.btnSmall} onClick={executeCleanup}>Close All</button>
                                        </div>
                                        {autoPilotReport.recommendations.closeSuggestions.slice(0, 4).map(th => (
                                            <div key={th.tabId} style={styles.suggestionItem}>
                                                <span style={styles.suggestionTitle}>{th.title}</span>
                                                <span style={styles.suggestionReason}>{th.reason}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {autoPilotReport.recommendations.groupSuggestions.length > 0 && (
                                    <div style={styles.section}>
                                        <div style={styles.sectionHead}>
                                            <span>Suggested Groups ({autoPilotReport.recommendations.groupSuggestions.length})</span>
                                            <button style={styles.btnSmall} onClick={executeGrouping}>Group All</button>
                                        </div>
                                        {autoPilotReport.recommendations.groupSuggestions.map(g => (
                                            <div key={g.name} style={styles.groupItem}>
                                                <span>{g.name}</span>
                                                <span style={styles.groupCount}>{g.tabIds.length} tabs</span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {autoPilotReport.recommendations.closeSuggestions.length === 0 &&
                                    autoPilotReport.recommendations.groupSuggestions.length === 0 && (
                                        <EmptyState type="all-optimized" />
                                    )}
                            </>
                        ) : null}
                    </div>
                    <button style={styles.btnBack} onClick={() => setView('tabs')}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="m15 18-6-6 6-6" />
                        </svg>
                        Back to tabs
                    </button>
                </div>
            )}

            {/* Analytics View */}
            {view === 'analytics' && (
                <div style={styles.panel}>
                    <div style={styles.panelHeader}>
                        <span>Analytics</span>
                        <span style={styles.tagPro}>PRO</span>
                    </div>
                    <div style={styles.panelContent}>
                        {loading ? (
                            <div style={styles.loadingContainer}>
                                <div style={styles.loadingSpinner} />
                                <span>Analyzing...</span>
                            </div>
                        ) : autoPilotReport?.analytics ? (
                            <>
                                {/* Health Score */}
                                <div style={styles.healthScoreCard}>
                                    <div style={styles.healthScoreCircle}>
                                        <svg width="80" height="80" viewBox="0 0 80 80">
                                            <circle cx="40" cy="40" r="35" fill="none" stroke={colors.borderMedium} strokeWidth="6" />
                                            <circle
                                                cx="40"
                                                cy="40"
                                                r="35"
                                                fill="none"
                                                stroke={getHealthScoreColor(autoPilotReport.analytics.healthScore)}
                                                strokeWidth="6"
                                                strokeLinecap="round"
                                                strokeDasharray={`${(autoPilotReport.analytics.healthScore / 100) * 220} 220`}
                                                transform="rotate(-90 40 40)"
                                            />
                                        </svg>
                                        <div style={styles.healthScoreValue}>
                                            <span style={{ fontSize: 24, fontWeight: typography.bold, color: getHealthScoreColor(autoPilotReport.analytics.healthScore) }}>
                                                {autoPilotReport.analytics.healthScore}
                                            </span>
                                        </div>
                                    </div>
                                    <div style={styles.healthLabel}>
                                        <span style={{ color: getHealthScoreColor(autoPilotReport.analytics.healthScore) }}>
                                            {autoPilotReport.analytics.healthLabel}
                                        </span>
                                    </div>
                                </div>

                                {/* Insights */}
                                <div style={styles.insightBox}>
                                    <div style={styles.insightLabel}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M12 2v20M2 12h20M6 6l12 12M6 18L18 6" />
                                        </svg>
                                        KEY INSIGHTS
                                    </div>
                                    <div style={styles.insightText}>
                                        {formatInsights(autoPilotReport.analytics.insights)}
                                    </div>
                                </div>

                                {/* Category Breakdown */}
                                <div style={styles.section}>
                                    <div style={styles.sectionHead}>
                                        <span>Categories</span>
                                    </div>
                                    {autoPilotReport.analytics.categoryBreakdown.slice(0, 5).map(cat => (
                                        <div key={cat.category} style={styles.analyticsRow}>
                                            <span style={styles.analyticsLabel}>{cat.category}</span>
                                            <div style={styles.analyticsBar}>
                                                <div style={{
                                                    ...styles.analyticsBarFill,
                                                    width: `${cat.percentage}%`,
                                                    background: `linear-gradient(90deg, ${colors.primary}, ${colors.accent})`,
                                                }} />
                                            </div>
                                            <span style={styles.analyticsValue}>{cat.count}</span>
                                        </div>
                                    ))}
                                </div>

                                {/* Top Domains */}
                                <div style={styles.section}>
                                    <div style={styles.sectionHead}>
                                        <span>Top Domains</span>
                                    </div>
                                    {autoPilotReport.analytics.topDomains.map(domain => (
                                        <div key={domain.domain} style={styles.analyticsRow}>
                                            <span style={styles.analyticsLabel}>{domain.domain}</span>
                                            <span style={styles.analyticsValue}>{domain.percentage}%</span>
                                        </div>
                                    ))}
                                </div>

                                {/* Stats Grid */}
                                <div style={styles.statsGrid}>
                                    <div style={styles.miniStat}>
                                        <div style={styles.miniStatValue}>{tabs.length}</div>
                                        <div style={styles.miniStatLabel}>Tabs</div>
                                    </div>
                                    <div style={styles.miniStat}>
                                        <div style={styles.miniStatValue}>{autoPilotReport.analytics.avgTabAge}</div>
                                        <div style={styles.miniStatLabel}>Avg Age</div>
                                    </div>
                                    <div style={styles.miniStat}>
                                        <div style={styles.miniStatValue}>{autoPilotReport.analytics.oldestTabDays}</div>
                                        <div style={styles.miniStatLabel}>Oldest</div>
                                    </div>
                                    <div style={styles.miniStat}>
                                        <div style={styles.miniStatValue}>{autoPilotReport?.duplicateCount || 0}</div>
                                        <div style={styles.miniStatLabel}>Dupes</div>
                                    </div>
                                </div>
                            </>
                        ) : null}
                    </div>
                    <button style={styles.btnBack} onClick={() => setView('tabs')}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="m15 18-6-6 6-6" />
                        </svg>
                        Back to tabs
                    </button>
                </div>
            )}

            {/* Memory Optimizer View */}
            {view === 'memory' && (
                <div style={styles.panel}>
                    <div style={styles.panelHeader}>
                        <span>Memory Optimizer</span>
                    </div>
                    <div style={styles.panelContent}>
                        {loading ? (
                            <div style={styles.loadingContainer}>
                                <div style={styles.loadingSpinner} />
                                <span>Analyzing memory usage...</span>
                            </div>
                        ) : memoryReport ? (
                            <>
                                <div style={styles.statsRow}>
                                    <div style={styles.stat}>
                                        <div style={styles.statNum}>{memoryReport.totalMB.toFixed(0)}</div>
                                        <div style={styles.statLabel}>Total MB</div>
                                    </div>
                                    <div style={styles.stat}>
                                        <div style={styles.statNum}>{memoryReport.tabs.length}</div>
                                        <div style={styles.statLabel}>Tabs</div>
                                    </div>
                                    <div style={styles.stat}>
                                        <div style={styles.statNum}>{(memoryReport.totalMB / memoryReport.tabs.length).toFixed(0)}</div>
                                        <div style={styles.statLabel}>Avg MB</div>
                                    </div>
                                </div>

                                <div style={styles.insightBox}>
                                    <div style={styles.insightLabel}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                                        </svg>
                                        MEMORY STATUS
                                    </div>
                                    <div style={styles.insightText}>
                                        <MicroLabel
                                            label="BROWSER"
                                            value={`${memoryReport.browserMemoryMB.toFixed(0)} MB`}
                                        />
                                        <MicroLabel
                                            label="TABS"
                                            value={`${memoryReport.totalMB.toFixed(0)} MB`}
                                            style={{ marginTop: spacing.xs }}
                                        />
                                        {memoryReport.systemMemory && (
                                            <>
                                                <MicroLabel
                                                    label="SYS AVAIL"
                                                    value={`${(memoryReport.systemMemory.availableMB / 1024).toFixed(1)} GB`}
                                                    style={{ marginTop: spacing.xs }}
                                                />
                                                <MicroLabel
                                                    label="SYS TOTAL"
                                                    value={`${(memoryReport.systemMemory.capacityMB / 1024).toFixed(1)} GB`}
                                                    style={{ marginTop: spacing.xs }}
                                                />
                                                <MicroLabel
                                                    label="SYS USAGE"
                                                    value={`${((memoryReport.systemMemory.usedMB / memoryReport.systemMemory.capacityMB) * 100).toFixed(1)}%`}
                                                    style={{ marginTop: spacing.xs }}
                                                />
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* Advanced Memory Permission Request */}
                                {!hasAdvancedMemory && (
                                    <button
                                        style={{
                                            ...styles.btnRefresh,
                                            marginBottom: spacing.md,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: spacing.sm,
                                        }}
                                        onClick={requestAdvancedMemory}
                                    >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                                        </svg>
                                        Enable Accurate Memory Tracking
                                    </button>
                                )}

                                {memoryReport.heavyTabs.length > 0 && (
                                    <div style={styles.section}>
                                        <div style={styles.sectionHead}>
                                            <span>Memory Hogs ({memoryReport.heavyTabs.length})</span>
                                            <button style={styles.btnSmall} onClick={closeMemoryHogs}>Close Top 5</button>
                                        </div>
                                        {memoryReport.heavyTabs.slice(0, 10).map(tab => (
                                            <div key={tab.tabId} style={styles.suggestionItem}>
                                                <div style={styles.suggestionTitle}>
                                                    {tab.title}
                                                    {tab.hasMedia && <span style={{ color: colors.warning, marginLeft: spacing.xs }}>📹</span>}
                                                    {tab.isAudible && <span style={{ color: colors.error, marginLeft: spacing.xs }}>🔊</span>}
                                                </div>
                                                <div style={styles.suggestionReason}>
                                                    {tab.actualMB.toFixed(1)} MB
                                                    {tab.hasMedia && ' • Media content'}
                                                    {tab.isAudible && ' • Playing audio'}
                                                </div>
                                                <button
                                                    style={styles.btnClose}
                                                    onClick={async () => {
                                                        await closeTab(tab.tabId);
                                                        await updateMemoryUsage();
                                                    }}
                                                >
                                                    ×
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {memoryReport.heavyTabs.length === 0 && (
                                    <EmptyState type="all-optimized" message="Memory usage is optimized!" />
                                )}
                            </>
                        ) : null}
                    </div>
                    <button style={styles.btnBack} onClick={() => setView('tabs')}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="m15 18-6-6 6-6" />
                        </svg>
                        Back to tabs
                    </button>
                </div>
            )}

            {/* Upgrade View */}
            {view === 'upgrade' && (
                <div style={styles.panel}>
                    <div style={styles.upgradeBox}>
                        <div style={styles.upgradeIcon}>
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={colors.primary} strokeWidth="2">
                                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                            </svg>
                        </div>
                        <div style={styles.upgradeTitle}>Upgrade to Pro</div>
                        <div style={styles.upgradePrice}>A$6.00</div>
                        <div style={styles.upgradeOnce}>one-time payment</div>
                        <ul style={styles.upgradeList}>
                            <li><span style={styles.checkmark}>&#10003;</span> Auto Pilot Mode</li>
                            <li><span style={styles.checkmark}>&#10003;</span> Unlimited AI Scans</li>
                            <li><span style={styles.checkmark}>&#10003;</span> Smart Grouping</li>
                            <li><span style={styles.checkmark}>&#10003;</span> Priority Support</li>
                        </ul>
                        <button
                            style={{
                                ...styles.btnUpgrade,
                                ...(hoveredButton === 'upgrade' ? styles.btnUpgradeHover : {}),
                            }}
                            onClick={handleUpgrade}
                            onMouseEnter={() => setHoveredButton('upgrade')}
                            onMouseLeave={() => setHoveredButton(null)}
                            disabled={loading}
                        >
                            {loading ? 'Loading...' : 'Get Pro Access'}
                        </button>
                        <button
                            style={styles.btnRefresh}
                            onClick={checkLicense}
                        >
                            Already purchased? Refresh status
                        </button>
                        <button
                            style={styles.btnRefresh}
                            onClick={() => chrome.runtime.openOptionsPage()}
                        >
                            Paid on different device? Verify in Settings
                        </button>
                    </div>
                    <button style={styles.btnBack} onClick={() => setView('tabs')}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="m15 18-6-6 6-6" />
                        </svg>
                        Back to tabs
                    </button>
                </div>
            )}

            {/* MGS Scanline Overlay */}
            <ScanlineOverlay />
        </div>
    );
};

const styles: { [key: string]: React.CSSProperties } = {
    container: {
        width: 380,
        maxHeight: 520,
        background: colors.bgDark,
        color: colors.textMuted,
        fontFamily: typography.fontFamily,
        fontSize: typography.sizeBase,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
    },
    header: {
        background: 'rgba(33, 33, 33, 0.85)',
        backdropFilter: effects.glassMedium,
        WebkitBackdropFilter: effects.glassMedium,
        borderBottom: `2px solid ${colors.primary}`,
        boxShadow: `0 2px 0 ${colors.primary}, ${shadows.glow}`,
        flexShrink: 0,
    },
    headerMain: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: `${spacing.md}px ${spacing.md}px`,
    },
    logoSection: {
        display: 'flex',
        alignItems: 'center',
        gap: spacing.md,
    },
    logo: {
        width: 32,
        height: 32,
        background: colors.primary,
        color: colors.bgDarkest,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: typography.bold,
        fontSize: typography.sizeBase,
        fontFamily: typography.fontMono,
        borderRadius: borderRadius.md,
        boxShadow: shadows.glow,
        border: `1px solid ${colors.primaryLight}`,
    },
    title: {
        fontSize: typography.sizeXl,
        fontWeight: typography.bold,
        color: colors.primary,
        letterSpacing: typography.letterWide,
    },
    subtitle: {
        fontSize: typography.sizeSm,
        color: colors.textDimmer,
        marginTop: 2,
        display: 'flex',
        alignItems: 'center',
        gap: spacing.xs,
    },
    tagPro: {
        background: colors.primary,
        color: colors.bgDarkest,
        padding: '3px 8px',
        fontSize: typography.sizeSm,
        fontWeight: typography.bold,
        borderRadius: borderRadius.sm,
        letterSpacing: typography.letterNormal,
    },
    tagTrial: {
        background: colors.borderLight,
        color: colors.warning,
        padding: '3px 8px',
        fontSize: typography.sizeSm,
        fontWeight: typography.semibold,
        borderRadius: borderRadius.sm,
    },
    statusBar: {
        background: colors.warningBg,
        color: colors.warningText,
        padding: `${spacing.sm}px ${spacing.md}px`,
        fontSize: typography.sizeMd,
        borderTop: `1px solid ${colors.borderLight}`,
        display: 'flex',
        alignItems: 'center',
        gap: spacing.sm,
    },
    statusIcon: {
        color: colors.warning,
        fontWeight: typography.bold,
    },
    memoryBar: {
        background: 'rgba(0, 0, 0, 0.3)',
        padding: `${spacing.sm}px ${spacing.md}px`,
        borderTop: `1px solid ${colors.borderMedium}`,
    },
    actions: {
        display: 'flex',
        gap: spacing.sm,
        padding: `${spacing.sm}px ${spacing.md}px`,
        background: colors.bgDarker,
        borderBottom: `1px solid ${colors.borderMedium}`,
        flexShrink: 0,
    },
    btn: {
        flex: 1,
        padding: `${spacing.sm}px ${spacing.xs}px`,
        background: colors.bgCardHover,
        border: `1px solid ${colors.borderLight}`,
        color: colors.textDim,
        fontSize: typography.sizeSm,
        fontWeight: typography.semibold,
        letterSpacing: typography.letterNormal,
        cursor: 'pointer',
        borderRadius: borderRadius.sm,
        transition: `all ${transitions.fast}`,
    },
    btnHover: {
        background: colors.borderMedium,
        color: colors.textSecondary,
        borderColor: colors.textDim,
    },
    btnPrimary: {
        background: colors.primaryBg,
        border: `1px solid ${colors.primary}`,
        color: colors.primary,
        boxShadow: shadows.glowSm,
    },
    btnAccent: {
        background: colors.accentBg,
        border: `1px solid ${colors.accent}`,
        color: colors.accent,
        boxShadow: shadows.glowAccent,
    },
    btnIcon: {
        padding: `${spacing.sm}px ${spacing.md}px`,
        background: colors.bgCardHover,
        border: `1px solid ${colors.borderLight}`,
        color: colors.textDimmer,
        cursor: 'pointer',
        borderRadius: borderRadius.sm,
        transition: `all ${transitions.fast}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
    btnIconHover: {
        background: colors.borderMedium,
        color: colors.textSecondary,
        borderColor: colors.textDim,
    },
    searchWrap: {
        padding: `${spacing.sm}px ${spacing.md}px`,
        background: colors.bgDarker,
        flexShrink: 0,
    },
    searchContainer: {
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
    },
    searchIcon: {
        position: 'absolute',
        left: 10,
        color: colors.textDimmest,
        pointerEvents: 'none',
    },
    search: {
        width: '100%',
        padding: `${spacing.sm}px ${spacing.md}px ${spacing.sm}px 32px`,
        background: colors.bgCard,
        border: `1px solid ${colors.borderMedium}`,
        color: colors.textPrimary,
        fontSize: typography.sizeMd,
        borderRadius: borderRadius.sm,
        boxSizing: 'border-box',
        outline: 'none',
        transition: `border-color ${transitions.fast}`,
    },
    searchClear: {
        position: 'absolute',
        right: 8,
        background: 'transparent',
        border: 'none',
        color: colors.textDimmest,
        cursor: 'pointer',
        padding: 4,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: borderRadius.sm,
    },
    tabList: {
        flex: 1,
        overflowY: 'auto',
        padding: `${spacing.xs}px ${spacing.sm}px`,
    },
    tabItem: {
        display: 'flex',
        alignItems: 'center',
        padding: spacing.sm,
        gap: spacing.md,
        borderBottom: `1px solid ${colors.borderDark}`,
        borderRadius: borderRadius.sm,
        transition: `background ${transitions.fast}`,
        cursor: 'default',
    },
    tabItemHover: {
        background: colors.bgCard,
    },
    tabItemActive: {
        borderLeft: `2px solid ${colors.primary}`,
        paddingLeft: spacing.sm - 2,
    },
    favicon: {
        width: 16,
        height: 16,
        borderRadius: borderRadius.sm,
        flexShrink: 0,
        objectFit: 'contain',
    },
    tabInfo: {
        flex: 1,
        minWidth: 0,
    },
    tabTitle: {
        fontSize: typography.sizeBase,
        color: colors.textSecondary,
        ...commonStyles.truncate,
    },
    tabUrl: {
        fontSize: typography.sizeSm,
        color: colors.textDimmest,
        marginTop: 1,
        ...commonStyles.truncate,
    },
    closeBtn: {
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
        transition: `all ${transitions.fast}`,
        flexShrink: 0,
    },
    panel: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        padding: spacing.md,
        overflow: 'hidden',
    },
    panelHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: typography.sizeLg,
        fontWeight: typography.semibold,
        color: colors.primary,
        marginBottom: spacing.md,
        paddingBottom: spacing.sm,
        borderBottom: `1px solid ${colors.borderMedium}`,
        flexShrink: 0,
    },
    panelContent: {
        flex: 1,
        overflowY: 'auto',
    },
    emptyState: {
        textAlign: 'center',
        color: colors.textDimmest,
        padding: spacing.xxxl,
        fontSize: typography.sizeMd,
    },
    emptyStateIcon: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: spacing.md,
        padding: spacing.xxxl,
        color: colors.textDimmest,
        fontSize: typography.sizeMd,
    },
    loadingContainer: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.md,
        padding: spacing.xxxl,
        color: colors.primary,
    },
    loadingSpinner: {
        width: 24,
        height: 24,
        border: `2px solid ${colors.borderLight}`,
        borderTop: `2px solid ${colors.primary}`,
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
    },
    btnBack: {
        marginTop: spacing.md,
        padding: spacing.md,
        background: colors.bgCard,
        border: `1px solid ${colors.borderMedium}`,
        color: colors.textDim,
        fontSize: typography.sizeMd,
        cursor: 'pointer',
        borderRadius: borderRadius.sm,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        transition: `all ${transitions.fast}`,
        flexShrink: 0,
    },
    btnDanger: {
        padding: `${spacing.xs}px ${spacing.md}px`,
        background: colors.errorBg,
        border: `1px solid ${colors.error}`,
        color: colors.error,
        fontSize: typography.sizeSm,
        fontWeight: typography.semibold,
        cursor: 'pointer',
        borderRadius: borderRadius.sm,
        transition: `all ${transitions.fast}`,
    },
    btnDangerHover: {
        background: colors.error,
        color: colors.textPrimary,
    },
    dupeItem: {
        display: 'flex',
        alignItems: 'center',
        gap: spacing.md,
        padding: spacing.md,
        background: colors.bgCard,
        marginBottom: spacing.sm,
        borderRadius: borderRadius.sm,
        borderLeft: `3px solid ${colors.warning}`,
    },
    dupeInfo: {
        flex: 1,
        minWidth: 0,
    },
    dupeTitle: {
        fontSize: typography.sizeMd,
        color: colors.textMuted,
        ...commonStyles.truncate,
    },
    dupeCount: {
        fontSize: typography.sizeSm,
        color: colors.warning,
        marginTop: 2,
    },
    analysisText: {
        margin: 0,
        whiteSpace: 'pre-wrap',
        fontFamily: typography.fontFamily,
        fontSize: typography.sizeMd,
        lineHeight: 1.6,
        color: colors.textDim,
        background: colors.bgDarker,
        padding: spacing.md,
        borderRadius: borderRadius.sm,
        border: `1px solid ${colors.borderDark}`,
    },
    analysisCards: {
        display: 'flex',
        flexDirection: 'column',
        gap: spacing.sm,
    },
    analysisCard: {
        background: colors.bgCard,
        borderRadius: borderRadius.sm,
        borderLeft: `3px solid ${colors.primary}`,
        overflow: 'hidden',
    },
    analysisCardHeader: {
        display: 'flex',
        alignItems: 'center',
        gap: spacing.sm,
        padding: `${spacing.sm}px ${spacing.md}px`,
        fontSize: typography.sizeSm,
        fontWeight: typography.bold,
        letterSpacing: typography.letterNormal,
        textTransform: 'uppercase',
        background: 'rgba(0,0,0,0.2)',
    },
    analysisCardContent: {
        padding: `${spacing.sm}px ${spacing.md}px`,
    },
    analysisItem: {
        fontSize: typography.sizeMd,
        color: colors.textMuted,
        padding: `${spacing.xs}px 0`,
        lineHeight: 1.4,
        borderBottom: `1px solid ${colors.borderDark}`,
    },
    statsRow: {
        display: 'flex',
        gap: spacing.sm,
        marginBottom: spacing.md,
    },
    stat: {
        flex: 1,
        background: colors.bgCard,
        padding: `${spacing.md}px ${spacing.sm}px`,
        textAlign: 'center',
        borderRadius: borderRadius.sm,
        border: `1px solid ${colors.borderDark}`,
    },
    statNum: {
        fontSize: 22,
        fontWeight: typography.bold,
        color: colors.primary,
    },
    statLabel: {
        fontSize: typography.sizeXs,
        color: colors.textDimmest,
        letterSpacing: typography.letterNormal,
        marginTop: spacing.xs,
        textTransform: 'uppercase',
    },
    insightBox: {
        background: colors.primaryBg,
        border: `1px solid ${colors.borderLight}`,
        padding: spacing.md,
        marginBottom: spacing.md,
        borderRadius: borderRadius.sm,
    },
    insightLabel: {
        display: 'flex',
        alignItems: 'center',
        gap: spacing.xs,
        fontSize: typography.sizeXs,
        color: colors.primary,
        letterSpacing: typography.letterNormal,
        marginBottom: spacing.sm,
        textTransform: 'uppercase',
        fontWeight: typography.semibold,
    },
    insightText: {
        fontSize: typography.sizeLg,
        lineHeight: 1.6,
        color: colors.textSecondary,
    },
    section: {
        marginBottom: spacing.md,
    },
    sectionHead: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: typography.sizeSm,
        fontWeight: typography.semibold,
        color: colors.textDim,
        letterSpacing: typography.letterNormal,
        marginBottom: spacing.sm,
    },
    btnSmall: {
        padding: `${spacing.xs}px ${spacing.md}px`,
        background: colors.primary,
        border: 'none',
        color: colors.bgDarkest,
        fontSize: typography.sizeXs,
        fontWeight: typography.bold,
        cursor: 'pointer',
        borderRadius: borderRadius.sm,
    },
    btnClose: {
        position: 'absolute' as const,
        top: spacing.sm,
        right: spacing.sm,
        width: 24,
        height: 24,
        background: colors.error,
        border: 'none',
        color: colors.textPrimary,
        fontSize: typography.sizeLg,
        fontWeight: typography.bold,
        cursor: 'pointer',
        borderRadius: borderRadius.full,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        lineHeight: 1,
        padding: 0,
    },
    suggestionItem: {
        position: 'relative' as const,
        padding: spacing.sm,
        paddingRight: 40, // Make room for close button
        background: '#1a0a0a',
        marginBottom: spacing.xs,
        borderRadius: borderRadius.sm,
        borderLeft: `3px solid ${colors.error}`,
    },
    suggestionTitle: {
        display: 'block',
        fontSize: typography.sizeMd,
        color: colors.textMuted,
        ...commonStyles.truncate,
    },
    suggestionReason: {
        display: 'block',
        fontSize: typography.sizeXs,
        color: colors.warning,
        marginTop: 3,
    },
    groupItem: {
        display: 'flex',
        justifyContent: 'space-between',
        padding: spacing.sm,
        background: colors.infoBg,
        marginBottom: spacing.xs,
        borderRadius: borderRadius.sm,
        borderLeft: `3px solid ${colors.info}`,
        fontSize: typography.sizeMd,
        color: colors.textMuted,
    },
    groupCount: {
        color: colors.info,
        fontSize: typography.sizeSm,
    },
    upgradeBox: {
        background: `linear-gradient(180deg, ${colors.bgDarker}, ${colors.bgCard})`,
        border: `2px solid ${colors.primary}`,
        borderRadius: borderRadius.lg,
        padding: spacing.xxl,
        textAlign: 'center',
    },
    upgradeIcon: {
        marginBottom: spacing.md,
    },
    upgradeTitle: {
        fontSize: typography.sizeXxl,
        fontWeight: typography.bold,
        color: colors.primary,
        letterSpacing: typography.letterWider,
        marginBottom: spacing.sm,
    },
    upgradePrice: {
        fontSize: 36,
        fontWeight: typography.bold,
        color: colors.textPrimary,
    },
    upgradeOnce: {
        fontSize: typography.sizeSm,
        color: colors.textDimmer,
        letterSpacing: typography.letterWide,
        marginBottom: spacing.lg,
    },
    upgradeList: {
        textAlign: 'left',
        listStyle: 'none',
        padding: 0,
        margin: `0 0 ${spacing.xl}px`,
        fontSize: typography.sizeBase,
        color: colors.textDim,
    },
    checkmark: {
        color: colors.primary,
        marginRight: spacing.sm,
        fontWeight: typography.bold,
    },
    btnUpgrade: {
        width: '100%',
        padding: spacing.md,
        background: colors.primary,
        border: 'none',
        color: colors.bgDarkest,
        fontSize: typography.sizeXl,
        fontWeight: typography.bold,
        letterSpacing: typography.letterWide,
        cursor: 'pointer',
        borderRadius: borderRadius.sm,
        marginBottom: spacing.sm,
        transition: `all ${transitions.fast}`,
    },
    btnUpgradeHover: {
        background: colors.primaryDark,
    },
    btnRefresh: {
        width: '100%',
        padding: spacing.sm,
        background: 'transparent',
        border: `1px solid ${colors.borderLight}`,
        color: colors.textDimmer,
        fontSize: typography.sizeSm,
        cursor: 'pointer',
        borderRadius: borderRadius.sm,
        transition: `all ${transitions.fast}`,
    },
    // Analytics styles
    healthScoreCard: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: spacing.lg,
        marginBottom: spacing.md,
    },
    healthScoreCircle: {
        position: 'relative',
        width: 80,
        height: 80,
    },
    healthScoreValue: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
    healthLabel: {
        marginTop: spacing.sm,
        fontSize: typography.sizeLg,
        fontWeight: typography.semibold,
    },
    insightItem: {
        display: 'flex',
        gap: spacing.sm,
        fontSize: typography.sizeMd,
        color: colors.textMuted,
        marginBottom: spacing.xs,
        lineHeight: 1.4,
    },
    insightBullet: {
        color: colors.primary,
        fontWeight: typography.bold,
    },
    analyticsRow: {
        display: 'flex',
        alignItems: 'center',
        gap: spacing.md,
        padding: `${spacing.sm}px 0`,
        borderBottom: `1px solid ${colors.borderDark}`,
    },
    analyticsLabel: {
        flex: 1,
        fontSize: typography.sizeMd,
        color: colors.textMuted,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
    },
    analyticsBar: {
        width: 80,
        height: 6,
        background: colors.borderMedium,
        borderRadius: borderRadius.full,
        overflow: 'hidden',
    },
    analyticsBarFill: {
        height: '100%',
        borderRadius: borderRadius.full,
        transition: `width ${transitions.normal}`,
    },
    analyticsValue: {
        fontSize: typography.sizeMd,
        color: colors.textDim,
        minWidth: 28,
        textAlign: 'right',
    },
    statsGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: spacing.sm,
        marginTop: spacing.md,
    },
    miniStat: {
        background: colors.bgDarker,
        padding: spacing.sm,
        borderRadius: borderRadius.sm,
        textAlign: 'center',
    },
    miniStatValue: {
        fontSize: typography.sizeXl,
        fontWeight: typography.bold,
        color: colors.primary,
    },
    miniStatLabel: {
        fontSize: typography.sizeXs,
        color: colors.textDimmest,
        marginTop: 2,
    },
};

// Add keyframe animation and enhanced styles
const styleSheet = document.createElement('style');
styleSheet.textContent = `
    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }

    /* Cyber-themed focus states */
    input:focus {
        border-color: ${colors.primary} !important;
        box-shadow: ${shadows.glow}, 0 0 0 2px ${colors.primaryBg};
    }

    button:focus-visible {
        outline: 2px solid ${colors.primary};
        outline-offset: 2px;
        box-shadow: ${shadows.glowSm};
        z-index: 1;
    }

    /* Keyboard navigation support */
    [role="button"]:focus-visible {
        outline: 2px solid ${colors.primary};
        outline-offset: 1px;
        background: ${colors.bgCardHover};
        box-shadow: ${shadows.glowSm};
    }

    /* Button hover effects with glow */
    button:hover:not(:disabled) {
        box-shadow: ${shadows.glowSm};
    }

    /* Improved scrollbar styling */
    ::-webkit-scrollbar {
        width: 8px;
    }

    ::-webkit-scrollbar-track {
        background: transparent;
    }

    ::-webkit-scrollbar-thumb {
        background: ${colors.borderLight};
        border-radius: 4px;
        transition: all 0.2s ease;
    }

    ::-webkit-scrollbar-thumb:hover {
        background: ${colors.primary};
        box-shadow: ${shadows.glowSm};
    }

    /* CSS-based hover states for better performance */
    .tab-item-hover:hover {
        background: ${colors.bgCard} !important;
    }

    .btn-hover:hover {
        background: ${colors.borderMedium} !important;
        color: ${colors.textSecondary} !important;
        border-color: ${colors.textDim} !important;
    }

    .close-btn-hover:hover {
        color: ${colors.error} !important;
        background: ${colors.errorBg} !important;
    }

    /* Smooth transitions */
    * {
        transition: background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease;
    }

    /* Reduced motion for accessibility */
    @media (prefers-reduced-motion: reduce) {
        * {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
        }
    }
`;
document.head.appendChild(styleSheet);

const container = document.getElementById('root');
if (container) {
    const root = createRoot(container);
    root.render(<Popup />);
}
