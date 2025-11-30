import React, { useState, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { colors, spacing, typography, borderRadius, transitions } from '../shared/theme';
import { ScanlineOverlay } from '../ui/components/ScanlineOverlay';

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
    const [showApiKey, setShowApiKey] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);

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

    const deleteApiKey = async () => {
        if (!confirmDelete) {
            setConfirmDelete(true);
            setTimeout(() => setConfirmDelete(false), 3000);
            return;
        }
        setApiKey('');
        await chrome.runtime.sendMessage({
            action: 'setAIConfig',
            payload: { cloudProvider, apiKey: '', model: '' }
        });
        setConfirmDelete(false);
        checkProvider();
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
                        <div style={styles.logo}>TE</div>
                        <h1 style={styles.title}>TabEater Settings</h1>
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
                        <h2 style={styles.sectionTitle}>License</h2>
                    </div>
                    <div style={styles.licenseCard}>
                        <div style={styles.licenseStatus}>
                            <span style={{ color: licenseDisplay.color, fontWeight: typography.semibold, fontSize: typography.sizeXl }}>
                                {licenseDisplay.text}
                            </span>
                        </div>
                        <button style={styles.compactBtn} onClick={loadLicense}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16" />
                            </svg>
                            Refresh
                        </button>
                    </div>
                </section>

                {/* Current AI Provider */}
                <section style={styles.section}>
                    <div style={styles.sectionHeader}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={colors.primary} strokeWidth="2">
                            <path d="M12 2a10 10 0 1 0 10 10H12V2z" />
                            <path d="M12 2a10 10 0 0 1 10 10" />
                        </svg>
                        <h2 style={styles.sectionTitle}>Active AI Provider</h2>
                    </div>
                    <div style={styles.compactCard}>
                        <div style={styles.providerStatusRow}>
                            <span style={{ ...styles.providerValue, color: getProviderColor(activeProvider) }}>
                                {getProviderLabel(activeProvider)}
                            </span>
                        </div>
                    </div>
                </section>

                {/* Local AI (Gemini Nano) - Compact */}
                {activeProvider !== 'nano' && (
                    <section style={styles.section}>
                        <div style={styles.sectionHeader}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={colors.primary} strokeWidth="2">
                                <rect x="4" y="4" width="16" height="16" rx="2" ry="2" />
                                <rect x="9" y="9" width="6" height="6" />
                            </svg>
                            <h2 style={styles.sectionTitle}>Local AI</h2>
                            <span style={styles.optionalBadge}>Optional</span>
                        </div>
                        <div style={styles.compactCard}>
                            <div style={styles.compactRow}>
                                <div style={styles.compactInfo}>
                                    <span style={styles.compactLabel}>Gemini Nano</span>
                                    <span style={styles.compactDesc}>Free, private, runs on device</span>
                                </div>
                                <div style={styles.compactActions}>
                                    <span style={{ color: getNanoStatusColor(), fontSize: typography.sizeMd }}>
                                        {getNanoStatusLabel()}
                                    </span>
                                    <button
                                        style={styles.compactBtn}
                                        onClick={checkNanoStatus}
                                        disabled={checkingNano}
                                    >
                                        {checkingNano ? '...' : 'Check'}
                                    </button>
                                </div>
                            </div>
                            <details style={styles.nanoDetails}>
                                <summary style={styles.nanoSummary}>Setup instructions</summary>
                                <div style={styles.nanoSteps}>
                                    <p>1. Enable <code style={styles.code}>chrome://flags/#optimization-guide-on-device-model</code></p>
                                    <p>2. Enable <code style={styles.code}>chrome://flags/#prompt-api-for-gemini-nano</code></p>
                                    <p>3. Relaunch Chrome and wait for download</p>
                                </div>
                            </details>
                        </div>
                    </section>
                )}

                {/* Cloud AI Configuration */}
                <section style={styles.section}>
                    <div style={styles.sectionHeader}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={colors.primary} strokeWidth="2">
                            <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
                        </svg>
                        <h2 style={styles.sectionTitle}>Cloud AI</h2>
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
                            <div style={styles.apiKeyRow}>
                                <input
                                    type={showApiKey ? 'text' : 'password'}
                                    value={apiKey}
                                    onChange={(e) => setApiKey(e.target.value)}
                                    placeholder={`Enter your ${PROVIDER_INFO[cloudProvider].name} API key`}
                                    style={{ ...styles.input, flex: 1 }}
                                />
                                <button
                                    style={styles.iconBtn}
                                    onClick={() => setShowApiKey(!showApiKey)}
                                    title={showApiKey ? 'Hide API key' : 'Show API key'}
                                    type="button"
                                >
                                    {showApiKey ? (
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                                            <line x1="1" y1="1" x2="23" y2="23"/>
                                        </svg>
                                    ) : (
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                                            <circle cx="12" cy="12" r="3"/>
                                        </svg>
                                    )}
                                </button>
                                {apiKey && (
                                    <button
                                        style={{ ...styles.iconBtn, ...(confirmDelete ? styles.iconBtnDanger : {}) }}
                                        onClick={deleteApiKey}
                                        title={confirmDelete ? 'Click again to confirm' : 'Delete API key'}
                                        type="button"
                                    >
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <polyline points="3 6 5 6 21 6"/>
                                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                        </svg>
                                    </button>
                                )}
                            </div>
                            <div style={styles.apiKeyHelp}>
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
                                    Get API key
                                </a>
                                <span style={styles.secureNote}>
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                                        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                                    </svg>
                                    Stored securely on device
                                </span>
                            </div>
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
                        <h2 style={styles.sectionTitle}>Auto Pilot</h2>
                        <span style={styles.proBadge}>PRO</span>
                    </div>
                    <div style={styles.card}>

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

                        <p style={styles.experimentalNote}>Auto-actions (use with caution)</p>

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

            </main>

            {/* MGS Scanline Overlay */}
            <ScanlineOverlay />
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
        color: colors.textPrimary,
        letterSpacing: typography.letterNormal,
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
    optionalBadge: {
        fontSize: typography.sizeSm,
        color: colors.textDim,
        background: colors.bgCardHover,
        padding: `2px ${spacing.sm}px`,
        borderRadius: borderRadius.sm,
        marginLeft: 'auto',
    },
    compactCard: {
        background: colors.bgCard,
        padding: spacing.lg,
        borderRadius: borderRadius.md,
        border: `1px solid ${colors.borderDark}`,
    },
    compactRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    compactInfo: {
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
    },
    compactLabel: {
        fontSize: typography.sizeXl,
        fontWeight: typography.medium,
        color: colors.textSecondary,
    },
    compactDesc: {
        fontSize: typography.sizeMd,
        color: colors.textDimmest,
    },
    compactActions: {
        display: 'flex',
        alignItems: 'center',
        gap: spacing.md,
    },
    compactBtn: {
        padding: `${spacing.xs}px ${spacing.md}px`,
        background: colors.bgCardHover,
        border: `1px solid ${colors.borderLight}`,
        borderRadius: borderRadius.sm,
        color: colors.textDim,
        fontSize: typography.sizeMd,
        cursor: 'pointer',
    },
    nanoDetails: {
        marginTop: spacing.md,
    },
    nanoSummary: {
        fontSize: typography.sizeMd,
        color: colors.textDim,
        cursor: 'pointer',
        padding: `${spacing.sm}px 0`,
    },
    nanoSteps: {
        fontSize: typography.sizeMd,
        color: colors.textDimmest,
        paddingLeft: spacing.md,
        lineHeight: 1.8,
    },
    card: {
        background: colors.bgCard,
        padding: spacing.xl,
        borderRadius: borderRadius.lg,
        border: `1px solid ${colors.borderMedium}`,
    },
    licenseCard: {
        background: colors.bgCard,
        padding: spacing.lg,
        borderRadius: borderRadius.md,
        border: `1px solid ${colors.borderDark}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    licenseStatus: {},
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
    apiKeyRow: {
        display: 'flex',
        gap: spacing.sm,
        alignItems: 'center',
    },
    iconBtn: {
        width: 42,
        height: 42,
        padding: 0,
        background: colors.bgCardHover,
        border: `1px solid ${colors.borderLight}`,
        borderRadius: borderRadius.md,
        color: colors.textDim,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: `all ${transitions.fast}`,
        flexShrink: 0,
    },
    iconBtnDanger: {
        background: colors.errorBg,
        borderColor: colors.error,
        color: colors.error,
    },
    apiKeyHelp: {
        display: 'flex',
        alignItems: 'center',
        gap: spacing.lg,
        marginTop: spacing.md,
    },
    secureNote: {
        display: 'flex',
        alignItems: 'center',
        gap: spacing.xs,
        fontSize: typography.sizeMd,
        color: colors.success,
    },
    link: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: spacing.xs,
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
        fontSize: typography.sizeMd,
        color: colors.textDim,
        marginTop: 0,
        marginBottom: spacing.md,
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
