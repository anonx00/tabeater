import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { colors, spacing, typography, borderRadius, shadows, transitions, scanlineOverlay } from '../shared/theme';

// Types
type CloudProvider = 'gemini' | 'openai' | 'anthropic';
type AutoPilotMode = 'manual' | 'auto-cleanup' | 'fly-mode';
type InputState = 'empty' | 'typing' | 'validating' | 'success' | 'error';
type NavSection = 'provider' | 'autopilot' | 'license';

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
    gemini: { name: 'GEMINI', desc: 'Google AI', color: '#4285f4', badge: 'FREE', models: ['gemini-2.0-flash', 'gemini-1.5-flash-latest', 'gemini-1.5-pro-latest'], default: 'gemini-2.0-flash', url: 'https://aistudio.google.com/app/apikey' },
    openai: { name: 'OPENAI', desc: 'GPT Models', color: '#10a37f', badge: 'PAID', models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo'], default: 'gpt-4o-mini', url: 'https://platform.openai.com/api-keys' },
    anthropic: { name: 'CLAUDE', desc: 'Anthropic', color: '#d4a574', badge: 'PAID', models: ['claude-3-5-haiku-latest', 'claude-3-5-sonnet-latest'], default: 'claude-3-5-haiku-latest', url: 'https://console.anthropic.com/settings/keys' },
};

