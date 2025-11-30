import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

const Options = () => {
    const [provider, setProvider] = useState<string>('none');
    const [apiKey, setApiKey] = useState('');
    const [endpoint, setEndpoint] = useState('https://api.nano.ai/v1/chat');
    const [saved, setSaved] = useState(false);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<string | null>(null);

    useEffect(() => {
        loadConfig();
    }, []);

    const loadConfig = async () => {
        const stored = await chrome.storage.local.get(['aiConfig']);
        if (stored.aiConfig) {
            setApiKey(stored.aiConfig.cloudApiKey || '');
            setEndpoint(stored.aiConfig.cloudEndpoint || 'https://api.nano.ai/v1/chat');
        }
        checkProvider();
    };

    const checkProvider = async () => {
        const response = await chrome.runtime.sendMessage({ action: 'getAIProvider' });
        if (response.success) {
            setProvider(response.data.provider);
        }
    };

    const saveConfig = async () => {
        await chrome.runtime.sendMessage({
            action: 'setAIConfig',
            payload: {
                cloudApiKey: apiKey,
                cloudEndpoint: endpoint
            }
        });
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        checkProvider();
    };

    const testConnection = async () => {
        setTesting(true);
        setTestResult(null);

        try {
            const response = await chrome.runtime.sendMessage({
                action: 'askAI',
                payload: { prompt: 'Say "Connection successful" in 3 words or less.' }
            });

            if (response.success) {
                setTestResult('success');
            } else {
                setTestResult(response.error || 'Test failed');
            }
        } catch (err: any) {
            setTestResult(err.message);
        }

        setTesting(false);
    };

    return (
        <div style={styles.container}>
            <header style={styles.header}>
                <h1 style={styles.title}>PHANTOM TABS</h1>
                <div style={styles.subtitle}>Configuration</div>
            </header>

            <main style={styles.main}>
                <section style={styles.section}>
                    <h2 style={styles.sectionTitle}>AI Provider Status</h2>
                    <div style={styles.statusCard}>
                        <div style={styles.statusRow}>
                            <span>Current Provider:</span>
                            <span style={{
                                color: provider === 'nano' ? '#00ff88' :
                                       provider === 'cloud' ? '#00aaff' : '#ff4444'
                            }}>
                                {provider === 'nano' ? 'Local Nano (Built-in)' :
                                 provider === 'cloud' ? 'Cloud API' : 'Not Configured'}
                            </span>
                        </div>
                        <p style={styles.statusInfo}>
                            {provider === 'nano' && 'Using Chrome built-in AI. No API key needed.'}
                            {provider === 'cloud' && 'Using cloud API with your key.'}
                            {provider === 'none' && 'Configure cloud API below or enable Chrome AI flags.'}
                        </p>
                    </div>
                </section>

                <section style={styles.section}>
                    <h2 style={styles.sectionTitle}>Local AI (Recommended)</h2>
                    <div style={styles.infoCard}>
                        <p>Chrome has built-in AI capabilities. To enable:</p>
                        <ol style={styles.list}>
                            <li>Open chrome://flags</li>
                            <li>Enable "Prompt API for Gemini Nano"</li>
                            <li>Enable "Optimization Guide On Device Model"</li>
                            <li>Restart Chrome</li>
                        </ol>
                        <p style={styles.note}>Local AI is faster and works offline.</p>
                    </div>
                </section>

                <section style={styles.section}>
                    <h2 style={styles.sectionTitle}>Cloud API (Fallback)</h2>
                    <div style={styles.form}>
                        <label style={styles.label}>
                            API Endpoint
                            <input
                                type="text"
                                value={endpoint}
                                onChange={(e) => setEndpoint(e.target.value)}
                                placeholder="https://api.nano.ai/v1/chat"
                                style={styles.input}
                            />
                        </label>

                        <label style={styles.label}>
                            API Key
                            <input
                                type="password"
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                placeholder="Enter your API key"
                                style={styles.input}
                            />
                        </label>

                        <div style={styles.btnRow}>
                            <button style={styles.btnPrimary} onClick={saveConfig}>
                                {saved ? 'Saved!' : 'Save Configuration'}
                            </button>
                            <button
                                style={styles.btnSecondary}
                                onClick={testConnection}
                                disabled={testing || provider === 'none'}
                            >
                                {testing ? 'Testing...' : 'Test Connection'}
                            </button>
                        </div>

                        {testResult && (
                            <div style={{
                                ...styles.testResult,
                                background: testResult === 'success' ? '#0d2818' : '#2a1010',
                                borderColor: testResult === 'success' ? '#00ff88' : '#ff4444',
                            }}>
                                {testResult === 'success' ? 'Connection successful!' : testResult}
                            </div>
                        )}
                    </div>
                </section>

                <section style={styles.section}>
                    <h2 style={styles.sectionTitle}>Features</h2>
                    <div style={styles.featureList}>
                        <div style={styles.feature}>
                            <span style={styles.featureIcon}>*</span>
                            <div>
                                <strong>Smart Organize</strong>
                                <p>Auto-group tabs by domain</p>
                            </div>
                        </div>
                        <div style={styles.feature}>
                            <span style={styles.featureIcon}>*</span>
                            <div>
                                <strong>Duplicate Detection</strong>
                                <p>Find and close duplicate tabs</p>
                            </div>
                        </div>
                        <div style={styles.feature}>
                            <span style={styles.featureIcon}>*</span>
                            <div>
                                <strong>AI Analysis</strong>
                                <p>Get insights about your tabs</p>
                            </div>
                        </div>
                        <div style={styles.feature}>
                            <span style={styles.featureIcon}>*</span>
                            <div>
                                <strong>Tab Chat</strong>
                                <p>Ask questions about open tabs</p>
                            </div>
                        </div>
                    </div>
                </section>
            </main>
        </div>
    );
};

