import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

type CloudProvider = 'gemini' | 'openai' | 'anthropic';

interface LicenseStatus {
    status: 'trial' | 'pro' | 'expired' | 'none';
    paid: boolean;
    usageRemaining: number;
    trialEndDate?: string;
    canUse: boolean;
}

const PROVIDER_INFO = {
    gemini: {
        name: 'Google Gemini',
        defaultModel: 'gemini-2.0-flash',
        models: ['gemini-2.0-flash', 'gemini-1.5-flash-latest', 'gemini-1.5-pro-latest'],
        getKeyUrl: 'https://aistudio.google.com/app/apikey',
        description: 'Google AI Studio - Free tier available'
    },
    openai: {
        name: 'OpenAI',
        defaultModel: 'gpt-4o-mini',
        models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
        getKeyUrl: 'https://platform.openai.com/api-keys',
        description: 'OpenAI Platform - Pay as you go'
    },
    anthropic: {
        name: 'Anthropic Claude',
        defaultModel: 'claude-3-5-haiku-latest',
        models: ['claude-3-5-haiku-latest', 'claude-3-5-sonnet-latest', 'claude-3-opus-latest'],
        getKeyUrl: 'https://console.anthropic.com/settings/keys',
        description: 'Anthropic Console - Pay as you go'
    }
};

