import React, { useState, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { colors, spacing, typography, borderRadius, transitions, shadows, faviconFallback, commonStyles } from '../shared/theme';
import { UndoToast } from '../ui/components/UndoToast';
import { EmptyState } from '../ui/components/EmptyState';
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

type View = 'tabs' | 'duplicates' | 'upgrade' | 'actions' | 'analytics' | 'memory';

interface MemoryReport {
    totalMB: number;
    tabs: { tabId: number; actualMB: number; url: string; title: string; isAudible: boolean; hasMedia: boolean }[];
    heavyTabs: { tabId: number; actualMB: number; url: string; title: string; isAudible: boolean; hasMedia: boolean }[];
    systemMemory?: { availableMB: number; capacityMB: number; usedMB: number };
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
    const [undoAction, setUndoAction] = useState<{ message: string; action: () => void } | null>(null);
    const [memoryUsageMB, setMemoryUsageMB] = useState<number>(0);
    const [memoryReport, setMemoryReport] = useState<MemoryReport | null>(null);
    const [grouping, setGrouping] = useState<boolean>(false);

    useEffect(() => {
        loadTabs();
        checkProvider();
        checkLicense();
        updateMemoryUsage();
    }, []);

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
            setMemoryReport(response.data);
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

    const smartOrganize = useCallback(async () => {
        if (provider === 'none') {
            showStatus('Configure AI in settings first');
            return;
        }
        setGrouping(true);
        setLoading(true);
        showStatus('Organizing tabs...');
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

    const getHealthScoreColor = (score: number) => {
        if (score >= 80) return colors.success;
        if (score >= 60) return colors.primary;
        if (score >= 40) return colors.warning;
        return colors.error;
    };

    // Check if all actions are clear
    const isAllClear = autoPilotReport &&
        autoPilotReport.recommendations.closeSuggestions.length === 0 &&
        autoPilotReport.recommendations.groupSuggestions.length === 0 &&
        autoPilotReport.duplicateCount === 0;

    return (
        <div style={styles.container}>
            {/* Clean Header */}
            <header style={styles.header}>
                <div style={styles.headerLeft}>
                    <div style={styles.logoIcon}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <circle cx="12" cy="12" r="10"/>
                            <path d="M8 12l2 2 4-4"/>
                        </svg>
                    </div>
                    <span style={styles.logoText}>TabEater</span>
                    {license?.paid && <span style={styles.proBadge}>Pro</span>}
                    {license?.status === 'trial' && !license.paid && (
                        <span style={styles.trialBadge}>{license.usageRemaining}/2 daily · 7 day trial</span>
                    )}
                </div>
                <div style={styles.headerRight}>
                    {/* Minimal memory indicator */}
                    <div style={styles.memoryPill}>
                        <span style={styles.memoryText}>{Math.round(memoryUsageMB)} MB</span>
                    </div>
                    <button
                        style={styles.iconBtn}
                        onClick={async () => {
                            try {
                                const win = await chrome.windows.getCurrent();
                                if (win.id) {
                                    await chrome.sidePanel.open({ windowId: win.id });
                                    window.close();
                                }
                            } catch { /* ignore */ }
                        }}
                        title="Open Sidebar"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="3" width="18" height="18" rx="2"/>
                            <line x1="9" y1="3" x2="9" y2="21"/>
                        </svg>
                    </button>
                    <button
                        style={styles.iconBtn}
                        onClick={() => chrome.runtime.openOptionsPage()}
                        title="Settings"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="3"/>
                            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                        </svg>
                    </button>
                </div>
            </header>

            {/* Status Message */}
            {statusMessage && (
                <div style={styles.statusBar}>{statusMessage}</div>
            )}

            {/* Quick Actions Bar */}
            <div style={styles.actionsBar}>
                <button
                    style={{
                        ...styles.actionBarBtn,
                        ...(license?.paid ? styles.actionBarBtnPrimary : {}),
                    }}
                    onClick={runActions}
                    disabled={loading}
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                    </svg>
                    Actions
                </button>
                <button
                    style={styles.actionBarBtn}
                    onClick={smartOrganize}
                    disabled={loading || grouping}
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                    </svg>
                    {grouping ? 'Grouping...' : 'Group'}
                </button>
                <button
                    style={styles.actionBarBtn}
                    onClick={showAnalytics}
                    disabled={loading}
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 20V10M12 20V4M6 20v-6"/>
                    </svg>
                    Stats
                </button>
            </div>

            {/* Setup Prompt */}
            {provider === 'none' && view === 'tabs' && (
                <div style={styles.setupBanner}>
                    <div style={styles.setupIcon}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={colors.primary} strokeWidth="2">
                            <circle cx="12" cy="12" r="10"/>
                            <path d="M12 16v-4M12 8h.01"/>
                        </svg>
                    </div>
                    <div style={styles.setupContent}>
                        <div style={styles.setupTitle}>Enable AI features</div>
                        <div style={styles.setupDesc}>Set up Gemini Nano (free & private) or a cloud provider</div>
                    </div>
                    <button style={styles.setupBtn} onClick={() => chrome.runtime.openOptionsPage()}>
                        Set up
                    </button>
                </div>
            )}

            {/* Search */}
            {view === 'tabs' && (
                <div style={styles.searchWrap}>
                    <div style={styles.searchBox}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={colors.textDim} strokeWidth="2">
                            <circle cx="11" cy="11" r="8"/>
                            <path d="m21 21-4.35-4.35"/>
                        </svg>
                        <input
                            type="text"
                            placeholder="Search tabs..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={styles.searchInput}
                        />
                        {searchQuery && (
                            <button style={styles.searchClear} onClick={() => setSearchQuery('')}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M18 6 6 18M6 6l12 12"/>
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
                        <EmptyState type={searchQuery ? 'no-results' : 'no-tabs'} />
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
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M18 6 6 18M6 6l12 12"/>
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
                        <span style={styles.panelTitle}>Duplicates</span>
                        {duplicates.length > 0 && (
                            <button style={styles.btnDanger} onClick={closeDuplicates}>
                                Close duplicates
                            </button>
                        )}
                    </div>
                    <div style={styles.panelContent}>
                        {duplicates.length === 0 ? (
                            <div style={styles.emptyState}>
                                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={colors.success} strokeWidth="1.5">
                                    <circle cx="12" cy="12" r="10"/>
                                    <path d="M8 12l2 2 4-4"/>
                                </svg>
                                <div style={styles.emptyTitle}>No duplicates</div>
                                <div style={styles.emptyDesc}>All your tabs are unique</div>
                            </div>
                        ) : (
                            duplicates.map((group, i) => (
                                <div key={i} style={styles.dupeItem}>
                                    <img src={group[0]?.favIconUrl || faviconFallback} style={styles.favicon} alt="" />
                                    <div style={styles.dupeInfo}>
                                        <div style={styles.dupeTitle}>{group[0]?.title}</div>
                                        <div style={styles.dupeCount}>{group.length} copies · will keep 1</div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                    <button style={styles.backBtn} onClick={() => setView('tabs')}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="m15 18-6-6 6-6"/>
                        </svg>
                        Back
                    </button>
                </div>
            )}

            {/* Actions View - Clean action cards */}
            {view === 'actions' && (
                <div style={styles.panel}>
                    <div style={styles.panelHeader}>
                        <span style={styles.panelTitle}>Actions</span>
                    </div>
                    <div style={styles.panelContent}>
                        {loading ? (
                            <div style={styles.loadingState}>
                                <div style={styles.spinner} />
                                <span>Analyzing...</span>
                            </div>
                        ) : isAllClear ? (
                            <div style={styles.allClearState}>
                                <div style={styles.allClearIcon}>
                                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={colors.success} strokeWidth="1.5">
                                        <circle cx="12" cy="12" r="10"/>
                                        <path d="M8 12l2 2 4-4"/>
                                    </svg>
                                </div>
                                <div style={styles.allClearTitle}>All clear!</div>
                                <div style={styles.allClearDesc}>Your tabs are organized and clean</div>
                            </div>
                        ) : autoPilotReport ? (
                            <div style={styles.actionCards}>
                                {/* Cleanup Card */}
                                <div style={styles.actionCard}>
                                    <div style={styles.actionCardHeader}>
                                        <div style={{...styles.actionCardIcon, background: colors.errorBg}}>
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={colors.error} strokeWidth="2">
                                                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                            </svg>
                                        </div>
                                        <div style={styles.actionCardInfo}>
                                            <div style={styles.actionCardTitle}>Cleanup</div>
                                            <div style={styles.actionCardDesc}>
                                                {autoPilotReport.recommendations.closeSuggestions.length > 0
                                                    ? `${autoPilotReport.recommendations.closeSuggestions.length} tabs to clean`
                                                    : 'Nothing to clean'}
                                            </div>
                                        </div>
                                    </div>
                                    {autoPilotReport.recommendations.closeSuggestions.length > 0 && (
                                        <button style={styles.actionCardBtn} onClick={executeCleanup}>
                                            Clean all
                                        </button>
                                    )}
                                </div>

                                {/* Organize Card */}
                                <div style={styles.actionCard}>
                                    <div style={styles.actionCardHeader}>
                                        <div style={{...styles.actionCardIcon, background: colors.infoBg}}>
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={colors.info} strokeWidth="2">
                                                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                                            </svg>
                                        </div>
                                        <div style={styles.actionCardInfo}>
                                            <div style={styles.actionCardTitle}>Organize</div>
                                            <div style={styles.actionCardDesc}>
                                                {autoPilotReport.recommendations.groupSuggestions.length > 0
                                                    ? `${autoPilotReport.recommendations.groupSuggestions.length} groups suggested`
                                                    : 'Already organized'}
                                            </div>
                                        </div>
                                    </div>
                                    {autoPilotReport.recommendations.groupSuggestions.length > 0 && (
                                        <button style={styles.actionCardBtn} onClick={executeGrouping}>
                                            Group all
                                        </button>
                                    )}
                                </div>

                                {/* Duplicates Card */}
                                <div style={styles.actionCard}>
                                    <div style={styles.actionCardHeader}>
                                        <div style={{...styles.actionCardIcon, background: colors.warningBg}}>
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={colors.warning} strokeWidth="2">
                                                <rect x="8" y="8" width="12" height="12" rx="2"/>
                                                <path d="M4 16V6a2 2 0 0 1 2-2h10"/>
                                            </svg>
                                        </div>
                                        <div style={styles.actionCardInfo}>
                                            <div style={styles.actionCardTitle}>Duplicates</div>
                                            <div style={styles.actionCardDesc}>
                                                {autoPilotReport.duplicateCount > 0
                                                    ? `${autoPilotReport.duplicateCount} duplicates found`
                                                    : 'No duplicates'}
                                            </div>
                                        </div>
                                    </div>
                                    {autoPilotReport.duplicateCount > 0 && (
                                        <button style={styles.actionCardBtn} onClick={findDuplicates}>
                                            Review
                                        </button>
                                    )}
                                </div>
                            </div>
                        ) : null}
                    </div>
                    <button style={styles.backBtn} onClick={() => setView('tabs')}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="m15 18-6-6 6-6"/>
                        </svg>
                        Back
                    </button>
                </div>
            )}

            {/* Analytics View */}
            {view === 'analytics' && (
                <div style={styles.panel}>
                    <div style={styles.panelHeader}>
                        <span style={styles.panelTitle}>Analytics</span>
                    </div>
                    <div style={styles.panelContent}>
                        {loading ? (
                            <div style={styles.loadingState}>
                                <div style={styles.spinner} />
                                <span>Analyzing...</span>
                            </div>
                        ) : autoPilotReport?.analytics ? (
                            <>
                                {/* Health Score */}
                                <div style={styles.healthCard}>
                                    <div style={styles.healthScore}>
                                        <svg width="80" height="80" viewBox="0 0 80 80">
                                            <circle cx="40" cy="40" r="35" fill="none" stroke={colors.borderMedium} strokeWidth="6"/>
                                            <circle
                                                cx="40" cy="40" r="35" fill="none"
                                                stroke={getHealthScoreColor(autoPilotReport.analytics.healthScore)}
                                                strokeWidth="6" strokeLinecap="round"
                                                strokeDasharray={`${(autoPilotReport.analytics.healthScore / 100) * 220} 220`}
                                                transform="rotate(-90 40 40)"
                                            />
                                        </svg>
                                        <div style={styles.healthValue}>
                                            <span style={{fontSize: 24, fontWeight: 600, color: getHealthScoreColor(autoPilotReport.analytics.healthScore)}}>
                                                {autoPilotReport.analytics.healthScore}
                                            </span>
                                        </div>
                                    </div>
                                    <div style={{...styles.healthLabel, color: getHealthScoreColor(autoPilotReport.analytics.healthScore)}}>
                                        {autoPilotReport.analytics.healthLabel}
                                    </div>
                                </div>

                                {/* Insights */}
                                <div style={styles.insightsList}>
                                    {autoPilotReport.analytics.insights.map((insight, i) => (
                                        <div key={i} style={styles.insightItem}>
                                            <span style={styles.insightBullet}>•</span>
                                            {insight}
                                        </div>
                                    ))}
                                </div>

                                {/* Stats Grid */}
                                <div style={styles.statsGrid}>
                                    <div style={styles.statBox}>
                                        <div style={styles.statValue}>{autoPilotReport.totalTabs}</div>
                                        <div style={styles.statLabel}>Tabs</div>
                                    </div>
                                    <div style={styles.statBox}>
                                        <div style={styles.statValue}>{autoPilotReport.analytics.avgTabAge}d</div>
                                        <div style={styles.statLabel}>Avg Age</div>
                                    </div>
                                    <div style={styles.statBox}>
                                        <div style={styles.statValue}>{autoPilotReport.staleCount}</div>
                                        <div style={styles.statLabel}>Stale</div>
                                    </div>
                                    <div style={styles.statBox}>
                                        <div style={styles.statValue}>{autoPilotReport.duplicateCount}</div>
                                        <div style={styles.statLabel}>Dupes</div>
                                    </div>
                                </div>

                                {/* Category Breakdown */}
                                <div style={styles.section}>
                                    <div style={styles.sectionTitle}>Categories</div>
                                    {autoPilotReport.analytics.categoryBreakdown.slice(0, 5).map(cat => (
                                        <div key={cat.category} style={styles.categoryRow}>
                                            <span style={styles.categoryName}>{cat.category}</span>
                                            <div style={styles.categoryBar}>
                                                <div style={{...styles.categoryBarFill, width: `${cat.percentage}%`}} />
                                            </div>
                                            <span style={styles.categoryCount}>{cat.count}</span>
                                        </div>
                                    ))}
                                </div>
                            </>
                        ) : null}
                    </div>
                    <button style={styles.backBtn} onClick={() => setView('tabs')}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="m15 18-6-6 6-6"/>
                        </svg>
                        Back
                    </button>
                </div>
            )}

            {/* Upgrade View */}
            {view === 'upgrade' && (
                <div style={styles.panel}>
                    <div style={styles.upgradeContent}>
                        <div style={styles.upgradeIcon}>
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={colors.primary} strokeWidth="2">
                                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                            </svg>
                        </div>
                        <div style={styles.upgradeTitle}>Upgrade to Pro</div>
                        <div style={styles.upgradePrice}>A$6.00 <span style={styles.upgradePriceNote}>one-time</span></div>
                        <ul style={styles.upgradeFeatures}>
                            <li>Unlimited AI scans</li>
                            <li>Auto Pilot mode</li>
                            <li>Smart grouping</li>
                            <li>Priority support</li>
                        </ul>
                        <button style={styles.upgradeBtn} onClick={handleUpgrade} disabled={loading}>
                            {loading ? 'Loading...' : 'Get Pro'}
                        </button>
                        <button style={styles.refreshBtn} onClick={checkLicense}>
                            Already purchased? Refresh
                        </button>
                    </div>
                    <button style={styles.backBtn} onClick={() => setView('tabs')}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="m15 18-6-6 6-6"/>
                        </svg>
                        Back
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
        </div>
    );
};

// Clean, minimalist styles
const styles: { [key: string]: React.CSSProperties } = {
    container: {
        width: 380,
        maxHeight: 520,
        background: colors.bgDarker,
        color: colors.textMuted,
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
        borderBottom: `1px solid ${colors.borderMedium}`,
        background: colors.bgDark,
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
    logoIcon: {
        width: 28,
        height: 28,
        background: colors.primary,
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: borderRadius.sm,
    },
    logoText: {
        fontSize: typography.sizeLg,
        fontWeight: typography.semibold,
        color: colors.textPrimary,
    },
    proBadge: {
        fontSize: typography.sizeXs,
        fontWeight: typography.medium,
        color: colors.primary,
        background: colors.primaryBg,
        padding: '2px 6px',
        borderRadius: borderRadius.xs,
    },
    trialBadge: {
        fontSize: typography.sizeXs,
        fontWeight: typography.medium,
        color: colors.warning,
        background: colors.warningBg,
        padding: '2px 6px',
        borderRadius: borderRadius.xs,
    },
    memoryPill: {
        background: colors.bgCard,
        border: `1px solid ${colors.borderMedium}`,
        borderRadius: borderRadius.full,
        padding: '4px 10px',
    },
    memoryText: {
        fontSize: typography.sizeXs,
        color: colors.textDim,
    },
    iconBtn: {
        width: 32,
        height: 32,
        background: 'transparent',
        border: 'none',
        borderRadius: borderRadius.sm,
        color: colors.textDim,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: transitions.fast,
    },
    statusBar: {
        background: colors.primaryBg,
        color: colors.primary,
        padding: `${spacing.sm}px ${spacing.lg}px`,
        fontSize: typography.sizeSm,
        borderBottom: `1px solid ${colors.borderMedium}`,
    },
    actionsBar: {
        display: 'flex',
        gap: spacing.sm,
        padding: `${spacing.sm}px ${spacing.lg}px`,
        background: colors.bgDark,
        borderBottom: `1px solid ${colors.borderMedium}`,
    },
    actionBarBtn: {
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.xs,
        padding: `${spacing.sm}px ${spacing.md}px`,
        background: colors.bgCard,
        border: `1px solid ${colors.borderMedium}`,
        borderRadius: borderRadius.sm,
        color: colors.textMuted,
        fontSize: typography.sizeSm,
        fontWeight: typography.medium,
        cursor: 'pointer',
        transition: transitions.fast,
    },
    actionBarBtnPrimary: {
        background: colors.primaryBg,
        borderColor: colors.primary,
        color: colors.primary,
    },
    setupBanner: {
        display: 'flex',
        alignItems: 'center',
        gap: spacing.md,
        padding: spacing.lg,
        background: colors.bgCard,
        borderBottom: `1px solid ${colors.borderMedium}`,
    },
    setupIcon: {
        flexShrink: 0,
    },
    setupContent: {
        flex: 1,
    },
    setupTitle: {
        fontSize: typography.sizeSm,
        fontWeight: typography.medium,
        color: colors.textSecondary,
    },
    setupDesc: {
        fontSize: typography.sizeXs,
        color: colors.textDim,
        marginTop: 2,
    },
    setupBtn: {
        padding: `${spacing.xs}px ${spacing.md}px`,
        background: colors.primary,
        border: 'none',
        borderRadius: borderRadius.sm,
        color: '#fff',
        fontSize: typography.sizeSm,
        fontWeight: typography.medium,
        cursor: 'pointer',
    },
    searchWrap: {
        padding: `${spacing.sm}px ${spacing.lg}px`,
        background: colors.bgDark,
    },
    searchBox: {
        display: 'flex',
        alignItems: 'center',
        gap: spacing.sm,
        background: colors.bgCard,
        border: `1px solid ${colors.borderMedium}`,
        borderRadius: borderRadius.sm,
        padding: `${spacing.sm}px ${spacing.md}px`,
    },
    searchInput: {
        flex: 1,
        background: 'transparent',
        border: 'none',
        outline: 'none',
        color: colors.textPrimary,
        fontSize: typography.sizeSm,
    },
    searchClear: {
        background: 'transparent',
        border: 'none',
        color: colors.textDim,
        cursor: 'pointer',
        padding: 0,
        display: 'flex',
    },
    tabList: {
        flex: 1,
        overflowY: 'auto',
        padding: `${spacing.xs}px 0`,
    },
    tabItem: {
        display: 'flex',
        alignItems: 'center',
        gap: spacing.md,
        padding: `${spacing.sm}px ${spacing.lg}px`,
        cursor: 'default',
        transition: transitions.fast,
    },
    tabItemHover: {
        background: colors.bgCard,
    },
    tabItemActive: {
        borderLeft: `2px solid ${colors.primary}`,
        paddingLeft: spacing.lg - 2,
    },
    favicon: {
        width: 16,
        height: 16,
        borderRadius: borderRadius.xs,
        flexShrink: 0,
    },
    tabInfo: {
        flex: 1,
        minWidth: 0,
    },
    tabTitle: {
        fontSize: typography.sizeSm,
        color: colors.textSecondary,
        ...commonStyles.truncate,
    },
    tabUrl: {
        fontSize: typography.sizeXs,
        color: colors.textDimmest,
        marginTop: 1,
        ...commonStyles.truncate,
    },
    closeBtn: {
        width: 24,
        height: 24,
        background: 'transparent',
        border: 'none',
        color: colors.textDim,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: borderRadius.xs,
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
        borderBottom: `1px solid ${colors.borderMedium}`,
        background: colors.bgDark,
    },
    panelTitle: {
        fontSize: typography.sizeLg,
        fontWeight: typography.semibold,
        color: colors.textPrimary,
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
        gap: spacing.xs,
        padding: spacing.md,
        margin: spacing.lg,
        marginTop: 0,
        background: colors.bgCard,
        border: `1px solid ${colors.borderMedium}`,
        borderRadius: borderRadius.sm,
        color: colors.textMuted,
        fontSize: typography.sizeSm,
        cursor: 'pointer',
    },
    btnDanger: {
        padding: `${spacing.xs}px ${spacing.md}px`,
        background: colors.errorBg,
        border: `1px solid ${colors.error}`,
        borderRadius: borderRadius.sm,
        color: colors.error,
        fontSize: typography.sizeSm,
        fontWeight: typography.medium,
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
        fontSize: typography.sizeLg,
        fontWeight: typography.medium,
        color: colors.textSecondary,
        marginTop: spacing.md,
    },
    emptyDesc: {
        fontSize: typography.sizeSm,
        color: colors.textDim,
        marginTop: spacing.xs,
    },
    dupeItem: {
        display: 'flex',
        alignItems: 'center',
        gap: spacing.md,
        padding: spacing.md,
        background: colors.bgCard,
        border: `1px solid ${colors.borderMedium}`,
        borderRadius: borderRadius.sm,
        marginBottom: spacing.sm,
    },
    dupeInfo: {
        flex: 1,
        minWidth: 0,
    },
    dupeTitle: {
        fontSize: typography.sizeSm,
        color: colors.textSecondary,
        ...commonStyles.truncate,
    },
    dupeCount: {
        fontSize: typography.sizeXs,
        color: colors.warning,
        marginTop: 2,
    },
    loadingState: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.xxxl,
        gap: spacing.md,
        color: colors.textDim,
    },
    spinner: {
        width: 24,
        height: 24,
        border: `2px solid ${colors.borderLight}`,
        borderTopColor: colors.primary,
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
    },
    allClearState: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.xxxl,
        textAlign: 'center',
    },
    allClearIcon: {
        marginBottom: spacing.md,
    },
    allClearTitle: {
        fontSize: typography.sizeXl,
        fontWeight: typography.semibold,
        color: colors.textPrimary,
    },
    allClearDesc: {
        fontSize: typography.sizeSm,
        color: colors.textDim,
        marginTop: spacing.xs,
    },
    actionCards: {
        display: 'flex',
        flexDirection: 'column',
        gap: spacing.sm,
    },
    actionCard: {
        display: 'flex',
        flexDirection: 'column',
        gap: spacing.md,
        padding: spacing.lg,
        background: colors.bgCard,
        border: `1px solid ${colors.borderMedium}`,
        borderRadius: borderRadius.md,
    },
    actionCardHeader: {
        display: 'flex',
        alignItems: 'center',
        gap: spacing.md,
    },
    actionCardIcon: {
        width: 36,
        height: 36,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: borderRadius.sm,
    },
    actionCardInfo: {
        flex: 1,
    },
    actionCardTitle: {
        fontSize: typography.sizeSm,
        fontWeight: typography.semibold,
        color: colors.textPrimary,
    },
    actionCardDesc: {
        fontSize: typography.sizeXs,
        color: colors.textDim,
        marginTop: 2,
    },
    actionCardBtn: {
        padding: `${spacing.sm}px ${spacing.md}px`,
        background: colors.primary,
        border: 'none',
        borderRadius: borderRadius.sm,
        color: '#fff',
        fontSize: typography.sizeSm,
        fontWeight: typography.medium,
        cursor: 'pointer',
        alignSelf: 'flex-start',
    },
    healthCard: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: spacing.lg,
        marginBottom: spacing.lg,
    },
    healthScore: {
        position: 'relative',
        width: 80,
        height: 80,
    },
    healthValue: {
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
        fontSize: typography.sizeSm,
        fontWeight: typography.medium,
        marginTop: spacing.sm,
    },
    insightsList: {
        background: colors.bgCard,
        border: `1px solid ${colors.borderMedium}`,
        borderRadius: borderRadius.sm,
        padding: spacing.md,
        marginBottom: spacing.lg,
    },
    insightItem: {
        fontSize: typography.sizeSm,
        color: colors.textMuted,
        padding: `${spacing.xs}px 0`,
        display: 'flex',
        gap: spacing.sm,
    },
    insightBullet: {
        color: colors.primary,
    },
    statsGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: spacing.sm,
        marginBottom: spacing.lg,
    },
    statBox: {
        background: colors.bgCard,
        border: `1px solid ${colors.borderMedium}`,
        borderRadius: borderRadius.sm,
        padding: spacing.md,
        textAlign: 'center',
    },
    statValue: {
        fontSize: typography.sizeXl,
        fontWeight: typography.semibold,
        color: colors.primary,
    },
    statLabel: {
        fontSize: typography.sizeXs,
        color: colors.textDim,
        marginTop: 2,
    },
    section: {
        marginBottom: spacing.md,
    },
    sectionTitle: {
        fontSize: typography.sizeSm,
        fontWeight: typography.medium,
        color: colors.textMuted,
        marginBottom: spacing.sm,
    },
    categoryRow: {
        display: 'flex',
        alignItems: 'center',
        gap: spacing.sm,
        padding: `${spacing.xs}px 0`,
    },
    categoryName: {
        width: 80,
        fontSize: typography.sizeSm,
        color: colors.textMuted,
        ...commonStyles.truncate,
    },
    categoryBar: {
        flex: 1,
        height: 6,
        background: colors.borderMedium,
        borderRadius: borderRadius.full,
        overflow: 'hidden',
    },
    categoryBarFill: {
        height: '100%',
        background: colors.primary,
        borderRadius: borderRadius.full,
    },
    categoryCount: {
        width: 24,
        fontSize: typography.sizeSm,
        color: colors.textDim,
        textAlign: 'right',
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
    upgradeIcon: {
        marginBottom: spacing.lg,
    },
    upgradeTitle: {
        fontSize: typography.sizeXxl,
        fontWeight: typography.bold,
        color: colors.textPrimary,
    },
    upgradePrice: {
        fontSize: typography.sizeHero,
        fontWeight: typography.bold,
        color: colors.textPrimary,
        marginTop: spacing.sm,
    },
    upgradePriceNote: {
        fontSize: typography.sizeSm,
        fontWeight: typography.normal,
        color: colors.textDim,
    },
    upgradeFeatures: {
        listStyle: 'none',
        padding: 0,
        margin: `${spacing.lg}px 0`,
        textAlign: 'left',
    },
    upgradeBtn: {
        width: '100%',
        padding: spacing.md,
        background: colors.primary,
        border: 'none',
        borderRadius: borderRadius.sm,
        color: '#fff',
        fontSize: typography.sizeLg,
        fontWeight: typography.semibold,
        cursor: 'pointer',
        marginBottom: spacing.sm,
    },
    refreshBtn: {
        background: 'transparent',
        border: 'none',
        color: colors.textDim,
        fontSize: typography.sizeSm,
        cursor: 'pointer',
        padding: spacing.sm,
    },
};

// Inject minimal CSS
const styleSheet = document.createElement('style');
styleSheet.textContent = `
    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }

    input::placeholder {
        color: ${colors.textDimmest};
    }

    button:hover:not(:disabled) {
        opacity: 0.9;
    }

    button:active:not(:disabled) {
        transform: scale(0.98);
    }

    button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
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

    ul li {
        padding: 4px 0;
        color: ${colors.textMuted};
    }

    ul li::before {
        content: "✓";
        color: ${colors.success};
        margin-right: 8px;
    }
`;
document.head.appendChild(styleSheet);

const container = document.getElementById('root');
if (container) {
    const root = createRoot(container);
    root.render(<Popup />);
}
