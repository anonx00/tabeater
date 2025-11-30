import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

interface TabInfo {
    id: number;
    title: string;
    url: string;
    favIconUrl?: string;
    active: boolean;
}

type View = 'tabs' | 'analyze' | 'duplicates';

const Popup = () => {
    const [tabs, setTabs] = useState<TabInfo[]>([]);
    const [duplicates, setDuplicates] = useState<TabInfo[][]>([]);
    const [view, setView] = useState<View>('tabs');
    const [loading, setLoading] = useState(false);
    const [analysis, setAnalysis] = useState<string>('');
    const [searchQuery, setSearchQuery] = useState('');
    const [provider, setProvider] = useState<string>('none');

    useEffect(() => {
        loadTabs();
        checkProvider();
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
            setAnalysis(response.error || 'Analysis failed');
        }
        setLoading(false);
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

    return (
        <div style={styles.container}>
            <header style={styles.header}>
                <h1 style={styles.title}>PHANTOM TABS</h1>
                <div style={styles.stats}>
                    {tabs.length} tabs | AI: {provider}
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
    title: {
        margin: 0,
        fontSize: 16,
        fontWeight: 600,
        color: '#00ff88',
        letterSpacing: 1,
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
};

const container = document.getElementById('root');
if (container) {
    const root = createRoot(container);
    root.render(<Popup />);
}
