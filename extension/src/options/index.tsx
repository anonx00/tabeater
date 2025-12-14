import React, { useState, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { colors, spacing, typography, borderRadius, shadows, transitions } from '../shared/theme';

// Types
type CloudProvider = 'gemini' | 'openai' | 'anthropic';
type AutoPilotMode = 'manual' | 'auto-cleanup' | 'fly-mode';
type ConnectionStatus = 'idle' | 'testing' | 'success' | 'error';

interface LicenseStatus {
    status: 'trial' | 'pro' | 'expired' | 'none';
    paid: boolean;
    usageRemaining: number;
    dailyLimit?: number;
    trialEndDate?: string;
    canUse: boolean;
}

interface AutoPilotSettings {
    mode: AutoPilotMode;
    staleDaysThreshold: number;
    autoCloseStale: boolean;
    autoGroupByCategory: boolean;
    excludePinned: boolean;
    excludeActive: boolean;
    flyModeDebounceMs: number;
    showNotifications: boolean;
}

// Constants
const PROVIDERS = {
    gemini: { name: 'Gemini', color: '#4285f4', models: ['gemini-2.0-flash', 'gemini-1.5-flash-latest', 'gemini-1.5-pro-latest'], default: 'gemini-2.0-flash', url: 'https://aistudio.google.com/app/apikey' },
    openai: { name: 'OpenAI', color: '#10a37f', models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo'], default: 'gpt-4o-mini', url: 'https://platform.openai.com/api-keys' },
    anthropic: { name: 'Claude', color: '#d4a574', models: ['claude-3-5-haiku-latest', 'claude-3-5-sonnet-latest'], default: 'claude-3-5-haiku-latest', url: 'https://console.anthropic.com/settings/keys' },
};

// Icons (Lucide-style SVG paths)
const Icons = {
    brain: <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/>,
    zap: <><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></>,
    shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>,
    check: <polyline points="20 6 9 17 4 12"/>,
    eye: <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>,
    eyeOff: <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></>,
    link: <><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></>,
    loader: <><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></>,
    star: <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>,
    refresh: <><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></>,
};

const Icon: React.FC<{ name: keyof typeof Icons; size?: number; color?: string }> = ({ name, size = 20, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {Icons[name]}
    </svg>
);

// Main Options Page
const OptionsPage: React.FC = () => {
    // State
    const [cloudProvider, setCloudProvider] = useState<CloudProvider>('gemini');
    const [apiKey, setApiKey] = useState('');
    const [model, setModel] = useState('');
    const [showApiKey, setShowApiKey] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
    const [activeProvider, setActiveProvider] = useState('none');
    const [saved, setSaved] = useState(false);
    const [license, setLicense] = useState<LicenseStatus | null>(null);
    const [autoPilotSettings, setAutoPilotSettings] = useState<AutoPilotSettings>({
        mode: 'manual', staleDaysThreshold: 7, autoCloseStale: false, autoGroupByCategory: false,
        excludePinned: true, excludeActive: true, flyModeDebounceMs: 5000, showNotifications: true,
    });
    const [autoPilotSaved, setAutoPilotSaved] = useState(false);
    const [showEmailVerify, setShowEmailVerify] = useState(false);
    const [verifyEmail, setVerifyEmail] = useState('');
    const [verifyError, setVerifyError] = useState('');
    const [verifyLoading, setVerifyLoading] = useState(false);

    // Load data
    useEffect(() => {
        loadConfig();
        loadLicense();
        loadAutoPilotSettings();
    }, []);

    const loadConfig = async () => {
        const stored = await chrome.storage.local.get(['aiConfig']);
        if (stored.aiConfig) {
            setApiKey(stored.aiConfig.apiKey || '');
            setCloudProvider(stored.aiConfig.cloudProvider || 'gemini');
            setModel(stored.aiConfig.model || '');
        }
        const response = await chrome.runtime.sendMessage({ action: 'getAIProvider' });
        if (response.success) {
            setActiveProvider(response.data.provider);
            setConnectionStatus(response.data.provider !== 'none' ? 'success' : 'idle');
        }
    };

    const loadLicense = async () => {
        const response = await chrome.runtime.sendMessage({ action: 'getLicenseStatus', payload: { forceRefresh: true } });
        if (response.success) setLicense(response.data);
    };

    const loadAutoPilotSettings = async () => {
        const response = await chrome.runtime.sendMessage({ action: 'getAutoPilotSettings' });
        if (response.success) setAutoPilotSettings(response.data);
    };

    // Actions
    const saveConfig = async () => {
        const selectedModel = model || PROVIDERS[cloudProvider].default;
        await chrome.runtime.sendMessage({ action: 'setAIConfig', payload: { cloudProvider, apiKey, model: selectedModel } });
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        loadConfig();
    };

    const testConnection = async () => {
        setConnectionStatus('testing');
        try {
            const response = await chrome.runtime.sendMessage({ action: 'askAI', payload: { prompt: 'Say OK' } });
            setConnectionStatus(response.success ? 'success' : 'error');
        } catch {
            setConnectionStatus('error');
        }
    };

    const saveAutoPilotSettings = useCallback(async () => {
        await chrome.runtime.sendMessage({ action: 'setAutoPilotSettings', payload: autoPilotSettings });
        setAutoPilotSaved(true);
        setTimeout(() => setAutoPilotSaved(false), 2000);
    }, [autoPilotSettings]);

    const verifyByEmail = async () => {
        if (!verifyEmail.trim()) { setVerifyError('Enter your payment email'); return; }
        setVerifyLoading(true); setVerifyError('');
        try {
            const response = await chrome.runtime.sendMessage({ action: 'verifyByEmail', payload: { email: verifyEmail.trim().toLowerCase() } });
            if (response.success && response.data.verified) {
                await loadLicense(); setShowEmailVerify(false); setVerifyEmail('');
            } else {
                setVerifyError(response.data?.error === 'DEVICE_LIMIT' ? 'Device limit reached' : response.data?.error === 'NOT_FOUND' ? 'No purchase found' : 'Verification failed');
            }
        } catch { setVerifyError('Failed to verify'); }
        setVerifyLoading(false);
    };

    // Styles
    const s = {
        page: { minHeight: '100vh', background: colors.bgDarker, color: colors.textPrimary, fontFamily: typography.fontFamily, padding: spacing.xxxl, display: 'flex', justifyContent: 'center' } as React.CSSProperties,
        container: { width: '100%', maxWidth: 680 } as React.CSSProperties,
        header: { marginBottom: spacing.xxxl, display: 'flex', alignItems: 'center', gap: spacing.lg } as React.CSSProperties,
        logo: { width: 48, height: 48, background: `linear-gradient(135deg, ${colors.primary}, ${colors.primaryDark})`, borderRadius: borderRadius.lg, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: shadows.glow } as React.CSSProperties,
        logoInner: { color: '#fff', fontWeight: typography.bold, fontSize: typography.sizeXl } as React.CSSProperties,
        title: { fontSize: typography.sizeHero, fontWeight: typography.bold, color: colors.textPrimary, margin: 0, letterSpacing: typography.letterTight } as React.CSSProperties,
        subtitle: { fontSize: typography.sizeSm, color: colors.textDim, marginTop: 2 } as React.CSSProperties,
        section: { background: colors.bgCard, border: `1px solid ${colors.borderMedium}`, borderRadius: borderRadius.lg, marginBottom: spacing.xxl, overflow: 'hidden' } as React.CSSProperties,
        sectionHeader: { padding: `${spacing.lg}px ${spacing.xl}px`, borderBottom: `1px solid ${colors.borderMedium}`, display: 'flex', alignItems: 'center', gap: spacing.md } as React.CSSProperties,
        sectionIcon: { width: 32, height: 32, background: colors.primaryBg, borderRadius: borderRadius.sm, display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.primary } as React.CSSProperties,
        sectionTitle: { fontSize: typography.sizeLg, fontWeight: typography.semibold, color: colors.textPrimary } as React.CSSProperties,
        sectionBody: { padding: spacing.xl } as React.CSSProperties,
        row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `${spacing.md}px 0`, borderBottom: `1px solid ${colors.borderDark}` } as React.CSSProperties,
        rowLast: { borderBottom: 'none' } as React.CSSProperties,
        label: { fontSize: typography.sizeSm, color: colors.textSecondary } as React.CSSProperties,
        labelSub: { fontSize: typography.sizeXs, color: colors.textDim, marginTop: 2 } as React.CSSProperties,
        input: { background: colors.bgInput, border: `1px solid ${colors.borderLight}`, borderRadius: borderRadius.sm, padding: `${spacing.sm}px ${spacing.md}px`, color: colors.textPrimary, fontSize: typography.sizeBase, outline: 'none', fontFamily: typography.fontFamily, transition: `border-color ${transitions.fast}`, width: '100%' } as React.CSSProperties,
        select: { background: colors.bgInput, border: `1px solid ${colors.borderLight}`, borderRadius: borderRadius.sm, padding: `${spacing.sm}px ${spacing.md}px`, color: colors.textPrimary, fontSize: typography.sizeBase, outline: 'none', fontFamily: typography.fontFamily, cursor: 'pointer', minWidth: 140 } as React.CSSProperties,
        checkbox: { width: 18, height: 18, accentColor: colors.primary, cursor: 'pointer' } as React.CSSProperties,
        btn: { background: colors.primary, color: '#fff', border: 'none', borderRadius: borderRadius.sm, padding: `${spacing.sm}px ${spacing.lg}px`, fontSize: typography.sizeSm, fontWeight: typography.semibold, cursor: 'pointer', transition: `all ${transitions.fast}`, display: 'inline-flex', alignItems: 'center', gap: spacing.sm } as React.CSSProperties,
        btnSecondary: { background: colors.bgElevated, color: colors.textSecondary, border: `1px solid ${colors.borderLight}` } as React.CSSProperties,
        btnSuccess: { background: colors.success } as React.CSSProperties,
        btnSmall: { padding: `${spacing.xs}px ${spacing.md}px` } as React.CSSProperties,
        providerGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: spacing.md, marginBottom: spacing.xl } as React.CSSProperties,
        providerCard: { background: colors.bgElevated, border: `2px solid ${colors.borderMedium}`, borderRadius: borderRadius.md, padding: spacing.lg, textAlign: 'center', cursor: 'pointer', transition: `all ${transitions.fast}` } as React.CSSProperties,
        providerCardActive: { borderColor: colors.primary, background: colors.primaryBg } as React.CSSProperties,
        providerName: { fontSize: typography.sizeSm, fontWeight: typography.semibold, color: colors.textPrimary, marginTop: spacing.sm } as React.CSSProperties,
        modeGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: spacing.md, marginBottom: spacing.xl } as React.CSSProperties,
        modeCard: { background: colors.bgElevated, border: `2px solid ${colors.borderMedium}`, borderRadius: borderRadius.md, padding: spacing.lg, textAlign: 'center', cursor: 'pointer', transition: `all ${transitions.fast}` } as React.CSSProperties,
        modeCardActive: { borderColor: colors.primary, background: colors.primaryBg } as React.CSSProperties,
        modeCardDanger: { borderColor: colors.error } as React.CSSProperties,
        modeIcon: { fontSize: 24, marginBottom: spacing.sm } as React.CSSProperties,
        modeName: { fontSize: typography.sizeSm, fontWeight: typography.semibold, color: colors.textPrimary } as React.CSSProperties,
        modeDesc: { fontSize: typography.sizeXs, color: colors.textDim, marginTop: 4 } as React.CSSProperties,
        status: { display: 'flex', alignItems: 'center', gap: spacing.sm, fontSize: typography.sizeSm } as React.CSSProperties,
        statusDot: { width: 8, height: 8, borderRadius: '50%', background: colors.textDim } as React.CSSProperties,
        statusDotSuccess: { background: colors.success, boxShadow: `0 0 8px ${colors.success}` } as React.CSSProperties,
        statusDotError: { background: colors.error } as React.CSSProperties,
        statusDotTesting: { background: colors.warning, animation: 'pulse 1s infinite' } as React.CSSProperties,
        inputGroup: { display: 'flex', gap: spacing.sm, marginBottom: spacing.md } as React.CSSProperties,
        link: { color: colors.primary, fontSize: typography.sizeSm, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 } as React.CSSProperties,
        badge: { fontSize: typography.sizeXs, fontWeight: typography.semibold, padding: `2px ${spacing.sm}px`, borderRadius: borderRadius.xs, textTransform: 'uppercase' } as React.CSSProperties,
        badgePro: { background: colors.primary, color: '#fff' } as React.CSSProperties,
        badgeTrial: { background: colors.warningBg, color: colors.warning, border: `1px solid ${colors.warning}` } as React.CSSProperties,
        licenseCard: { background: colors.bgElevated, border: `1px solid ${colors.borderMedium}`, borderRadius: borderRadius.md, padding: spacing.xl, textAlign: 'center' } as React.CSSProperties,
        licensePrice: { fontSize: typography.sizeHero, fontWeight: typography.bold, color: colors.textPrimary, marginTop: spacing.md } as React.CSSProperties,
        licenseFeatures: { listStyle: 'none', padding: 0, margin: `${spacing.lg}px 0`, textAlign: 'left' } as React.CSSProperties,
        licenseFeature: { padding: `${spacing.sm}px 0`, fontSize: typography.sizeSm, color: colors.textMuted, display: 'flex', alignItems: 'center', gap: spacing.sm } as React.CSSProperties,
    };

    const getStatusDotStyle = () => {
        if (connectionStatus === 'success') return { ...s.statusDot, ...s.statusDotSuccess };
        if (connectionStatus === 'error') return { ...s.statusDot, ...s.statusDotError };
        if (connectionStatus === 'testing') return { ...s.statusDot, ...s.statusDotTesting };
        return s.statusDot;
    };

    return (
        <div style={s.page}>
            <div style={s.container}>
                {/* Header */}
                <div style={s.header}>
                    <div style={s.logo}><span style={s.logoInner}>TE</span></div>
                    <div>
                        <h1 style={s.title}>TabEater</h1>
                        <p style={s.subtitle}>Settings & Configuration</p>
                    </div>
                    {license?.paid && <span style={{ ...s.badge, ...s.badgePro, marginLeft: 'auto' }}>PRO</span>}
                    {license?.status === 'trial' && !license.paid && <span style={{ ...s.badge, ...s.badgeTrial, marginLeft: 'auto' }}>TRIAL</span>}
                </div>

                {/* AI Provider Section */}
                <div style={s.section}>
                    <div style={s.sectionHeader}>
                        <div style={s.sectionIcon}><Icon name="brain" size={18} /></div>
                        <span style={s.sectionTitle}>AI Provider</span>
                        <div style={{ ...s.status, marginLeft: 'auto' }}>
                            <div style={getStatusDotStyle()} />
                            <span style={{ color: connectionStatus === 'success' ? colors.success : connectionStatus === 'error' ? colors.error : colors.textDim }}>
                                {connectionStatus === 'success' ? 'Connected' : connectionStatus === 'error' ? 'Error' : connectionStatus === 'testing' ? 'Testing...' : 'Not connected'}
                            </span>
                        </div>
                    </div>
                    <div style={s.sectionBody}>
                        <div style={s.providerGrid}>
                            {(Object.keys(PROVIDERS) as CloudProvider[]).map(p => (
                                <div key={p} style={{ ...s.providerCard, ...(cloudProvider === p ? s.providerCardActive : {}), borderColor: cloudProvider === p ? PROVIDERS[p].color : undefined }} onClick={() => { setCloudProvider(p); setModel(PROVIDERS[p].default); }}>
                                    <div style={{ width: 40, height: 40, borderRadius: borderRadius.full, background: `${PROVIDERS[p].color}20`, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <div style={{ width: 20, height: 20, borderRadius: borderRadius.full, background: PROVIDERS[p].color }} />
                                    </div>
                                    <div style={s.providerName}>{PROVIDERS[p].name}</div>
                                </div>
                            ))}
                        </div>

                        <div style={{ marginBottom: spacing.lg }}>
                            <div style={{ ...s.label, marginBottom: spacing.sm }}>API Key</div>
                            <div style={s.inputGroup}>
                                <input type={showApiKey ? 'text' : 'password'} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Enter your API key..." style={{ ...s.input, flex: 1, fontFamily: typography.fontMono }} />
                                <button style={{ ...s.btn, ...s.btnSecondary, ...s.btnSmall }} onClick={() => setShowApiKey(!showApiKey)}><Icon name={showApiKey ? 'eyeOff' : 'eye'} size={16} /></button>
                                <button style={{ ...s.btn, ...s.btnSmall }} onClick={testConnection} disabled={!apiKey || connectionStatus === 'testing'}>
                                    {connectionStatus === 'testing' ? <Icon name="loader" size={16} /> : 'Test'}
                                </button>
                            </div>
                            <a href={PROVIDERS[cloudProvider].url} target="_blank" rel="noopener noreferrer" style={s.link}><Icon name="link" size={14} /> Get API key from {PROVIDERS[cloudProvider].name}</a>
                        </div>

                        <div style={{ marginBottom: spacing.xl }}>
                            <div style={{ ...s.label, marginBottom: spacing.sm }}>Model</div>
                            <select value={model || PROVIDERS[cloudProvider].default} onChange={(e) => setModel(e.target.value)} style={s.select}>
                                {PROVIDERS[cloudProvider].models.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                        </div>

                        <button style={{ ...s.btn, width: '100%', justifyContent: 'center', ...(saved ? s.btnSuccess : {}) }} onClick={saveConfig}>
                            {saved ? <><Icon name="check" size={16} /> Saved!</> : 'Save Configuration'}
                        </button>
                    </div>
                </div>

                {/* Auto Pilot Section */}
                <div style={s.section}>
                    <div style={s.sectionHeader}>
                        <div style={s.sectionIcon}><Icon name="zap" size={18} /></div>
                        <span style={s.sectionTitle}>Auto Pilot</span>
                        {!license?.paid && <span style={{ ...s.badge, ...s.badgePro, marginLeft: 'auto' }}>PRO</span>}
                    </div>
                    <div style={s.sectionBody}>
                        <div style={s.modeGrid}>
                            <div style={{ ...s.modeCard, ...(autoPilotSettings.mode === 'manual' ? s.modeCardActive : {}) }} onClick={() => setAutoPilotSettings(p => ({ ...p, mode: 'manual' }))}>
                                <div style={s.modeIcon}>🔔</div>
                                <div style={s.modeName}>Manual</div>
                                <div style={s.modeDesc}>AI suggests, you confirm</div>
                            </div>
                            <div style={{ ...s.modeCard, ...(autoPilotSettings.mode === 'auto-cleanup' ? s.modeCardActive : {}) }} onClick={() => setAutoPilotSettings(p => ({ ...p, mode: 'auto-cleanup' }))}>
                                <div style={s.modeIcon}>🧹</div>
                                <div style={s.modeName}>Auto Clean</div>
                                <div style={s.modeDesc}>Auto-closes duplicates</div>
                            </div>
                            <div style={{ ...s.modeCard, ...(autoPilotSettings.mode === 'fly-mode' ? { ...s.modeCardActive, ...s.modeCardDanger } : {}) }} onClick={() => setAutoPilotSettings(p => ({ ...p, mode: 'fly-mode' }))}>
                                <div style={s.modeIcon}>🚀</div>
                                <div style={{ ...s.modeName, color: autoPilotSettings.mode === 'fly-mode' ? colors.error : undefined }}>Fly Mode</div>
                                <div style={{ ...s.modeDesc, color: autoPilotSettings.mode === 'fly-mode' ? colors.error : undefined }}>Full autonomy</div>
                            </div>
                        </div>

                        {autoPilotSettings.mode === 'fly-mode' && (
                            <div style={{ background: colors.errorBg, border: `1px solid ${colors.error}`, borderRadius: borderRadius.sm, padding: spacing.md, marginBottom: spacing.lg, fontSize: typography.sizeSm, color: colors.error }}>
                                Fly Mode automatically closes duplicates and groups tabs without confirmation.
                            </div>
                        )}

                        <div style={s.row}>
                            <div><div style={s.label}>Stale Tab Threshold</div><div style={s.labelSub}>Tabs not accessed for this period are marked stale</div></div>
                            <select value={autoPilotSettings.staleDaysThreshold} onChange={(e) => setAutoPilotSettings(p => ({ ...p, staleDaysThreshold: parseInt(e.target.value) }))} style={s.select}>
                                <option value={1}>1 day</option><option value={3}>3 days</option><option value={7}>7 days</option><option value={14}>14 days</option><option value={30}>30 days</option>
                            </select>
                        </div>
                        <div style={s.row}>
                            <div><div style={s.label}>Exclude Pinned Tabs</div><div style={s.labelSub}>Never auto-close pinned tabs</div></div>
                            <input type="checkbox" checked={autoPilotSettings.excludePinned} onChange={(e) => setAutoPilotSettings(p => ({ ...p, excludePinned: e.target.checked }))} style={s.checkbox} />
                        </div>
                        <div style={s.row}>
                            <div><div style={s.label}>Exclude Active Tabs</div><div style={s.labelSub}>Never auto-close the current tab</div></div>
                            <input type="checkbox" checked={autoPilotSettings.excludeActive} onChange={(e) => setAutoPilotSettings(p => ({ ...p, excludeActive: e.target.checked }))} style={s.checkbox} />
                        </div>
                        <div style={{ ...s.row, ...s.rowLast }}>
                            <div><div style={s.label}>Show Notifications</div><div style={s.labelSub}>Get notified when tabs are auto-managed</div></div>
                            <input type="checkbox" checked={autoPilotSettings.showNotifications} onChange={(e) => setAutoPilotSettings(p => ({ ...p, showNotifications: e.target.checked }))} style={s.checkbox} />
                        </div>

                        <button style={{ ...s.btn, width: '100%', justifyContent: 'center', marginTop: spacing.xl, ...(autoPilotSaved ? s.btnSuccess : {}) }} onClick={saveAutoPilotSettings}>
                            {autoPilotSaved ? <><Icon name="check" size={16} /> Saved!</> : 'Save Auto Pilot Settings'}
                        </button>
                    </div>
                </div>

                {/* License Section */}
                <div style={s.section}>
                    <div style={s.sectionHeader}>
                        <div style={s.sectionIcon}><Icon name="shield" size={18} /></div>
                        <span style={s.sectionTitle}>License</span>
                    </div>
                    <div style={s.sectionBody}>
                        {license?.paid ? (
                            <div style={s.licenseCard}>
                                <Icon name="star" size={32} color={colors.primary} />
                                <div style={{ ...s.licensePrice, color: colors.primary }}>PRO</div>
                                <div style={{ color: colors.textMuted, marginTop: spacing.sm }}>Unlimited access to all features</div>
                            </div>
                        ) : (
                            <>
                                <div style={s.licenseCard}>
                                    <Icon name="star" size={32} color={colors.textDim} />
                                    <div style={s.licensePrice}>A$6<span style={{ fontSize: typography.sizeSm, fontWeight: typography.normal, color: colors.textDim }}> one-time</span></div>
                                    <ul style={s.licenseFeatures}>
                                        <li style={s.licenseFeature}><Icon name="check" size={16} color={colors.success} /> Unlimited AI scans</li>
                                        <li style={s.licenseFeature}><Icon name="check" size={16} color={colors.success} /> Auto Pilot mode</li>
                                        <li style={s.licenseFeature}><Icon name="check" size={16} color={colors.success} /> Smart tab grouping</li>
                                        <li style={s.licenseFeature}><Icon name="check" size={16} color={colors.success} /> Priority support</li>
                                    </ul>
                                    <button style={{ ...s.btn, width: '100%', justifyContent: 'center' }} onClick={async () => { const r = await chrome.runtime.sendMessage({ action: 'getCheckoutUrl' }); if (r.success) chrome.tabs.create({ url: r.data.url }); }}>
                                        Upgrade to Pro
                                    </button>
                                </div>

                                {license?.status === 'trial' && (
                                    <div style={{ marginTop: spacing.lg, padding: spacing.md, background: colors.warningBg, border: `1px solid ${colors.warning}`, borderRadius: borderRadius.sm, fontSize: typography.sizeSm, color: colors.warning }}>
                                        Trial: {license.usageRemaining}/{license.dailyLimit || 20} uses remaining today
                                    </div>
                                )}

                                <div style={{ marginTop: spacing.lg, textAlign: 'center' }}>
                                    {!showEmailVerify ? (
                                        <button style={{ ...s.btn, ...s.btnSecondary }} onClick={() => setShowEmailVerify(true)}>Already purchased? Verify by email</button>
                                    ) : (
                                        <div style={{ background: colors.bgElevated, padding: spacing.lg, borderRadius: borderRadius.md }}>
                                            <input type="email" placeholder="your@email.com" value={verifyEmail} onChange={(e) => setVerifyEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && verifyByEmail()} style={{ ...s.input, marginBottom: spacing.sm }} />
                                            {verifyError && <div style={{ color: colors.error, fontSize: typography.sizeSm, marginBottom: spacing.sm }}>{verifyError}</div>}
                                            <div style={{ display: 'flex', gap: spacing.sm }}>
                                                <button style={{ ...s.btn, flex: 1 }} onClick={verifyByEmail} disabled={verifyLoading}>{verifyLoading ? 'Verifying...' : 'Verify'}</button>
                                                <button style={{ ...s.btn, ...s.btnSecondary, flex: 1 }} onClick={() => { setShowEmailVerify(false); setVerifyError(''); setVerifyEmail(''); }}>Cancel</button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </>
                        )}

                        <button style={{ ...s.btn, ...s.btnSecondary, width: '100%', justifyContent: 'center', marginTop: spacing.lg }} onClick={loadLicense}>
                            <Icon name="refresh" size={16} /> Refresh License Status
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Inject CSS
const styleSheet = document.createElement('style');
styleSheet.textContent = `
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: ${colors.bgDarker}; }
    input:focus, select:focus { border-color: ${colors.primary} !important; box-shadow: ${shadows.focus}; }
    button:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); }
    button:active:not(:disabled) { transform: translateY(0); }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    ::-webkit-scrollbar { width: 8px; }
    ::-webkit-scrollbar-track { background: ${colors.bgDark}; }
    ::-webkit-scrollbar-thumb { background: ${colors.borderLight}; border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: ${colors.textDimmest}; }
    ::selection { background: ${colors.primary}; color: #fff; }
`;
document.head.appendChild(styleSheet);

const container = document.getElementById('root');
if (container) createRoot(container).render(<OptionsPage />);