const styles: { [key: string]: React.CSSProperties } = {
    container: {
        minHeight: '100vh',
        background: '#0a0a0a',
        color: '#e0e0e0',
        fontFamily: 'system-ui, -apple-system, sans-serif',
    },
    header: {
        padding: '24px 32px',
        borderBottom: '1px solid #222',
        background: '#111',
    },
    title: {
        margin: 0,
        fontSize: 24,
        fontWeight: 600,
        color: '#00ff88',
        letterSpacing: 1,
    },
    subtitle: {
        fontSize: 14,
        color: '#666',
        marginTop: 4,
    },
    main: {
        maxWidth: 600,
        margin: '0 auto',
        padding: '24px 32px',
    },
    section: {
        marginBottom: 32,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: 600,
        marginBottom: 12,
        color: '#fff',
    },
    statusCard: {
        background: '#111',
        padding: 16,
        borderRadius: 8,
        border: '1px solid #222',
    },
    statusRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: 14,
    },
    statusInfo: {
        fontSize: 12,
        color: '#666',
        marginTop: 8,
        marginBottom: 0,
    },
    infoCard: {
        background: '#111',
        padding: 16,
        borderRadius: 8,
        border: '1px solid #222',
        fontSize: 13,
    },
    list: {
        marginLeft: 20,
        lineHeight: 1.8,
    },
    note: {
        fontSize: 12,
        color: '#00ff88',
        marginBottom: 0,
    },
    form: {
        background: '#111',
        padding: 16,
        borderRadius: 8,
        border: '1px solid #222',
    },
    label: {
        display: 'block',
        fontSize: 13,
        marginBottom: 16,
    },
    input: {
        display: 'block',
        width: '100%',
        marginTop: 6,
        padding: '10px 12px',
        background: '#0a0a0a',
        border: '1px solid #333',
        borderRadius: 4,
        color: '#fff',
        fontSize: 14,
        boxSizing: 'border-box',
    },
    btnRow: {
        display: 'flex',
        gap: 12,
    },
    btnPrimary: {
        flex: 1,
        padding: '10px 20px',
        background: '#00ff88',
        border: 'none',
        borderRadius: 4,
        color: '#000',
        fontSize: 14,
        fontWeight: 500,
        cursor: 'pointer',
    },
    btnSecondary: {
        flex: 1,
        padding: '10px 20px',
        background: '#222',
        border: '1px solid #333',
        borderRadius: 4,
        color: '#ccc',
        fontSize: 14,
        cursor: 'pointer',
    },
    testResult: {
        marginTop: 12,
        padding: 10,
        borderRadius: 4,
        border: '1px solid',
        fontSize: 13,
    },
    featureList: {
        display: 'grid',
        gap: 12,
    },
    feature: {
        display: 'flex',
        gap: 12,
        padding: 12,
        background: '#111',
        borderRadius: 8,
        border: '1px solid #222',
    },
    featureIcon: {
        color: '#00ff88',
        fontSize: 16,
    },
};

const container = document.getElementById('root');
if (container) {
    const root = createRoot(container);
    root.render(<Options />);
}
