import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

type AIProvider = 'gemini' | 'openai' | 'anthropic';

interface AIConfig {
    cloudProvider?: AIProvider;
    apiKey?: string;
    model?: string;
}

const OptionsPage: React.FC = () => {
    const [provider, setProvider] = useState<AIProvider>('gemini');
    const [apiKey, setApiKey] = useState('');
    const [model, setModel] = useState('');
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        loadConfig();
    }, []);

    const loadConfig = async () => {
        const { aiConfig } = await chrome.storage.local.get('aiConfig');
        if (aiConfig) {
            setProvider(aiConfig.cloudProvider || 'gemini');
            setApiKey(aiConfig.apiKey || '');
            setModel(aiConfig.model || '');
        }
    };

    const handleSave = async () => {
        setSaving(true);
        setMessage('');

        const config: AIConfig = {
            cloudProvider: provider,
            apiKey: apiKey.trim(),
            model: model.trim() || undefined
        };

        try {
            await chrome.storage.local.set({ aiConfig: config });

            // Notify service worker to reinitialize
            chrome.runtime.sendMessage({ action: 'initialize-ai' }).catch(() => {});

            setMessage('Configuration saved successfully!');
            setTimeout(() => setMessage(''), 3000);
        } catch (error) {
            setMessage('Error saving configuration');
        } finally {
            setSaving(false);
        }
    };

    const getDefaultModel = () => {
        switch (provider) {
            case 'gemini': return 'gemini-2.0-flash';
            case 'openai': return 'gpt-4o-mini';
            case 'anthropic': return 'claude-3-5-haiku-latest';
        }
    };

    const getApiKeyUrl = () => {
        switch (provider) {
            case 'gemini': return 'https://aistudio.google.com/app/apikey';
            case 'openai': return 'https://platform.openai.com/api-keys';
            case 'anthropic': return 'https://console.anthropic.com/settings/keys';
        }
    };

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <h1 style={styles.title}>TabEater Settings</h1>
                <p style={styles.subtitle}>Configure AI Provider</p>
            </div>

            <div style={styles.content}>
                <div style={styles.section}>
                    <h2 style={styles.sectionTitle}>Cloud AI Provider</h2>

                    <div style={styles.providerGrid}>
                        <button
                            style={{
                                ...styles.providerCard,
                                ...(provider === 'gemini' ? styles.providerCardActive : {})
                            }}
                            onClick={() => setProvider('gemini')}
                        >
                            <div style={styles.providerName}>Google Gemini</div>
                            <div style={styles.providerModel}>gemini-2.0-flash</div>
                        </button>

                        <button
                            style={{
                                ...styles.providerCard,
                                ...(provider === 'openai' ? styles.providerCardActive : {})
                            }}
                            onClick={() => setProvider('openai')}
                        >
                            <div style={styles.providerName}>OpenAI</div>
                            <div style={styles.providerModel}>gpt-4o-mini</div>
                        </button>

                        <button
                            style={{
                                ...styles.providerCard,
                                ...(provider === 'anthropic' ? styles.providerCardActive : {})
                            }}
                            onClick={() => setProvider('anthropic')}
                        >
                            <div style={styles.providerName}>Anthropic Claude</div>
                            <div style={styles.providerModel}>claude-3-5-haiku</div>
                        </button>
                    </div>

                    <div style={styles.formGroup}>
                        <label style={styles.label}>
                            API Key
                            <a href={getApiKeyUrl()} target="_blank" rel="noopener noreferrer" style={styles.link}>
                                Get API Key →
                            </a>
                        </label>
                        <input
                            type="password"
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            placeholder="Enter your API key"
                            style={styles.input}
                        />
                    </div>

                    <div style={styles.formGroup}>
                        <label style={styles.label}>
                            Model (optional)
                        </label>
                        <input
                            type="text"
                            value={model}
                            onChange={(e) => setModel(e.target.value)}
                            placeholder={`Default: ${getDefaultModel()}`}
                            style={styles.input}
                        />
                        <div style={styles.hint}>
                            Leave empty to use the default model
                        </div>
                    </div>

                    <button
                        onClick={handleSave}
                        disabled={saving || !apiKey.trim()}
                        style={{
                            ...styles.saveButton,
                            ...(saving || !apiKey.trim() ? styles.saveButtonDisabled : {})
                        }}
                    >
                        {saving ? 'Saving...' : 'Save Configuration'}
                    </button>

                    {message && (
                        <div style={{
                            ...styles.message,
                            ...(message.includes('Error') ? styles.messageError : styles.messageSuccess)
                        }}>
                            {message}
                        </div>
                    )}
                </div>

                <div style={styles.infoBox}>
                    <h3 style={styles.infoTitle}>Privacy Notice</h3>
                    <p style={styles.infoText}>
                        Your tab data will be sent to {provider === 'gemini' ? 'Google' : provider === 'openai' ? 'OpenAI' : 'Anthropic'} servers for AI processing.
                        API keys are stored locally in your browser and never sent to TabEater servers.
                    </p>
                </div>
            </div>
        </div>
    );
};

