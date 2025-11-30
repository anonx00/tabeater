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
    const [statusMessage, setStatusMessage] = useState<string>('');

    useEffect(() => {
        loadTabs();
        checkProvider();
        checkLicense();
    }, []);

    const sendMessage = async (action: string, payload?: any) => {
        return await chrome.runtime.sendMessage({ action, payload });
    };

    const loadTabs = async () => {
        const response = await sendMessage('getWindowTabs');
        if (response.success) setTabs(response.data);
    };

    const checkProvider = async () => {
        const response = await sendMessage('getAIProvider');
        if (response.success) setProvider(response.data.provider);
    };

    const checkLicense = async () => {
        const response = await sendMessage('getLicenseStatus', { forceRefresh: true });
        if (response.success) setLicense(response.data);
    };

    const closeTab = async (tabId: number) => {
        await sendMessage('closeTab', { tabId });
        loadTabs();
    };

    const findDuplicates = async () => {
        setView('duplicates');
        const response = await sendMessage('getDuplicates');
        if (response.success) setDuplicates(response.data);
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
        if (provider === 'none') {
            setStatusMessage('Configure AI in settings first');
            setTimeout(() => setStatusMessage(''), 3000);
            return;
        }
        setLoading(true);
        setStatusMessage('Analyzing tabs...');
        const response = await sendMessage('smartOrganize');
        if (response.success) {
            setStatusMessage(response.data.message);
            loadTabs();
        } else {
            setStatusMessage(response.error || 'Failed');
        }
        setLoading(false);
        setTimeout(() => setStatusMessage(''), 3000);
    };

    const analyzeWithAI = async () => {
        if (provider === 'none') {
            setAnalysis('[ NO AI CONFIGURED ]\n\nGo to Settings to configure an AI provider.');
            setView('analyze');
            return;
        }
        setLoading(true);
        setView('analyze');
        const response = await sendMessage('analyzeAllTabs');
        if (response.success) {
            setAnalysis(response.data.analysis);
        } else {
            if (response.error?.includes('TRIAL_EXPIRED') || response.error?.includes('LIMIT_REACHED')) {
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
        if (response.success) chrome.tabs.create({ url: response.data.url });
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
            if (response.error?.includes('TRIAL_EXPIRED') || response.error?.includes('LIMIT_REACHED')) {
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

    const filteredTabs = searchQuery
        ? tabs.filter(t => t.title.toLowerCase().includes(searchQuery.toLowerCase()) || t.url.toLowerCase().includes(searchQuery.toLowerCase()))
        : tabs;

    const getHostname = (url: string) => {
        try { return new URL(url).hostname; } catch { return url; }
    };

    const getLicenseTag = () => {
        if (!license) return null;
        if (license.paid) return <span style={styles.tagPro}>PRO</span>;
        if (license.status === 'trial') return <span style={styles.tagTrial}>{license.usageRemaining}/day</span>;
        return null;
    };

    return (
        <div style={styles.container}>
            {/* Header */}
            <header style={styles.header}>
                <div style={styles.headerMain}>
                    <div style={styles.logoSection}>
                        <div style={styles.logo}>PT</div>
                        <div>
                            <div style={styles.title}>PHANTOM TABS</div>
                            <div style={styles.subtitle}>{tabs.length} TARGETS | {provider.toUpperCase()}</div>
                        </div>
                    </div>
                    {getLicenseTag()}
                </div>
                {statusMessage && <div style={styles.statusBar}>{statusMessage}</div>}
            </header>

            {/* Actions */}
            <div style={styles.actions}>
                <button style={license?.paid ? styles.btnPrimary : styles.btn} onClick={runAutoPilot} disabled={loading}>
                    AUTO
                </button>
                <button style={styles.btn} onClick={smartOrganize} disabled={loading}>
                    GROUP
                </button>
                <button style={styles.btn} onClick={findDuplicates}>
                    DUPES
                </button>
                <button style={styles.btn} onClick={analyzeWithAI} disabled={loading}>
                    SCAN
                </button>
                <button style={styles.btnIcon} onClick={() => chrome.runtime.openOptionsPage()} title="Settings">
                    <span style={{ fontSize: 14 }}>&#9881;</span>
                </button>
            </div>

            {/* Search */}
            <div style={styles.searchWrap}>
                <input
                    type="text"
                    placeholder="SEARCH TARGETS..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={styles.search}
                />
            </div>

            {/* Tab List View */}
            {view === 'tabs' && (
                <div style={styles.tabList}>
                    {filteredTabs.map(tab => (
                        <div key={tab.id} style={styles.tabItem}>
                            <img src={tab.favIconUrl || ''} style={styles.favicon} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} />
                            <div style={styles.tabInfo}>
                                <div style={styles.tabTitle}>{tab.title}</div>
                                <div style={styles.tabUrl}>{getHostname(tab.url)}</div>
                            </div>
                            <button style={styles.closeBtn} onClick={() => closeTab(tab.id)}>×</button>
                        </div>
                    ))}
                </div>
            )}

            {/* Duplicates View */}
            {view === 'duplicates' && (
                <div style={styles.panel}>
                    <div style={styles.panelHeader}>
                        <span>DUPLICATE TARGETS</span>
                        {duplicates.length > 0 && (
                            <button style={styles.btnDanger} onClick={closeDuplicates}>ELIMINATE ALL</button>
                        )}
                    </div>
                    <div style={styles.panelContent}>
                        {duplicates.length === 0 ? (
                            <div style={styles.emptyState}>NO DUPLICATES DETECTED</div>
                        ) : (
                            duplicates.map((group, i) => (
                                <div key={i} style={styles.dupeItem}>
                                    <div style={styles.dupeTitle}>{group[0]?.title}</div>
                                    <div style={styles.dupeCount}>{group.length} instances</div>
                                </div>
                            ))
                        )}
                    </div>
                    <button style={styles.btnBack} onClick={() => setView('tabs')}>← BACK</button>
                </div>
            )}

            {/* Analysis View */}
            {view === 'analyze' && (
                <div style={styles.panel}>
                    <div style={styles.panelHeader}>INTEL REPORT</div>
                    <div style={styles.panelContent}>
                        {loading ? (
                            <div style={styles.loading}>SCANNING...</div>
                        ) : (
                            <pre style={styles.analysisText}>{analysis}</pre>
                        )}
                    </div>
                    <button style={styles.btnBack} onClick={() => setView('tabs')}>← BACK</button>
                </div>
            )}

            {/* Auto Pilot View */}
            {view === 'autopilot' && (
                <div style={styles.panel}>
                    <div style={styles.panelHeader}>
                        <span>AUTO PILOT</span>
                        <span style={styles.tagPro}>PRO</span>
                    </div>
                    <div style={styles.panelContent}>
                        {loading ? (
                            <div style={styles.loading}>ANALYZING TARGETS...</div>
                        ) : autoPilotReport ? (
                            <>
                                <div style={styles.statsRow}>
                                    <div style={styles.stat}>
                                        <div style={styles.statNum}>{autoPilotReport.totalTabs}</div>
                                        <div style={styles.statLabel}>TOTAL</div>
                                    </div>
                                    <div style={styles.stat}>
                                        <div style={{ ...styles.statNum, color: autoPilotReport.staleCount > 0 ? '#ff8800' : '#00ff88' }}>
                                            {autoPilotReport.staleCount}
                                        </div>
                                        <div style={styles.statLabel}>STALE</div>
                                    </div>
                                    <div style={styles.stat}>
                                        <div style={{ ...styles.statNum, color: autoPilotReport.duplicateCount > 0 ? '#ff4444' : '#00ff88' }}>
                                            {autoPilotReport.duplicateCount}
                                        </div>
                                        <div style={styles.statLabel}>DUPES</div>
                                    </div>
                                </div>

                                {autoPilotReport.aiInsights && (
                                    <div style={styles.insightBox}>
                                        <div style={styles.insightLabel}>AI INTEL</div>
                                        <div style={styles.insightText}>{autoPilotReport.aiInsights}</div>
                                    </div>
                                )}

                                {autoPilotReport.recommendations.closeSuggestions.length > 0 && (
                                    <div style={styles.section}>
                                        <div style={styles.sectionHead}>
                                            <span>CLOSE ({autoPilotReport.recommendations.closeSuggestions.length})</span>
                                            <button style={styles.btnSmall} onClick={executeCleanup}>ALL</button>
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
                                            <span>GROUP ({autoPilotReport.recommendations.groupSuggestions.length})</span>
                                            <button style={styles.btnSmall} onClick={executeGrouping}>ALL</button>
                                        </div>
                                        {autoPilotReport.recommendations.groupSuggestions.map(g => (
                                            <div key={g.name} style={styles.groupItem}>
                                                <span>{g.name}</span>
                                                <span style={styles.groupCount}>{g.tabIds.length}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {autoPilotReport.recommendations.closeSuggestions.length === 0 &&
                                 autoPilotReport.recommendations.groupSuggestions.length === 0 && (
                                    <div style={styles.emptyState}>ALL TARGETS OPTIMIZED</div>
                                )}
                            </>
                        ) : null}
                    </div>
                    <button style={styles.btnBack} onClick={() => setView('tabs')}>← BACK</button>
                </div>
            )}

            {/* Upgrade View */}
            {view === 'upgrade' && (
                <div style={styles.panel}>
                    <div style={styles.upgradeBox}>
                        <div style={styles.upgradeTitle}>UPGRADE TO PRO</div>
                        <div style={styles.upgradePrice}>$9.99</div>
                        <div style={styles.upgradeOnce}>ONE-TIME</div>
                        <ul style={styles.upgradeList}>
                            <li>+ Auto Pilot Mode</li>
                            <li>+ Unlimited AI Scans</li>
                            <li>+ Smart Grouping</li>
                            <li>+ Priority Support</li>
                        </ul>
                        <button style={styles.btnUpgrade} onClick={handleUpgrade} disabled={loading}>
                            {loading ? 'LOADING...' : 'ACTIVATE'}
                        </button>
                        <button style={styles.btnRefresh} onClick={checkLicense}>REFRESH STATUS</button>
                    </div>
                    <button style={styles.btnBack} onClick={() => setView('tabs')}>← BACK</button>
                </div>
            )}
        </div>
    );
};

const styles: { [key: string]: React.CSSProperties } = {
    container: { width: 380, maxHeight: 520, background: '#0d0d0d', color: '#c0c0c0', fontFamily: "'Segoe UI', system-ui, sans-serif", fontSize: 12, display: 'flex', flexDirection: 'column' },
    header: { background: '#111', borderBottom: '2px solid #00ff88' },
    headerMain: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px' },
    logoSection: { display: 'flex', alignItems: 'center', gap: 10 },
    logo: { width: 32, height: 32, background: '#00ff88', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12, borderRadius: 4 },
    title: { fontSize: 14, fontWeight: 700, color: '#00ff88', letterSpacing: 2 },
    subtitle: { fontSize: 10, color: '#666', letterSpacing: 1, marginTop: 2 },
    tagPro: { background: '#00ff88', color: '#000', padding: '3px 8px', fontSize: 10, fontWeight: 700, borderRadius: 2, letterSpacing: 1 },
    tagTrial: { background: '#333', color: '#ff8800', padding: '3px 8px', fontSize: 10, fontWeight: 600, borderRadius: 2 },
    statusBar: { background: '#1a1a00', color: '#ffcc00', padding: '6px 12px', fontSize: 11, borderTop: '1px solid #333' },
    actions: { display: 'flex', gap: 6, padding: '8px 12px', background: '#0a0a0a', borderBottom: '1px solid #222' },
    btn: { flex: 1, padding: '8px 4px', background: '#1a1a1a', border: '1px solid #333', color: '#888', fontSize: 10, fontWeight: 600, letterSpacing: 1, cursor: 'pointer', borderRadius: 2 },
    btnPrimary: { flex: 1, padding: '8px 4px', background: '#002200', border: '1px solid #00ff88', color: '#00ff88', fontSize: 10, fontWeight: 600, letterSpacing: 1, cursor: 'pointer', borderRadius: 2 },
    btnIcon: { padding: '8px 10px', background: '#1a1a1a', border: '1px solid #333', color: '#666', cursor: 'pointer', borderRadius: 2 },
    searchWrap: { padding: '8px 12px', background: '#0a0a0a' },
    search: { width: '100%', padding: '8px 10px', background: '#111', border: '1px solid #222', color: '#fff', fontSize: 11, letterSpacing: 1, borderRadius: 2, boxSizing: 'border-box' },
    tabList: { flex: 1, overflowY: 'auto', padding: '4px 8px' },
    tabItem: { display: 'flex', alignItems: 'center', padding: '8px', gap: 10, borderBottom: '1px solid #1a1a1a' },
    favicon: { width: 16, height: 16, borderRadius: 2 },
    tabInfo: { flex: 1, minWidth: 0 },
    tabTitle: { fontSize: 12, color: '#ddd', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
    tabUrl: { fontSize: 10, color: '#555', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
    closeBtn: { width: 20, height: 20, background: 'transparent', border: 'none', color: '#444', cursor: 'pointer', fontSize: 16 },
    panel: { flex: 1, display: 'flex', flexDirection: 'column', padding: 12 },
    panelHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, fontWeight: 700, color: '#00ff88', letterSpacing: 2, marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid #222' },
    panelContent: { flex: 1, overflowY: 'auto' },
    emptyState: { textAlign: 'center', color: '#444', padding: 30, fontSize: 11, letterSpacing: 1 },
    loading: { textAlign: 'center', color: '#00ff88', padding: 30, letterSpacing: 2 },
    btnBack: { marginTop: 12, padding: '10px', background: '#111', border: '1px solid #222', color: '#666', fontSize: 11, cursor: 'pointer', borderRadius: 2, letterSpacing: 1 },
    btnDanger: { padding: '5px 10px', background: '#330000', border: '1px solid #ff4444', color: '#ff4444', fontSize: 10, fontWeight: 600, cursor: 'pointer', borderRadius: 2 },
    dupeItem: { padding: '10px', background: '#111', marginBottom: 6, borderRadius: 2, borderLeft: '2px solid #ff8800' },
    dupeTitle: { fontSize: 11, color: '#ccc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
    dupeCount: { fontSize: 10, color: '#ff8800', marginTop: 4 },
    analysisText: { margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 11, lineHeight: 1.6, color: '#aaa', background: '#0a0a0a', padding: 12, borderRadius: 2, border: '1px solid #1a1a1a' },
    statsRow: { display: 'flex', gap: 8, marginBottom: 12 },
    stat: { flex: 1, background: '#111', padding: '12px 8px', textAlign: 'center', borderRadius: 2, border: '1px solid #1a1a1a' },
    statNum: { fontSize: 22, fontWeight: 700, color: '#00ff88' },
    statLabel: { fontSize: 9, color: '#555', letterSpacing: 1, marginTop: 4 },
    insightBox: { background: '#001a00', border: '1px solid #003300', padding: 10, marginBottom: 12, borderRadius: 2 },
    insightLabel: { fontSize: 9, color: '#00ff88', letterSpacing: 1, marginBottom: 6 },
    insightText: { fontSize: 11, lineHeight: 1.5, color: '#88cc88', whiteSpace: 'pre-wrap' },
    section: { marginBottom: 12 },
    sectionHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10, fontWeight: 600, color: '#888', letterSpacing: 1, marginBottom: 8 },
    btnSmall: { padding: '4px 10px', background: '#00ff88', border: 'none', color: '#000', fontSize: 9, fontWeight: 700, cursor: 'pointer', borderRadius: 2 },
    suggestionItem: { padding: '8px', background: '#1a0a0a', marginBottom: 4, borderRadius: 2, borderLeft: '2px solid #ff4444' },
    suggestionTitle: { display: 'block', fontSize: 11, color: '#ccc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
    suggestionReason: { display: 'block', fontSize: 9, color: '#ff8800', marginTop: 3 },
    groupItem: { display: 'flex', justifyContent: 'space-between', padding: '8px', background: '#0a0a1a', marginBottom: 4, borderRadius: 2, borderLeft: '2px solid #4488ff', fontSize: 11 },
    groupCount: { color: '#4488ff', fontSize: 10 },
    upgradeBox: { background: 'linear-gradient(180deg, #0a0a0a, #111)', border: '2px solid #00ff88', borderRadius: 4, padding: 24, textAlign: 'center' },
    upgradeTitle: { fontSize: 16, fontWeight: 700, color: '#00ff88', letterSpacing: 3, marginBottom: 8 },
    upgradePrice: { fontSize: 36, fontWeight: 700, color: '#fff' },
    upgradeOnce: { fontSize: 10, color: '#666', letterSpacing: 2, marginBottom: 16 },
    upgradeList: { textAlign: 'left', listStyle: 'none', padding: 0, margin: '0 0 20px', fontSize: 12, color: '#888' },
    btnUpgrade: { width: '100%', padding: '12px', background: '#00ff88', border: 'none', color: '#000', fontSize: 14, fontWeight: 700, letterSpacing: 2, cursor: 'pointer', borderRadius: 2, marginBottom: 8 },
    btnRefresh: { width: '100%', padding: '8px', background: 'transparent', border: '1px solid #333', color: '#666', fontSize: 10, cursor: 'pointer', borderRadius: 2 },
};

const container = document.getElementById('root');
if (container) {
    const root = createRoot(container);
    root.render(<Popup />);
}