// Glitch Tab Logo Component
const GlitchLogo: React.FC<{ size?: number }> = ({ size = 32 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <rect width="24" height="24" fill={colors.voidBlack}/>
        <path d="M3 18V7C3 6.5 3.5 6 4 6H8L10 4H20C20.5 4 21 4.5 21 5V18C21 18.5 20.5 19 20 19H4C3.5 19 3 18.5 3 18Z"
              fill="none" stroke={colors.phosphorGreen} strokeWidth="1.5"/>
        <rect x="18" y="6" width="2" height="2" fill={colors.voidBlack}/>
        <rect x="17" y="8" width="3" height="3" fill={colors.voidBlack}/>
        <rect x="18" y="11" width="2" height="2" fill={colors.voidBlack}/>
        <rect x="7" y="10" width="3" height="3" fill={colors.phosphorGreen}/>
        <line x1="3" y1="15" x2="17" y2="15" stroke={colors.phosphorGreen} strokeWidth="0.5" opacity="0.4"/>
        <line x1="3" y1="17" x2="17" y2="17" stroke={colors.phosphorGreen} strokeWidth="0.5" opacity="0.4"/>
    </svg>
);

// Toast Component for Undo
const UndoToast: React.FC<{ message: string; onUndo: () => void; onDismiss: () => void }> = ({ message, onUndo, onDismiss }) => {
    const [progress, setProgress] = useState(100);

    useEffect(() => {
        const interval = setInterval(() => setProgress(p => Math.max(0, p - 2.5)), 100);
        const timeout = setTimeout(onDismiss, 4000);
        return () => { clearInterval(interval); clearTimeout(timeout); };
    }, [onDismiss]);

    return (
        <div style={toastStyles.container}>
            <span style={toastStyles.message}>{message}</span>
            <button style={toastStyles.undoBtn} onClick={onUndo}>UNDO</button>
            <div style={{ ...toastStyles.progress, width: `${progress}%` }} />
        </div>
    );
};

const toastStyles = {
    container: { position: 'fixed' as const, bottom: 24, left: '50%', transform: 'translateX(-50%)', background: colors.panelGrey, border: `1px solid ${colors.phosphorGreen}`, padding: '12px 16px', fontFamily: typography.fontMono, fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 16, zIndex: 1000, overflow: 'hidden' },
    message: { color: colors.textPrimary },
    undoBtn: { background: 'transparent', border: `1px solid ${colors.phosphorGreen}`, color: colors.phosphorGreen, padding: '4px 8px', fontFamily: typography.fontMono, fontSize: 10, textTransform: 'uppercase' as const, cursor: 'pointer' },
    progress: { position: 'absolute' as const, bottom: 0, left: 0, height: 2, background: colors.phosphorGreen, transition: 'width 0.1s linear' },
};

// Main Options Page
const OptionsPage: React.FC = () => {
    // State
    const [activeNav, setActiveNav] = useState<NavSection>('provider');
    const [cloudProvider, setCloudProvider] = useState<CloudProvider>('gemini');
    const [apiKey, setApiKey] = useState('');
    const [model, setModel] = useState('');
    const [inputState, setInputState] = useState<InputState>('empty');
    const [activeProvider, setActiveProvider] = useState('none');
    const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'saved'>('idle');
    const [license, setLicense] = useState<LicenseStatus | null>(null);
    const [autoPilotSettings, setAutoPilotSettings] = useState<AutoPilotSettings>({
        mode: 'manual', staleDaysThreshold: 7, autoCloseStale: false, autoGroupByCategory: false,
        excludePinned: true, excludeActive: true, flyModeDebounceMs: 5000, showNotifications: true,
    });
    const [toast, setToast] = useState<{ message: string; undo: () => void } | null>(null);
    const [previousMode, setPreviousMode] = useState<AutoPilotMode>('manual');
    const [showEmailVerify, setShowEmailVerify] = useState(false);
    const [verifyEmail, setVerifyEmail] = useState('');
    const [verifyError, setVerifyError] = useState('');
    const [verifyLoading, setVerifyLoading] = useState(false);
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Load data
    useEffect(() => {
        loadConfig();
        loadLicense();
        loadAutoPilotSettings();
    }, []);

    // Auto-save with debounce
    useEffect(() => {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        if (apiKey || model) {
            setInputState('typing');
            setSyncStatus('syncing');
            saveTimeoutRef.current = setTimeout(async () => {
                await saveConfig();
            }, 500);
        }
    }, [apiKey, model, cloudProvider]);

    // Auto-save auto-pilot settings
    useEffect(() => {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        setSyncStatus('syncing');
        saveTimeoutRef.current = setTimeout(async () => {
            await saveAutoPilotSettings();
        }, 500);
    }, [autoPilotSettings]);

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
            setInputState(response.data.provider !== 'none' ? 'success' : 'empty');
        }
    };

    const loadLicense = async () => {
        const response = await chrome.runtime.sendMessage({ action: 'getLicenseStatus', payload: { forceRefresh: true } });
        if (response.success) setLicense(response.data);
    };

    const loadAutoPilotSettings = async () => {
        const response = await chrome.runtime.sendMessage({ action: 'getAutoPilotSettings' });
        if (response.success) {
            setAutoPilotSettings(response.data);
            setPreviousMode(response.data.mode);
        }
    };

    const saveConfig = async () => {
        const selectedModel = model || PROVIDERS[cloudProvider].default;
        setInputState('validating');
        try {
            await chrome.runtime.sendMessage({ action: 'setAIConfig', payload: { cloudProvider, apiKey, model: selectedModel } });
            // Test connection
            const response = await chrome.runtime.sendMessage({ action: 'askAI', payload: { prompt: 'Say OK' } });
            setInputState(response.success ? 'success' : 'error');
            setSyncStatus('saved');
            setTimeout(() => setSyncStatus('idle'), 2000);
        } catch {
            setInputState('error');
            setSyncStatus('idle');
        }
    };

    const saveAutoPilotSettings = useCallback(async () => {
        await chrome.runtime.sendMessage({ action: 'setAutoPilotSettings', payload: autoPilotSettings });
        setSyncStatus('saved');
        setTimeout(() => setSyncStatus('idle'), 2000);
    }, [autoPilotSettings]);

    const handleModeChange = (newMode: AutoPilotMode) => {
        const oldMode = autoPilotSettings.mode;
        setPreviousMode(oldMode);
        setAutoPilotSettings(p => ({ ...p, mode: newMode }));
        if (newMode === 'fly-mode') {
            setToast({
                message: 'Auto-Pilot set to FLY MODE',
                undo: () => setAutoPilotSettings(p => ({ ...p, mode: oldMode })),
            });
        }
    };

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

    const getIndicatorStyle = (): React.CSSProperties => {
        const base: React.CSSProperties = { width: 8, height: 8, borderRadius: borderRadius.full, transition: 'all 0.2s' };
        switch (inputState) {
            case 'empty': return { ...base, border: `2px solid ${colors.textDim}`, background: 'transparent' };
            case 'typing': return { ...base, background: colors.signalAmber, animation: 'pulse 1s infinite' };
            case 'validating': return { ...base, background: colors.signalAmber, animation: 'spin 0.8s linear infinite' };
            case 'success': return { ...base, background: colors.phosphorGreen, boxShadow: shadows.glow };
            case 'error': return { ...base, background: colors.criticalRed, boxShadow: shadows.glowRed };
        }
    };

    return (
        <div style={s.page}>
            {/* Sidebar */}
            <aside style={s.sidebar}>
                {/* Brand */}
                <div style={s.brand}>
                    <GlitchLogo size={40} />
                    <div style={s.brandText}>
                        <div style={s.brandName}>TAB_EATER</div>
                        <div style={s.brandTagline}>// AUTOMATION_SYSTEM</div>
                    </div>
                </div>

                {/* Navigation */}
                <nav style={s.nav}>
                    <button style={{ ...s.navItem, ...(activeNav === 'provider' ? s.navItemActive : {}) }} onClick={() => setActiveNav('provider')}>
                        <span style={s.navIcon}>&#9632;</span>
                        <span>AI_PROVIDER</span>
                        {activeProvider !== 'none' && <span style={s.navStatus}>&#9679;</span>}
                    </button>
                    <button style={{ ...s.navItem, ...(activeNav === 'autopilot' ? s.navItemActive : {}) }} onClick={() => setActiveNav('autopilot')}>
                        <span style={s.navIcon}>&#9650;</span>
                        <span>AUTO_PILOT</span>
                        {autoPilotSettings.mode !== 'manual' && <span style={{ ...s.navStatus, color: autoPilotSettings.mode === 'fly-mode' ? colors.criticalRed : colors.signalAmber }}>&#9679;</span>}
                    </button>
                    <button style={{ ...s.navItem, ...(activeNav === 'license' ? s.navItemActive : {}) }} onClick={() => setActiveNav('license')}>
                        <span style={s.navIcon}>&#9733;</span>
                        <span>LICENSE</span>
                        {license?.paid && <span style={{ ...s.navBadge, background: colors.phosphorGreen }}>PRO</span>}
                    </button>
                </nav>

                {/* System Status */}
                <div style={s.systemStatus}>
                    <div style={s.statusRow}>
                        <span style={s.statusLabel}>CONNECTION</span>
                        <span style={{ ...s.statusValue, color: activeProvider !== 'none' ? colors.phosphorGreen : colors.textDim }}>
                            {activeProvider !== 'none' ? 'ONLINE' : 'OFFLINE'}
                        </span>
                    </div>
                    <div style={s.statusRow}>
                        <span style={s.statusLabel}>SYNC</span>
                        <span style={{ ...s.statusValue, color: syncStatus === 'saved' ? colors.phosphorGreen : syncStatus === 'syncing' ? colors.signalAmber : colors.textDim }}>
                            {syncStatus === 'saved' ? 'SAVED' : syncStatus === 'syncing' ? 'SYNCING...' : 'IDLE'}
                        </span>
                    </div>
                </div>
            </aside>

            {/* Viewport */}
            <main style={s.viewport}>
                {/* Provider Panel */}
                {activeNav === 'provider' && (
                    <div style={s.panel}>
                        <div style={s.panelHeader}>
                            <h2 style={s.panelTitle}>SELECT_AI_PROVIDER</h2>
                            <div style={s.indicatorWrap}>
                                <div style={getIndicatorStyle()} />
                                <span style={s.indicatorLabel}>
                                    {inputState === 'success' ? 'ENCRYPTED' : inputState === 'error' ? 'FAILED' : inputState === 'validating' ? 'VALIDATING' : ''}
                                </span>
                            </div>
                        </div>

                        {/* Provider Cards */}
                        <div style={s.providerGrid}>
                            {(Object.keys(PROVIDERS) as CloudProvider[]).map(p => (
                                <button
                                    key={p}
                                    style={{
                                        ...s.providerCard,
                                        ...(cloudProvider === p ? s.providerCardActive : {}),
                                        borderColor: cloudProvider === p ? colors.phosphorGreen : colors.borderIdle,
                                    }}
                                    onClick={() => { setCloudProvider(p); setModel(PROVIDERS[p].default); }}
                                >
                                    {cloudProvider === p && <span style={s.checkIcon}>&#10003;</span>}
                                    <div style={{ ...s.providerIcon, background: cloudProvider === p ? PROVIDERS[p].color : colors.textDim }} />
                                    <div style={s.providerName}>{PROVIDERS[p].name}</div>
                                    <div style={s.providerDesc}>{PROVIDERS[p].desc}</div>
                                    <span style={{ ...s.providerBadge, background: PROVIDERS[p].badge === 'FREE' ? colors.phosphorGreen : colors.textDim }}>
                                        {PROVIDERS[p].badge}
                                    </span>
                                </button>
                            ))}
                        </div>

                        {/* API Input */}
                        <div style={s.inputSection}>
                            <label style={s.inputLabel}>API_KEY</label>
                            <div style={s.liveInput}>
                                <input
                                    type="password"
                                    value={apiKey}
                                    onChange={(e) => setApiKey(e.target.value)}
                                    placeholder="Enter API key..."
                                    style={s.input}
                                />
                                <div style={getIndicatorStyle()} />
                            </div>
                            <a href={PROVIDERS[cloudProvider].url} target="_blank" rel="noopener noreferrer" style={s.link}>
                                GET KEY FROM {PROVIDERS[cloudProvider].name} &#8599;
                            </a>
                        </div>

                        {/* Model Select */}
                        <div style={s.inputSection}>
                            <label style={s.inputLabel}>MODEL</label>
                            <select
                                value={model || PROVIDERS[cloudProvider].default}
                                onChange={(e) => setModel(e.target.value)}
                                style={s.select}
                            >
                                {PROVIDERS[cloudProvider].models.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                        </div>
                    </div>
                )}

                {/* Auto-Pilot Panel */}
                {activeNav === 'autopilot' && (
                    <div style={s.panel}>
                        <div style={s.panelHeader}>
                            <h2 style={s.panelTitle}>AUTO_PILOT_CONFIG</h2>
                            {!license?.paid && <span style={s.proBadge}>PRO</span>}
                        </div>

                        {/* 3-Stage Danger Slider */}
                        <div style={{ ...s.sliderContainer, borderColor: autoPilotSettings.mode === 'fly-mode' ? colors.criticalRed : colors.borderIdle }}>
                            <div style={s.sliderTrack}>
                                <button
                                    style={{ ...s.sliderStop, ...(autoPilotSettings.mode === 'manual' ? s.sliderStopActive : {}), borderColor: colors.phosphorGreen, color: autoPilotSettings.mode === 'manual' ? colors.phosphorGreen : colors.textDim }}
                                    onClick={() => handleModeChange('manual')}
                                >
                                    <span style={s.stopIcon}>&#9632;</span>
                                    <span style={s.stopLabel}>MANUAL</span>
                                    <span style={s.stopDesc}>AI suggests, you confirm</span>
                                </button>
                                <button
                                    style={{ ...s.sliderStop, ...(autoPilotSettings.mode === 'auto-cleanup' ? s.sliderStopActive : {}), borderColor: colors.signalAmber, color: autoPilotSettings.mode === 'auto-cleanup' ? colors.signalAmber : colors.textDim }}
                                    onClick={() => handleModeChange('auto-cleanup')}
                                >
                                    <span style={s.stopIcon}>&#9650;</span>
                                    <span style={s.stopLabel}>AUTO_CLOSE</span>
                                    <span style={s.stopDesc}>Auto-closes duplicates</span>
                                </button>
                                <button
                                    style={{ ...s.sliderStop, ...(autoPilotSettings.mode === 'fly-mode' ? s.sliderStopActive : {}), borderColor: colors.criticalRed, color: autoPilotSettings.mode === 'fly-mode' ? colors.criticalRed : colors.textDim }}
                                    onClick={() => handleModeChange('fly-mode')}
                                >
                                    <span style={s.stopIcon}>&#9660;</span>
                                    <span style={s.stopLabel}>FLY_MODE</span>
                                    <span style={s.stopDesc}>Full autonomy</span>
                                </button>
                            </div>

                            {autoPilotSettings.mode === 'fly-mode' && (
                                <div style={s.warningTicker}>
                                    &#9888; WARNING: EXPERIMENTAL &#9888; WARNING: EXPERIMENTAL &#9888; WARNING: EXPERIMENTAL &#9888;
                                </div>
                            )}
                        </div>

                        {/* Settings */}
                        <div style={s.settingsGrid}>
                            <div style={s.settingRow}>
                                <div>
                                    <div style={s.settingLabel}>STALE_THRESHOLD</div>
                                    <div style={s.settingDesc}>Days before tab marked stale</div>
                                </div>
                                <select
                                    value={autoPilotSettings.staleDaysThreshold}
                                    onChange={(e) => setAutoPilotSettings(p => ({ ...p, staleDaysThreshold: parseInt(e.target.value) }))}
                                    style={s.selectSmall}
                                >
                                    <option value={1}>1 DAY</option>
                                    <option value={3}>3 DAYS</option>
                                    <option value={7}>7 DAYS</option>
                                    <option value={14}>14 DAYS</option>
                                    <option value={30}>30 DAYS</option>
                                </select>
                            </div>
                            <div style={s.settingRow}>
                                <div>
                                    <div style={s.settingLabel}>EXCLUDE_PINNED</div>
                                    <div style={s.settingDesc}>Never auto-close pinned tabs</div>
                                </div>
                                <button
                                    style={{ ...s.toggle, ...(autoPilotSettings.excludePinned ? s.toggleOn : {}) }}
                                    onClick={() => setAutoPilotSettings(p => ({ ...p, excludePinned: !p.excludePinned }))}
                                >
                                    {autoPilotSettings.excludePinned ? 'ON' : 'OFF'}
                                </button>
                            </div>
                            <div style={s.settingRow}>
                                <div>
                                    <div style={s.settingLabel}>EXCLUDE_ACTIVE</div>
                                    <div style={s.settingDesc}>Never auto-close current tab</div>
                                </div>
                                <button
                                    style={{ ...s.toggle, ...(autoPilotSettings.excludeActive ? s.toggleOn : {}) }}
                                    onClick={() => setAutoPilotSettings(p => ({ ...p, excludeActive: !p.excludeActive }))}
                                >
                                    {autoPilotSettings.excludeActive ? 'ON' : 'OFF'}
                                </button>
                            </div>
                            <div style={s.settingRow}>
                                <div>
                                    <div style={s.settingLabel}>NOTIFICATIONS</div>
                                    <div style={s.settingDesc}>Show when tabs auto-managed</div>
                                </div>
                                <button
                                    style={{ ...s.toggle, ...(autoPilotSettings.showNotifications ? s.toggleOn : {}) }}
                                    onClick={() => setAutoPilotSettings(p => ({ ...p, showNotifications: !p.showNotifications }))}
                                >
                                    {autoPilotSettings.showNotifications ? 'ON' : 'OFF'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* License Panel */}
                {activeNav === 'license' && (
                    <div style={s.panel}>
                        <div style={s.panelHeader}>
                            <h2 style={s.panelTitle}>LICENSE_STATUS</h2>
                        </div>

                        {license?.paid ? (
                            <div style={s.licenseActive}>
                                <div style={s.licenseIcon}>&#9733;</div>
                                <div style={s.licenseTitle}>PRO_ACTIVE</div>
                                <div style={s.licenseDesc}>Unlimited access to all features</div>
                            </div>
                        ) : (
                            <div style={s.licenseCard}>
                                <div style={s.licensePrice}>
                                    A$6 <span style={s.licensePriceNote}>ONE_TIME</span>
                                </div>
                                <ul style={s.featureList}>
                                    <li style={s.featureItem}><span style={s.checkMark}>&#10003;</span> Unlimited AI scans</li>
                                    <li style={s.featureItem}><span style={s.checkMark}>&#10003;</span> Auto Pilot mode</li>
                                    <li style={s.featureItem}><span style={s.checkMark}>&#10003;</span> Smart tab grouping</li>
                                    <li style={s.featureItem}><span style={s.checkMark}>&#10003;</span> Priority support</li>
                                </ul>
                                <button
                                    style={s.upgradeBtn}
                                    onClick={async () => {
                                        const r = await chrome.runtime.sendMessage({ action: 'getCheckoutUrl' });
                                        if (r.success) chrome.tabs.create({ url: r.data.url });
                                    }}
                                >
                                    UPGRADE_TO_PRO
                                </button>

                                {license?.status === 'trial' && (
                                    <div style={s.trialInfo}>
                                        TRIAL: {license.usageRemaining}/{license.dailyLimit || 20} USES_REMAINING
                                    </div>
                                )}

                                <div style={s.verifySection}>
                                    {!showEmailVerify ? (
                                        <button style={s.verifyBtn} onClick={() => setShowEmailVerify(true)}>
                                            ALREADY_PURCHASED? VERIFY_BY_EMAIL
                                        </button>
                                    ) : (
                                        <div style={s.verifyForm}>
                                            <input
                                                type="email"
                                                placeholder="your@email.com"
                                                value={verifyEmail}
                                                onChange={(e) => setVerifyEmail(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && verifyByEmail()}
                                                style={s.verifyInput}
                                            />
                                            {verifyError && <div style={s.verifyError}>{verifyError}</div>}
                                            <div style={s.verifyActions}>
                                                <button style={s.verifySubmit} onClick={verifyByEmail} disabled={verifyLoading}>
                                                    {verifyLoading ? 'VERIFYING...' : 'VERIFY'}
                                                </button>
                                                <button style={s.verifyCancel} onClick={() => { setShowEmailVerify(false); setVerifyError(''); setVerifyEmail(''); }}>
                                                    CANCEL
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        <button style={s.refreshBtn} onClick={loadLicense}>
                            &#8635; REFRESH_LICENSE
                        </button>
                    </div>
                )}

                {/* Scanline Overlay */}
                <div style={s.scanlines} />
            </main>

            {/* Toast */}
            {toast && (
                <UndoToast
                    message={toast.message}
                    onUndo={() => { toast.undo(); setToast(null); }}
                    onDismiss={() => setToast(null)}
                />
            )}
        </div>
    );
};

// Styles
const s: { [key: string]: React.CSSProperties } = {
    page: {
        display: 'grid',
        gridTemplateColumns: '260px 1fr',
        minHeight: '100vh',
        background: colors.voidBlack,
        color: colors.textPrimary,
        fontFamily: typography.fontFamily,
    },
    sidebar: {
        background: colors.panelGrey,
        borderRight: `1px solid ${colors.borderIdle}`,
        display: 'flex',
        flexDirection: 'column',
        padding: spacing.xxl,
        position: 'sticky',
        top: 0,
        height: '100vh',
    },
    brand: {
        display: 'flex',
        alignItems: 'center',
        gap: spacing.md,
        marginBottom: spacing.xxxl,
        paddingBottom: spacing.xxl,
        borderBottom: `1px solid ${colors.borderIdle}`,
    },
    brandText: {},
    brandName: {
        fontFamily: typography.fontMono,
        fontSize: typography.sizeLg,
        fontWeight: typography.bold,
        color: colors.phosphorGreen,
        letterSpacing: '0.1em',
    },
    brandTagline: {
        fontFamily: typography.fontMono,
        fontSize: typography.sizeXs,
        color: colors.textDim,
        letterSpacing: '0.05em',
    },
    nav: {
        display: 'flex',
        flexDirection: 'column',
        gap: spacing.xs,
        flex: 1,
    },
    navItem: {
        display: 'flex',
        alignItems: 'center',
        gap: spacing.md,
        padding: `${spacing.md}px ${spacing.lg}px`,
        background: 'transparent',
        border: `1px solid transparent`,
        color: colors.textMuted,
        fontFamily: typography.fontMono,
        fontSize: typography.sizeSm,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        cursor: 'pointer',
        textAlign: 'left',
        transition: `all ${transitions.fast}`,
    },
    navItemActive: {
        background: colors.voidBlack,
        borderColor: colors.phosphorGreen,
        color: colors.phosphorGreen,
    },
    navIcon: {
        fontSize: 10,
        opacity: 0.7,
    },
    navStatus: {
        marginLeft: 'auto',
        color: colors.phosphorGreen,
        fontSize: 8,
    },
    navBadge: {
        marginLeft: 'auto',
        padding: '2px 6px',
        fontSize: 9,
        fontWeight: typography.bold,
        color: colors.voidBlack,
    },
    systemStatus: {
        marginTop: 'auto',
        paddingTop: spacing.xxl,
        borderTop: `1px solid ${colors.borderIdle}`,
    },
    statusRow: {
        display: 'flex',
        justifyContent: 'space-between',
        marginBottom: spacing.sm,
    },
    statusLabel: {
        fontFamily: typography.fontMono,
        fontSize: typography.sizeXs,
        color: colors.textDim,
        letterSpacing: '0.05em',
    },
    statusValue: {
        fontFamily: typography.fontMono,
        fontSize: typography.sizeXs,
        letterSpacing: '0.05em',
    },
    viewport: {
        padding: spacing.xxxl,
        overflowY: 'auto',
        position: 'relative',
    },
    panel: {
        maxWidth: 640,
    },
    panelHeader: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: spacing.xxl,
        paddingBottom: spacing.lg,
        borderBottom: `1px solid ${colors.borderIdle}`,
    },
    panelTitle: {
        fontFamily: typography.fontMono,
        fontSize: typography.sizeXl,
        fontWeight: typography.bold,
        color: colors.textPrimary,
        letterSpacing: '0.05em',
        margin: 0,
    },
    indicatorWrap: {
        display: 'flex',
        alignItems: 'center',
        gap: spacing.sm,
    },
    indicatorLabel: {
        fontFamily: typography.fontMono,
        fontSize: typography.sizeXs,
        color: colors.textDim,
        letterSpacing: '0.05em',
    },
    proBadge: {
        background: colors.phosphorGreen,
        color: colors.voidBlack,
        padding: '4px 8px',
        fontFamily: typography.fontMono,
        fontSize: 10,
        fontWeight: typography.bold,
        letterSpacing: '0.1em',
    },
    providerGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: spacing.lg,
        marginBottom: spacing.xxl,
    },
    providerCard: {
        position: 'relative',
        padding: spacing.xl,
        background: colors.panelGrey,
        border: `1px solid ${colors.borderIdle}`,
        textAlign: 'center',
        cursor: 'pointer',
        transition: `all ${transitions.fast}`,
    },
    providerCardActive: {
        background: colors.successBg,
    },
    checkIcon: {
        position: 'absolute',
        top: 8,
        right: 8,
        color: colors.phosphorGreen,
        fontSize: 14,
    },
    providerIcon: {
        width: 32,
        height: 32,
        borderRadius: borderRadius.full,
        margin: '0 auto',
        marginBottom: spacing.md,
        transition: `background ${transitions.fast}`,
    },
    providerName: {
        fontFamily: typography.fontMono,
        fontSize: typography.sizeSm,
        fontWeight: typography.bold,
        color: colors.textPrimary,
        letterSpacing: '0.05em',
    },
    providerDesc: {
        fontSize: typography.sizeXs,
        color: colors.textDim,
        marginTop: 4,
    },
    providerBadge: {
        display: 'inline-block',
        marginTop: spacing.sm,
        padding: '2px 6px',
        fontFamily: typography.fontMono,
        fontSize: 9,
        fontWeight: typography.bold,
        color: colors.voidBlack,
        letterSpacing: '0.05em',
    },
    inputSection: {
        marginBottom: spacing.xl,
    },
    inputLabel: {
        display: 'block',
        fontFamily: typography.fontMono,
        fontSize: typography.sizeXs,
        color: colors.textDim,
        letterSpacing: '0.05em',
        marginBottom: spacing.sm,
    },
    liveInput: {
        display: 'flex',
        alignItems: 'center',
        gap: spacing.md,
        padding: `${spacing.md}px ${spacing.lg}px`,
        background: colors.panelGrey,
        border: `1px solid ${colors.borderIdle}`,
    },
    input: {
        flex: 1,
        background: 'transparent',
        border: 'none',
        outline: 'none',
        color: colors.textPrimary,
        fontFamily: typography.fontMono,
        fontSize: typography.sizeBase,
    },
    link: {
        display: 'inline-block',
        marginTop: spacing.sm,
        fontFamily: typography.fontMono,
        fontSize: typography.sizeXs,
        color: colors.phosphorGreen,
        textDecoration: 'none',
        letterSpacing: '0.05em',
    },
    select: {
        width: '100%',
        padding: `${spacing.md}px ${spacing.lg}px`,
        background: colors.panelGrey,
        border: `1px solid ${colors.borderIdle}`,
        color: colors.textPrimary,
        fontFamily: typography.fontMono,
        fontSize: typography.sizeBase,
        cursor: 'pointer',
        outline: 'none',
    },
    sliderContainer: {
        border: '1px solid',
        padding: spacing.lg,
        marginBottom: spacing.xxl,
        transition: `border-color ${transitions.fast}`,
    },
    sliderTrack: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: spacing.md,
    },
    sliderStop: {
        padding: spacing.lg,
        background: 'transparent',
        border: '1px solid',
        textAlign: 'center',
        cursor: 'pointer',
        transition: `all ${transitions.fast}`,
    },
    sliderStopActive: {
        background: 'rgba(255,255,255,0.02)',
    },
    stopIcon: {
        display: 'block',
        fontSize: 16,
        marginBottom: spacing.sm,
    },
    stopLabel: {
        display: 'block',
        fontFamily: typography.fontMono,
        fontSize: typography.sizeSm,
        fontWeight: typography.bold,
        letterSpacing: '0.05em',
    },
    stopDesc: {
        display: 'block',
        fontSize: typography.sizeXs,
        marginTop: 4,
        opacity: 0.7,
    },
    warningTicker: {
        marginTop: spacing.lg,
        padding: spacing.sm,
        background: colors.errorBg,
        color: colors.criticalRed,
        fontFamily: typography.fontMono,
        fontSize: typography.sizeXs,
        letterSpacing: '0.05em',
        textAlign: 'center',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        animation: 'ticker 10s linear infinite',
    },
    settingsGrid: {
        display: 'flex',
        flexDirection: 'column',
        gap: spacing.md,
    },
    settingRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: spacing.lg,
        background: colors.panelGrey,
        border: `1px solid ${colors.borderIdle}`,
    },
    settingLabel: {
        fontFamily: typography.fontMono,
        fontSize: typography.sizeSm,
        color: colors.textPrimary,
        letterSpacing: '0.05em',
    },
    settingDesc: {
        fontSize: typography.sizeXs,
        color: colors.textDim,
        marginTop: 2,
    },
    selectSmall: {
        padding: `${spacing.sm}px ${spacing.md}px`,
        background: colors.voidBlack,
        border: `1px solid ${colors.borderIdle}`,
        color: colors.textPrimary,
        fontFamily: typography.fontMono,
        fontSize: typography.sizeSm,
        cursor: 'pointer',
        outline: 'none',
    },
    toggle: {
        padding: `${spacing.sm}px ${spacing.lg}px`,
        background: colors.voidBlack,
        border: `1px solid ${colors.borderIdle}`,
        color: colors.textDim,
        fontFamily: typography.fontMono,
        fontSize: typography.sizeSm,
        cursor: 'pointer',
        transition: `all ${transitions.fast}`,
    },
    toggleOn: {
        borderColor: colors.phosphorGreen,
        color: colors.phosphorGreen,
    },
    licenseActive: {
        padding: spacing.xxxl,
        background: colors.successBg,
        border: `1px solid ${colors.phosphorGreen}`,
        textAlign: 'center',
        marginBottom: spacing.xxl,
    },
    licenseIcon: {
        fontSize: 40,
        color: colors.phosphorGreen,
        marginBottom: spacing.md,
    },
    licenseTitle: {
        fontFamily: typography.fontMono,
        fontSize: typography.sizeXl,
        fontWeight: typography.bold,
        color: colors.phosphorGreen,
        letterSpacing: '0.1em',
    },
    licenseDesc: {
        fontSize: typography.sizeSm,
        color: colors.textMuted,
        marginTop: spacing.sm,
    },
    licenseCard: {
        padding: spacing.xxl,
        background: colors.panelGrey,
        border: `1px solid ${colors.borderIdle}`,
        textAlign: 'center',
        marginBottom: spacing.xxl,
    },
    licensePrice: {
        fontFamily: typography.fontMono,
        fontSize: 32,
        fontWeight: typography.bold,
        color: colors.textPrimary,
    },
    licensePriceNote: {
        fontSize: typography.sizeSm,
        fontWeight: typography.normal,
        color: colors.textDim,
    },
    featureList: {
        listStyle: 'none',
        padding: 0,
        margin: `${spacing.xl}px 0`,
        textAlign: 'left',
    },
    featureItem: {
        display: 'flex',
        alignItems: 'center',
        gap: spacing.md,
        padding: `${spacing.sm}px 0`,
        fontSize: typography.sizeSm,
        color: colors.textMuted,
    },
    checkMark: {
        color: colors.phosphorGreen,
    },
    upgradeBtn: {
        width: '100%',
        padding: spacing.lg,
        background: colors.phosphorGreen,
        border: 'none',
        color: colors.voidBlack,
        fontFamily: typography.fontMono,
        fontSize: typography.sizeSm,
        fontWeight: typography.bold,
        letterSpacing: '0.1em',
        cursor: 'pointer',
        transition: `opacity ${transitions.fast}`,
    },
    trialInfo: {
        marginTop: spacing.lg,
        padding: spacing.md,
        background: colors.warningBg,
        border: `1px solid ${colors.signalAmber}`,
        fontFamily: typography.fontMono,
        fontSize: typography.sizeXs,
        color: colors.signalAmber,
        letterSpacing: '0.05em',
    },
    verifySection: {
        marginTop: spacing.xl,
        paddingTop: spacing.xl,
        borderTop: `1px solid ${colors.borderIdle}`,
    },
    verifyBtn: {
        background: 'transparent',
        border: `1px solid ${colors.borderIdle}`,
        color: colors.textMuted,
        fontFamily: typography.fontMono,
        fontSize: typography.sizeXs,
        letterSpacing: '0.05em',
        padding: `${spacing.sm}px ${spacing.lg}px`,
        cursor: 'pointer',
    },
    verifyForm: {},
    verifyInput: {
        width: '100%',
        padding: spacing.md,
        background: colors.voidBlack,
        border: `1px solid ${colors.borderIdle}`,
        color: colors.textPrimary,
        fontFamily: typography.fontFamily,
        fontSize: typography.sizeBase,
        outline: 'none',
        marginBottom: spacing.sm,
    },
    verifyError: {
        color: colors.criticalRed,
        fontFamily: typography.fontMono,
        fontSize: typography.sizeXs,
        marginBottom: spacing.sm,
    },
    verifyActions: {
        display: 'flex',
        gap: spacing.sm,
    },
    verifySubmit: {
        flex: 1,
        padding: spacing.md,
        background: colors.phosphorGreen,
        border: 'none',
        color: colors.voidBlack,
        fontFamily: typography.fontMono,
        fontSize: typography.sizeSm,
        fontWeight: typography.bold,
        cursor: 'pointer',
    },
    verifyCancel: {
        flex: 1,
        padding: spacing.md,
        background: 'transparent',
        border: `1px solid ${colors.borderIdle}`,
        color: colors.textMuted,
        fontFamily: typography.fontMono,
        fontSize: typography.sizeSm,
        cursor: 'pointer',
    },
    refreshBtn: {
        width: '100%',
        padding: spacing.md,
        background: 'transparent',
        border: `1px solid ${colors.borderIdle}`,
        color: colors.textMuted,
        fontFamily: typography.fontMono,
        fontSize: typography.sizeSm,
        letterSpacing: '0.05em',
        cursor: 'pointer',
    },
    scanlines: {
        position: 'fixed',
        top: 0,
        left: 260,
        right: 0,
        bottom: 0,
        pointerEvents: 'none',
        background: scanlineOverlay,
        opacity: 0.5,
    },
};

// Inject CSS
const styleSheet = document.createElement('style');
styleSheet.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap');

    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    @keyframes ticker { from { transform: translateX(0); } to { transform: translateX(-50%); } }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: ${colors.voidBlack}; }

    input:focus, select:focus {
        border-color: ${colors.phosphorGreen} !important;
    }

    button:hover:not(:disabled) {
        border-color: ${colors.borderHover} !important;
    }

    button:active:not(:disabled) {
        opacity: 0.8;
    }

    button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    select {
        appearance: none;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888888' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
        background-repeat: no-repeat;
        background-position: right 12px center;
        padding-right: 36px;
    }

    ::-webkit-scrollbar { width: 4px; }
    ::-webkit-scrollbar-track { background: ${colors.voidBlack}; }
    ::-webkit-scrollbar-thumb { background: ${colors.borderIdle}; }
    ::-webkit-scrollbar-thumb:hover { background: ${colors.borderHover}; }

    ::selection { background: ${colors.phosphorGreen}; color: ${colors.voidBlack}; }

    @media (max-width: 768px) {
        .page { grid-template-columns: 1fr !important; }
        .sidebar { display: none; }
        .scanlines { left: 0 !important; }
    }
`;
document.head.appendChild(styleSheet);

const container = document.getElementById('root');
if (container) createRoot(container).render(<OptionsPage />);
