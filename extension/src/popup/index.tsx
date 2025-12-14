import React, { useState, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { colors, spacing, typography, borderRadius, transitions, shadows, scanlineOverlay } from '../shared/theme';
import { UndoToast } from '../ui/components/UndoToast';
import { EmptyState } from '../ui/components/EmptyState';

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

// Glitch Tab Logo
const GlitchLogo: React.FC<{ size?: number }> = ({ size = 24 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <rect width="24" height="24" fill={colors.voidBlack}/>
        <path d="M3 18V7C3 6.5 3.5 6 4 6H8L10 4H20C20.5 4 21 4.5 21 5V18C21 18.5 20.5 19 20 19H4C3.5 19 3 18.5 3 18Z"
              fill="none" stroke={colors.phosphorGreen} strokeWidth="1.5"/>
        <rect x="18" y="6" width="2" height="2" fill={colors.voidBlack}/>
        <rect x="17" y="8" width="3" height="3" fill={colors.voidBlack}/>
        <rect x="18" y="11" width="2" height="2" fill={colors.voidBlack}/>
        <rect x="7" y="10" width="3" height="3" fill={colors.phosphorGreen}/>
        <line x1="3" y1="15" x2="17" y2="15" stroke={colors.phosphorGreen} strokeWidth="0.5" opacity="0.4"/>
        <line x1="3" y1="17" x2="17" y2="17" stroke={colors.phosphorGreen} strokeWidth="0.5" opacity="0.4"/>
    </svg>
);

const faviconFallback = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="${colors.textDim}"><rect x="2" y="2" width="12" height="12" rx="0" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="6" y="6" width="4" height="4" fill="currentColor"/></svg>`)}`;

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
        const response = await sendMessage('getAIProvider');
        if (response.success) setProvider(response.data.provider);
    }, [sendMessage]);

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
                    <GlitchLogo size={28} />
                    <span style={s.logoText}>TAB_EATER</span>
                    {license?.paid && <span style={s.proBadge}>PRO</span>}
                    {license?.status === 'trial' && !license.paid && (
                        <span style={s.trialBadge}>{license.usageRemaining}/2</span>
                    )}
                </div>
                <div style={s.headerRight}>
                    {focusScore !== null && (
                        <div style={{ ...s.scorePill, borderColor: getScoreColor(focusScore) }}>
                            <span style={{ ...s.scoreValue, color: getScoreColor(focusScore) }}>{focusScore}</span>
                        </div>
                    )}
                    <button style={s.iconBtn} onClick={async () => {
                        try {
                            const win = await chrome.windows.getCurrent();
                            if (win.id) { await chrome.sidePanel.open({ windowId: win.id }); window.close(); }
                        } catch { /* ignore */ }
                    }} title="Open Sidebar">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="3" width="18" height="18"/><line x1="9" y1="3" x2="9" y2="21"/>
                        </svg>
                    </button>
                    <button style={s.iconBtn} onClick={() => chrome.runtime.openOptionsPage()} title="Settings">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
                        </svg>
                    </button>
                </div>
            </header>

            {/* Status */}
            {statusMessage && <div style={s.statusBar}>{statusMessage}</div>}

            {/* Hero Action */}
            <div style={s.heroSection}>
                {(() => {
                    const hasCleanupNeeded = quickReport && (quickReport.recommendations.closeSuggestions.length > 0 || quickReport.duplicateCount > 0);
                    const hasGroupingNeeded = quickReport && quickReport.recommendations.groupSuggestions.length > 0;
                    const isClean = quickReport && !hasCleanupNeeded && !hasGroupingNeeded;

                    if (loading || grouping) {
                        return (
                            <button style={s.heroBtn} disabled>
                                <div style={s.spinner} />
                                <span>{grouping ? 'ORGANIZING...' : 'ANALYZING...'}</span>
                            </button>
                        );
                    }

                    if (isClean) {
                        return (
                            <button style={{ ...s.heroBtn, background: colors.phosphorGreen }} onClick={showAnalytics}>
                                <span>&#10003;</span>
                                <span>ALL_CLEAR</span>
                                <span style={s.heroSub}>View stats</span>
                            </button>
                        );
                    }

                    if (hasCleanupNeeded) {
                        const count = (quickReport?.recommendations.closeSuggestions.length || 0) + (quickReport?.duplicateCount || 0);
                        return (
                            <button style={{ ...s.heroBtn, background: colors.signalAmber }} onClick={license?.paid ? runActions : () => setView('upgrade')}>
                                <span>&#9888;</span>
                                <span>TIDY_UP</span>
                                <span style={s.heroSub}>{count} items to clean</span>
                            </button>
                        );
                    }

                    if (hasGroupingNeeded) {
                        return (
                            <button style={s.heroBtn} onClick={smartOrganize}>
                                <span>&#9632;</span>
                                <span>ORGANIZE</span>
                                <span style={s.heroSub}>{quickReport?.recommendations.groupSuggestions.length} groups</span>
                            </button>
                        );
                    }

                    return (
                        <button style={s.heroBtn} onClick={license?.paid ? runActions : smartOrganize}>
                            <span>&#9654;</span>
                            <span>ANALYZE</span>
                            <span style={s.heroSub}>{tabs.length} tabs</span>
                        </button>
                    );
                })()}

                <div style={s.secondaryBtns}>
                    <button style={s.secBtn} onClick={smartOrganize} disabled={loading || grouping} title="Smart Group">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                        </svg>
                    </button>
                    <button style={s.secBtn} onClick={findDuplicates} disabled={loading} title="Duplicates">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="8" y="8" width="12" height="12"/><path d="M4 16V6a2 2 0 0 1 2-2h10"/>
                        </svg>
                    </button>
                    <button style={s.secBtn} onClick={showAnalytics} disabled={loading} title="Stats">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 20V10M12 20V4M6 20v-6"/>
                        </svg>
                    </button>
                </div>
            </div>

            {/* Setup Banner */}
            {provider === 'none' && view === 'tabs' && (
                <div style={s.setupBanner}>
                    <span style={s.setupIcon}>&#9888;</span>
                    <div style={s.setupText}>
                        <div style={s.setupTitle}>ENABLE_AI</div>
                        <div style={s.setupDesc}>Connect provider for smart features</div>
                    </div>
                    <button style={s.setupBtn} onClick={() => chrome.runtime.openOptionsPage()}>SETUP</button>
                </div>
            )}

            {/* Search */}
            {view === 'tabs' && (
                <div style={s.searchWrap}>
                    <div style={s.searchBox}>
                        <span style={s.searchIcon}>&#9906;</span>
                        <input
                            type="text"
                            placeholder="Search tabs..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={s.searchInput}
                        />
                        {searchQuery && (
                            <button style={s.searchClear} onClick={() => setSearchQuery('')}>&#10005;</button>
                        )}
                    </div>
                </div>
            )}

            {/* Tab List */}
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
                                    &#10005;
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
                        <span style={s.panelTitle}>DUPLICATES</span>
                        {duplicates.length > 0 && (
                            <button style={s.dangerBtn} onClick={closeDuplicates}>CLOSE_ALL</button>
                        )}
                    </div>
                    <div style={s.panelContent}>
                        {duplicates.length === 0 ? (
                            <div style={s.emptyState}>
                                <span style={s.emptyIcon}>&#10003;</span>
                                <div style={s.emptyTitle}>NO_DUPLICATES</div>
                                <div style={s.emptyDesc}>All tabs are unique</div>
                            </div>
                        ) : (
                            duplicates.map((group, i) => (
                                <div key={i} style={s.dupeItem}>
                                    <img src={group[0]?.favIconUrl || faviconFallback} style={s.favicon} alt="" />
                                    <div style={s.dupeInfo}>
                                        <div style={s.dupeTitle}>{group[0]?.title}</div>
                                        <div style={s.dupeCount}>{group.length} copies</div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                    <button style={s.backBtn} onClick={() => setView('tabs')}>&#8592; BACK</button>
                </div>
            )}

            {/* Actions View */}
            {view === 'actions' && (
                <div style={s.panel}>
                    <div style={s.panelHeader}>
                        <span style={s.panelTitle}>ACTIONS</span>
                    </div>
                    <div style={s.panelContent}>
                        {loading ? (
                            <div style={s.loadingState}>
                                <div style={s.spinner} />
                                <span>ANALYZING...</span>
                            </div>
                        ) : isAllClear ? (
                            <div style={s.emptyState}>
                                <span style={{ ...s.emptyIcon, color: colors.phosphorGreen }}>&#10003;</span>
                                <div style={s.emptyTitle}>ALL_CLEAR</div>
                                <div style={s.emptyDesc}>Tabs are organized</div>
                            </div>
                        ) : autoPilotReport ? (
                            <div style={s.actionCards}>
                                <div style={s.actionCard}>
                                    <div style={s.actionHeader}>
                                        <span style={{ ...s.actionIcon, color: colors.criticalRed }}>&#9632;</span>
                                        <div style={s.actionInfo}>
                                            <div style={s.actionTitle}>CLEANUP</div>
                                            <div style={s.actionDesc}>
                                                {autoPilotReport.recommendations.closeSuggestions.length > 0
                                                    ? `${autoPilotReport.recommendations.closeSuggestions.length} tabs`
                                                    : 'Nothing'}
                                            </div>
                                        </div>
                                    </div>
                                    {autoPilotReport.recommendations.closeSuggestions.length > 0 && (
                                        <button style={s.actionBtn} onClick={executeCleanup}>CLEAN</button>
                                    )}
                                </div>
                                <div style={s.actionCard}>
                                    <div style={s.actionHeader}>
                                        <span style={{ ...s.actionIcon, color: colors.info }}>&#9650;</span>
                                        <div style={s.actionInfo}>
                                            <div style={s.actionTitle}>ORGANIZE</div>
                                            <div style={s.actionDesc}>
                                                {autoPilotReport.recommendations.groupSuggestions.length > 0
                                                    ? `${autoPilotReport.recommendations.groupSuggestions.length} groups`
                                                    : 'Organized'}
                                            </div>
                                        </div>
                                    </div>
                                    {autoPilotReport.recommendations.groupSuggestions.length > 0 && (
                                        <button style={s.actionBtn} onClick={executeGrouping}>GROUP</button>
                                    )}
                                </div>
                                <div style={s.actionCard}>
                                    <div style={s.actionHeader}>
                                        <span style={{ ...s.actionIcon, color: colors.signalAmber }}>&#9679;</span>
                                        <div style={s.actionInfo}>
                                            <div style={s.actionTitle}>DUPLICATES</div>
                                            <div style={s.actionDesc}>
                                                {autoPilotReport.duplicateCount > 0 ? `${autoPilotReport.duplicateCount} found` : 'None'}
                                            </div>
                                        </div>
                                    </div>
                                    {autoPilotReport.duplicateCount > 0 && (
                                        <button style={s.actionBtn} onClick={findDuplicates}>REVIEW</button>
                                    )}
                                </div>
                            </div>
                        ) : null}
                    </div>
                    <button style={s.backBtn} onClick={() => setView('tabs')}>&#8592; BACK</button>
                </div>
            )}

            {/* Analytics View */}
            {view === 'analytics' && (
                <div style={s.panel}>
                    <div style={s.panelHeader}>
                        <span style={s.panelTitle}>ANALYTICS</span>
                    </div>
                    <div style={s.panelContent}>
                        {loading ? (
                            <div style={s.loadingState}>
                                <div style={s.spinner} />
                                <span>ANALYZING...</span>
                            </div>
                        ) : autoPilotReport?.analytics ? (
                            <>
                                <div style={s.healthCard}>
                                    <svg width="80" height="80" viewBox="0 0 80 80">
                                        <circle cx="40" cy="40" r="35" fill="none" stroke={colors.borderIdle} strokeWidth="4"/>
                                        <circle
                                            cx="40" cy="40" r="35" fill="none"
                                            stroke={getScoreColor(autoPilotReport.analytics.healthScore)}
                                            strokeWidth="4"
                                            strokeDasharray={`${(autoPilotReport.analytics.healthScore / 100) * 220} 220`}
                                            transform="rotate(-90 40 40)"
                                        />
                                    </svg>
                                    <div style={s.healthValue}>
                                        <span style={{ color: getScoreColor(autoPilotReport.analytics.healthScore), fontSize: 24, fontFamily: typography.fontMono }}>
                                            {autoPilotReport.analytics.healthScore}
                                        </span>
                                    </div>
                                    <div style={{ ...s.healthLabel, color: getScoreColor(autoPilotReport.analytics.healthScore) }}>
                                        {autoPilotReport.analytics.healthLabel.toUpperCase().replace(' ', '_')}
                                    </div>
                                </div>
                                <div style={s.statsGrid}>
                                    <div style={s.statBox}>
                                        <div style={s.statValue}>{autoPilotReport.totalTabs}</div>
                                        <div style={s.statLabel}>TABS</div>
                                    </div>
                                    <div style={s.statBox}>
                                        <div style={s.statValue}>{autoPilotReport.analytics.avgTabAge}d</div>
                                        <div style={s.statLabel}>AVG_AGE</div>
                                    </div>
                                    <div style={s.statBox}>
                                        <div style={s.statValue}>{autoPilotReport.staleCount}</div>
                                        <div style={s.statLabel}>STALE</div>
                                    </div>
                                    <div style={s.statBox}>
                                        <div style={s.statValue}>{autoPilotReport.duplicateCount}</div>
                                        <div style={s.statLabel}>DUPES</div>
                                    </div>
                                </div>
                            </>
                        ) : null}
                    </div>
                    <button style={s.backBtn} onClick={() => setView('tabs')}>&#8592; BACK</button>
                </div>
            )}

            {/* Upgrade View */}
            {view === 'upgrade' && (
                <div style={s.panel}>
                    <div style={s.upgradeContent}>
                        <div style={s.upgradeIcon}>&#9733;</div>
                        <div style={s.upgradeTitle}>UPGRADE_TO_PRO</div>
                        <div style={s.upgradePrice}>A$6 <span style={s.upgradePriceNote}>ONE_TIME</span></div>
                        <ul style={s.upgradeFeatures}>
                            <li>&#10003; Unlimited AI scans</li>
                            <li>&#10003; Auto Pilot mode</li>
                            <li>&#10003; Smart grouping</li>
                            <li>&#10003; Priority support</li>
                        </ul>
                        <button style={s.upgradeBtn} onClick={handleUpgrade} disabled={loading}>
                            {loading ? 'LOADING...' : 'GET_PRO'}
                        </button>
                        <button style={s.refreshBtn} onClick={checkLicense}>ALREADY_PURCHASED? REFRESH</button>
                    </div>
                    <button style={s.backBtn} onClick={() => setView('tabs')}>&#8592; BACK</button>
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

            {/* Scanlines */}
            <div style={s.scanlines} />
        </div>
    );
};

// Styles
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
        position: 'relative',
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
    logoText: {
        fontFamily: typography.fontMono,
        fontSize: typography.sizeSm,
        fontWeight: typography.bold,
        color: colors.phosphorGreen,
        letterSpacing: '0.1em',
    },
    proBadge: {
        fontFamily: typography.fontMono,
        fontSize: 9,
        fontWeight: typography.bold,
        color: colors.voidBlack,
        background: colors.phosphorGreen,
        padding: '2px 4px',
        letterSpacing: '0.05em',
    },
    trialBadge: {
        fontFamily: typography.fontMono,
        fontSize: 9,
        color: colors.signalAmber,
        border: `1px solid ${colors.signalAmber}`,
        padding: '2px 4px',
        letterSpacing: '0.05em',
    },
    scorePill: {
        border: '1px solid',
        padding: '2px 8px',
    },
    scoreValue: {
        fontFamily: typography.fontMono,
        fontSize: typography.sizeSm,
        fontWeight: typography.bold,
    },
    iconBtn: {
        width: 28,
        height: 28,
        background: 'transparent',
        border: `1px solid ${colors.borderIdle}`,
        color: colors.textDim,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: transitions.fast,
    },
    statusBar: {
        background: colors.panelGrey,
        color: colors.phosphorGreen,
        padding: `${spacing.sm}px ${spacing.lg}px`,
        fontFamily: typography.fontMono,
        fontSize: typography.sizeXs,
        letterSpacing: '0.05em',
        borderBottom: `1px solid ${colors.borderIdle}`,
    },
    heroSection: {
        display: 'flex',
        flexDirection: 'column',
        gap: spacing.sm,
        padding: spacing.lg,
        background: colors.panelGrey,
        borderBottom: `1px solid ${colors.borderIdle}`,
    },
    heroBtn: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        padding: spacing.md,
        background: colors.phosphorGreen,
        border: 'none',
        color: colors.voidBlack,
        fontFamily: typography.fontMono,
        fontSize: typography.sizeSm,
        fontWeight: typography.bold,
        letterSpacing: '0.1em',
        cursor: 'pointer',
        flexWrap: 'wrap',
    },
    heroSub: {
        width: '100%',
        fontSize: typography.sizeXs,
        fontWeight: typography.normal,
        opacity: 0.8,
    },
    spinner: {
        width: 16,
        height: 16,
        border: `2px solid ${colors.voidBlack}`,
        borderTopColor: 'transparent',
        animation: 'spin 0.8s linear infinite',
    },
    secondaryBtns: {
        display: 'flex',
        justifyContent: 'center',
        gap: spacing.sm,
    },
    secBtn: {
        width: 36,
        height: 32,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'transparent',
        border: `1px solid ${colors.borderIdle}`,
        color: colors.textDim,
        cursor: 'pointer',
        transition: transitions.fast,
    },
    setupBanner: {
        display: 'flex',
        alignItems: 'center',
        gap: spacing.md,
        padding: spacing.lg,
        background: colors.warningBg,
        borderBottom: `1px solid ${colors.signalAmber}`,
    },
    setupIcon: {
        color: colors.signalAmber,
        fontSize: 18,
    },
    setupText: {
        flex: 1,
    },
    setupTitle: {
        fontFamily: typography.fontMono,
        fontSize: typography.sizeSm,
        color: colors.signalAmber,
        letterSpacing: '0.05em',
    },
    setupDesc: {
        fontSize: typography.sizeXs,
        color: colors.textDim,
        marginTop: 2,
    },
    setupBtn: {
        padding: `${spacing.xs}px ${spacing.md}px`,
        background: colors.signalAmber,
        border: 'none',
        color: colors.voidBlack,
        fontFamily: typography.fontMono,
        fontSize: typography.sizeXs,
        fontWeight: typography.bold,
        cursor: 'pointer',
    },
    searchWrap: {
        padding: `${spacing.sm}px ${spacing.lg}px`,
        background: colors.panelGrey,
    },
    searchBox: {
        display: 'flex',
        alignItems: 'center',
        gap: spacing.sm,
        background: colors.voidBlack,
        border: `1px solid ${colors.borderIdle}`,
        padding: `${spacing.sm}px ${spacing.md}px`,
    },
    searchIcon: {
        color: colors.textDim,
        fontSize: 12,
    },
    searchInput: {
        flex: 1,
        background: 'transparent',
        border: 'none',
        outline: 'none',
        color: colors.textPrimary,
        fontSize: typography.sizeSm,
        fontFamily: typography.fontFamily,
    },
    searchClear: {
        background: 'transparent',
        border: 'none',
        color: colors.textDim,
        cursor: 'pointer',
        fontSize: 12,
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
        background: colors.panelGrey,
    },
    tabItemActive: {
        borderLeft: `2px solid ${colors.phosphorGreen}`,
        paddingLeft: spacing.lg - 2,
    },
    favicon: {
        width: 16,
        height: 16,
        flexShrink: 0,
    },
    tabInfo: {
        flex: 1,
        minWidth: 0,
    },
    tabTitle: {
        fontSize: typography.sizeSm,
        color: colors.textSecondary,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
    },
    tabUrl: {
        fontSize: typography.sizeXs,
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
        fontSize: 12,
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
        fontSize: typography.sizeSm,
        fontWeight: typography.bold,
        color: colors.textPrimary,
        letterSpacing: '0.05em',
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
        color: colors.textMuted,
        fontFamily: typography.fontMono,
        fontSize: typography.sizeSm,
        cursor: 'pointer',
    },
    dangerBtn: {
        padding: `${spacing.xs}px ${spacing.md}px`,
        background: colors.errorBg,
        border: `1px solid ${colors.criticalRed}`,
        color: colors.criticalRed,
        fontFamily: typography.fontMono,
        fontSize: typography.sizeXs,
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
    emptyIcon: {
        fontSize: 32,
        color: colors.phosphorGreen,
        marginBottom: spacing.md,
    },
    emptyTitle: {
        fontFamily: typography.fontMono,
        fontSize: typography.sizeSm,
        fontWeight: typography.bold,
        color: colors.textPrimary,
        letterSpacing: '0.05em',
    },
    emptyDesc: {
        fontSize: typography.sizeXs,
        color: colors.textDim,
        marginTop: spacing.xs,
    },
    dupeItem: {
        display: 'flex',
        alignItems: 'center',
        gap: spacing.md,
        padding: spacing.md,
        background: colors.panelGrey,
        border: `1px solid ${colors.borderIdle}`,
        marginBottom: spacing.sm,
    },
    dupeInfo: {
        flex: 1,
        minWidth: 0,
    },
    dupeTitle: {
        fontSize: typography.sizeSm,
        color: colors.textSecondary,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
    },
    dupeCount: {
        fontFamily: typography.fontMono,
        fontSize: typography.sizeXs,
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
        color: colors.textDim,
        fontFamily: typography.fontMono,
        fontSize: typography.sizeSm,
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
        background: colors.panelGrey,
        border: `1px solid ${colors.borderIdle}`,
    },
    actionHeader: {
        display: 'flex',
        alignItems: 'center',
        gap: spacing.md,
    },
    actionIcon: {
        fontSize: 16,
    },
    actionInfo: {
        flex: 1,
    },
    actionTitle: {
        fontFamily: typography.fontMono,
        fontSize: typography.sizeSm,
        fontWeight: typography.bold,
        color: colors.textPrimary,
        letterSpacing: '0.05em',
    },
    actionDesc: {
        fontSize: typography.sizeXs,
        color: colors.textDim,
        marginTop: 2,
    },
    actionBtn: {
        padding: `${spacing.sm}px ${spacing.md}px`,
        background: colors.phosphorGreen,
        border: 'none',
        color: colors.voidBlack,
        fontFamily: typography.fontMono,
        fontSize: typography.sizeXs,
        fontWeight: typography.bold,
        cursor: 'pointer',
        alignSelf: 'flex-start',
    },
    healthCard: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        position: 'relative',
        marginBottom: spacing.xl,
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
        fontFamily: typography.fontMono,
        fontSize: typography.sizeXs,
        fontWeight: typography.bold,
        marginTop: spacing.sm,
        letterSpacing: '0.05em',
    },
    statsGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: spacing.sm,
    },
    statBox: {
        background: colors.panelGrey,
        border: `1px solid ${colors.borderIdle}`,
        padding: spacing.md,
        textAlign: 'center',
    },
    statValue: {
        fontFamily: typography.fontMono,
        fontSize: typography.sizeLg,
        fontWeight: typography.bold,
        color: colors.phosphorGreen,
    },
    statLabel: {
        fontFamily: typography.fontMono,
        fontSize: typography.sizeXs,
        color: colors.textDim,
        marginTop: 2,
        letterSpacing: '0.05em',
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
        fontSize: 32,
        color: colors.phosphorGreen,
        marginBottom: spacing.md,
    },
    upgradeTitle: {
        fontFamily: typography.fontMono,
        fontSize: typography.sizeLg,
        fontWeight: typography.bold,
        color: colors.textPrimary,
        letterSpacing: '0.1em',
    },
    upgradePrice: {
        fontFamily: typography.fontMono,
        fontSize: 28,
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
        fontFamily: typography.fontMono,
        fontSize: typography.sizeSm,
        color: colors.textMuted,
        lineHeight: 2,
    },
    upgradeBtn: {
        width: '100%',
        padding: spacing.md,
        background: colors.phosphorGreen,
        border: 'none',
        color: colors.voidBlack,
        fontFamily: typography.fontMono,
        fontSize: typography.sizeSm,
        fontWeight: typography.bold,
        letterSpacing: '0.1em',
        cursor: 'pointer',
        marginBottom: spacing.sm,
    },
    refreshBtn: {
        background: 'transparent',
        border: 'none',
        color: colors.textDim,
        fontFamily: typography.fontMono,
        fontSize: typography.sizeXs,
        cursor: 'pointer',
        padding: spacing.sm,
    },
    scanlines: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: 'none',
        background: scanlineOverlay,
        opacity: 0.3,
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

    * { box-sizing: border-box; margin: 0; padding: 0; }

    input::placeholder { color: ${colors.textDim}; }

    button:hover:not(:disabled) { border-color: ${colors.borderHover} !important; }
    button:active:not(:disabled) { opacity: 0.8; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }

    ::-webkit-scrollbar { width: 4px; }
    ::-webkit-scrollbar-track { background: ${colors.voidBlack}; }
    ::-webkit-scrollbar-thumb { background: ${colors.borderIdle}; }
    ::-webkit-scrollbar-thumb:hover { background: ${colors.borderHover}; }
`;
document.head.appendChild(styleSheet);

const container = document.getElementById('root');
if (container) createRoot(container).render(<Popup />);
