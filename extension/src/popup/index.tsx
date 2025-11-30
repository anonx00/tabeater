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

type View = 'tabs' | 'analyze' | 'duplicates' | 'upgrade';

const Popup = () => {
    const [tabs, setTabs] = useState<TabInfo[]>([]);
    const [duplicates, setDuplicates] = useState<TabInfo[][]>([]);
    const [view, setView] = useState<View>('tabs');
    const [loading, setLoading] = useState(false);
    const [analysis, setAnalysis] = useState<string>('');
    const [searchQuery, setSearchQuery] = useState('');
    const [provider, setProvider] = useState<string>('none');
    const [license, setLicense] = useState<LicenseStatus | null>(null);
    const [email, setEmail] = useState('');
    const [checkoutLoading, setCheckoutLoading] = useState(false);

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
        const response = await sendMessage('getLicenseStatus');
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
                return;
            }
            setAnalysis(response.error || 'Analysis failed');
        }
        setLoading(false);
        checkLicense();
    };

    const handleUpgrade = async () => {
        if (!email.trim() || !email.includes('@')) {
            return;
        }
        setCheckoutLoading(true);
        const response = await sendMessage('getCheckoutUrl', { email: email.trim() });
        if (response.success) {
            chrome.tabs.create({ url: response.data.url });
        }
        setCheckoutLoading(false);
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
                <button style={styles.btn} onClick={smartOrganize} disabled={loading}>
                    Organize
                </button>
                <button style={styles.btn} onClick={findDuplicates}>
                    Duplicates
                </button>
                <button style={styles.btn} onClick={analyzeWithAI} disabled={loading}>
                    Analyze
                </button>
                <button style={styles.btn} onClick={() => chrome.runtime.openOptionsPage()}>
                    Config
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

            {view === 'upgrade' && (
                <div style={styles.section}>
                    <div style={styles.upgradeCard}>
                        <div style={styles.upgradeTitle}>Upgrade to Pro</div>
                        <div style={styles.upgradePrice}>$9.99</div>
                        <div style={styles.upgradeSubtitle}>One-time payment</div>
                        <ul style={styles.upgradeFeatures}>
                            <li>Unlimited AI queries</li>
                            <li>All current features</li>
                            <li>Future updates included</li>
                        </ul>

                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="Enter your email"
                            style={styles.emailInput}
                        />
                        <div style={styles.emailHint}>
                            Your activation code will be sent here
                        </div>

                        <button
                            style={styles.upgradeBtnLarge}
                            onClick={handleUpgrade}
                            disabled={checkoutLoading || !email.includes('@')}
                        >
                            {checkoutLoading ? 'Loading...' : 'Pay with Card'}
                        </button>

                        <div style={styles.alreadyPaid}>
                            Already paid? Enter your code in Config
                        </div>
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
        margin: '0 0 16px 0',
        fontSize: 13,
    },
    emailInput: {
        width: '100%',
        padding: '12px',
        background: '#0a0a0a',
        border: '1px solid #444',
        borderRadius: 6,
        color: '#fff',
        fontSize: 14,
        textAlign: 'center',
        boxSizing: 'border-box',
    },
    emailHint: {
        fontSize: 11,
        color: '#666',
        marginTop: 6,
        marginBottom: 16,
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
    alreadyPaid: {
        fontSize: 11,
        color: '#666',
        marginTop: 12,
    },
};

const container = document.getElementById('root');
if (container) {
    const root = createRoot(container);
    root.render(<Popup />);
}