const Options = () => {
    const [activeProvider, setActiveProvider] = useState<string>('none');
    const [cloudProvider, setCloudProvider] = useState<CloudProvider>('gemini');
    const [apiKey, setApiKey] = useState('');
    const [model, setModel] = useState('');
    const [saved, setSaved] = useState(false);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<string | null>(null);
    const [license, setLicense] = useState<LicenseStatus | null>(null);

    useEffect(() => {
        loadConfig();
        loadLicense();
    }, []);

    const loadConfig = async () => {
        const stored = await chrome.storage.local.get(['aiConfig']);
        if (stored.aiConfig) {
            setApiKey(stored.aiConfig.apiKey || '');
            setCloudProvider(stored.aiConfig.cloudProvider || 'gemini');
            setModel(stored.aiConfig.model || '');
        }
        checkProvider();
    };

    const loadLicense = async () => {
        const response = await chrome.runtime.sendMessage({ action: 'getLicenseStatus', payload: { forceRefresh: true } });
        if (response.success) {
            setLicense(response.data);
        }
    };

    const checkProvider = async () => {
        const response = await chrome.runtime.sendMessage({ action: 'getAIProvider' });
        if (response.success) {
            setActiveProvider(response.data.provider);
        }
    };

    const saveConfig = async () => {
        const selectedModel = model || PROVIDER_INFO[cloudProvider].defaultModel;
        await chrome.runtime.sendMessage({
            action: 'setAIConfig',
            payload: {
                cloudProvider,
                apiKey,
                model: selectedModel
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
                payload: { prompt: 'Respond with exactly: "Connection OK"' }
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

    const getProviderColor = (p: string) => {
        if (p === 'nano') return '#00ff88';
        if (p === 'gemini') return '#4285f4';
        if (p === 'openai') return '#10a37f';
        if (p === 'anthropic') return '#d4a574';
        return '#ff4444';
    };

    const getProviderLabel = (p: string) => {
        if (p === 'nano') return 'Chrome Nano (Local)';
        if (p === 'gemini') return 'Google Gemini';
        if (p === 'openai') return 'OpenAI';
        if (p === 'anthropic') return 'Anthropic Claude';
        return 'Not Configured';
    };

    const getLicenseDisplay = () => {
        if (!license) return { text: 'Loading...', color: '#666' };
        if (license.paid) return { text: 'PRO - Unlimited Access', color: '#00ff88' };
        if (license.status === 'trial') {
            const daysLeft = license.trialEndDate
                ? Math.ceil((new Date(license.trialEndDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                : 0;
            return { text: `Free Trial - ${daysLeft} days left (${license.usageRemaining}/day remaining)`, color: '#ffaa00' };
        }
        if (license.status === 'expired') return { text: 'Trial Expired', color: '#ff4444' };
        return { text: 'Not Registered', color: '#ff4444' };
    };

    const licenseDisplay = getLicenseDisplay();

    return (
        <div style={styles.container}>
            <header style={styles.header}>
                <h1 style={styles.title}>PHANTOM TABS</h1>
                <div style={styles.subtitle}>Settings</div>
            </header>

            <main style={styles.main}>
                <section style={styles.section}>
                    <h2 style={styles.sectionTitle}>License Status</h2>
                    <div style={styles.licenseCard}>
                        <div style={styles.licenseStatus}>
                            <span style={{ color: licenseDisplay.color, fontWeight: 600, fontSize: 16 }}>
                                {licenseDisplay.text}
                            </span>
                        </div>
                        <button style={styles.refreshBtn} onClick={loadLicense}>
                            Refresh Status
                        </button>
                        {license?.paid && (
                            <p style={styles.proMessage}>
                                Thank you for your support!
                            </p>
                        )}
                    </div>
                </section>

                <section style={styles.section}>
                    <h2 style={styles.sectionTitle}>Current AI Provider</h2>
                    <div style={styles.statusCard}>
                        <div style={styles.statusRow}>
                            <span>Active:</span>
                            <span style={{ color: getProviderColor(activeProvider), fontWeight: 600 }}>
                                {getProviderLabel(activeProvider)}
                            </span>
                        </div>
                        <p style={styles.statusInfo}>
                            {activeProvider === 'nano' && 'Using Chrome built-in AI. Fast and private - no API key needed.'}
                            {activeProvider !== 'nano' && activeProvider !== 'none' && `Using ${getProviderLabel(activeProvider)} cloud API.`}
                            {activeProvider === 'none' && 'No AI configured. Set up below to enable AI features.'}
                        </p>
                    </div>
                </section>

                <section style={styles.section}>
                    <h2 style={styles.sectionTitle}>Local AI (Priority 1)</h2>
                    <div style={styles.infoCard}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <span>Gemini Nano Status:</span>
                            <span style={{
                                color: activeProvider === 'nano' ? '#00ff88' : '#ff8800',
                                fontWeight: 600
                            }}>
                                {activeProvider === 'nano' ? 'Active' : 'Not Available'}
                            </span>
                        </div>
                        <p>Chrome's built-in AI runs locally - fastest and most private.</p>
                        <p style={{ fontWeight: 600, marginTop: 12 }}>To enable Gemini Nano:</p>
                        <ol style={styles.list}>
                            <li>Open <code>chrome://flags/#optimization-guide-on-device-model</code></li>
                            <li>Set to <strong>"Enabled BypassPerfRequirement"</strong></li>
                            <li>Open <code>chrome://flags/#prompt-api-for-gemini-nano</code></li>
                            <li>Set to <strong>"Enabled"</strong></li>
                            <li>Click "Relaunch" to restart Chrome</li>
                        </ol>
                        <p style={styles.note}>When enabled, Nano takes priority over cloud APIs (no API key needed).</p>
                        <button
                            style={{ ...styles.refreshBtn, marginTop: 12 }}
                            onClick={() => { checkProvider(); }}
                        >
                            Check Nano Status
                        </button>
                    </div>
                </section>

                <section style={styles.section}>
                    <h2 style={styles.sectionTitle}>Cloud AI (Fallback)</h2>
                    <div style={styles.form}>
                        <label style={styles.label}>
                            Provider
                            <div style={styles.providerGrid}>
                                {(Object.keys(PROVIDER_INFO) as CloudProvider[]).map(p => (
                                    <button
                                        key={p}
                                        style={{
                                            ...styles.providerBtn,
                                            ...(cloudProvider === p ? styles.providerBtnActive : {}),
                                            borderColor: cloudProvider === p ? getProviderColor(p) : '#333'
                                        }}
                                        onClick={() => {
                                            setCloudProvider(p);
                                            setModel(PROVIDER_INFO[p].defaultModel);
                                        }}
                                    >
                                        <span style={{ color: getProviderColor(p), fontWeight: 600 }}>
                                            {PROVIDER_INFO[p].name}
                                        </span>
                                        <span style={{ fontSize: 11, color: '#666' }}>
                                            {PROVIDER_INFO[p].description}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </label>

                        <label style={styles.label}>
                            API Key
                            <input
                                type="password"
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                placeholder={`Enter your ${PROVIDER_INFO[cloudProvider].name} API key`}
                                style={styles.input}
                            />
                            <a
                                href={PROVIDER_INFO[cloudProvider].getKeyUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={styles.link}
                            >
                                Get API key from {PROVIDER_INFO[cloudProvider].name}
                            </a>
                        </label>

                        <label style={styles.label}>
                            Model
                            <select
                                value={model || PROVIDER_INFO[cloudProvider].defaultModel}
                                onChange={(e) => setModel(e.target.value)}
                                style={styles.select}
                            >
                                {PROVIDER_INFO[cloudProvider].models.map(m => (
                                    <option key={m} value={m}>{m}</option>
                                ))}
                            </select>
                        </label>

                        <div style={styles.btnRow}>
                            <button style={styles.btnPrimary} onClick={saveConfig}>
                                {saved ? 'Saved!' : 'Save Configuration'}
                            </button>
                            <button
                                style={styles.btnSecondary}
                                onClick={testConnection}
                                disabled={testing || !apiKey}
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
        maxWidth: 640,
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
    licenseCard: {
        background: 'linear-gradient(135deg, #1a1a2e, #16213e)',
        padding: 20,
        borderRadius: 12,
        border: '1px solid #333',
        textAlign: 'center',
    },
    licenseStatus: {
        marginBottom: 12,
    },
    refreshBtn: {
        padding: '8px 16px',
        background: '#333',
        border: 'none',
        borderRadius: 4,
        color: '#00ff88',
        fontSize: 12,
        cursor: 'pointer',
    },
    proMessage: {
        fontSize: 13,
        color: '#00ff88',
        margin: '12px 0 0 0',
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
        color: '#888',
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
        padding: 20,
        borderRadius: 8,
        border: '1px solid #222',
    },
    label: {
        display: 'block',
        fontSize: 13,
        marginBottom: 20,
        color: '#ccc',
    },
    providerGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 10,
        marginTop: 8,
    },
    providerBtn: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        padding: 12,
        background: '#0a0a0a',
        border: '2px solid #333',
        borderRadius: 8,
        cursor: 'pointer',
        transition: 'all 0.2s',
    },
    providerBtnActive: {
        background: '#1a1a1a',
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
    select: {
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
    link: {
        display: 'inline-block',
        marginTop: 6,
        fontSize: 12,
        color: '#00aaff',
        textDecoration: 'none',
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
};

const container = document.getElementById('root');
if (container) {
    const root = createRoot(container);
    root.render(<Options />);
}
