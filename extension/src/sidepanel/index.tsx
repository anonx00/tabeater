import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

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

const Sidepanel = () => {
    const [tabs, setTabs] = useState<TabInfo[]>([]);
    const [groups, setGroups] = useState<TabGroup[]>([]);
    const [view, setView] = useState<'list' | 'grouped'>('grouped');
    const [chatInput, setChatInput] = useState('');
    const [chatMessages, setChatMessages] = useState<{ role: string; content: string }[]>([]);
    const [loading, setLoading] = useState(false);
    const [provider, setProvider] = useState('none');

    useEffect(() => {
        initializeAndLoad();
        const interval = setInterval(loadData, 5000);
        return () => clearInterval(interval);
    }, []);

    const sendMessage = async (action: string, payload?: any) => {
        const response = await chrome.runtime.sendMessage({ action, payload });
        return response;
    };

    const initializeAndLoad = async () => {
        // Reinitialize AI to ensure it's ready
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

    const switchToTab = (tabId: number) => {
        chrome.tabs.update(tabId, { active: true });
    };

    const closeTab = async (tabId: number) => {
        await sendMessage('closeTab', { tabId });
        loadData();
    };

    const askAI = async () => {
        if (!chatInput.trim() || provider === 'none') return;

        const userMessage = chatInput;
        setChatInput('');
        setChatMessages(prev => [...prev, { role: 'user', content: userMessage }]);
        setLoading(true);

        const tabContext = tabs.map(t => `${t.title} (${new URL(t.url).hostname})`).join(', ');
        const prompt = `Context: User has ${tabs.length} tabs open: ${tabContext}\n\nUser question: ${userMessage}`;

        const response = await sendMessage('askAI', { prompt });

        if (response.success) {
            setChatMessages(prev => [...prev, { role: 'assistant', content: response.data.response }]);
        } else {
            setChatMessages(prev => [...prev, { role: 'assistant', content: `Error: ${response.error}` }]);
        }
        setLoading(false);
    };

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
                <div style={styles.subtitle}>Tactical Command Center</div>
                <div style={styles.stats}>
                    {tabs.length} tabs | {groups.length} domains | AI: {provider}
                </div>
            </header>

            <div style={styles.viewToggle}>
                <button
                    style={{ ...styles.toggleBtn, ...(view === 'grouped' ? styles.toggleActive : {}) }}
                    onClick={() => setView('grouped')}
                >
                    By Domain
                </button>
                <button
                    style={{ ...styles.toggleBtn, ...(view === 'list' ? styles.toggleActive : {}) }}
                    onClick={() => setView('list')}
                >
                    All Tabs
                </button>
            </div>

            <div style={styles.content}>
                {view === 'grouped' && (
                    <div style={styles.groupList}>
                        {groups.map(group => (
                            <div key={group.id} style={styles.group}>
                                <div style={styles.groupHeader}>
                                    <span style={styles.groupName}>{group.name}</span>
                                    <span style={styles.groupCount}>{group.tabs.length}</span>
                                </div>
                                <div style={styles.groupTabs}>
                                    {group.tabs.map(tab => (
                                        <div
                                            key={tab.id}
                                            style={styles.tabItem}
                                            onClick={() => switchToTab(tab.id)}
                                        >
                                            <img
                                                src={tab.favIconUrl || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>'}
                                                style={styles.favicon}
                                                alt=""
                                            />
                                            <span style={styles.tabTitle}>{tab.title}</span>
                                            <button
                                                style={styles.closeBtn}
                                                onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                                            >
                                                x
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {view === 'list' && (
                    <div style={styles.tabList}>
                        {tabs.map(tab => (
                            <div
                                key={tab.id}
                                style={{ ...styles.tabItem, ...styles.tabItemFull }}
                                onClick={() => switchToTab(tab.id)}
                            >
                                <img
                                    src={tab.favIconUrl || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>'}
                                    style={styles.favicon}
                                    alt=""
                                />
                                <div style={styles.tabInfo}>
                                    <div style={styles.tabTitleFull}>{tab.title}</div>
                                    <div style={styles.tabUrl}>{getHostname(tab.url)}</div>
                                </div>
                                <button
                                    style={styles.closeBtn}
                                    onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                                >
                                    x
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div style={styles.chatSection}>
                <div style={styles.chatHeader}>AI Assistant</div>
                <div style={styles.chatMessages}>
                    {chatMessages.map((msg, i) => (
                        <div
                            key={i}
                            style={msg.role === 'user' ? styles.userMessage : styles.assistantMessage}
                        >
                            {msg.content}
                        </div>
                    ))}
                    {loading && <div style={styles.loading}>Thinking...</div>}
                </div>
                <div style={styles.chatInputRow}>
                    <input
                        type="text"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && askAI()}
                        placeholder={provider === 'none' ? 'Configure AI first...' : 'Ask about your tabs...'}
                        disabled={provider === 'none'}
                        style={styles.chatInput}
                    />
                    <button
                        style={styles.sendBtn}
                        onClick={askAI}
                        disabled={provider === 'none' || loading}
                    >
                        Send
                    </button>
                </div>
            </div>
        </div>
    );
};

const styles: { [key: string]: React.CSSProperties } = {
    container: {
        height: '100vh',
        background: '#0a0a0a',
        color: '#e0e0e0',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: 13,
        display: 'flex',
        flexDirection: 'column',
    },
    header: {
        padding: '16px',
        borderBottom: '1px solid #222',
        background: '#111',
    },
    title: {
        margin: 0,
        fontSize: 18,
        fontWeight: 600,
        color: '#00ff88',
        letterSpacing: 1,
    },
    subtitle: {
        fontSize: 11,
        color: '#666',
        marginTop: 2,
    },
    stats: {
        fontSize: 11,
        color: '#888',
        marginTop: 8,
    },
    viewToggle: {
        display: 'flex',
        padding: '8px 16px',
        gap: 8,
        borderBottom: '1px solid #222',
    },
    toggleBtn: {
        flex: 1,
        padding: '6px 12px',
        background: '#1a1a1a',
        border: '1px solid #333',
        borderRadius: 4,
        color: '#888',
        cursor: 'pointer',
        fontSize: 12,
    },
    toggleActive: {
        background: '#00ff88',
        color: '#000',
        borderColor: '#00ff88',
    },
    content: {
        flex: 1,
        overflowY: 'auto',
        padding: '8px 16px',
    },
    groupList: {
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
    },
    group: {
        background: '#111',
        borderRadius: 6,
        overflow: 'hidden',
    },
    groupHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '8px 12px',
        background: '#1a1a1a',
    },
    groupName: {
        fontWeight: 500,
        color: '#00ff88',
    },
    groupCount: {
        fontSize: 11,
        color: '#666',
        background: '#222',
        padding: '2px 6px',
        borderRadius: 10,
    },
    groupTabs: {
        padding: '4px',
    },
    tabList: {
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
    },
    tabItem: {
        display: 'flex',
        alignItems: 'center',
        padding: '6px 8px',
        borderRadius: 4,
        cursor: 'pointer',
        gap: 8,
    },
    tabItemFull: {
        background: '#111',
    },
    favicon: {
        width: 16,
        height: 16,
        borderRadius: 2,
        flexShrink: 0,
    },
    tabTitle: {
        flex: 1,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        fontSize: 12,
    },
    tabTitleFull: {
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
    },
    tabInfo: {
        flex: 1,
        minWidth: 0,
    },
    tabUrl: {
        fontSize: 11,
        color: '#666',
    },
    closeBtn: {
        width: 18,
        height: 18,
        background: 'transparent',
        border: 'none',
        color: '#666',
        cursor: 'pointer',
        fontSize: 14,
        flexShrink: 0,
    },
    chatSection: {
        borderTop: '1px solid #222',
        background: '#111',
    },
    chatHeader: {
        padding: '8px 16px',
        fontSize: 12,
        fontWeight: 500,
        color: '#00ff88',
        borderBottom: '1px solid #222',
    },
    chatMessages: {
        height: 120,
        overflowY: 'auto',
        padding: '8px 16px',
    },
    userMessage: {
        background: '#1a1a1a',
        padding: '6px 10px',
        borderRadius: 4,
        marginBottom: 6,
        fontSize: 12,
    },
    assistantMessage: {
        background: '#0d2818',
        padding: '6px 10px',
        borderRadius: 4,
        marginBottom: 6,
        fontSize: 12,
        borderLeft: '2px solid #00ff88',
    },
    loading: {
        color: '#00ff88',
        fontSize: 12,
    },
    chatInputRow: {
        display: 'flex',
        padding: '8px 16px',
        gap: 8,
        borderTop: '1px solid #222',
    },
    chatInput: {
        flex: 1,
        padding: '8px 12px',
        background: '#0a0a0a',
        border: '1px solid #333',
        borderRadius: 4,
        color: '#fff',
        fontSize: 13,
    },
    sendBtn: {
        padding: '8px 16px',
        background: '#00ff88',
        border: 'none',
        borderRadius: 4,
        color: '#000',
        cursor: 'pointer',
        fontWeight: 500,
    },
};

const container = document.getElementById('root');
if (container) {
    const root = createRoot(container);
    root.render(<Sidepanel />);
}
