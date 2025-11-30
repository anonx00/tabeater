import React, { useState, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { colors, spacing, typography, borderRadius, transitions } from '../shared/theme';

type CloudProvider = 'gemini' | 'openai' | 'anthropic';

interface LicenseStatus {
    status: 'trial' | 'pro' | 'expired' | 'none';
    paid: boolean;
    usageRemaining: number;
    trialEndDate?: string;
    canUse: boolean;
}

interface NanoStatus {
    available: boolean;
    status: 'ready' | 'downloading' | 'not_available' | 'error';
    message: string;
}

interface AutoPilotSettings {
    staleDaysThreshold: number;
    autoCloseStale: boolean;
    autoGroupByCategory: boolean;
    excludePinned: boolean;
    excludeActive: boolean;
}

const PROVIDER_INFO = {
    gemini: {
        name: 'Google Gemini',
        defaultModel: 'gemini-2.0-flash',
        models: ['gemini-2.0-flash', 'gemini-1.5-flash-latest', 'gemini-1.5-pro-latest'],
        getKeyUrl: 'https://aistudio.google.com/app/apikey',
        description: 'Free tier available',
        color: colors.providerGemini,
    },
    openai: {
        name: 'OpenAI',
        defaultModel: 'gpt-4o-mini',
        models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
        getKeyUrl: 'https://platform.openai.com/api-keys',
        description: 'Pay as you go',
        color: colors.providerOpenai,
    },
    anthropic: {
        name: 'Anthropic Claude',
        defaultModel: 'claude-3-5-haiku-latest',
        models: ['claude-3-5-haiku-latest', 'claude-3-5-sonnet-latest', 'claude-3-opus-latest'],
        getKeyUrl: 'https://console.anthropic.com/settings/keys',
        description: 'Pay as you go',
        color: colors.providerAnthropic,
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
    const [nanoStatus, setNanoStatus] = useState<NanoStatus | null>(null);
    const [checkingNano, setCheckingNano] = useState(false);
    const [autoPilotSettings, setAutoPilotSettings] = useState<AutoPilotSettings>({
        staleDaysThreshold: 7,
        autoCloseStale: false,
        autoGroupByCategory: false,
        excludePinned: true,
        excludeActive: true,
    });
    const [autoPilotSaved, setAutoPilotSaved] = useState(false);
    const [hoveredProvider, setHoveredProvider] = useState<string | null>(null);

    useEffect(() => {
        loadConfig();
        loadLicense();
        checkNanoStatus();
        loadAutoPilotSettings();
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

    const checkNanoStatus = async () => {
        setCheckingNano(true);
        try {
            const statusResponse = await chrome.runtime.sendMessage({ action: 'checkNanoStatus' });
            if (statusResponse.success) {
                setNanoStatus(statusResponse.data);
            }

            const reinitResponse = await chrome.runtime.sendMessage({ action: 'reinitializeAI' });
            if (reinitResponse.success) {
                setActiveProvider(reinitResponse.data.provider);
                if (reinitResponse.data.nanoStatus) {
                    setNanoStatus(reinitResponse.data.nanoStatus);
                }
            }
        } catch (err) {
            console.error('Failed to check Nano status:', err);
        }
        setCheckingNano(false);
    };

    const loadAutoPilotSettings = async () => {
        const response = await chrome.runtime.sendMessage({ action: 'getAutoPilotSettings' });
        if (response.success) {
            setAutoPilotSettings(response.data);
        }
    };

    const saveAutoPilotSettings = useCallback(async () => {
        await chrome.runtime.sendMessage({
            action: 'setAutoPilotSettings',
            payload: autoPilotSettings
        });
        setAutoPilotSaved(true);
        setTimeout(() => setAutoPilotSaved(false), 2000);
    }, [autoPilotSettings]);

    const updateAutoPilotSetting = <K extends keyof AutoPilotSettings>(key: K, value: AutoPilotSettings[K]) => {
        setAutoPilotSettings(prev => ({ ...prev, [key]: value }));
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
        if (p === 'nano') return colors.providerNano;
        if (p === 'gemini') return colors.providerGemini;
        if (p === 'openai') return colors.providerOpenai;
        if (p === 'anthropic') return colors.providerAnthropic;
        return colors.error;
    };

    const getProviderLabel = (p: string) => {
        if (p === 'nano') return 'Chrome Nano (Local)';
        if (p === 'gemini') return 'Google Gemini';
        if (p === 'openai') return 'OpenAI';
        if (p === 'anthropic') return 'Anthropic Claude';
        return 'Not Configured';
    };

    const getNanoStatusColor = () => {
        if (!nanoStatus) return colors.textDimmer;
        if (nanoStatus.status === 'ready' || activeProvider === 'nano') return colors.success;
        if (nanoStatus.status === 'downloading') return colors.warningText;
        return colors.warning;
    };

    const getNanoStatusLabel = () => {
        if (activeProvider === 'nano') return 'Active';
        if (!nanoStatus) return 'Checking...';
        if (nanoStatus.status === 'ready') return 'Ready';
        if (nanoStatus.status === 'downloading') return 'Downloading...';
        if (nanoStatus.status === 'error') return 'Error';
        return 'Not Available';
    };

    const getLicenseDisplay = () => {
        if (!license) return { text: 'Loading...', color: colors.textDimmer, icon: 'loading' };
        if (license.paid) return { text: 'PRO - Unlimited Access', color: colors.licensePro, icon: 'star' };
        if (license.status === 'trial') {
            const daysLeft = license.trialEndDate
                ? Math.ceil((new Date(license.trialEndDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                : 0;
            return { text: `Free Trial - ${daysLeft} days left (${license.usageRemaining}/day remaining)`, color: colors.licenseTrial, icon: 'clock' };
        }
        if (license.status === 'expired') return { text: 'Trial Expired', color: colors.licenseExpired, icon: 'x' };
        return { text: 'Not Registered', color: colors.licenseExpired, icon: 'x' };
    };

    const licenseDisplay = getLicenseDisplay();

    return (
        <div style={styles.container}>
            <header style={styles.header}>
                <div style={styles.headerContent}>
                    <div style={styles.logoSection}>
                        <div style={styles.logo}>PT</div>
                        <div>
                            <h1 style={styles.title}>PHANTOM TABS</h1>
                            <div style={styles.subtitle}>Settings & Configuration</div>
                        </div>
                    </div>
                    <div style={styles.version}>v1.0.0</div>
                </div>
            </header>

            <main style={styles.main}>
                {/* License Status */}
                <section style={styles.section}>
                    <div style={styles.sectionHeader}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={colors.primary} strokeWidth="2">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                        </svg>
                        <h2 style={styles.sectionTitle}>License Status</h2>
                    </div>
                    <div style={styles.licenseCard}>
                        <div style={styles.licenseStatus}>
                            <span style={{ color: licenseDisplay.color, fontWeight: typography.semibold, fontSize: typography.sizeXxl }}>
                                {licenseDisplay.text}
                            </span>
                        </div>
                        <button style={styles.secondaryBtn} onClick={loadLicense}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16" />
                            </svg>
                            Refresh Status
                        </button>
                        {license?.paid && (
                            <p style={styles.proMessage}>Thank you for your support!</p>
                        )}
                        <p style={styles.licenseNote}>
                            License is bound to this device. One purchase = one device.
                        </p>
                    </div>
                </section>

                {/* Current AI Provider */}
                <section style={styles.section}>
                    <div style={styles.sectionHeader}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={colors.primary} strokeWidth="2">
                            <path d="M12 2a10 10 0 1 0 10 10H12V2z" />
                            <path d="M12 2a10 10 0 0 1 10 10" />
                        </svg>
                        <h2 style={styles.sectionTitle}>Current AI Provider</h2>
                    </div>
                    <div style={styles.card}>
                        <div style={styles.providerStatusRow}>
                            <span style={styles.providerLabel}>Active Provider:</span>
                            <span style={{ ...styles.providerValue, color: getProviderColor(activeProvider) }}>
                                {getProviderLabel(activeProvider)}
                            </span>
                        </div>
                        <p style={styles.providerInfo}>
                            {activeProvider === 'nano' && 'Using Chrome built-in AI. Fast and private - no API key needed.'}
                            {activeProvider !== 'nano' && activeProvider !== 'none' && `Using ${getProviderLabel(activeProvider)} cloud API.`}
                            {activeProvider === 'none' && 'No AI configured. Set up Nano or a cloud provider below.'}
                        </p>
                    </div>
                </section>

                {/* Local AI (Gemini Nano) */}
                <section style={styles.section}>
                    <div style={styles.sectionHeader}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={colors.primary} strokeWidth="2">
                            <rect x="4" y="4" width="16" height="16" rx="2" ry="2" />
                            <rect x="9" y="9" width="6" height="6" />
                            <line x1="9" y1="1" x2="9" y2="4" />
                            <line x1="15" y1="1" x2="15" y2="4" />
                            <line x1="9" y1="20" x2="9" y2="23" />
                            <line x1="15" y1="20" x2="15" y2="23" />
                        </svg>
                        <h2 style={styles.sectionTitle}>Local AI (Priority 1)</h2>
                        <span style={styles.recommendedBadge}>Recommended</span>
                    </div>
                    <div style={styles.card}>
                        <div style={styles.nanoStatusRow}>
                            <span>Gemini Nano Status:</span>
                            <span style={{ color: getNanoStatusColor(), fontWeight: typography.semibold }}>
                                {getNanoStatusLabel()}
                            </span>
                        </div>

                        {nanoStatus && nanoStatus.status !== 'ready' && activeProvider !== 'nano' && (
                            <div style={{
                                ...styles.statusMessage,
                                background: nanoStatus.status === 'downloading' ? colors.warningBg : '#1a1010',
                                borderColor: nanoStatus.status === 'downloading' ? '#665500' : '#441111',
                                color: nanoStatus.status === 'downloading' ? colors.warningText : '#ff8888',
                            }}>
                                {nanoStatus.message}
                            </div>
                        )}

                        {(nanoStatus?.status === 'ready' || activeProvider === 'nano') && (
                            <div style={{ ...styles.statusMessage, background: '#102810', borderColor: '#006600', color: colors.success }}>
                                Gemini Nano is ready - local AI enabled!
                            </div>
                        )}

                        <div style={styles.setupInstructions}>
                            <p style={styles.setupTitle}>To enable Gemini Nano:</p>
                            <ol style={styles.stepList}>
                                <li>Open <code style={styles.code}>chrome://flags/#optimization-guide-on-device-model</code></li>
                                <li>Set to <strong>"Enabled BypassPerfRequirement"</strong></li>
                                <li>Open <code style={styles.code}>chrome://flags/#prompt-api-for-gemini-nano</code></li>
                                <li>Set to <strong>"Enabled"</strong></li>
                                <li>Click <strong>"Relaunch"</strong> to restart Chrome</li>
                                <li>Wait 2-5 minutes for the model to download</li>
                            </ol>
                            <p style={styles.setupNote}>
                                When enabled, Nano takes priority over cloud APIs (no API key needed).
                            </p>
                        </div>

                        <button
                            style={{ ...styles.secondaryBtn, marginTop: spacing.lg }}
                            onClick={checkNanoStatus}
                            disabled={checkingNano}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16" />
                            </svg>
                            {checkingNano ? 'Checking...' : 'Check Nano Status'}
                        </button>
                    </div>
                </section>

                {/* Cloud AI Configuration */}
                <section style={styles.section}>
                    <div style={styles.sectionHeader}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={colors.primary} strokeWidth="2">
                            <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
                        </svg>
                        <h2 style={styles.sectionTitle}>Cloud AI (Fallback)</h2>
                    </div>
                    <div style={styles.card}>
                        <div style={styles.formGroup}>
                            <label style={styles.label}>Select Provider</label>
                            <div style={styles.providerGrid}>
                                {(Object.keys(PROVIDER_INFO) as CloudProvider[]).map(p => (
                                    <button
                                        key={p}
                                        style={{
                                            ...styles.providerBtn,
                                            ...(cloudProvider === p ? styles.providerBtnActive : {}),
                                            borderColor: cloudProvider === p ? PROVIDER_INFO[p].color : colors.borderLight,
                                            ...(hoveredProvider === p && cloudProvider !== p ? styles.providerBtnHover : {}),
                                        }}
                                        onClick={() => {
                                            setCloudProvider(p);
                                            setModel(PROVIDER_INFO[p].defaultModel);
                                        }}
                                        onMouseEnter={() => setHoveredProvider(p)}
                                        onMouseLeave={() => setHoveredProvider(null)}
                                    >
                                        <span style={{ color: PROVIDER_INFO[p].color, fontWeight: typography.semibold }}>
                                            {PROVIDER_INFO[p].name}
                                        </span>
                                        <span style={styles.providerDesc}>
                                            {PROVIDER_INFO[p].description}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div style={styles.formGroup}>
                            <label style={styles.label}>API Key</label>
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
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                    <polyline points="15 3 21 3 21 9" />
                                    <line x1="10" y1="14" x2="21" y2="3" />
                                </svg>
                                Get API key from {PROVIDER_INFO[cloudProvider].name}
                            </a>
                        </div>

                        <div style={styles.formGroup}>
                            <label style={styles.label}>Model</label>
                            <select
                                value={model || PROVIDER_INFO[cloudProvider].defaultModel}
                                onChange={(e) => setModel(e.target.value)}
                                style={styles.select}
                            >
                                {PROVIDER_INFO[cloudProvider].models.map(m => (
                                    <option key={m} value={m}>{m}</option>
                                ))}
                            </select>
                        </div>

                        <div style={styles.btnRow}>
                            <button style={styles.primaryBtn} onClick={saveConfig}>
                                {saved ? (
                                    <>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <polyline points="20 6 9 17 4 12" />
                                        </svg>
                                        Saved!
                                    </>
                                ) : 'Save Configuration'}
                            </button>
                            <button
                                style={styles.secondaryBtn}
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
                                borderColor: testResult === 'success' ? colors.success : colors.error,
                                color: testResult === 'success' ? colors.success : colors.error,
                            }}>
                                {testResult === 'success' ? (
                                    <>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <polyline points="20 6 9 17 4 12" />
                                        </svg>
                                        Connection successful!
                                    </>
                                ) : testResult}
                            </div>
                        )}
                    </div>
                </section>

                {/* Auto Pilot Settings */}
                <section style={styles.section}>
                    <div style={styles.sectionHeader}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={colors.primary} strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                            <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
                        </svg>
                        <h2 style={styles.sectionTitle}>Auto Pilot Settings</h2>
                        <span style={styles.proBadge}>PRO</span>
                    </div>
                    <div style={styles.card}>
                        <p style={styles.cardDescription}>
                            Auto Pilot analyzes your tabs, identifies stale and duplicate tabs, and provides AI-powered recommendations.
                        </p>

                        <div style={styles.settingRow}>
                            <div style={styles.settingInfo}>
                                <span style={styles.settingLabel}>Stale tab threshold</span>
                                <span style={styles.settingDesc}>Tabs not accessed for this many days are considered stale</span>
                            </div>
                            <select
                                style={{ ...styles.select, width: 80 }}
                                value={autoPilotSettings.staleDaysThreshold}
                                onChange={(e) => updateAutoPilotSetting('staleDaysThreshold', parseInt(e.target.value))}
                            >
                                <option value={1}>1 day</option>
                                <option value={3}>3 days</option>
                                <option value={7}>7 days</option>
                                <option value={14}>14 days</option>
                                <option value={30}>30 days</option>
                            </select>
                        </div>

                        <div style={styles.checkboxRow}>
                            <label style={styles.checkboxLabel}>
                                <input
                                    type="checkbox"
                                    checked={autoPilotSettings.excludePinned}
                                    onChange={(e) => updateAutoPilotSetting('excludePinned', e.target.checked)}
                                    style={styles.checkbox}
                                />
                                <span>Exclude pinned tabs from suggestions</span>
                            </label>
                        </div>

                        <div style={styles.checkboxRow}>
                            <label style={styles.checkboxLabel}>
                                <input
                                    type="checkbox"
                                    checked={autoPilotSettings.excludeActive}
                                    onChange={(e) => updateAutoPilotSetting('excludeActive', e.target.checked)}
                                    style={styles.checkbox}
                                />
                                <span>Exclude currently active tabs</span>
                            </label>
                        </div>

                        <div style={styles.divider} />

                        <p style={styles.experimentalNote}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                <line x1="12" y1="9" x2="12" y2="13" />
                                <line x1="12" y1="17" x2="12.01" y2="17" />
                            </svg>
                            Auto-actions (experimental - use with caution)
                        </p>

                        <div style={styles.checkboxRow}>
                            <label style={styles.checkboxLabel}>
                                <input
                                    type="checkbox"
                                    checked={autoPilotSettings.autoCloseStale}
                                    onChange={(e) => updateAutoPilotSetting('autoCloseStale', e.target.checked)}
                                    style={styles.checkbox}
                                />
                                <span>Auto-close stale and duplicate tabs</span>
                            </label>
                        </div>

                        <div style={styles.checkboxRow}>
                            <label style={styles.checkboxLabel}>
                                <input
                                    type="checkbox"
                                    checked={autoPilotSettings.autoGroupByCategory}
                                    onChange={(e) => updateAutoPilotSetting('autoGroupByCategory', e.target.checked)}
                                    style={styles.checkbox}
                                />
                                <span>Auto-group tabs by category</span>
                            </label>
                        </div>

                        <button style={{ ...styles.primaryBtn, marginTop: spacing.lg }} onClick={saveAutoPilotSettings}>
                            {autoPilotSaved ? (
                                <>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                    Saved!
                                </>
                            ) : 'Save Auto Pilot Settings'}
                        </button>
                    </div>
                </section>

                {/* Privacy & Data */}
                <section style={styles.section}>
                    <div style={styles.sectionHeader}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={colors.primary} strokeWidth="2">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                        </svg>
                        <h2 style={styles.sectionTitle}>Privacy & Data</h2>
                    </div>
                    <div style={styles.card}>
                        <div style={styles.privacyGrid}>
                            <div style={styles.privacyColumn}>
                                <p style={styles.privacyTitle}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={colors.success} strokeWidth="2">
                                        <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                    What we collect:
                                </p>
                                <ul style={styles.privacyList}>
                                    <li>Device ID (anonymous, for license)</li>
                                    <li>License status (trial/pro)</li>
                                    <li>Daily usage count</li>
                                </ul>
                            </div>
                            <div style={styles.privacyColumn}>
                                <p style={styles.privacyTitle}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={colors.error} strokeWidth="2">
                                        <line x1="18" y1="6" x2="6" y2="18" />
                                        <line x1="6" y1="6" x2="18" y2="18" />
                                    </svg>
                                    What we DON'T collect:
                                </p>
                                <ul style={styles.privacyList}>
                                    <li>Browsing history</li>
                                    <li>Tab contents or URLs</li>
                                    <li>Personal information</li>
                                    <li>AI conversation data</li>
                                </ul>
                            </div>
                        </div>
                        <div style={styles.privacyNote}>
                            AI analysis happens locally (Nano) or via your API key. Tab data never leaves your browser unless you use a cloud provider.
                        </div>
                    </div>
                </section>

                {/* About */}
                <section style={styles.section}>
                    <div style={styles.sectionHeader}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={colors.primary} strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="16" x2="12" y2="12" />
                            <line x1="12" y1="8" x2="12.01" y2="8" />
                        </svg>
                        <h2 style={styles.sectionTitle}>About</h2>
                    </div>
                    <div style={styles.card}>
                        <div style={styles.aboutContent}>
                            <div style={styles.aboutLogo}>PT</div>
                            <div>
                                <p style={styles.aboutName}>PHANTOM TABS</p>
                                <p style={styles.aboutTagline}>Tactical Tab Intelligence System</p>
                                <p style={styles.aboutVersion}>Version 1.0.0</p>
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
        background: colors.bgDarker,
        color: colors.textSecondary,
        fontFamily: typography.fontFamily,
    },
    header: {
        background: colors.bgCard,
        borderBottom: `2px solid ${colors.primary}`,
        position: 'sticky',
        top: 0,
        zIndex: 100,
    },
    headerContent: {
        maxWidth: 720,
        margin: '0 auto',
        padding: `${spacing.xl}px ${spacing.xxxl}px`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    logoSection: {
        display: 'flex',
        alignItems: 'center',
        gap: spacing.lg,
    },
    logo: {
        width: 48,
        height: 48,
        background: colors.primary,
        color: colors.bgDarkest,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: typography.bold,
        fontSize: typography.sizeDisplay,
        borderRadius: borderRadius.lg,
    },
    title: {
        margin: 0,
        fontSize: typography.sizeHero,
        fontWeight: typography.semibold,
        color: colors.primary,
        letterSpacing: typography.letterNormal,
    },
    subtitle: {
        fontSize: typography.sizeLg,
        color: colors.textDim,
        marginTop: 2,
    },
    version: {
        fontSize: typography.sizeMd,
        color: colors.textDimmest,
        background: colors.bgCardHover,
        padding: `${spacing.xs}px ${spacing.md}px`,
        borderRadius: borderRadius.sm,
    },
    main: {
        maxWidth: 720,
        margin: '0 auto',
        padding: `${spacing.xxl}px ${spacing.xxxl}px`,
    },
    section: {
        marginBottom: spacing.xxxl,
    },
    sectionHeader: {
        display: 'flex',
        alignItems: 'center',
        gap: spacing.md,
        marginBottom: spacing.lg,
    },
    sectionTitle: {
        margin: 0,
        fontSize: typography.sizeXxl,
        fontWeight: typography.semibold,
        color: colors.textPrimary,
    },
    recommendedBadge: {
        fontSize: typography.sizeSm,
        color: colors.success,
        background: colors.primaryBg,
        padding: `2px ${spacing.sm}px`,
        borderRadius: borderRadius.sm,
        marginLeft: 'auto',
    },
    proBadge: {
        fontSize: typography.sizeSm,
        color: colors.bgDarkest,
        background: '#ffd700',
        padding: `2px ${spacing.sm}px`,
        borderRadius: borderRadius.sm,
        fontWeight: typography.bold,
    },
    card: {
        background: colors.bgCard,
        padding: spacing.xl,
        borderRadius: borderRadius.lg,
        border: `1px solid ${colors.borderMedium}`,
    },
    licenseCard: {
        background: `linear-gradient(135deg, ${colors.bgCard}, #16213e)`,
        padding: spacing.xl,
        borderRadius: borderRadius.lg,
        border: `1px solid ${colors.borderLight}`,
        textAlign: 'center',
    },
    licenseStatus: {
        marginBottom: spacing.lg,
    },
    proMessage: {
        fontSize: typography.sizeLg,
        color: colors.success,
        margin: `${spacing.lg}px 0 0 0`,
    },
    licenseNote: {
        fontSize: typography.sizeMd,
        color: colors.textDimmest,
        marginTop: spacing.lg,
        marginBottom: 0,
    },
    providerStatusRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: typography.sizeXl,
    },
    providerLabel: {
        color: colors.textDim,
    },
    providerValue: {
        fontWeight: typography.semibold,
    },
    providerInfo: {
        fontSize: typography.sizeLg,
        color: colors.textDim,
        marginTop: spacing.md,
        marginBottom: 0,
    },
    nanoStatusRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: typography.sizeXl,
        marginBottom: spacing.lg,
    },
    statusMessage: {
        padding: `${spacing.md}px ${spacing.lg}px`,
        border: '1px solid',
        borderRadius: borderRadius.md,
        fontSize: typography.sizeLg,
        marginBottom: spacing.lg,
    },
    setupInstructions: {
        background: colors.bgDarker,
        padding: spacing.lg,
        borderRadius: borderRadius.md,
        marginTop: spacing.lg,
    },
    setupTitle: {
        fontWeight: typography.semibold,
        marginTop: 0,
        marginBottom: spacing.md,
        color: colors.textSecondary,
    },
    stepList: {
        margin: 0,
        paddingLeft: spacing.xl,
        lineHeight: 2,
        color: colors.textDim,
    },
    code: {
        background: colors.bgCard,
        padding: `2px ${spacing.sm}px`,
        borderRadius: borderRadius.sm,
        fontFamily: typography.fontMono,
        fontSize: typography.sizeMd,
        color: colors.primary,
    },
    setupNote: {
        fontSize: typography.sizeLg,
        color: colors.success,
        marginBottom: 0,
        marginTop: spacing.lg,
    },
    formGroup: {
        marginBottom: spacing.xl,
    },
    label: {
        display: 'block',
        fontSize: typography.sizeLg,
        marginBottom: spacing.md,
        color: colors.textMuted,
    },
    providerGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: spacing.md,
    },
    providerBtn: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: spacing.xs,
        padding: spacing.lg,
        background: colors.bgDarker,
        border: `2px solid ${colors.borderLight}`,
        borderRadius: borderRadius.lg,
        cursor: 'pointer',
        transition: `all ${transitions.fast}`,
    },
    providerBtnActive: {
        background: colors.bgCardHover,
    },
    providerBtnHover: {
        background: colors.bgCard,
        borderColor: colors.textDimmest,
    },
    providerDesc: {
        fontSize: typography.sizeMd,
        color: colors.textDimmest,
    },
    input: {
        display: 'block',
        width: '100%',
        padding: `${spacing.md}px ${spacing.lg}px`,
        background: colors.bgDarker,
        border: `1px solid ${colors.borderLight}`,
        borderRadius: borderRadius.md,
        color: colors.textPrimary,
        fontSize: typography.sizeXl,
        boxSizing: 'border-box',
        outline: 'none',
        transition: `border-color ${transitions.fast}`,
    },
    select: {
        display: 'block',
        width: '100%',
        padding: `${spacing.md}px ${spacing.lg}px`,
        background: colors.bgDarker,
        border: `1px solid ${colors.borderLight}`,
        borderRadius: borderRadius.md,
        color: colors.textPrimary,
        fontSize: typography.sizeXl,
        boxSizing: 'border-box',
        outline: 'none',
        cursor: 'pointer',
    },
    link: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: spacing.xs,
        marginTop: spacing.md,
        fontSize: typography.sizeLg,
        color: colors.info,
        textDecoration: 'none',
    },
    btnRow: {
        display: 'flex',
        gap: spacing.md,
    },
    primaryBtn: {
        flex: 1,
        padding: `${spacing.md}px ${spacing.xl}px`,
        background: colors.primary,
        border: 'none',
        borderRadius: borderRadius.md,
        color: colors.bgDarkest,
        fontSize: typography.sizeXl,
        fontWeight: typography.medium,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        transition: `all ${transitions.fast}`,
    },
    secondaryBtn: {
        flex: 1,
        padding: `${spacing.md}px ${spacing.xl}px`,
        background: colors.bgCardHover,
        border: `1px solid ${colors.borderLight}`,
        borderRadius: borderRadius.md,
        color: colors.textMuted,
        fontSize: typography.sizeXl,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        transition: `all ${transitions.fast}`,
    },
    testResult: {
        marginTop: spacing.lg,
        padding: spacing.md,
        borderRadius: borderRadius.md,
        border: '1px solid',
        fontSize: typography.sizeLg,
        display: 'flex',
        alignItems: 'center',
        gap: spacing.sm,
    },
    cardDescription: {
        margin: 0,
        marginBottom: spacing.xl,
        fontSize: typography.sizeLg,
        color: colors.textDim,
    },
    settingRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacing.lg,
    },
    settingInfo: {
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
    },
    settingLabel: {
        fontSize: typography.sizeXl,
        color: colors.textSecondary,
    },
    settingDesc: {
        fontSize: typography.sizeMd,
        color: colors.textDimmest,
    },
    checkboxRow: {
        marginBottom: spacing.md,
    },
    checkboxLabel: {
        display: 'flex',
        alignItems: 'center',
        gap: spacing.md,
        cursor: 'pointer',
        fontSize: typography.sizeXl,
        color: colors.textMuted,
    },
    checkbox: {
        width: 20,
        height: 20,
        cursor: 'pointer',
        accentColor: colors.primary,
    },
    divider: {
        height: 1,
        background: colors.borderMedium,
        margin: `${spacing.xl}px 0`,
    },
    experimentalNote: {
        display: 'flex',
        alignItems: 'center',
        gap: spacing.sm,
        fontSize: typography.sizeLg,
        color: colors.warning,
        marginTop: 0,
        marginBottom: spacing.lg,
    },
    privacyGrid: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: spacing.xl,
        marginBottom: spacing.lg,
    },
    privacyColumn: {},
    privacyTitle: {
        display: 'flex',
        alignItems: 'center',
        gap: spacing.sm,
        fontWeight: typography.semibold,
        marginBottom: spacing.md,
        marginTop: 0,
        fontSize: typography.sizeXl,
        color: colors.textSecondary,
    },
    privacyList: {
        margin: 0,
        paddingLeft: spacing.xl,
        lineHeight: 1.8,
        color: colors.textDim,
        fontSize: typography.sizeLg,
    },
    privacyNote: {
        padding: spacing.md,
        background: colors.bgDarker,
        borderRadius: borderRadius.md,
        fontSize: typography.sizeLg,
        color: colors.textDim,
        borderLeft: `3px solid ${colors.primary}`,
    },
    aboutContent: {
        display: 'flex',
        alignItems: 'center',
        gap: spacing.xl,
    },
    aboutLogo: {
        width: 64,
        height: 64,
        background: colors.primary,
        color: colors.bgDarkest,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: typography.bold,
        fontSize: typography.sizeHero,
        borderRadius: borderRadius.lg,
    },
    aboutName: {
        margin: 0,
        fontSize: typography.sizeXxl,
        fontWeight: typography.semibold,
        color: colors.primary,
    },
    aboutTagline: {
        margin: `${spacing.xs}px 0 0`,
        fontSize: typography.sizeXl,
        color: colors.textDim,
    },
    aboutVersion: {
        margin: `${spacing.sm}px 0 0`,
        fontSize: typography.sizeLg,
        color: colors.textDimmest,
    },
};

// Add global styles
const styleSheet = document.createElement('style');
styleSheet.textContent = `
    input:focus, select:focus {
        border-color: ${colors.primary} !important;
    }
    button:focus-visible {
        outline: 2px solid ${colors.primary};
        outline-offset: 2px;
    }
    button:hover:not(:disabled) {
        opacity: 0.9;
    }
    a:hover {
        text-decoration: underline;
    }
    ::-webkit-scrollbar {
        width: 8px;
    }
    ::-webkit-scrollbar-track {
        background: ${colors.bgDarker};
    }
    ::-webkit-scrollbar-thumb {
        background: ${colors.borderLight};
        border-radius: 4px;
    }
    ::-webkit-scrollbar-thumb:hover {
        background: ${colors.textDimmest};
    }
`;
document.head.appendChild(styleSheet);

const container = document.getElementById('root');
if (container) {
    const root = createRoot(container);
    root.render(<Options />);
}
