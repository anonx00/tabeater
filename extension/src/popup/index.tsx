import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

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
    trialEndDate?: string;
    canUse: boolean;
}

interface TabHealth {
    tabId: number;
    title: string;
    url: string;
    favicon?: string;
    memoryMB?: number;
    staleDays: number;
    category: string;
    isStale: boolean;
    isDuplicate: boolean;
    recommendation: 'keep' | 'close' | 'review';
    reason: string;
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
    aiInsights?: string;
}

type View = 'tabs' | 'analyze' | 'duplicates' | 'upgrade' | 'autopilot';

const Popup = () => {
    const [tabs, setTabs] = useState<TabInfo[]>([]);
    const [duplicates, setDuplicates] = useState<TabInfo[][]>([]);
    const [view, setView] = useState<View>('tabs');
    const [loading, setLoading] = useState(false);
    const [analysis, setAnalysis] = useState<string>('');
    const [searchQuery, setSearchQuery] = useState('');
    const [provider, setProvider] = useState<string>('none');
    const [license, setLicense] = useState<LicenseStatus | null>(null);
    const [autoPilotReport, setAutoPilotReport] = useState<AutoPilotReport | null>(null);

    useEffect(() => {
        loadTabs();
        checkProvider();
        checkLicense();
    }, []);

    const sendMessage = async (action: string, payload?: any) => {
        const response = await chrome.runtime.sendMessage({ action, payload });
        return response;
    };

    const loadTabs = async () => {
        const response = await sendMessage('getWindowTabs');
        if (response.success) {
            setTabs(response.data);
        }
    };

    const checkProvider = async () => {
        const response = await sendMessage('getAIProvider');
        if (response.success) {
            setProvider(response.data.provider);
        }
    };

    const checkLicense = async () => {
        const response = await sendMessage('getLicenseStatus', { forceRefresh: true });
        if (response.success) {
            setLicense(response.data);
        }
    };

    const closeTab = async (tabId: number) => {
        await sendMessage('closeTab', { tabId });
        loadTabs();
    };

    const findDuplicates = async () => {
        setView('duplicates');
        const response = await sendMessage('getDuplicates');
        if (response.success) {
            setDuplicates(response.data);
        }
    };

    const closeDuplicates = async () => {
        for (const group of duplicates) {
            const tabsToClose = group.slice(1).map(t => t.id);
            await sendMessage('closeTabs', { tabIds: tabsToClose });
        }
        loadTabs();
        findDuplicates();
    };

    const smartOrganize = async () => {
        setLoading(true);
        await sendMessage('smartOrganize');
        setLoading(false);
    };

    const analyzeWithAI = async () => {
        if (provider === 'none') {
            setAnalysis('Configure AI in options first');
            setView('analyze');
            return;
        }
        setLoading(true);
        setView('analyze');
        const response = await sendMessage('analyzeAllTabs');
        if (response.success) {
            setAnalysis(response.data.analysis);
        } else {
            if (response.error?.startsWith('TRIAL_EXPIRED:') || response.error?.startsWith('LIMIT_REACHED:')) {
                setView('upgrade');
                setLoading(false);
                return;
            }
            setAnalysis(response.error || 'Analysis failed');
        }
        setLoading(false);
        checkLicense();
    };

    const handleUpgrade = async () => {
        setLoading(true);
        const response = await sendMessage('getCheckoutUrl');
        if (response.success) {
            chrome.tabs.create({ url: response.data.url });
        }
        setLoading(false);
    };

    const runAutoPilot = async () => {
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
            if (response.error?.startsWith('TRIAL_EXPIRED:') || response.error?.startsWith('LIMIT_REACHED:')) {
                setView('upgrade');
            }
        }
        setLoading(false);
        checkLicense();
    };

    const executeCleanup = async () => {
        if (!autoPilotReport) return;
        setLoading(true);
        const tabIds = autoPilotReport.recommendations.closeSuggestions.map(t => t.tabId);
        await sendMessage('autoPilotCleanup', { tabIds });
        await loadTabs();
        await runAutoPilot();
    };

    const executeGrouping = async () => {
        if (!autoPilotReport) return;
        setLoading(true);
        await sendMessage('autoPilotGroup', { groups: autoPilotReport.recommendations.groupSuggestions });
        await loadTabs();
        await runAutoPilot();
    };

    const closeSingleTab = async (tabId: number) => {
        await sendMessage('closeTab', { tabId });
        await loadTabs();
        if (view === 'autopilot') {
            await runAutoPilot();
        }
    };

    const filteredTabs = searchQuery
        ? tabs.filter(t =>
            t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            t.url.toLowerCase().includes(searchQuery.toLowerCase())
        )
        : tabs;

    const getHostname = (url: string) => {
        try {
            return new URL(url).hostname;
        } catch {
            return url;
        }
    };

    const getLicenseDisplay = () => {
        if (!license) return '';
        if (license.paid) return 'PRO';
        if (license.status === 'trial') return `Trial: ${license.usageRemaining}/day`;
        if (license.status === 'expired') return 'Trial Expired';
        return '';
    };

    return (
        <div style={styles.container}>
            <header style={styles.header}>
                <div style={styles.headerRow}>
                    <h1 style={styles.title}>PHANTOM TABS</h1>
                    {license && !license.paid && (
                        <button style={styles.upgradeBtn} onClick={() => setView('upgrade')}>
                            Upgrade
                        </button>
                    )}
                </div>
                <div style={styles.stats}>
                    {tabs.length} tabs | AI: {provider} | {getLicenseDisplay()}
                </div>
            </header>

            <div style={styles.actions}>
                <button
                    style={{
                        ...styles.btn,
                        ...(license?.paid ? styles.btnPro : {}),
                        flex: 1.5
                    }}
                    onClick={runAutoPilot}
                    disabled={loading}
                    title="Auto Pilot - Smart tab management (PRO)"
                >
                    Auto
                </button>
                <button style={styles.btn} onClick={smartOrganize} disabled={loading}>
                    Group
                </button>
                <button style={styles.btn} onClick={findDuplicates}>
                    Dupes
                </button>
                <button style={styles.btn} onClick={analyzeWithAI} disabled={loading}>
                    AI
                </button>
                <button style={styles.btn} onClick={() => chrome.runtime.openOptionsPage()}>
                    Cfg
                </button>
            </div>

            <input
                type="text"
                placeholder="Search tabs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={styles.search}
            />

            {view === 'tabs' && (
                <div style={styles.tabList}>
                    {filteredTabs.map(tab => (
                        <div key={tab.id} style={styles.tabItem}>
                            <img
                                src={tab.favIconUrl || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>'}
                                style={styles.favicon}
                                alt=""
                            />
                            <div style={styles.tabInfo}>
                                <div style={styles.tabTitle}>{tab.title}</div>
                                <div style={styles.tabUrl}>{getHostname(tab.url)}</div>
                            </div>
                            <button
                                style={styles.closeBtn}
                                onClick={() => closeTab(tab.id)}
                            >
                                x
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {view === 'duplicates' && (
                <div style={styles.section}>
                    <div style={styles.sectionHeader}>
                        <span>Duplicates: {duplicates.length} groups</span>
                        {duplicates.length > 0 && (
                            <button style={styles.btnSmall} onClick={closeDuplicates}>
                                Close All Dupes
                            </button>
                        )}
                    </div>
                    {duplicates.map((group, i) => (
                        <div key={i} style={styles.dupeGroup}>
                            <div style={styles.dupeTitle}>{group[0]?.title}</div>
                            <div style={styles.dupeCount}>{group.length} tabs</div>
                        </div>
                    ))}
                    {duplicates.length === 0 && (
                        <div style={styles.empty}>No duplicates found</div>
                    )}
                    <button style={styles.btnBack} onClick={() => setView('tabs')}>
                        Back to Tabs
                    </button>
                </div>
            )}

            {view === 'analyze' && (
                <div style={styles.section}>
                    <div style={styles.sectionHeader}>AI Analysis</div>
                    {loading ? (
                        <div style={styles.loading}>Analyzing...</div>
                    ) : (
                        <div style={styles.analysis}>{analysis}</div>
                    )}
                    <button style={styles.btnBack} onClick={() => setView('tabs')}>
                        Back to Tabs
                    </button>
                </div>
            )}

            {view === 'autopilot' && (
                <div style={styles.section}>
                    <div style={styles.sectionHeader}>
                        <span>Auto Pilot</span>
                        <span style={{ fontSize: 11, color: '#ffd700' }}>PRO</span>
                    </div>

                    {loading ? (
                        <div style={styles.loading}>Analyzing your tabs...</div>
                    ) : autoPilotReport ? (
                        <>
                            {/* Stats Overview */}
                            <div style={styles.statsGrid}>
                                <div style={styles.statCard}>
                                    <div style={styles.statValue}>{autoPilotReport.totalTabs}</div>
                                    <div style={styles.statLabel}>Total Tabs</div>
                                </div>
                                <div style={styles.statCard}>
                                    <div style={{ ...styles.statValue, color: autoPilotReport.staleCount > 0 ? '#ff8800' : '#00ff88' }}>
                                        {autoPilotReport.staleCount}
                                    </div>
                                    <div style={styles.statLabel}>Stale</div>
                                </div>
                                <div style={styles.statCard}>
                                    <div style={{ ...styles.statValue, color: autoPilotReport.duplicateCount > 0 ? '#ff4444' : '#00ff88' }}>
                                        {autoPilotReport.duplicateCount}
                                    </div>
                                    <div style={styles.statLabel}>Duplicates</div>
                                </div>
                            </div>

                            {/* Categories */}
                            <div style={styles.categorySection}>
                                <div style={styles.categoryTitle}>Categories</div>
                                <div style={styles.categoryList}>
                                    {Object.entries(autoPilotReport.categoryGroups).map(([cat, tabs]) => (
                                        <div key={cat} style={styles.categoryItem}>
                                            <span>{cat}</span>
                                            <span style={{ color: '#666' }}>{tabs.length}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* AI Insights */}
                            {autoPilotReport.aiInsights && (
                                <div style={styles.insightsBox}>
                                    <div style={{ fontSize: 11, color: '#00ff88', marginBottom: 6 }}>AI Insights</div>
                                    <div style={{ whiteSpace: 'pre-wrap', fontSize: 12, lineHeight: 1.5 }}>
                                        {autoPilotReport.aiInsights}
                                    </div>
                                </div>
                            )}

                            {/* Recommendations */}
                            {autoPilotReport.recommendations.closeSuggestions.length > 0 && (
                                <div style={styles.recommendSection}>
                                    <div style={styles.recommendHeader}>
                                        <span>Suggested to Close ({autoPilotReport.recommendations.closeSuggestions.length})</span>
                                        <button style={styles.btnAction} onClick={executeCleanup}>
                                            Close All
                                        </button>
                                    </div>
                                    <div style={styles.recommendList}>
                                        {autoPilotReport.recommendations.closeSuggestions.slice(0, 5).map(th => (
                                            <div key={th.tabId} style={styles.recommendItem}>
                                                <div style={styles.recommendItemInfo}>
                                                    <div style={styles.recommendTitle}>{th.title}</div>
                                                    <div style={styles.recommendReason}>{th.reason}</div>
                                                </div>
                                                <button
                                                    style={styles.closeBtn}
                                                    onClick={() => closeSingleTab(th.tabId)}
                                                >
                                                    x
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Group Suggestions */}
                            {autoPilotReport.recommendations.groupSuggestions.length > 0 && (
                                <div style={styles.recommendSection}>
                                    <div style={styles.recommendHeader}>
                                        <span>Smart Groups ({autoPilotReport.recommendations.groupSuggestions.length})</span>
                                        <button style={styles.btnAction} onClick={executeGrouping}>
                                            Group All
                                        </button>
                                    </div>
                                    <div style={styles.recommendList}>
                                        {autoPilotReport.recommendations.groupSuggestions.map(g => (
                                            <div key={g.name} style={styles.groupSuggestion}>
                                                <span>{g.name}</span>
                                                <span style={{ color: '#666' }}>{g.tabIds.length} tabs</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {autoPilotReport.recommendations.closeSuggestions.length === 0 &&
                             autoPilotReport.recommendations.groupSuggestions.length === 0 && (
                                <div style={styles.empty}>Your tabs are well organized!</div>
                            )}
                        </>
                    ) : (
                        <div style={styles.empty}>Click Auto to analyze</div>
                    )}

                    <button style={styles.btnBack} onClick={() => setView('tabs')}>
                        Back to Tabs
                    </button>
                </div>
            )}

            {view === 'upgrade' && (
                <div style={styles.section}>
                    <div style={styles.upgradeCard}>
                        <div style={styles.upgradeTitle}>Upgrade to Pro</div>
                        <div style={styles.upgradePrice}>$9.99</div>
                        <div style={styles.upgradeSubtitle}>One-time payment</div>
                        <ul style={styles.upgradeFeatures}>
                            <li>Auto Pilot - Smart tab management</li>
                            <li>AI-powered tab analysis</li>
                            <li>Unlimited AI queries</li>
                            <li>Future updates included</li>
                        </ul>

                        <button
                            style={styles.upgradeBtnLarge}
                            onClick={handleUpgrade}
                            disabled={loading}
                        >
                            {loading ? 'Loading...' : 'Pay Now'}
                        </button>

                        <div style={styles.paymentNote}>
                            Secure payment via Stripe
                        </div>
                        <div style={styles.refreshNote}>
                            After payment, click here to refresh your status
                        </div>
                        <button style={styles.refreshBtn} onClick={checkLicense}>
                            Refresh Status
                        </button>
                    </div>
                    <button style={styles.btnBack} onClick={() => setView('tabs')}>
                        Back to Tabs
                    </button>
                </div>
            )}
        </div>
    );
};

const styles: { [key: string]: React.CSSProperties } = {
    container: {
        width: 380,
        maxHeight: 580,
        background: '#0a0a0a',
        color: '#e0e0e0',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: 13,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
    },
    header: {
        padding: '12px 16px',
        borderBottom: '1px solid #222',
        background: '#111',
    },
    headerRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    title: {
        margin: 0,
        fontSize: 16,
        fontWeight: 600,
        color: '#00ff88',
        letterSpacing: 1,
    },
    upgradeBtn: {
        padding: '4px 10px',
        background: 'linear-gradient(135deg, #ffd700, #ff8c00)',
        border: 'none',
        borderRadius: 4,
        color: '#000',
        fontSize: 11,
        fontWeight: 600,
        cursor: 'pointer',
    },
    stats: {
        fontSize: 11,
        color: '#666',
        marginTop: 4,
    },
    actions: {
        display: 'flex',
        gap: 8,
        padding: '10px 16px',
        borderBottom: '1px solid #222',
    },
    btn: {
        flex: 1,
        padding: '8px 12px',
        background: '#1a1a1a',
        border: '1px solid #333',
        borderRadius: 4,
        color: '#ccc',
        cursor: 'pointer',
        fontSize: 12,
    },
    btnPro: {
        background: 'linear-gradient(135deg, #1a2a1a, #0a1f0a)',
        border: '1px solid #00ff88',
        color: '#00ff88',
    },
    btnAction: {
        padding: '4px 10px',
        background: '#00ff88',
        border: 'none',
        borderRadius: 4,
        color: '#000',
        cursor: 'pointer',
        fontSize: 11,
        fontWeight: 600,
    },
    statsGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 8,
        marginBottom: 12,
    },
    statCard: {
        background: '#111',
        padding: '10px 8px',
        borderRadius: 6,
        textAlign: 'center',
        border: '1px solid #222',
    },
    statValue: {
        fontSize: 20,
        fontWeight: 700,
        color: '#00ff88',
    },
    statLabel: {
        fontSize: 10,
        color: '#666',
        marginTop: 2,
    },
    categorySection: {
        marginBottom: 12,
    },
    categoryTitle: {
        fontSize: 11,
        color: '#888',
        marginBottom: 6,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    categoryList: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: 6,
    },
    categoryItem: {
        display: 'flex',
        gap: 6,
        padding: '4px 8px',
        background: '#1a1a1a',
        borderRadius: 4,
        fontSize: 11,
    },
    insightsBox: {
        background: '#0a1a0a',
        border: '1px solid #003300',
        borderRadius: 6,
        padding: 10,
        marginBottom: 12,
    },
    recommendSection: {
        marginBottom: 12,
    },
    recommendHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
        fontSize: 12,
        fontWeight: 600,
    },
    recommendList: {
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
    },
    recommendItem: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 10px',
        background: '#1a1010',
        borderRadius: 4,
        border: '1px solid #331111',
    },
    recommendItemInfo: {
        flex: 1,
        minWidth: 0,
    },
    recommendTitle: {
        fontSize: 11,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
    },
    recommendReason: {
        fontSize: 10,
        color: '#ff8800',
    },
    groupSuggestion: {
        display: 'flex',
        justifyContent: 'space-between',
        padding: '6px 10px',
        background: '#1a1a2a',
        borderRadius: 4,
        border: '1px solid #333366',
        fontSize: 11,
    },
    search: {
        margin: '10px 16px',
        padding: '8px 12px',
        background: '#111',
        border: '1px solid #333',
        borderRadius: 4,
        color: '#fff',
        fontSize: 13,
    },
    tabList: {
        flex: 1,
        overflowY: 'auto',
        padding: '0 8px 8px',
    },
    tabItem: {
        display: 'flex',
        alignItems: 'center',
        padding: '8px',
        borderRadius: 4,
        cursor: 'pointer',
        gap: 10,
    },
    favicon: {
        width: 16,
        height: 16,
        borderRadius: 2,
    },
    tabInfo: {
        flex: 1,
        minWidth: 0,
    },
    tabTitle: {
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        fontSize: 13,
    },
    tabUrl: {
        fontSize: 11,
        color: '#666',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
    },
    closeBtn: {
        width: 20,
        height: 20,
        background: 'transparent',
        border: 'none',
        color: '#666',
        cursor: 'pointer',
        fontSize: 16,
        lineHeight: 1,
    },
    section: {
        flex: 1,
        padding: 16,
        overflowY: 'auto',
    },
    sectionHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
        fontSize: 14,
        fontWeight: 600,
        color: '#00ff88',
    },
    btnSmall: {
        padding: '4px 8px',
        background: '#ff4444',
        border: 'none',
        borderRadius: 4,
        color: '#fff',
        cursor: 'pointer',
        fontSize: 11,
    },
    dupeGroup: {
        padding: '8px 12px',
        background: '#1a1a1a',
        borderRadius: 4,
        marginBottom: 8,
    },
    dupeTitle: {
        fontSize: 12,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
    },
    dupeCount: {
        fontSize: 11,
        color: '#ff8800',
        marginTop: 4,
    },
    empty: {
        textAlign: 'center',
        color: '#666',
        padding: 20,
    },
    loading: {
        textAlign: 'center',
        color: '#00ff88',
        padding: 20,
    },
    analysis: {
        whiteSpace: 'pre-wrap',
        lineHeight: 1.5,
        background: '#111',
        padding: 12,
        borderRadius: 4,
        maxHeight: 300,
        overflowY: 'auto',
    },
    btnBack: {
        width: '100%',
        marginTop: 12,
        padding: '8px',
        background: '#222',
        border: '1px solid #333',
        borderRadius: 4,
        color: '#ccc',
        cursor: 'pointer',
    },
    upgradeCard: {
        background: 'linear-gradient(135deg, #1a1a2e, #16213e)',
        border: '1px solid #ffd700',
        borderRadius: 12,
        padding: 24,
        textAlign: 'center',
    },
    upgradeTitle: {
        fontSize: 20,
        fontWeight: 700,
        color: '#ffd700',
        marginBottom: 8,
    },
    upgradePrice: {
        fontSize: 36,
        fontWeight: 700,
        color: '#fff',
    },
    upgradeSubtitle: {
        fontSize: 12,
        color: '#888',
        marginBottom: 16,
    },
    upgradeFeatures: {
        textAlign: 'left',
        listStyle: 'none',
        padding: 0,
        margin: '0 0 20px 0',
        fontSize: 13,
    },
    upgradeBtnLarge: {
        width: '100%',
        padding: '12px 24px',
        background: 'linear-gradient(135deg, #ffd700, #ff8c00)',
        border: 'none',
        borderRadius: 6,
        color: '#000',
        fontSize: 16,
        fontWeight: 700,
        cursor: 'pointer',
    },
    paymentNote: {
        fontSize: 11,
        color: '#666',
        marginTop: 8,
    },
    refreshNote: {
        fontSize: 11,
        color: '#888',
        marginTop: 16,
    },
    refreshBtn: {
        marginTop: 8,
        padding: '6px 12px',
        background: '#333',
        border: 'none',
        borderRadius: 4,
        color: '#00ff88',
        fontSize: 12,
        cursor: 'pointer',
    },
};

const container = document.getElementById('root');
if (container) {
    const root = createRoot(container);
    root.render(<Popup />);
}