const styles: { [key: string]: React.CSSProperties } = {
    container: {
        minHeight: '100vh',
        background: '#0a0a0a',
        color: '#e0e0e0',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        padding: '40px 20px',
    },
    header: {
        maxWidth: '800px',
        margin: '0 auto 40px',
        borderBottom: '1px solid #333',
        paddingBottom: '20px',
    },
    title: {
        fontSize: '32px',
        fontWeight: '600',
        margin: '0 0 8px',
        color: '#ffffff',
    },
    subtitle: {
        fontSize: '16px',
        color: '#888',
        margin: 0,
    },
    content: {
        maxWidth: '800px',
        margin: '0 auto',
    },
    section: {
        background: '#1a1a1a',
        border: '1px solid #333',
        borderRadius: '8px',
        padding: '32px',
        marginBottom: '24px',
    },
    sectionTitle: {
        fontSize: '20px',
        fontWeight: '600',
        margin: '0 0 24px',
        color: '#ffffff',
    },
    providerGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '16px',
        marginBottom: '32px',
    },
    providerCard: {
        background: '#222',
        border: '2px solid #333',
        borderRadius: '8px',
        padding: '20px',
        cursor: 'pointer',
        transition: 'all 0.2s',
        textAlign: 'left' as const,
    },
    providerCardActive: {
        borderColor: '#8b5cf6',
        background: '#2a1a4a',
    },
    providerName: {
        fontSize: '14px',
        fontWeight: '600',
        marginBottom: '4px',
        color: '#ffffff',
    },
    providerModel: {
        fontSize: '12px',
        color: '#888',
    },
    formGroup: {
        marginBottom: '24px',
    },
    label: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: '14px',
        fontWeight: '500',
        marginBottom: '8px',
        color: '#e0e0e0',
    },
    link: {
        color: '#8b5cf6',
        textDecoration: 'none',
        fontSize: '13px',
    },
    input: {
        width: '100%',
        padding: '12px',
        background: '#222',
        border: '1px solid #333',
        borderRadius: '6px',
        color: '#e0e0e0',
        fontSize: '14px',
        outline: 'none',
        boxSizing: 'border-box' as const,
    },
    hint: {
        fontSize: '12px',
        color: '#666',
        marginTop: '6px',
    },
    saveButton: {
        width: '100%',
        padding: '12px 24px',
        background: '#8b5cf6',
        color: '#ffffff',
        border: 'none',
        borderRadius: '6px',
        fontSize: '14px',
        fontWeight: '600',
        cursor: 'pointer',
        transition: 'background 0.2s',
    },
    saveButtonDisabled: {
        background: '#444',
        cursor: 'not-allowed',
        opacity: 0.5,
    },
    message: {
        marginTop: '16px',
        padding: '12px',
        borderRadius: '6px',
        fontSize: '14px',
        textAlign: 'center' as const,
    },
    messageSuccess: {
        background: '#1a3a1a',
        color: '#4ade80',
        border: '1px solid #4ade80',
    },
    messageError: {
        background: '#3a1a1a',
        color: '#f87171',
        border: '1px solid #f87171',
    },
    infoBox: {
        background: '#1a1a2e',
        border: '1px solid #333',
        borderRadius: '8px',
        padding: '20px',
    },
    infoTitle: {
        fontSize: '16px',
        fontWeight: '600',
        margin: '0 0 12px',
        color: '#ffffff',
    },
    infoText: {
        fontSize: '14px',
        color: '#aaa',
        lineHeight: '1.6',
        margin: 0,
    },
};

// Mount the app
const container = document.getElementById('root');
if (container) {
    const root = createRoot(container);
    root.render(<OptionsPage />);
}
