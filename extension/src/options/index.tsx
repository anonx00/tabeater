import React, { useState, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import '../ui/theme.css';

// ============================================
// TYPES
// ============================================

type CloudProvider = 'gemini' | 'openai' | 'anthropic';
type TabId = 'brain' | 'pilot' | 'display' | 'license';
type ConnectionStatus = 'idle' | 'testing' | 'success' | 'error';
type AutoPilotMode = 'manual' | 'auto-cleanup' | 'fly-mode';

interface LicenseStatus {
    status: 'trial' | 'pro' | 'expired' | 'none';
    paid: boolean;
    usageRemaining: number;
    dailyLimit?: number;
    trialEndDate?: string;
    canUse: boolean;
}

interface NanoStatus {
    available: boolean;
    status: 'ready' | 'downloading' | 'not_available' | 'error';
    message: string;
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

// ============================================
// CONSTANTS
// ============================================

const PROVIDER_INFO = {
    gemini: {
        name: 'Google Gemini',
        defaultModel: 'gemini-2.0-flash',
        models: ['gemini-2.0-flash', 'gemini-1.5-flash-latest', 'gemini-1.5-pro-latest'],
        getKeyUrl: 'https://aistudio.google.com/app/apikey',
        description: 'RECOMMENDED',
        color: '#4285f4',
    },
    openai: {
        name: 'OpenAI',
        defaultModel: 'gpt-4o-mini',
        models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
        getKeyUrl: 'https://platform.openai.com/api-keys',
        description: 'PAY-AS-YOU-GO',
        color: '#10a37f',
    },
    anthropic: {
        name: 'Claude',
        defaultModel: 'claude-3-5-haiku-latest',
        models: ['claude-3-5-haiku-latest', 'claude-3-5-sonnet-latest', 'claude-3-opus-latest'],
        getKeyUrl: 'https://console.anthropic.com/settings/keys',
        description: 'PAY-AS-YOU-GO',
        color: '#d4a574',
    }
};

// ============================================
// COMPONENTS
// ============================================

// Status LED Component
const StatusLED: React.FC<{ status: ConnectionStatus }> = ({ status }) => {
    const statusClass = {
        idle: 'idle',
        testing: 'testing',
        success: 'online',
        error: 'offline'
    }[status];

    return <div className={`status-led ${statusClass}`} />;
};

// Section Header Component
const SectionHeader: React.FC<{ title: string; subtitle: string }> = ({ title, subtitle }) => (
    <div className="section-header">
        <h2 className="section-title">{title}</h2>
        <p className="section-subtitle">&gt;&gt; {subtitle}</p>
    </div>
);

// Navigation Item Component
const NavItem: React.FC<{
    id: TabId;
    label: string;
    icon: string;
    active: boolean;
    badge?: string;
    onClick: () => void;
}> = ({ id, label, icon, active, badge, onClick }) => (
    <button
        className={`nav-item ${active ? 'active' : ''}`}
        onClick={onClick}
    >
        <span style={{ fontSize: '16px' }}>{icon}</span>
        <span style={{ flex: 1 }}>{label}</span>
        {badge && <span className={`badge ${badge === 'PRO' ? 'badge-pro' : 'badge-trial'}`}>{badge}</span>}
    </button>
);

// Glitch Logo Component
const GlitchLogo: React.FC = () => (
    <svg width="40" height="40" viewBox="0 0 128 128" fill="none">
        <rect width="128" height="128" rx="16" fill="#0a0a0a"/>
        <path d="M20 108H108V48H68L56 36H20V108Z" fill="#111111" stroke="#39ff14" strokeWidth="4"/>
        <rect x="84" y="24" width="12" height="12" fill="#39ff14"/>
        <rect x="96" y="36" width="12" height="12" fill="#39ff14"/>
        <rect x="36" y="56" width="12" height="12" fill="#39ff14" style={{ filter: 'drop-shadow(0 0 4px rgba(57, 255, 20, 0.8))' }}/>
    </svg>
);

// ============================================
// MAIN OPTIONS PAGE COMPONENT
// ============================================

const OptionsPage: React.FC = () => {
    // Tab State
    const [activeTab, setActiveTab] = useState<TabId>('brain');

    // AI Configuration State
    const [activeProvider, setActiveProvider] = useState<string>('none');
    const [cloudProvider, setCloudProvider] = useState<CloudProvider>('gemini');
    const [apiKey, setApiKey] = useState('');
    const [model, setModel] = useState('');
    const [showApiKey, setShowApiKey] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
    const [testResult, setTestResult] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);

    // Nano State
    const [nanoStatus, setNanoStatus] = useState<NanoStatus | null>(null);
    const [checkingNano, setCheckingNano] = useState(false);

    // License State
    const [license, setLicense] = useState<LicenseStatus | null>(null);
    const [showEmailVerify, setShowEmailVerify] = useState(false);
    const [verifyEmail, setVerifyEmail] = useState('');
    const [verifyError, setVerifyError] = useState('');
    const [verifyLoading, setVerifyLoading] = useState(false);

    // Auto Pilot State
    const [autoPilotSettings, setAutoPilotSettings] = useState<AutoPilotSettings>({
        mode: 'manual',
        staleDaysThreshold: 7,
        autoCloseStale: false,
        autoGroupByCategory: false,
        excludePinned: true,
        excludeActive: true,
        flyModeDebounceMs: 5000,
        showNotifications: true,
    });
    const [autoPilotSaved, setAutoPilotSaved] = useState(false);

    // Display State
    const [cleanMode, setCleanMode] = useState(true);

    // ============================================
    // EFFECTS & DATA LOADING
    // ============================================

    useEffect(() => {
        loadConfig();
        loadLicense();
        checkNanoStatus();
        loadAutoPilotSettings();
        loadDisplaySettings();
    }, []);

    const loadDisplaySettings = async () => {
        const stored = await chrome.storage.local.get(['cleanMode']);
        setCleanMode(stored.cleanMode !== false);
    };

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
            setConnectionStatus(response.data.provider !== 'none' ? 'success' : 'idle');
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

    // ============================================
    // ACTIONS
    // ============================================

    const toggleCleanMode = async () => {
        const newValue = !cleanMode;
        setCleanMode(newValue);
        await chrome.storage.local.set({ cleanMode: newValue });
    };

    const saveConfig = async () => {
        const selectedModel = model || PROVIDER_INFO[cloudProvider].defaultModel;
        await chrome.runtime.sendMessage({
            action: 'setAIConfig',
            payload: { cloudProvider, apiKey, model: selectedModel }
        });
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        checkProvider();
    };

    const testConnection = async () => {
        setConnectionStatus('testing');
        setTestResult(null);

        try {
            const response = await chrome.runtime.sendMessage({
                action: 'askAI',
                payload: { prompt: 'Respond with exactly: "Connection OK"' }
            });

            if (response.success) {
                setConnectionStatus('success');
                setTestResult('success');
            } else {
                setConnectionStatus('error');
                setTestResult(response.error || 'Test failed');
            }
        } catch (err: any) {
            setConnectionStatus('error');
            setTestResult(err.message);
        }
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
        setConnectionStatus('idle');
        checkProvider();
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

    const verifyByEmail = async () => {
        if (!verifyEmail.trim()) {
            setVerifyError('Please enter your payment email');
            return;
        }
        setVerifyLoading(true);
        setVerifyError('');
        try {
            const response = await chrome.runtime.sendMessage({
                action: 'verifyByEmail',
                payload: { email: verifyEmail.trim().toLowerCase() }
            });
            if (response.success && response.data.verified) {
                await loadLicense();
                setShowEmailVerify(false);
                setVerifyEmail('');
            } else if (response.data?.error === 'DEVICE_LIMIT') {
                setVerifyError('Device limit reached. Contact support.');
            } else if (response.data?.error === 'NOT_FOUND') {
                setVerifyError('No purchase found for this email');
            } else {
                setVerifyError(response.data?.message || 'Verification failed');
            }
        } catch {
            setVerifyError('Failed to verify. Please try again.');
        }
        setVerifyLoading(false);
    };

    // ============================================
    // HELPER FUNCTIONS
    // ============================================

    const getProviderLabel = (p: string) => {
        if (p === 'nano') return 'Chrome Nano (Local)';
        if (p === 'gemini') return 'Google Gemini';
        if (p === 'openai') return 'OpenAI';
        if (p === 'anthropic') return 'Anthropic Claude';
        return 'Not Configured';
    };

    const getLicenseBadge = () => {
        if (!license) return null;
        if (license.paid) return 'PRO';
        if (license.status === 'trial') return 'TRIAL';
        return null;
    };

    // ============================================
    // SECTION RENDERERS
    // ============================================

    const renderBrainSection = () => (
        <div className="animate-fade-in">
            <SectionHeader title="AI Core" subtitle="Configure Neural Link" />

            {/* Current Status Card */}
            <div className="card" style={{ marginBottom: '24px' }}>
                <div className="card-body">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <span style={{ color: 'var(--text-secondary)', textTransform: 'uppercase', fontSize: '12px', letterSpacing: '1px' }}>
                            Active Provider
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <StatusLED status={connectionStatus} />
                            <span className={`badge ${connectionStatus === 'success' ? 'badge-online' : 'badge-offline'}`}>
                                {connectionStatus === 'success' ? 'ONLINE' : 'OFFLINE'}
                            </span>
                        </div>
                    </div>
                    <div style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--terminal-green)' }}>
                        {getProviderLabel(activeProvider)}
                    </div>
                </div>
            </div>

            {/* Provider Selection */}
            <div className="card" style={{ marginBottom: '24px' }}>
                <div className="card-body">
                    <label style={{ display: 'block', color: 'var(--text-dim)', textTransform: 'uppercase', fontSize: '11px', letterSpacing: '1px', marginBottom: '12px' }}>
                        Cloud Provider
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '24px' }}>
                        {(Object.keys(PROVIDER_INFO) as CloudProvider[]).map(p => (
                            <button
                                key={p}
                                className={`provider-card ${p} ${cloudProvider === p ? 'selected' : ''}`}
                                onClick={() => {
                                    setCloudProvider(p);
                                    setModel(PROVIDER_INFO[p].defaultModel);
                                }}
                                style={{
                                    borderColor: cloudProvider === p ? PROVIDER_INFO[p].color : undefined
                                }}
                            >
                                <div style={{ fontWeight: 'bold', color: PROVIDER_INFO[p].color, marginBottom: '4px' }}>
                                    {PROVIDER_INFO[p].name}
                                </div>
                                <div style={{ fontSize: '10px', color: 'var(--text-dim)' }}>
                                    {PROVIDER_INFO[p].description}
                                </div>
                            </button>
                        ))}
                    </div>

                    {/* API Key Input */}
                    <label style={{ display: 'block', color: 'var(--text-dim)', textTransform: 'uppercase', fontSize: '11px', letterSpacing: '1px', marginBottom: '8px' }}>
                        API Key
                    </label>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                        <input
                            type={showApiKey ? 'text' : 'password'}
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            placeholder="sk-..."
                            style={{ flex: 1 }}
                        />
                        <button
                            className="btn-ghost"
                            onClick={() => setShowApiKey(!showApiKey)}
                            style={{ padding: '8px 12px' }}
                            title={showApiKey ? 'Hide' : 'Show'}
                        >
                            {showApiKey ? '◠' : '◡'}
                        </button>
                        {apiKey && (
                            <button
                                className={confirmDelete ? 'btn-danger' : 'btn-ghost'}
                                onClick={deleteApiKey}
                                style={{ padding: '8px 12px' }}
                                title={confirmDelete ? 'Confirm delete' : 'Delete key'}
                            >
                                ✕
                            </button>
                        )}
                        <button
                            className="btn-primary"
                            onClick={testConnection}
                            disabled={connectionStatus === 'testing' || !apiKey}
                            style={{ padding: '8px 16px' }}
                        >
                            {connectionStatus === 'testing' ? 'TESTING...' : 'TEST'}
                        </button>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
                        <a
                            href={PROVIDER_INFO[cloudProvider].getKeyUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: 'var(--info-blue)', fontSize: '12px', textDecoration: 'none' }}
                        >
                            ↗ Get API key
                        </a>
                        <span style={{ color: 'var(--terminal-green)', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ fontSize: '8px' }}>🔒</span> Encrypted locally
                        </span>
                    </div>

                    {/* Model Selection */}
                    <label style={{ display: 'block', color: 'var(--text-dim)', textTransform: 'uppercase', fontSize: '11px', letterSpacing: '1px', marginBottom: '8px' }}>
                        Model
                    </label>
                    <select
                        value={model || PROVIDER_INFO[cloudProvider].defaultModel}
                        onChange={(e) => setModel(e.target.value)}
                        style={{ width: '100%', marginBottom: '16px' }}
                    >
                        {PROVIDER_INFO[cloudProvider].models.map(m => (
                            <option key={m} value={m}>{m}</option>
                        ))}
                    </select>

                    {/* Test Result */}
                    {testResult && (
                        <div style={{
                            padding: '12px',
                            marginBottom: '16px',
                            borderRadius: '4px',
                            background: testResult === 'success' ? 'rgba(57, 255, 20, 0.1)' : 'rgba(255, 0, 85, 0.1)',
                            border: `1px solid ${testResult === 'success' ? 'var(--terminal-green-dim)' : 'var(--alert-red-dim)'}`,
                            color: testResult === 'success' ? 'var(--terminal-green)' : 'var(--alert-red)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}>
                            <StatusLED status={testResult === 'success' ? 'success' : 'error'} />
                            {testResult === 'success' ? 'Connection successful!' : testResult}
                        </div>
                    )}

                    {/* Save Button */}
                    <button
                        className="btn-primary"
                        onClick={saveConfig}
                        style={{ width: '100%', padding: '12px' }}
                    >
                        {saved ? '✓ SAVED!' : 'SAVE CONFIGURATION'}
                    </button>
                </div>
            </div>

            {/* Local AI Section */}
            {(activeProvider === 'nano' || nanoStatus?.status === 'ready' || nanoStatus?.status === 'downloading') && (
                <div className="card">
                    <div className="card-body">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <div style={{ color: 'var(--terminal-green)', fontWeight: 'bold', marginBottom: '4px' }}>
                                    Gemini Nano (Local)
                                </div>
                                <div style={{ color: 'var(--text-dim)', fontSize: '12px' }}>
                                    Runs on device • No API key needed • Free & Private
                                </div>
                            </div>
                            <span className={`badge ${activeProvider === 'nano' ? 'badge-online' : 'badge-trial'}`}>
                                {activeProvider === 'nano' ? 'ACTIVE' : nanoStatus?.status === 'ready' ? 'READY' : 'DOWNLOADING'}
                            </span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

    const renderAutoPilotSection = () => (
        <div className="animate-fade-in">
            <SectionHeader title="Auto Pilot" subtitle="Automated Cleanup Protocols" />

            {/* Mode Selection */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '24px' }}>
                <button
                    className={`mode-card ${autoPilotSettings.mode === 'manual' ? 'selected' : ''}`}
                    onClick={() => updateAutoPilotSetting('mode', 'manual')}
                >
                    <span style={{ fontSize: '24px' }}>🔔</span>
                    <span style={{ fontWeight: 'bold', fontSize: '14px' }}>MANUAL</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>AI suggests, you confirm</span>
                </button>
                <button
                    className={`mode-card ${autoPilotSettings.mode === 'auto-cleanup' ? 'selected' : ''}`}
                    onClick={() => updateAutoPilotSetting('mode', 'auto-cleanup')}
                >
                    <span style={{ fontSize: '24px' }}>🧹</span>
                    <span style={{ fontWeight: 'bold', fontSize: '14px' }}>AUTO-CLEAN</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>Auto-closes duplicates</span>
                </button>
                <button
                    className={`mode-card danger ${autoPilotSettings.mode === 'fly-mode' ? 'selected' : ''}`}
                    onClick={() => updateAutoPilotSetting('mode', 'fly-mode')}
                >
                    <span style={{ fontSize: '24px' }}>🚀</span>
                    <span style={{ fontWeight: 'bold', fontSize: '14px', color: 'var(--alert-red)' }}>FLY MODE</span>
                    <span style={{ fontSize: '11px', color: 'var(--alert-red)' }}>Full autonomy • EXPERIMENTAL</span>
                </button>
            </div>

            {autoPilotSettings.mode === 'fly-mode' && (
                <div style={{
                    padding: '12px',
                    marginBottom: '24px',
                    background: 'rgba(255, 0, 85, 0.1)',
                    border: '1px solid var(--alert-red-dim)',
                    borderRadius: '4px',
                    color: 'var(--alert-red)',
                    fontSize: '12px'
                }}>
                    ⚠ FLY MODE: Automatically closes duplicates and groups tabs. Use with caution.
                </div>
            )}

            {/* Settings Card */}
            <div className="card">
                <div className="card-body">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid var(--border-subtle)' }}>
                        <div>
                            <div style={{ color: 'var(--text-primary)', marginBottom: '4px' }}>Stale Tab Threshold</div>
                            <div style={{ color: 'var(--text-dim)', fontSize: '12px' }}>Tabs not accessed for this period</div>
                        </div>
                        <select
                            value={autoPilotSettings.staleDaysThreshold}
                            onChange={(e) => updateAutoPilotSetting('staleDaysThreshold', parseInt(e.target.value))}
                            style={{ minWidth: '120px' }}
                        >
                            <option value={1}>1 Day</option>
                            <option value={3}>3 Days</option>
                            <option value={7}>7 Days</option>
                            <option value={14}>14 Days</option>
                            <option value={30}>30 Days</option>
                        </select>
                    </div>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px', cursor: 'pointer', padding: '8px', borderRadius: '4px' }}>
                        <input
                            type="checkbox"
                            checked={autoPilotSettings.excludePinned}
                            onChange={(e) => updateAutoPilotSetting('excludePinned', e.target.checked)}
                        />
                        <span style={{ color: 'var(--text-primary)' }}>Exclude pinned tabs</span>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px', cursor: 'pointer', padding: '8px', borderRadius: '4px' }}>
                        <input
                            type="checkbox"
                            checked={autoPilotSettings.excludeActive}
                            onChange={(e) => updateAutoPilotSetting('excludeActive', e.target.checked)}
                        />
                        <span style={{ color: 'var(--text-primary)' }}>Exclude currently active tabs</span>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px', cursor: 'pointer', padding: '8px', borderRadius: '4px' }}>
                        <input
                            type="checkbox"
                            checked={autoPilotSettings.showNotifications}
                            onChange={(e) => updateAutoPilotSetting('showNotifications', e.target.checked)}
                        />
                        <span style={{ color: 'var(--text-primary)' }}>Show notifications for auto actions</span>
                    </label>

                    <button
                        className="btn-primary"
                        onClick={saveAutoPilotSettings}
                        style={{ width: '100%', padding: '12px' }}
                    >
                        {autoPilotSaved ? '✓ SAVED!' : 'SAVE AUTO PILOT SETTINGS'}
                    </button>
                </div>
            </div>
        </div>
    );

    const renderDisplaySection = () => (
        <div className="animate-fade-in">
            <SectionHeader title="Display" subtitle="Visual Configuration" />

            <div className="card">
                <div className="card-body">
                    <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', padding: '8px', borderRadius: '4px' }}>
                        <input
                            type="checkbox"
                            checked={!cleanMode}
                            onChange={toggleCleanMode}
                        />
                        <div>
                            <div style={{ color: 'var(--text-primary)', marginBottom: '4px' }}>Retro Mode (CRT Scanlines)</div>
                            <div style={{ color: 'var(--text-dim)', fontSize: '12px' }}>Enable classic CRT monitor effects for tactical aesthetic</div>
                        </div>
                    </label>
                </div>
            </div>

            <div style={{ marginTop: '24px', padding: '16px', border: '1px dashed var(--border-medium)', borderRadius: '4px', textAlign: 'center', color: 'var(--text-dim)' }}>
                <div style={{ fontSize: '24px', marginBottom: '8px' }}>🎨</div>
                <div>More display settings coming soon</div>
            </div>
        </div>
    );

    const renderLicenseSection = () => {
        const getLicenseStatus = () => {
            if (!license) return { text: 'Loading...', color: 'var(--text-dim)' };
            if (license.paid) return { text: 'PRO - Unlimited Access', color: 'var(--terminal-green)' };
            if (license.status === 'trial') {
                const daysLeft = license.trialEndDate
                    ? Math.ceil((new Date(license.trialEndDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                    : 0;
                return { text: `Free Trial - ${daysLeft} days left (${license.usageRemaining}/${license.dailyLimit || 20} uses today)`, color: 'var(--warning-amber)' };
            }
            if (license.status === 'expired') return { text: 'Trial Expired', color: 'var(--alert-red)' };
            return { text: 'Not Registered', color: 'var(--alert-red)' };
        };

        const status = getLicenseStatus();

        return (
            <div className="animate-fade-in">
                <SectionHeader title="License" subtitle="Account Status" />

                <div className="card">
                    <div className="card-body">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <span style={{ color: status.color, fontWeight: 'bold', fontSize: '16px' }}>
                                {status.text}
                            </span>
                            <button
                                className="btn-ghost"
                                onClick={loadLicense}
                                style={{ padding: '6px 12px', fontSize: '12px' }}
                            >
                                ↻ REFRESH
                            </button>
                        </div>

                        {license && !license.paid && (
                            <>
                                {!showEmailVerify ? (
                                    <button
                                        className="btn-secondary"
                                        onClick={() => setShowEmailVerify(true)}
                                        style={{ width: '100%', padding: '12px', marginTop: '16px' }}
                                    >
                                        ✉ Already paid? Verify by email
                                    </button>
                                ) : (
                                    <div style={{ marginTop: '16px', padding: '16px', background: 'var(--bg-card)', borderRadius: '4px' }}>
                                        <div style={{ color: 'var(--text-dim)', fontSize: '12px', marginBottom: '8px' }}>
                                            Enter the email you used for payment:
                                        </div>
                                        <input
                                            type="email"
                                            placeholder="your@email.com"
                                            value={verifyEmail}
                                            onChange={(e) => setVerifyEmail(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && verifyByEmail()}
                                            style={{ width: '100%', marginBottom: '8px' }}
                                        />
                                        <div style={{ color: 'var(--text-dimmer)', fontSize: '11px', marginBottom: '8px' }}>
                                            Each purchase can be activated on up to 3 devices
                                        </div>
                                        {verifyError && (
                                            <div style={{ color: 'var(--alert-red)', fontSize: '12px', marginBottom: '8px' }}>
                                                {verifyError}
                                            </div>
                                        )}
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button
                                                className="btn-primary"
                                                onClick={verifyByEmail}
                                                disabled={verifyLoading}
                                                style={{ flex: 1, padding: '10px' }}
                                            >
                                                {verifyLoading ? 'VERIFYING...' : 'VERIFY'}
                                            </button>
                                            <button
                                                className="btn-ghost"
                                                onClick={() => {
                                                    setShowEmailVerify(false);
                                                    setVerifyError('');
                                                    setVerifyEmail('');
                                                }}
                                                style={{ flex: 1, padding: '10px' }}
                                            >
                                                CANCEL
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    // ============================================
    // MAIN RENDER
    // ============================================

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            background: 'var(--bg-dark)',
            color: 'var(--terminal-green)',
            fontFamily: 'var(--font-mono)',
        }}>
            {/* Sidebar */}
            <div style={{
                width: '260px',
                borderRight: '1px solid var(--terminal-green-dim)',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                background: '#000',
            }}>
                {/* Logo Section */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
                    <GlitchLogo />
                    <div>
                        <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 'bold', letterSpacing: '-0.5px' }}>
                            TabEater
                        </h1>
                        <p style={{ margin: 0, fontSize: '10px', color: 'var(--text-dim)' }}>
                            SYS.V.1.0.0
                        </p>
                    </div>
                </div>

                {/* Navigation */}
                <nav style={{ flex: 1 }}>
                    <NavItem
                        id="brain"
                        label="AI CONNECTION"
                        icon="🧠"
                        active={activeTab === 'brain'}
                        onClick={() => setActiveTab('brain')}
                    />
                    <NavItem
                        id="pilot"
                        label="AUTO PILOT"
                        icon="✈️"
                        active={activeTab === 'pilot'}
                        badge="PRO"
                        onClick={() => setActiveTab('pilot')}
                    />
                    <NavItem
                        id="display"
                        label="DISPLAY / UX"
                        icon="🖥️"
                        active={activeTab === 'display'}
                        onClick={() => setActiveTab('display')}
                    />
                    <NavItem
                        id="license"
                        label={`LICENSE${getLicenseBadge() ? `: ${getLicenseBadge()}` : ''}`}
                        icon="💎"
                        active={activeTab === 'license'}
                        onClick={() => setActiveTab('license')}
                    />
                </nav>

                {/* Footer Stats */}
                <div style={{ fontSize: '10px', color: 'var(--text-dimmer)', borderTop: '1px solid var(--border-subtle)', paddingTop: '16px' }}>
                    <div style={{ marginBottom: '4px' }}>STATUS: {connectionStatus === 'success' ? 'CONNECTED' : 'DISCONNECTED'}</div>
                    <div>PROVIDER: {activeProvider.toUpperCase()}</div>
                </div>
            </div>

            {/* Main Content */}
            <div style={{ flex: 1, padding: '32px 48px', position: 'relative', overflowY: 'auto' }}>
                {/* Scanline Overlay */}
                {!cleanMode && <div className="scanline-overlay" />}

                <div style={{ maxWidth: '640px', margin: '0 auto' }}>
                    {activeTab === 'brain' && renderBrainSection()}
                    {activeTab === 'pilot' && renderAutoPilotSection()}
                    {activeTab === 'display' && renderDisplaySection()}
                    {activeTab === 'license' && renderLicenseSection()}
                </div>
            </div>
        </div>
    );
};

// ============================================
// MOUNT
// ============================================

const container = document.getElementById('root');
if (container) {
    const root = createRoot(container);
    root.render(<OptionsPage />);
}
