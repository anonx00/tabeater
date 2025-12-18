import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { colors, spacing, typography, borderRadius, shadows, transitions, scanlineOverlay } from '../shared/theme';
import * as webllm from '@mlc-ai/web-llm';

// WebLLM Model ID (default) - Using 3B model for reliability
const WEBLLM_MODEL_ID = 'Llama-3.2-3B-Instruct-q4f16_1-MLC';

// Available Local AI Models - only quality models that work reliably
const LOCAL_AI_MODELS = [
    // Quality models (recommended - reliable JSON output)
    { id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', name: 'Qwen2.5 1.5B', size: '1GB', vram: '1.8GB', speed: 'Medium', quality: 'Good', category: 'quality', recommended: false },
    { id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC', name: 'Llama 3.2 3B', size: '2GB', vram: '3GB', speed: 'Medium', quality: 'Best', category: 'quality', recommended: true },
];

// Global engine reference (persists across re-renders)
let webllmEngine: webllm.MLCEngineInterface | null = null;

// Types
type CloudProvider = 'gemini' | 'openai' | 'anthropic';
type AutoPilotMode = 'manual' | 'auto-cleanup' | 'fly-mode';
type InputState = 'empty' | 'typing' | 'validating' | 'success' | 'error';
type NavSection = 'provider' | 'autopilot' | 'license';

type WebLLMStatus = 'not_initialized' | 'checking_support' | 'not_supported' | 'ready_to_download' | 'downloading' | 'loading' | 'ready' | 'error';

interface WebLLMState {
    status: WebLLMStatus;
    progress: number;
    message: string;
    modelId: string;
    error?: string;
    downloadedMB?: number;
    totalMB?: number;
}

interface WebGPUCapabilities {
    webgpuSupported: boolean;
    webgpuAdapter: string | null;
    estimatedVRAM: number | null;
    recommendedModel: string;
}

interface LicenseStatus {
    status: 'trial' | 'pro' | 'expired' | 'none';
    paid: boolean;
    usageRemaining: number;
    dailyLimit?: number;
    trialEndDate?: string;
    trialDaysRemaining?: number;
    canUse: boolean;
    // Pro user info
    email?: string;
    devicesUsed?: number;
    maxDevices?: number;
    purchaseDate?: string;
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

// Local AI info
const LOCAL_AI_INFO = {
    name: 'LOCAL AI',
    desc: 'Llama 3.2',
    color: '#00ff88',
    badge: 'PRIVATE',
    size: '~700MB',
};

// Premium Provider Logo Components (SimpleIcons-based)
const GeminiLogo: React.FC<{ size?: number; active?: boolean }> = ({ size = 48, active = false }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={active ? '#4285f4' : colors.textDim}>
        <path d="M12 0C5.352 0 0 5.352 0 12s5.352 12 12 12 12-5.352 12-12S18.648 0 12 0zm0 2.4c5.304 0 9.6 4.296 9.6 9.6s-4.296 9.6-9.6 9.6S2.4 17.304 2.4 12 6.696 2.4 12 2.4zm0 1.44a8.16 8.16 0 1 0 0 16.32 8.16 8.16 0 0 0 0-16.32zm0 2.88c2.904 0 5.28 2.376 5.28 5.28s-2.376 5.28-5.28 5.28S6.72 14.904 6.72 12s2.376-5.28 5.28-5.28z"/>
    </svg>
);

const OpenAILogo: React.FC<{ size?: number; active?: boolean }> = ({ size = 48, active = false }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={active ? '#10a37f' : colors.textDim}>
        <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.8956zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.4066-.6813zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z"/>
    </svg>
);

const ClaudeLogo: React.FC<{ size?: number; active?: boolean }> = ({ size = 48, active = false }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={active ? '#d4a574' : colors.textDim}>
        <path d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.08-2.809-.112-.72-.048.048-.208.336-.192.368-.032 2.809.144 2.377.096 1.278.064-.336-.336-.945-1.04-1.663-1.68-1.727-1.888-.592-.672.16-.144.4.048.224.208 1.584 1.728 1.615 1.632 1.023 1.072-.032-.16-.16-1.136-.336-2.192-.4-2.72-.224-1.664.24-.112.304.128.128.288.192 1.712.32 2.017.352 2.16.176.992.048-.016.16-.128.16-.592.144-1.472.32-1.328.288-.608.128-.048.336.192.256-.064 1.263-.288 1.712-.4 1.376-.288-.48.64-1.055 1.391-.656.88-.64.815-.096.176.144.224.24.08.352-.08 1.407-.48 3.12-1.072.784-.256 1.055-.368.608-.192.128.064.048.208-.064.288-1.12.48-2.32.768-2.592.88-.592.176-.16.16.064.144.784.064 2.176.192 2.688.192.88.064.176.144v.224l-.32.192-.288.064-2.608-.176-2.593-.128-.816-.048.048.192.288.288.096.112 1.264 1.28 1.439 1.504.416.416-.032.24-.24.128-.24-.032-1.695-1.744-1.233-1.2-.336-.336-.128.176-.048.192.176 2.016.256 2.993.048.736-.24.144-.272-.096-.112-.4-.224-2.16-.208-2.16-.096-.816-.032-.24-.288.16-.224.176-.88.592-1.904 1.264-.704.464-.16-.032-.096-.256.064-.16.88-.64 1.343-.928-.255-.112-.992-.096-2.641-.192-2.848-.208-.656-.048.016-.208.32-.24.256-.032 2.048.144 3.265.24.464.016.08-.112.016-.176-.56-.528-2.096-2.017-.976-.912-.128-.208.064-.256.288-.144.224.144.224.192 1.68 1.632 1.488 1.424.224-.112.064-.224-.08-.544-.272-1.04-.624-2.369-.544-2.16-.064-.256.144-.192.336-.016.176.32.64 2.16.592 2.16.304 1.088.176.624.08.112.176-.016.192-.192.608-1.008.88-1.472.816-1.392.176-.32.24-.064.288.192-.032.288-.544.976-1.28 2.096-.56.976.16.064.192-.048 1.04-.224 2.72-.592 2.225-.48.544-.128.112.128.016.32-.176.24-.72.208-1.712.4-2.881.624-.816.16-.176.224.032.208.88.816 1.312 1.216 1.247 1.136.112.144-.016.224-.24.144-.192-.048-.224-.176L4.709 15.955z"/>
    </svg>
);

// Local AI Logo (CPU/chip icon representing on-device processing)
const LocalAILogo: React.FC<{ size?: number; active?: boolean; loading?: boolean; progress?: number }> = ({ size = 48, active = false, loading = false, progress = 0 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <rect x="6" y="6" width="12" height="12" rx="2" stroke={active ? '#00ff88' : colors.textDim} strokeWidth="1.5" fill={active ? 'rgba(0,255,136,0.1)' : 'none'}/>
        <rect x="9" y="9" width="6" height="6" fill={active ? '#00ff88' : colors.textDim}/>
        {/* Connection pins */}
        <line x1="8" y1="3" x2="8" y2="6" stroke={active ? '#00ff88' : colors.textDim} strokeWidth="1.5"/>
        <line x1="12" y1="3" x2="12" y2="6" stroke={active ? '#00ff88' : colors.textDim} strokeWidth="1.5"/>
        <line x1="16" y1="3" x2="16" y2="6" stroke={active ? '#00ff88' : colors.textDim} strokeWidth="1.5"/>
        <line x1="8" y1="18" x2="8" y2="21" stroke={active ? '#00ff88' : colors.textDim} strokeWidth="1.5"/>
        <line x1="12" y1="18" x2="12" y2="21" stroke={active ? '#00ff88' : colors.textDim} strokeWidth="1.5"/>
        <line x1="16" y1="18" x2="16" y2="21" stroke={active ? '#00ff88' : colors.textDim} strokeWidth="1.5"/>
        <line x1="3" y1="8" x2="6" y2="8" stroke={active ? '#00ff88' : colors.textDim} strokeWidth="1.5"/>
        <line x1="3" y1="12" x2="6" y2="12" stroke={active ? '#00ff88' : colors.textDim} strokeWidth="1.5"/>
        <line x1="3" y1="16" x2="6" y2="16" stroke={active ? '#00ff88' : colors.textDim} strokeWidth="1.5"/>
        <line x1="18" y1="8" x2="21" y2="8" stroke={active ? '#00ff88' : colors.textDim} strokeWidth="1.5"/>
        <line x1="18" y1="12" x2="21" y2="12" stroke={active ? '#00ff88' : colors.textDim} strokeWidth="1.5"/>
        <line x1="18" y1="16" x2="21" y2="16" stroke={active ? '#00ff88' : colors.textDim} strokeWidth="1.5"/>
        {loading && (
            <circle cx="12" cy="12" r="8" stroke="#00ff88" strokeWidth="2" strokeDasharray={`${progress * 0.5} 50`} fill="none" opacity="0.5"/>
        )}
    </svg>
);

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

// Provider Logo Renderer
const ProviderLogo: React.FC<{ provider: CloudProvider; size?: number; active?: boolean }> = ({ provider, size = 48, active = false }) => {
    switch (provider) {
        case 'gemini': return <GeminiLogo size={size} active={active} />;
        case 'openai': return <OpenAILogo size={size} active={active} />;
        case 'anthropic': return <ClaudeLogo size={size} active={active} />;
    }
};

// Masked API Key Display
const MaskedApiKey: React.FC<{ apiKey: string }> = ({ apiKey }) => {
    if (!apiKey) return <span style={{ color: colors.textDim }}>NOT_SET</span>;
    const prefix = apiKey.slice(0, 4);
    return <span style={{ fontFamily: typography.fontMono, color: colors.textMuted }}>{prefix}...•••</span>;
};

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
    const [trialInfo, setTrialInfo] = useState<{ daysRemaining: number; startDate: string; endDate: string } | null>(null);
    const [deviceInfo, setDeviceInfo] = useState<{ devices: { deviceId: string; lastActive: string; current: boolean }[]; maxDevices: number } | null>(null);
    const [showDevices, setShowDevices] = useState(false);
    const [apiUsage, setApiUsage] = useState<{ totalCalls: number; todayCalls: number; hourCalls: number; estimatedCost: number; limits: { maxPerHour: number; maxPerDay: number; warningThreshold: number }; nearLimit: boolean; provider: string; configuredProvider: string } | null>(null);
    const [customLimits, setCustomLimits] = useState<{ maxPerHour: number; maxPerDay: number }>({ maxPerHour: 30, maxPerDay: 100 });
    const [showLimitSettings, setShowLimitSettings] = useState(false);
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // WebLLM (Local AI) state
    const [webllmState, setWebllmState] = useState<WebLLMState>({ status: 'not_initialized', progress: 0, message: 'Checking...', modelId: 'SmolLM2-360M-Instruct-q4f16_1-MLC' });
    const [webgpuCapabilities, setWebgpuCapabilities] = useState<WebGPUCapabilities | null>(null);
    const [webllmLoading, setWebllmLoading] = useState(false);
    const [selectedLocalModel, setSelectedLocalModel] = useState(WEBLLM_MODEL_ID);

    // Load data
    useEffect(() => {
        loadConfig();
        loadLicense();
        loadAutoPilotSettings();
        loadTrialInfo();
        loadWebLLMState();
        // Load API usage after a short delay to ensure service worker is ready
        setTimeout(loadApiUsage, 100);
    }, []);

    // Poll WebLLM state during download/loading
    useEffect(() => {
        if (webllmState.status === 'downloading' || webllmState.status === 'loading') {
            const interval = setInterval(loadWebLLMState, 500);
            return () => clearInterval(interval);
        }
    }, [webllmState.status]);

    // Load device info when license is loaded and user is Pro
    useEffect(() => {
        if (license?.paid) {
            loadDeviceInfo();
        }
    }, [license?.paid]);

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

    const loadTrialInfo = async () => {
        const response = await chrome.runtime.sendMessage({ action: 'getTrialInfo' });
        if (response.success) setTrialInfo(response.data);
    };

    const loadDeviceInfo = async () => {
        const response = await chrome.runtime.sendMessage({ action: 'getDevices' });
        if (response.success && response.data) setDeviceInfo(response.data);
    };

    const loadWebLLMState = async () => {
        try {
            // Check WebGPU support directly in page context
            if (!webgpuCapabilities) {
                const capabilities = await checkWebGPUDirectly();
                setWebgpuCapabilities(capabilities);
            }

            // Check if WebLLM was previously enabled and load selected model
            const stored = await chrome.storage.local.get(['webllmReady', 'aiConfig', 'webllmModel']);

            // Load selected model from storage
            if (stored.webllmModel) {
                setSelectedLocalModel(stored.webllmModel);
            }

            const currentModel = stored.webllmModel || WEBLLM_MODEL_ID;

            if (stored.webllmReady && webllmEngine) {
                // Engine already loaded in this session
                setWebllmState({
                    status: 'ready',
                    progress: 100,
                    message: 'Local AI ready',
                    modelId: currentModel,
                });
                setActiveProvider('webllm');
            } else if (stored.aiConfig?.preferWebLLM && !webllmEngine) {
                // Was enabled before but engine not loaded (page refresh)
                // Show as "ready to re-enable"
                setWebllmState({
                    status: 'not_initialized',
                    progress: 0,
                    message: 'Click to re-enable',
                    modelId: currentModel,
                });
            }
        } catch (err) {
            console.warn('Failed to load WebLLM state:', err);
        }
    };

    // Check WebGPU support directly in page context
    const checkWebGPUDirectly = async (): Promise<WebGPUCapabilities> => {
        try {
            const gpu = (navigator as any).gpu;
            if (!gpu) {
                return {
                    webgpuSupported: false,
                    webgpuAdapter: null,
                    estimatedVRAM: null,
                    recommendedModel: 'SmolLM2-360M-Instruct-q4f16_1-MLC',
                };
            }

            const adapter = await gpu.requestAdapter();
            if (!adapter) {
                return {
                    webgpuSupported: false,
                    webgpuAdapter: null,
                    estimatedVRAM: null,
                    recommendedModel: 'SmolLM2-360M-Instruct-q4f16_1-MLC',
                };
            }

            // Get adapter info
            let adapterDesc = 'WebGPU';
            try {
                const info = await adapter.requestAdapterInfo?.();
                if (info) {
                    adapterDesc = info.description || info.vendor || 'WebGPU';
                }
            } catch {
                // Adapter info not available
            }

            return {
                webgpuSupported: true,
                webgpuAdapter: adapterDesc,
                estimatedVRAM: null,
                recommendedModel: 'SmolLM2-360M-Instruct-q4f16_1-MLC',
            };
        } catch (err) {
            console.warn('WebGPU check failed:', err);
            return {
                webgpuSupported: false,
                webgpuAdapter: null,
                estimatedVRAM: null,
                recommendedModel: 'SmolLM2-360M-Instruct-q4f16_1-MLC',
            };
        }
    };

    const enableWebLLM = async () => {
        if (webllmLoading) return;
        setWebllmLoading(true);

        try {
            // Save selected model to storage for popup/sidepanel to use
            await chrome.storage.local.set({ webllmModel: selectedLocalModel });

            setWebllmState({
                status: 'downloading',
                progress: 0,
                message: 'Starting download...',
                modelId: selectedLocalModel,
            });

            // Initialize WebLLM directly in page context (WebGPU only works here)
            webllmEngine = await webllm.CreateMLCEngine(selectedLocalModel, {
                initProgressCallback: (progress) => {
                    const percent = Math.round(progress.progress * 100);
                    let message = progress.text || 'Loading model...';

                    // Parse download info
                    let downloadedMB: number | undefined;
                    let totalMB: number | undefined;
                    if (message.includes('MB')) {
                        const match = message.match(/(\d+(?:\.\d+)?)\s*MB.*?(\d+(?:\.\d+)?)\s*MB/);
                        if (match) {
                            downloadedMB = parseFloat(match[1]);
                            totalMB = parseFloat(match[2]);
                        }
                    }

                    const status: WebLLMStatus = percent > 95 ? 'loading' : 'downloading';
                    setWebllmState({
                        status,
                        progress: percent,
                        message: status === 'loading' ? 'Initializing model...' : message,
                        modelId: selectedLocalModel,
                        downloadedMB,
                        totalMB,
                    });
                },
            });

            // Save preference to storage
            await chrome.storage.local.set({
                aiConfig: { preferWebLLM: true },
                webllmReady: true,
                webllmModel: selectedLocalModel,
            });

            setWebllmState({
                status: 'ready',
                progress: 100,
                message: 'Local AI ready',
                modelId: selectedLocalModel,
            });
            setActiveProvider('webllm');
            setToast({ message: 'Local AI enabled', undo: () => {} });

        } catch (err: any) {
            console.error('WebLLM initialization failed:', err);
            let errorMsg = err.message || 'Unknown error';
            if (errorMsg.includes('WebGPU')) {
                errorMsg = 'WebGPU initialization failed. Try updating your browser or GPU drivers.';
            } else if (errorMsg.includes('memory') || errorMsg.includes('OOM')) {
                errorMsg = 'Not enough GPU memory. Close other apps and try again.';
            }

            setWebllmState({
                status: 'error',
                progress: 0,
                message: errorMsg,
                modelId: selectedLocalModel,
                error: errorMsg,
            });
        }

        setWebllmLoading(false);
    };

    // Handle model selection change - auto-download new model
    const handleLocalModelChange = async (modelId: string) => {
        setSelectedLocalModel(modelId);
        await chrome.storage.local.set({ webllmModel: modelId });

        // If a model is already loaded and user selects different one, auto-reload
        if (webllmState.status === 'ready' && webllmState.modelId !== modelId) {
            // Unload current model
            if (webllmEngine) {
                try {
                    await webllmEngine.unload();
                    webllmEngine = null;
                } catch (e) {
                    console.log('[WebLLM] Unload error:', e);
                }
            }
            // Auto-download new model
            setWebllmState({
                status: 'not_initialized',
                progress: 0,
                message: 'Switching model...',
                modelId: modelId,
            });
            setTimeout(() => enableWebLLM(), 100);
        }
    };

    // Clear WebLLM IndexedDB cache to free up storage
    const clearWebLLMCache = async () => {
        try {
            // WebLLM stores models in IndexedDB under these databases
            const dbNames = ['webllm-model-cache', 'webllm-wasm-cache', 'tvmjs'];
            for (const dbName of dbNames) {
                try {
                    await new Promise<void>((resolve, reject) => {
                        const req = indexedDB.deleteDatabase(dbName);
                        req.onsuccess = () => resolve();
                        req.onerror = () => reject(req.error);
                        req.onblocked = () => resolve(); // Continue even if blocked
                    });
                    console.log(`[WebLLM] Cleared ${dbName} cache`);
                } catch (e) {
                    console.log(`[WebLLM] Could not clear ${dbName}:`, e);
                }
            }
        } catch (e) {
            console.error('[WebLLM] Cache cleanup error:', e);
        }
    };

    const disableWebLLM = async (clearCache = false) => {
        try {
            // Unload engine directly
            if (webllmEngine) {
                await webllmEngine.unload();
                webllmEngine = null;
            }

            // Clear storage preference and model selection
            await chrome.storage.local.set({
                aiConfig: { preferWebLLM: false },
                webllmReady: false,
                webllmModel: null, // Clear model selection
            });

            // Optionally clear the cached model data from IndexedDB
            if (clearCache) {
                await clearWebLLMCache();
            }

            setWebllmState({
                status: 'not_initialized',
                progress: 0,
                message: 'Not initialized',
                modelId: WEBLLM_MODEL_ID,
            });
            setSelectedLocalModel(WEBLLM_MODEL_ID); // Reset to default
            setActiveProvider('none');
            setToast({ message: 'Local AI disabled', undo: () => {} });
        } catch (err) {
            console.warn('Failed to disable WebLLM:', err);
        }
    };

    const loadApiUsage = async () => {
        try {
            const response = await chrome.runtime.sendMessage({ action: 'getAPIUsageStats' });
            if (response.success && response.data) {
                // Also check local config for configured provider (fallback)
                const localConfig = await chrome.storage.local.get(['aiConfig']);
                let configuredProvider = response.data.configuredProvider;

                // If backend didn't detect it, check local storage directly
                if ((!configuredProvider || configuredProvider === 'none') && localConfig.aiConfig?.cloudProvider && localConfig.aiConfig?.apiKey) {
                    configuredProvider = localConfig.aiConfig.cloudProvider;
                }

                setApiUsage({
                    ...response.data,
                    configuredProvider: configuredProvider
                });

                // Update custom limits from loaded data
                if (response.data.limits) {
                    setCustomLimits({
                        maxPerHour: response.data.limits.maxPerHour,
                        maxPerDay: response.data.limits.maxPerDay
                    });
                }
            }
        } catch (err) {
            console.warn('Failed to load API usage:', err);
        }
    };

    const saveRateLimits = async (limits: { maxPerHour: number; maxPerDay: number }) => {
        try {
            await chrome.runtime.sendMessage({ action: 'setRateLimits', payload: limits });
            setCustomLimits(limits);
            setSyncStatus('saved');
            setTimeout(() => setSyncStatus('idle'), 2000);
            // Reload to get updated stats
            await loadApiUsage();
        } catch (err) {
            console.warn('Failed to save rate limits:', err);
        }
    };

    const resetUsageStats = async () => {
        try {
            await chrome.runtime.sendMessage({ action: 'resetUsageStats' });
            await loadApiUsage();
            setToast({ message: 'Usage stats reset', undo: () => {} });
        } catch (err) {
            console.warn('Failed to reset usage stats:', err);
        }
    };

    // Auto-refresh API usage every 30 seconds when on autopilot panel
    useEffect(() => {
        if (activeNav === 'autopilot') {
            const interval = setInterval(loadApiUsage, 30000);
            return () => clearInterval(interval);
        }
    }, [activeNav]);

    const removeDevice = async (deviceId: string) => {
        const response = await chrome.runtime.sendMessage({ action: 'removeDevice', payload: { deviceId } });
        if (response.success) {
            await loadDeviceInfo();
            setToast({ message: 'Device removed', undo: () => {} });
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
                {/* Brand - Glitch Logo Only */}
                <div style={s.brand}>
                    <div style={s.brandLogoWrap}>
                        <GlitchLogo size={48} />
                    </div>
                    <div style={s.brandText}>
                        <div style={s.brandName}>TAB_EATER</div>
                        <div style={s.brandTagline}>// AUTOMATION_SYSTEM</div>
                    </div>
                </div>

                {/* Navigation */}
                <nav style={s.nav}>
                    <button
                        className="nav-item"
                        style={{
                            ...s.navItem,
                            ...(activeNav === 'provider' ? s.navItemActive : {}),
                            boxShadow: activeNav === 'provider' ? `inset 3px 0 0 ${colors.accentCyan}` : 'none',
                        }}
                        onClick={() => setActiveNav('provider')}
                    >
                        <span>AI Provider</span>
                        {activeProvider !== 'none' && <span style={s.navStatus}>●</span>}
                    </button>
                    <button
                        className="nav-item"
                        style={{
                            ...s.navItem,
                            ...(activeNav === 'autopilot' ? s.navItemActive : {}),
                            boxShadow: activeNav === 'autopilot' ? `inset 3px 0 0 ${colors.accentCyan}` : 'none',
                        }}
                        onClick={() => setActiveNav('autopilot')}
                    >
                        <span>Auto-Pilot</span>
                        {autoPilotSettings.mode !== 'manual' && (
                            <span style={{ ...s.navStatus, color: autoPilotSettings.mode === 'fly-mode' ? colors.accentCyan : colors.signalAmber }}>
                                ●
                            </span>
                        )}
                    </button>
                    <button
                        className="nav-item"
                        style={{
                            ...s.navItem,
                            ...(activeNav === 'license' ? s.navItemActive : {}),
                            boxShadow: activeNav === 'license' ? `inset 3px 0 0 ${colors.accentCyan}` : 'none',
                        }}
                        onClick={() => setActiveNav('license')}
                    >
                        <span>License</span>
                        {license?.paid && <span style={{ ...s.navBadge, background: colors.accentCyan }}>PRO</span>}
                    </button>
                </nav>

                {/* System Status Footer with Heartbeat */}
                <div style={s.systemStatus}>
                    <div style={s.statusBar}>
                        <div style={s.statusBarFill} className="heartbeat-bar" />
                    </div>
                    <div style={s.statusGrid}>
                        <div style={s.statusItem}>
                            <span style={s.statusLabel}>CONN</span>
                            <span style={{ ...s.statusValue, color: activeProvider !== 'none' ? colors.phosphorGreen : colors.textDim }}>
                                {activeProvider !== 'none' ? '●' : '○'}
                            </span>
                        </div>
                        <div style={s.statusItem}>
                            <span style={s.statusLabel}>SYNC</span>
                            <span style={{ ...s.statusValue, color: syncStatus === 'saved' ? colors.phosphorGreen : syncStatus === 'syncing' ? colors.signalAmber : colors.textDim }}>
                                {syncStatus === 'saved' ? '●' : syncStatus === 'syncing' ? '◐' : '○'}
                            </span>
                        </div>
                        <div style={s.statusItem}>
                            <span style={s.statusLabel}>MODE</span>
                            <span style={{ ...s.statusValue, color: autoPilotSettings.mode === 'fly-mode' ? colors.criticalRed : autoPilotSettings.mode === 'auto-cleanup' ? colors.signalAmber : colors.textDim }}>
                                {autoPilotSettings.mode === 'fly-mode' ? 'FLY' : autoPilotSettings.mode === 'auto-cleanup' ? 'AUTO' : 'MAN'}
                            </span>
                        </div>
                    </div>
                </div>
            </aside>

            {/* Viewport */}
            <main style={s.viewport}>
                {/* Provider Panel */}
                {activeNav === 'provider' && (
                    <div style={s.panel}>
                        <div style={s.panelHeader}>
                            <h2 style={s.panelTitle}>AI Provider</h2>
                            <div style={s.indicatorWrap}>
                                <div style={getIndicatorStyle()} />
                                <span style={s.indicatorLabel}>
                                    {inputState === 'success' ? 'ENCRYPTED' : inputState === 'error' ? 'FAILED' : inputState === 'validating' ? 'VALIDATING' : ''}
                                </span>
                            </div>
                        </div>

                        {/* Provider Cards - 4 column grid with Local AI first */}
                        <div style={{ ...s.providerGrid, gridTemplateColumns: 'repeat(4, 1fr)' }}>
                            {/* Local AI Card */}
                            <button
                                className={`provider-card ${webllmState.status === 'ready' ? 'active' : ''}`}
                                style={{
                                    ...s.providerCard,
                                    borderColor: webllmState.status === 'ready' ? '#00ff88' : colors.borderIdle,
                                    boxShadow: webllmState.status === 'ready' ? '0 0 20px rgba(0, 255, 136, 0.3)' : 'none',
                                    opacity: !webgpuCapabilities?.webgpuSupported ? 0.5 : 1,
                                    cursor: !webgpuCapabilities?.webgpuSupported ? 'not-allowed' : 'pointer',
                                }}
                                onClick={() => {
                                    if (!webgpuCapabilities?.webgpuSupported) return;
                                    if (webllmState.status === 'ready') {
                                        disableWebLLM();
                                    } else if (webllmState.status === 'not_initialized' || webllmState.status === 'error') {
                                        enableWebLLM();
                                    }
                                }}
                                disabled={webllmLoading || webllmState.status === 'downloading' || webllmState.status === 'loading'}
                            >
                                {webllmState.status === 'ready' && <span style={s.checkIcon}>&#10003;</span>}
                                <div style={s.providerLogoWrap}>
                                    <LocalAILogo
                                        size={48}
                                        active={webllmState.status === 'ready'}
                                        loading={webllmState.status === 'downloading' || webllmState.status === 'loading'}
                                        progress={webllmState.progress}
                                    />
                                </div>
                                <div style={s.providerName}>{LOCAL_AI_INFO.name}</div>
                                <div style={s.providerDesc}>
                                    {webllmState.status === 'downloading' || webllmState.status === 'loading'
                                        ? `${webllmState.progress}%`
                                        : webllmState.status === 'ready'
                                            ? 'Active'
                                            : !webgpuCapabilities?.webgpuSupported
                                                ? 'No WebGPU'
                                                : LOCAL_AI_INFO.desc}
                                </div>
                                <span style={{ ...s.providerBadge, background: '#00ff88' }}>
                                    {LOCAL_AI_INFO.badge}
                                </span>
                            </button>

                            {/* Cloud Provider Cards */}
                            {(Object.keys(PROVIDERS) as CloudProvider[]).map(p => {
                                const isActive = cloudProvider === p && webllmState.status !== 'ready';
                                return (
                                    <button
                                        key={p}
                                        className={`provider-card ${isActive ? 'active' : ''}`}
                                        style={{
                                            ...s.providerCard,
                                            ...(isActive ? s.providerCardActive : {}),
                                            borderColor: isActive ? colors.phosphorGreen : colors.borderIdle,
                                            boxShadow: isActive ? shadows.phantomGreen : 'none',
                                        }}
                                        onClick={() => { setCloudProvider(p); setModel(PROVIDERS[p].default); }}
                                    >
                                        {isActive && <span style={s.checkIcon}>&#10003;</span>}
                                        <div style={s.providerLogoWrap}>
                                            <ProviderLogo provider={p} size={48} active={isActive} />
                                        </div>
                                        <div style={s.providerName}>{PROVIDERS[p].name}</div>
                                        <div style={s.providerDesc}>{PROVIDERS[p].desc}</div>
                                        <span style={{ ...s.providerBadge, background: PROVIDERS[p].badge === 'FREE' ? colors.phosphorGreen : colors.textDim }}>
                                            {PROVIDERS[p].badge}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Download Progress (shown below cards when downloading) */}
                        {(webllmState.status === 'downloading' || webllmState.status === 'loading') && (
                            <div style={s.downloadProgress}>
                                <div style={s.progressHeader}>
                                    <span style={s.progressLabel}>
                                        {webllmState.status === 'downloading' ? 'DOWNLOADING LOCAL AI' : 'INITIALIZING'}
                                    </span>
                                    <span style={s.progressPercent}>{webllmState.progress}%</span>
                                </div>
                                <div style={s.progressBarBg}>
                                    <div style={{ ...s.progressBarFill, width: `${webllmState.progress}%` }} />
                                </div>
                                <span style={s.progressMessage}>{webllmState.message}</span>
                            </div>
                        )}

                        {/* Local AI Settings - Only show when Local AI is active or loading */}
                        {webgpuCapabilities?.webgpuSupported && (webllmState.status === 'ready' || webllmState.status === 'downloading' || webllmState.status === 'loading') && (
                            <div style={{ marginTop: spacing.lg }}>
                                {/* Section Header */}
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    marginBottom: spacing.sm,
                                }}>
                                    <div style={{
                                        fontFamily: typography.fontMono,
                                        fontSize: typography.sizeSm,
                                        color: colors.phosphorGreen,
                                        letterSpacing: '0.1em',
                                    }}>LOCAL_AI_SETTINGS</div>
                                    <div style={{
                                        fontSize: 10,
                                        color: webllmState.status === 'ready' ? colors.phosphorGreen : colors.textDim,
                                        fontFamily: typography.fontMono,
                                    }}>
                                        {webllmState.status === 'ready' ? '● ACTIVE' : '○ INACTIVE'}
                                    </div>
                                </div>

                                {/* Info Note */}
                                <div style={{
                                    padding: spacing.sm,
                                    marginBottom: spacing.md,
                                    background: 'rgba(0, 255, 136, 0.05)',
                                    border: `1px solid ${colors.borderIdle}`,
                                    borderRadius: borderRadius.xs,
                                    fontSize: 11,
                                    color: colors.textMuted,
                                    lineHeight: 1.5,
                                }}>
                                    <strong style={{ color: colors.phosphorGreen }}>Llama 3.2 3B</strong> is the default model (2GB download, best quality for reliable AI responses).
                                    Requires 3GB VRAM. Select Qwen 1.5B for faster performance on lower-end GPUs.
                                    Models download once and are cached locally.
                                </div>

                                {/* Model Selector */}
                                <div style={{ marginBottom: spacing.md }}>
                                    <label style={{
                                        display: 'block',
                                        fontFamily: typography.fontMono,
                                        fontSize: 10,
                                        color: colors.textMuted,
                                        marginBottom: spacing.xs,
                                        letterSpacing: '0.1em',
                                    }}>SELECT_MODEL</label>
                                    <select
                                        value={selectedLocalModel}
                                        onChange={(e) => handleLocalModelChange(e.target.value)}
                                        style={{
                                            ...s.select,
                                            background: colors.voidBlack,
                                            borderColor: webllmState.status === 'ready' ? colors.phosphorGreen : colors.borderIdle,
                                        }}
                                        disabled={webllmState.status === 'downloading' || webllmState.status === 'loading'}
                                    >
                                        <optgroup label="⚖️ Balanced (Recommended)">
                                            {LOCAL_AI_MODELS.filter(m => m.category === 'balanced').map(m => (
                                                <option key={m.id} value={m.id}>
                                                    {m.name} • {m.size} {m.recommended ? '★ Default' : ''}
                                                </option>
                                            ))}
                                        </optgroup>
                                        <optgroup label="🎯 High Quality (More VRAM)">
                                            {LOCAL_AI_MODELS.filter(m => m.category === 'quality').map(m => (
                                                <option key={m.id} value={m.id}>
                                                    {m.name} • {m.size}
                                                </option>
                                            ))}
                                        </optgroup>
                                    </select>
                                </div>

                                {/* Model Specs */}
                                {(() => {
                                    const currentModel = LOCAL_AI_MODELS.find(m => m.id === selectedLocalModel);
                                    if (!currentModel) return null;
                                    return (
                                        <div style={{
                                            display: 'grid',
                                            gridTemplateColumns: 'repeat(4, 1fr)',
                                            gap: spacing.sm,
                                            padding: spacing.sm,
                                            background: 'rgba(0, 0, 0, 0.2)',
                                            borderRadius: borderRadius.xs,
                                            marginBottom: spacing.sm,
                                        }}>
                                            <div style={{ textAlign: 'center' }}>
                                                <div style={{ fontSize: 9, color: colors.textDim, marginBottom: 2 }}>DOWNLOAD</div>
                                                <div style={{ fontFamily: typography.fontMono, fontSize: 12, color: colors.textPrimary }}>{currentModel.size}</div>
                                            </div>
                                            <div style={{ textAlign: 'center' }}>
                                                <div style={{ fontSize: 9, color: colors.textDim, marginBottom: 2 }}>VRAM</div>
                                                <div style={{ fontFamily: typography.fontMono, fontSize: 12, color: colors.textPrimary }}>{currentModel.vram}</div>
                                            </div>
                                            <div style={{ textAlign: 'center' }}>
                                                <div style={{ fontSize: 9, color: colors.textDim, marginBottom: 2 }}>SPEED</div>
                                                <div style={{ fontFamily: typography.fontMono, fontSize: 12, color: currentModel.speed === 'Fast' ? colors.phosphorGreen : currentModel.speed === 'Medium' ? colors.signalAmber : colors.textMuted }}>{currentModel.speed}</div>
                                            </div>
                                            <div style={{ textAlign: 'center' }}>
                                                <div style={{ fontSize: 9, color: colors.textDim, marginBottom: 2 }}>QUALITY</div>
                                                <div style={{ fontFamily: typography.fontMono, fontSize: 12, color: currentModel.quality === 'Best' ? colors.phosphorGreen : colors.textPrimary }}>{currentModel.quality}</div>
                                            </div>
                                        </div>
                                    );
                                })()}

                                {/* Privacy Badge */}
                                <div style={{
                                    textAlign: 'center',
                                    fontSize: 10,
                                    color: colors.textDim,
                                    padding: `${spacing.xs}px 0`,
                                }}>
                                    🔒 100% private • No data sent anywhere • Runs on your GPU
                                </div>

                                {/* Delete Model Button - only show when model is loaded */}
                                {webllmState.status === 'ready' && (
                                    <button
                                        onClick={async () => {
                                            if (confirm('Delete cached model data? This will free up storage but the model will need to be re-downloaded.')) {
                                                await disableWebLLM(true);
                                                setToast({ message: 'Model data deleted', undo: () => {} });
                                            }
                                        }}
                                        style={{
                                            width: '100%',
                                            marginTop: spacing.sm,
                                            padding: `${spacing.xs}px ${spacing.md}px`,
                                            background: 'transparent',
                                            border: `1px solid ${colors.criticalRed}`,
                                            borderRadius: borderRadius.xs,
                                            color: colors.criticalRed,
                                            fontFamily: typography.fontMono,
                                            fontSize: 10,
                                            cursor: 'pointer',
                                            transition: transitions.fast,
                                        }}
                                    >
                                        🗑️ Delete Model Data
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Cloud Provider Settings - Hidden when Local AI is active */}
                        {webllmState.status !== 'ready' && webllmState.status !== 'downloading' && webllmState.status !== 'loading' && (
                            <>
                                {/* API Input - Secure Code-Block Style */}
                                <div style={s.inputSection}>
                                    <label style={s.inputLabel}>API_KEY</label>
                                    <div style={s.secureInput} className="secure-input">
                                        <span style={s.inputPrefix}>$</span>
                                        <input
                                            type="password"
                                            value={apiKey}
                                            onChange={(e) => setApiKey(e.target.value)}
                                            placeholder="sk-..."
                                            style={s.input}
                                        />
                                        <div style={s.inputIndicator}>
                                            <div style={getIndicatorStyle()} />
                                        </div>
                                    </div>
                                    <div style={s.inputMeta}>
                                        <span style={s.inputStatus}>
                                            {apiKey ? <MaskedApiKey apiKey={apiKey} /> : 'AWAITING_INPUT'}
                                        </span>
                                        <a href={PROVIDERS[cloudProvider].url} target="_blank" rel="noopener noreferrer" style={s.link}>
                                            GET KEY &#8599;
                                        </a>
                                    </div>
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
                            </>
                        )}
                    </div>
                )}

                {/* Auto-Pilot Panel */}
                {activeNav === 'autopilot' && (
                    <div style={s.panel}>
                        <div style={s.panelHeader}>
                            <h2 style={s.panelTitle}>Auto-Pilot</h2>
                            {!license?.paid && <span style={s.proLabel}>Pro feature</span>}
                        </div>

                        {/* 3-Stage Mode Selector */}
                        <div style={{ ...s.sliderContainer, borderColor: autoPilotSettings.mode === 'fly-mode' ? colors.accentCyan : autoPilotSettings.mode === 'auto-cleanup' ? colors.signalAmber : colors.borderIdle }}>
                            <div style={s.sliderTrack}>
                                <button
                                    className="mode-btn"
                                    style={{
                                        ...s.sliderStop,
                                        ...(autoPilotSettings.mode === 'manual' ? s.sliderStopActive : {}),
                                        borderColor: autoPilotSettings.mode === 'manual' ? colors.textMuted : colors.borderIdle,
                                        color: autoPilotSettings.mode === 'manual' ? colors.textPrimary : colors.textDim,
                                        background: autoPilotSettings.mode === 'manual' ? 'rgba(255,255,255,0.04)' : 'transparent'
                                    }}
                                    onClick={() => handleModeChange('manual')}
                                >
                                    <span style={s.stopIcon}>◼</span>
                                    <span style={s.stopLabel}>Manual</span>
                                    <span style={s.stopDesc}>AI suggests, you decide</span>
                                </button>
                                <button
                                    className="mode-btn"
                                    style={{
                                        ...s.sliderStop,
                                        ...(autoPilotSettings.mode === 'auto-cleanup' ? s.sliderStopActive : {}),
                                        borderColor: autoPilotSettings.mode === 'auto-cleanup' ? colors.signalAmber : colors.borderIdle,
                                        color: autoPilotSettings.mode === 'auto-cleanup' ? colors.signalAmber : colors.textDim,
                                        background: autoPilotSettings.mode === 'auto-cleanup' ? 'rgba(255, 170, 0, 0.08)' : 'transparent'
                                    }}
                                    onClick={() => handleModeChange('auto-cleanup')}
                                >
                                    <span style={s.stopIcon}>▲</span>
                                    <span style={s.stopLabel}>Auto-Close</span>
                                    <span style={s.stopDesc}>Closes duplicates only</span>
                                </button>
                                <button
                                    className="mode-btn"
                                    style={{
                                        ...s.sliderStop,
                                        ...(autoPilotSettings.mode === 'fly-mode' ? s.sliderStopActive : {}),
                                        borderColor: autoPilotSettings.mode === 'fly-mode' ? colors.accentCyan : colors.borderIdle,
                                        color: autoPilotSettings.mode === 'fly-mode' ? colors.accentCyan : colors.textDim,
                                        background: autoPilotSettings.mode === 'fly-mode' ? 'rgba(0, 212, 255, 0.08)' : 'transparent'
                                    }}
                                    onClick={() => handleModeChange('fly-mode')}
                                >
                                    <span style={s.stopIcon}>◆</span>
                                    <span style={s.stopLabel}>Fly Mode</span>
                                    <span style={s.stopDesc}>Auto-group & cleanup</span>
                                </button>
                            </div>

                            {autoPilotSettings.mode === 'fly-mode' && (
                                <div style={s.warningTicker}>
                                    AI-powered automation · New tabs auto-grouped, duplicates closed
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

                        {/* API Usage Stats */}
                        <div style={s.usageSection}>
                            <div style={s.usageHeader}>
                                <span style={s.usageTitle}>API Usage</span>
                                <div style={s.usageActions}>
                                    {apiUsage?.configuredProvider === 'nano' ? (
                                        <span style={{ ...s.usageWarning, background: 'rgba(0, 255, 136, 0.1)', color: colors.phosphorGreen }}>Unlimited</span>
                                    ) : apiUsage?.nearLimit ? (
                                        <span style={s.usageWarning}>Approaching limit</span>
                                    ) : apiUsage?.configuredProvider && apiUsage.configuredProvider !== 'none' ? (
                                        <span style={{ ...s.usageWarning, background: 'rgba(0, 212, 255, 0.1)', color: colors.accentCyan }}>
                                            {apiUsage.configuredProvider.toUpperCase()}
                                        </span>
                                    ) : null}
                                    {apiUsage?.configuredProvider && apiUsage.configuredProvider !== 'none' && apiUsage.configuredProvider !== 'nano' && (
                                        <button style={s.limitBtn} onClick={() => setShowLimitSettings(!showLimitSettings)}>
                                            {showLimitSettings ? 'Hide' : 'Configure'}
                                        </button>
                                    )}
                                </div>
                            </div>

                            {apiUsage?.configuredProvider === 'nano' ? (
                                <div style={s.usageNote}>
                                    Using Gemini Nano (local AI) - no API costs, unlimited usage.
                                </div>
                            ) : apiUsage?.configuredProvider && apiUsage.configuredProvider !== 'none' ? (
                                <>
                                    <div style={s.usageGrid}>
                                        <div style={s.usageItem}>
                                            <span style={s.usageValue}>{apiUsage.hourCalls || 0}</span>
                                            <span style={s.usageLabel}>/{customLimits.maxPerHour} hr</span>
                                        </div>
                                        <div style={s.usageItem}>
                                            <span style={s.usageValue}>{apiUsage.todayCalls || 0}</span>
                                            <span style={s.usageLabel}>/{customLimits.maxPerDay} day</span>
                                        </div>
                                        <div style={s.usageItem}>
                                            <span style={s.usageValue}>{apiUsage.totalCalls || 0}</span>
                                            <span style={s.usageLabel}>total</span>
                                        </div>
                                        <div style={s.usageItem}>
                                            <span style={s.usageValue}>${((apiUsage.estimatedCost || 0) / 100).toFixed(2)}</span>
                                            <span style={s.usageLabel}>est. cost</span>
                                        </div>
                                    </div>

                                    {/* Rate Limit Settings */}
                                    {showLimitSettings && (
                                        <div style={s.limitSettings}>
                                            <div style={s.limitRow}>
                                                <label style={s.limitLabel}>Calls per hour</label>
                                                <input
                                                    type="number"
                                                    min="5"
                                                    max="200"
                                                    value={customLimits.maxPerHour}
                                                    onChange={(e) => setCustomLimits(prev => ({ ...prev, maxPerHour: parseInt(e.target.value) || 30 }))}
                                                    style={s.limitInput}
                                                />
                                            </div>
                                            <div style={s.limitRow}>
                                                <label style={s.limitLabel}>Calls per day</label>
                                                <input
                                                    type="number"
                                                    min="10"
                                                    max="1000"
                                                    value={customLimits.maxPerDay}
                                                    onChange={(e) => setCustomLimits(prev => ({ ...prev, maxPerDay: parseInt(e.target.value) || 100 }))}
                                                    style={s.limitInput}
                                                />
                                            </div>
                                            <div style={s.limitActions}>
                                                <button style={s.limitSaveBtn} onClick={() => saveRateLimits(customLimits)}>
                                                    Save Limits
                                                </button>
                                                <button style={s.limitResetBtn} onClick={resetUsageStats}>
                                                    Reset Stats
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    <div style={s.usageNote}>
                                        Fly mode uses AI to group tabs. Set limits to control API costs.
                                    </div>
                                </>
                            ) : (
                                <div style={s.usageNote}>
                                    Configure an AI provider above to enable smart features.
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* License Panel */}
                {activeNav === 'license' && (
                    <div style={s.panel}>
                        <div style={s.panelHeader}>
                            <h2 style={s.panelTitle}>License</h2>
                        </div>

                        {license?.paid ? (
                            <>
                                {/* Pro Active Status */}
                                <div style={s.licenseActive}>
                                    <div style={s.licenseIcon}>&#9733;</div>
                                    <div style={s.licenseTitle}>PRO_ACTIVE</div>
                                    <div style={s.licenseDesc}>Unlimited access to all features</div>
                                    {license.email && (
                                        <div style={s.licenseEmail}>{license.email}</div>
                                    )}
                                </div>

                                {/* Device Management */}
                                <div style={s.deviceSection}>
                                    <div style={s.deviceHeader}>
                                        <span style={s.deviceLabel}>DEVICES</span>
                                        <span style={s.deviceCount}>
                                            {deviceInfo ? `${deviceInfo.devices.length}/${deviceInfo.maxDevices}` : '...'}
                                        </span>
                                    </div>
                                    <button
                                        style={s.deviceToggle}
                                        onClick={() => setShowDevices(!showDevices)}
                                    >
                                        {showDevices ? 'HIDE_DEVICES' : 'MANAGE_DEVICES'}
                                    </button>

                                    {showDevices && deviceInfo && (
                                        <div style={s.deviceList}>
                                            {deviceInfo.devices.map((device) => (
                                                <div key={device.deviceId} style={s.deviceItem}>
                                                    <div style={s.deviceInfo}>
                                                        <span style={s.deviceId}>
                                                            {device.current && <span style={s.currentBadge}>THIS</span>}
                                                            {device.deviceId.slice(0, 12)}...
                                                        </span>
                                                        <span style={s.deviceDate}>
                                                            Last: {new Date(device.lastActive).toLocaleDateString()}
                                                        </span>
                                                    </div>
                                                    {!device.current && (
                                                        <button
                                                            style={s.deviceRemove}
                                                            onClick={() => removeDevice(device.deviceId)}
                                                        >
                                                            &#10005;
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </>
                        ) : (
                            <div style={s.licenseCard}>
                                {/* 7-Day Trial Banner */}
                                {trialInfo && trialInfo.daysRemaining > 0 && (
                                    <div style={s.trialBanner}>
                                        <div style={s.trialDays}>{trialInfo.daysRemaining}</div>
                                        <div style={s.trialText}>
                                            <div style={s.trialLabel}>DAYS_REMAINING</div>
                                            <div style={s.trialDesc}>Full access trial</div>
                                        </div>
                                        <div style={s.trialProgress}>
                                            <div style={{ ...s.trialProgressFill, width: `${(trialInfo.daysRemaining / 7) * 100}%` }} />
                                        </div>
                                    </div>
                                )}

                                {trialInfo && trialInfo.daysRemaining === 0 && (
                                    <div style={s.trialExpired}>
                                        Trial ended · Upgrade for full access
                                    </div>
                                )}

                                <div style={s.licensePrice}>
                                    AUD $2 <span style={s.licensePriceNote}>/MONTH</span>
                                </div>
                                <ul style={s.featureList}>
                                    <li style={s.featureItem}><span style={s.checkMark}>&#10003;</span> Local AI (100% private)</li>
                                    <li style={s.featureItem}><span style={s.checkMark}>&#10003;</span> Unlimited AI scans</li>
                                    <li style={s.featureItem}><span style={s.checkMark}>&#10003;</span> Auto Pilot mode</li>
                                    <li style={s.featureItem}><span style={s.checkMark}>&#10003;</span> Smart tab grouping</li>
                                    <li style={s.featureItem}><span style={s.checkMark}>&#10003;</span> Up to 3 devices</li>
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
        gap: spacing.lg,
        marginBottom: spacing.xxxl,
        paddingBottom: spacing.xxl,
        borderBottom: `1px solid ${colors.borderIdle}`,
    },
    brandLogoWrap: {
        flexShrink: 0,
    },
    brandText: {},
    brandName: {
        fontFamily: typography.fontMono,
        fontSize: typography.sizeLg,
        fontWeight: typography.bold,
        color: colors.textPrimary,
        letterSpacing: '0.15em',
    },
    brandTagline: {
        fontFamily: typography.fontMono,
        fontSize: typography.sizeXs,
        color: colors.textDim,
        letterSpacing: '0.05em',
        fontWeight: typography.normal,
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
        justifyContent: 'space-between',
        padding: `${spacing.md}px ${spacing.lg}px`,
        background: 'transparent',
        border: 'none',
        borderLeft: '3px solid transparent',
        color: colors.textMuted,
        fontFamily: typography.fontMono,
        fontSize: typography.sizeSm,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        cursor: 'pointer',
        textAlign: 'left',
        transition: `all ${transitions.normal}`,
    },
    navItemActive: {
        background: 'rgba(0, 212, 255, 0.05)',
        color: colors.accentCyan,
        borderLeftColor: colors.accentCyan,
    },
    navStatus: {
        color: colors.accentCyan,
        fontSize: 10,
    },
    navBadge: {
        padding: '2px 6px',
        fontSize: 9,
        fontWeight: typography.bold,
        color: colors.voidBlack,
    },
    systemStatus: {
        marginTop: 'auto',
        paddingTop: spacing.lg,
    },
    statusBar: {
        height: 2,
        background: colors.borderIdle,
        marginBottom: spacing.md,
        overflow: 'hidden',
    },
    statusBarFill: {
        height: '100%',
        width: '30%',
        background: colors.phosphorGreen,
        boxShadow: `0 0 6px ${colors.phosphorGreen}`,
    },
    statusGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: spacing.sm,
    },
    statusItem: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
    },
    statusLabel: {
        fontFamily: typography.fontMono,
        fontSize: 8,
        color: colors.textDim,
        letterSpacing: '0.1em',
    },
    statusValue: {
        fontFamily: typography.fontMono,
        fontSize: typography.sizeSm,
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
    proLabel: {
        fontFamily: typography.fontFamily,
        fontSize: typography.sizeXs,
        color: colors.textDim,
        fontWeight: typography.normal,
    },
    // Local AI Section Styles
    localAiSection: {
        background: colors.panelGrey,
        border: `1px solid ${colors.borderIdle}`,
        padding: spacing.xl,
        marginBottom: spacing.xl,
    },
    localAiHeader: {
        marginBottom: spacing.lg,
    },
    localAiTitleRow: {
        display: 'flex',
        alignItems: 'center',
        gap: spacing.sm,
        marginBottom: spacing.xs,
    },
    localAiTitle: {
        fontFamily: typography.fontMono,
        fontSize: typography.sizeSm,
        fontWeight: typography.bold,
        color: colors.textPrimary,
        letterSpacing: '0.1em',
    },
    localAiBadge: {
        padding: '2px 6px',
        background: colors.phosphorGreen,
        color: colors.voidBlack,
        fontFamily: typography.fontMono,
        fontSize: 9,
        fontWeight: typography.bold,
        letterSpacing: '0.05em',
    },
    localAiDesc: {
        fontFamily: typography.fontFamily,
        fontSize: typography.sizeXs,
        color: colors.textDim,
    },
    localAiUnsupported: {
        display: 'flex',
        alignItems: 'flex-start',
        gap: spacing.md,
        padding: spacing.md,
        background: 'rgba(255, 170, 0, 0.05)',
        border: `1px solid rgba(255, 170, 0, 0.2)`,
    },
    unsupportedIcon: {
        color: colors.signalAmber,
        fontSize: 16,
    },
    unsupportedTitle: {
        fontFamily: typography.fontMono,
        fontSize: typography.sizeSm,
        color: colors.signalAmber,
        marginBottom: 2,
    },
    unsupportedDesc: {
        fontSize: typography.sizeXs,
        color: colors.textDim,
    },
    localAiReady: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: spacing.md,
        background: colors.successBg,
        border: `1px solid ${colors.phosphorGreen}`,
    },
    readyIndicator: {
        display: 'flex',
        alignItems: 'center',
        gap: spacing.sm,
    },
    readyDot: {
        color: colors.phosphorGreen,
        fontSize: 12,
        animation: 'pulse 2s ease-in-out infinite',
    },
    readyText: {
        fontFamily: typography.fontMono,
        fontSize: typography.sizeXs,
        color: colors.phosphorGreen,
        letterSpacing: '0.1em',
    },
    modelInfo: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
    },
    modelName: {
        fontFamily: typography.fontMono,
        fontSize: typography.sizeSm,
        color: colors.textPrimary,
    },
    modelSize: {
        fontSize: typography.sizeXs,
        color: colors.textDim,
    },
    disableBtn: {
        padding: `${spacing.sm}px ${spacing.md}px`,
        background: 'transparent',
        border: `1px solid ${colors.borderIdle}`,
        color: colors.textDim,
        fontFamily: typography.fontMono,
        fontSize: typography.sizeXs,
        cursor: 'pointer',
    },
    downloadProgress: {
        gridColumn: '1 / -1',
        marginTop: spacing.md,
        padding: spacing.md,
        background: colors.voidBlack,
        border: `1px solid ${colors.accentCyan}`,
    },
    localAiProgress: {
        padding: spacing.md,
        background: colors.voidBlack,
        border: `1px solid ${colors.accentCyan}`,
    },
    progressHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacing.sm,
    },
    progressLabel: {
        fontFamily: typography.fontMono,
        fontSize: typography.sizeXs,
        color: colors.accentCyan,
        letterSpacing: '0.1em',
    },
    progressPercent: {
        fontFamily: typography.fontMono,
        fontSize: typography.sizeSm,
        color: colors.accentCyan,
        fontWeight: typography.bold,
    },
    progressBarBg: {
        height: 4,
        background: colors.borderIdle,
        marginBottom: spacing.sm,
        overflow: 'hidden',
    },
    progressBarFill: {
        height: '100%',
        background: colors.accentCyan,
        transition: 'width 0.3s ease',
        boxShadow: `0 0 8px ${colors.accentCyan}`,
    },
    progressMessage: {
        display: 'block',
        fontFamily: typography.fontFamily,
        fontSize: typography.sizeXs,
        color: colors.textMuted,
        marginBottom: spacing.xs,
    },
    progressBytes: {
        display: 'block',
        fontFamily: typography.fontMono,
        fontSize: 10,
        color: colors.textDim,
    },
    localAiError: {
        display: 'flex',
        alignItems: 'flex-start',
        gap: spacing.md,
        padding: spacing.md,
        background: 'rgba(255, 68, 68, 0.05)',
        border: `1px solid rgba(255, 68, 68, 0.2)`,
    },
    errorIcon: {
        color: colors.criticalRed,
        fontSize: 16,
        fontWeight: typography.bold,
    },
    errorTitle: {
        fontFamily: typography.fontMono,
        fontSize: typography.sizeSm,
        color: colors.criticalRed,
        marginBottom: 2,
    },
    errorDesc: {
        fontSize: typography.sizeXs,
        color: colors.textDim,
        maxWidth: 300,
    },
    retryBtn: {
        marginLeft: 'auto',
        padding: `${spacing.sm}px ${spacing.md}px`,
        background: 'transparent',
        border: `1px solid ${colors.criticalRed}`,
        color: colors.criticalRed,
        fontFamily: typography.fontMono,
        fontSize: typography.sizeXs,
        cursor: 'pointer',
    },
    localAiEnable: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: spacing.md,
        background: colors.voidBlack,
        border: `1px solid ${colors.borderIdle}`,
    },
    enableInfo: {},
    enableTitle: {
        fontFamily: typography.fontMono,
        fontSize: typography.sizeSm,
        color: colors.textPrimary,
        marginBottom: 2,
    },
    enableDesc: {
        fontSize: typography.sizeXs,
        color: colors.textDim,
        maxWidth: 280,
    },
    enableBtn: {
        padding: `${spacing.md}px ${spacing.xl}px`,
        background: colors.phosphorGreen,
        border: 'none',
        color: colors.voidBlack,
        fontFamily: typography.fontMono,
        fontSize: typography.sizeXs,
        fontWeight: typography.bold,
        letterSpacing: '0.05em',
        cursor: 'pointer',
        transition: `opacity ${transitions.fast}`,
    },
    localAiChecking: {
        display: 'flex',
        alignItems: 'center',
        gap: spacing.sm,
        padding: spacing.md,
        background: colors.voidBlack,
    },
    checkingSpinner: {
        color: colors.textDim,
        animation: 'spin 1s linear infinite',
    },
    checkingText: {
        fontFamily: typography.fontFamily,
        fontSize: typography.sizeXs,
        color: colors.textDim,
    },
    sectionDivider: {
        display: 'flex',
        alignItems: 'center',
        gap: spacing.md,
        marginBottom: spacing.xl,
    },
    dividerText: {
        fontFamily: typography.fontMono,
        fontSize: typography.sizeXs,
        color: colors.textDim,
        letterSpacing: '0.1em',
        whiteSpace: 'nowrap',
    },
    providerGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: spacing.lg,
        marginBottom: spacing.xxl,
    },
    providerCard: {
        position: 'relative',
        aspectRatio: '4 / 5',
        padding: spacing.xl,
        background: colors.panelGrey,
        border: `1px solid ${colors.borderIdle}`,
        textAlign: 'center',
        cursor: 'pointer',
        transition: `all ${transitions.normal}`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.md,
    },
    providerCardActive: {
        background: colors.successBg,
    },
    checkIcon: {
        position: 'absolute',
        top: spacing.md,
        right: spacing.md,
        color: colors.phosphorGreen,
        fontSize: 14,
        textShadow: `0 0 6px ${colors.phosphorGreen}`,
    },
    providerLogoWrap: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 64,
        height: 64,
        transition: `transform ${transitions.normal}`,
    },
    providerName: {
        fontFamily: typography.fontMono,
        fontSize: typography.sizeSm,
        fontWeight: typography.bold,
        color: colors.textPrimary,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
    },
    providerDesc: {
        fontFamily: typography.fontFamily,
        fontSize: typography.sizeXs,
        color: colors.textDim,
        fontWeight: typography.normal,
    },
    providerBadge: {
        display: 'inline-block',
        padding: '3px 8px',
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
        letterSpacing: '0.1em',
        marginBottom: spacing.sm,
        textTransform: 'uppercase',
    },
    secureInput: {
        display: 'flex',
        alignItems: 'center',
        gap: spacing.sm,
        padding: `${spacing.md}px ${spacing.lg}px`,
        background: colors.voidBlack,
        border: `1px solid ${colors.borderIdle}`,
        fontFamily: typography.fontMono,
        transition: `all ${transitions.fast}`,
    },
    inputPrefix: {
        color: colors.phosphorGreen,
        fontSize: typography.sizeSm,
        fontWeight: typography.bold,
        opacity: 0.6,
    },
    input: {
        flex: 1,
        background: 'transparent',
        border: 'none',
        outline: 'none',
        color: colors.textPrimary,
        fontFamily: typography.fontMono,
        fontSize: typography.sizeBase,
        letterSpacing: '0.02em',
    },
    inputIndicator: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 24,
        height: 24,
    },
    inputMeta: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: spacing.sm,
    },
    inputStatus: {
        fontFamily: typography.fontMono,
        fontSize: typography.sizeXs,
        color: colors.textDim,
        letterSpacing: '0.05em',
    },
    link: {
        fontFamily: typography.fontMono,
        fontSize: typography.sizeXs,
        color: colors.phosphorGreen,
        textDecoration: 'none',
        letterSpacing: '0.05em',
        opacity: 0.8,
        transition: `opacity ${transitions.fast}`,
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
        background: 'rgba(255,255,255,0.04)',
        transform: 'scale(1.02)',
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
        padding: `${spacing.sm}px ${spacing.md}px`,
        background: 'rgba(0, 212, 255, 0.05)',
        border: `1px solid rgba(0, 212, 255, 0.2)`,
        borderRadius: borderRadius.sm,
        color: colors.textSecondary,
        fontFamily: typography.fontFamily,
        fontSize: typography.sizeXs,
        textAlign: 'center',
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
    usageSection: {
        marginTop: spacing.xxl,
        padding: spacing.lg,
        background: colors.panelGrey,
        border: `1px solid ${colors.borderIdle}`,
        borderRadius: borderRadius.sm,
    },
    usageHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacing.md,
    },
    usageTitle: {
        fontFamily: typography.fontMono,
        fontSize: typography.sizeSm,
        color: colors.textPrimary,
        letterSpacing: '0.05em',
    },
    usageWarning: {
        fontFamily: typography.fontMono,
        fontSize: 9,
        color: colors.signalAmber,
        background: 'rgba(255, 170, 0, 0.1)',
        padding: '2px 6px',
        borderRadius: 2,
    },
    usageGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: spacing.sm,
    },
    usageItem: {
        textAlign: 'center',
        padding: spacing.sm,
        background: colors.voidBlack,
        borderRadius: borderRadius.sm,
    },
    usageValue: {
        display: 'block',
        fontFamily: typography.fontMono,
        fontSize: typography.sizeLg,
        fontWeight: typography.bold,
        color: colors.textPrimary,
    },
    usageLabel: {
        display: 'block',
        fontFamily: typography.fontMono,
        fontSize: 9,
        color: colors.textDim,
        marginTop: 2,
    },
    usageNote: {
        marginTop: spacing.md,
        fontSize: typography.sizeXs,
        color: colors.textDim,
        textAlign: 'center',
    },
    usageActions: {
        display: 'flex',
        alignItems: 'center',
        gap: spacing.sm,
    },
    limitBtn: {
        padding: `${spacing.xs}px ${spacing.sm}px`,
        background: 'transparent',
        border: `1px solid ${colors.borderIdle}`,
        borderRadius: borderRadius.sm,
        color: colors.textDim,
        fontFamily: typography.fontMono,
        fontSize: 9,
        cursor: 'pointer',
        transition: `all ${transitions.fast}`,
    },
    limitSettings: {
        marginTop: spacing.md,
        padding: spacing.md,
        background: colors.voidBlack,
        borderRadius: borderRadius.sm,
        border: `1px solid ${colors.borderIdle}`,
    },
    limitRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacing.sm,
    },
    limitLabel: {
        fontFamily: typography.fontMono,
        fontSize: typography.sizeXs,
        color: colors.textSecondary,
    },
    limitInput: {
        width: 80,
        padding: `${spacing.xs}px ${spacing.sm}px`,
        background: colors.panelGrey,
        border: `1px solid ${colors.borderIdle}`,
        borderRadius: borderRadius.sm,
        color: colors.textPrimary,
        fontFamily: typography.fontMono,
        fontSize: typography.sizeSm,
        textAlign: 'right',
        outline: 'none',
    },
    limitActions: {
        display: 'flex',
        gap: spacing.sm,
        marginTop: spacing.md,
    },
    limitSaveBtn: {
        flex: 1,
        padding: `${spacing.sm}px ${spacing.md}px`,
        background: colors.phosphorGreen,
        border: 'none',
        borderRadius: borderRadius.sm,
        color: colors.voidBlack,
        fontFamily: typography.fontMono,
        fontSize: typography.sizeXs,
        fontWeight: typography.bold,
        cursor: 'pointer',
    },
    limitResetBtn: {
        padding: `${spacing.sm}px ${spacing.md}px`,
        background: 'transparent',
        border: `1px solid ${colors.borderIdle}`,
        borderRadius: borderRadius.sm,
        color: colors.textMuted,
        fontFamily: typography.fontMono,
        fontSize: typography.sizeXs,
        cursor: 'pointer',
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
    // Trial Banner Styles
    trialBanner: {
        display: 'flex',
        alignItems: 'center',
        gap: spacing.lg,
        padding: spacing.lg,
        background: colors.successBg,
        border: `1px solid ${colors.phosphorGreen}`,
        marginBottom: spacing.xl,
    },
    trialDays: {
        fontFamily: typography.fontMono,
        fontSize: 32,
        fontWeight: typography.bold,
        color: colors.phosphorGreen,
        textShadow: `0 0 10px ${colors.phosphorGreen}`,
        minWidth: 50,
        textAlign: 'center',
    },
    trialText: {
        flex: 1,
    },
    trialLabel: {
        fontFamily: typography.fontMono,
        fontSize: typography.sizeSm,
        color: colors.phosphorGreen,
        letterSpacing: '0.1em',
    },
    trialDesc: {
        fontSize: typography.sizeXs,
        color: colors.textMuted,
        marginTop: 2,
    },
    trialProgress: {
        width: 60,
        height: 4,
        background: colors.borderIdle,
        overflow: 'hidden',
    },
    trialProgressFill: {
        height: '100%',
        background: colors.phosphorGreen,
        transition: 'width 0.3s ease',
    },
    trialExpired: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: `${spacing.md}px ${spacing.lg}px`,
        background: 'rgba(255, 170, 0, 0.05)',
        border: `1px solid rgba(255, 170, 0, 0.2)`,
        borderRadius: borderRadius.sm,
        marginBottom: spacing.xl,
        fontFamily: typography.fontFamily,
        fontSize: typography.sizeXs,
        color: colors.textSecondary,
    },
    // Device Management Styles
    licenseEmail: {
        fontFamily: typography.fontMono,
        fontSize: typography.sizeXs,
        color: colors.textDim,
        marginTop: spacing.md,
        letterSpacing: '0.05em',
    },
    deviceSection: {
        padding: spacing.lg,
        background: colors.panelGrey,
        border: `1px solid ${colors.borderIdle}`,
        marginBottom: spacing.xl,
    },
    deviceHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacing.md,
    },
    deviceLabel: {
        fontFamily: typography.fontMono,
        fontSize: typography.sizeXs,
        color: colors.textDim,
        letterSpacing: '0.1em',
    },
    deviceCount: {
        fontFamily: typography.fontMono,
        fontSize: typography.sizeSm,
        color: colors.phosphorGreen,
    },
    deviceToggle: {
        width: '100%',
        padding: spacing.sm,
        background: 'transparent',
        border: `1px solid ${colors.borderIdle}`,
        color: colors.textMuted,
        fontFamily: typography.fontMono,
        fontSize: typography.sizeXs,
        letterSpacing: '0.05em',
        cursor: 'pointer',
    },
    deviceList: {
        marginTop: spacing.md,
        display: 'flex',
        flexDirection: 'column',
        gap: spacing.sm,
    },
    deviceItem: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: spacing.sm,
        background: colors.voidBlack,
        border: `1px solid ${colors.borderIdle}`,
    },
    deviceInfo: {
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
    },
    deviceId: {
        fontFamily: typography.fontMono,
        fontSize: typography.sizeXs,
        color: colors.textPrimary,
        display: 'flex',
        alignItems: 'center',
        gap: spacing.sm,
    },
    currentBadge: {
        padding: '2px 4px',
        background: colors.phosphorGreen,
        color: colors.voidBlack,
        fontSize: 8,
        fontWeight: typography.bold,
        letterSpacing: '0.05em',
    },
    deviceDate: {
        fontSize: typography.sizeXs,
        color: colors.textDim,
    },
    deviceRemove: {
        width: 24,
        height: 24,
        background: 'transparent',
        border: `1px solid ${colors.criticalRed}`,
        color: colors.criticalRed,
        fontSize: 12,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
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

// Inject CSS with premium micro-interactions
const styleSheet = document.createElement('style');
styleSheet.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Inter:wght@300;400;500;600&display=swap');

    /* Animations */
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    @keyframes ticker { from { transform: translateX(0); } to { transform: translateX(-50%); } }
    @keyframes heartbeat { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
    @keyframes heartbeat-bar { 0% { transform: translateX(-100%); } 100% { transform: translateX(400%); } }
    @keyframes selection-flash { 0% { background: rgba(57, 255, 20, 0.2); } 100% { background: rgba(57, 255, 20, 0.05); } }
    @keyframes input-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(57, 255, 20, 0); } 50% { box-shadow: 0 0 0 3px rgba(57, 255, 20, 0.2); } }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: ${colors.voidBlack}; }

    /* Heartbeat animation for status indicators */
    .heartbeat { animation: heartbeat 2s ease-in-out infinite; }
    .heartbeat-bar { animation: heartbeat-bar 3s ease-in-out infinite; }

    /* Provider card hover lift */
    .provider-card:hover:not(.active) {
        transform: translateY(-2px);
        box-shadow: ${shadows.cardHover};
        border-color: ${colors.borderHover} !important;
    }
    .provider-card:active {
        transform: translateY(0);
    }
    .provider-card.active {
        animation: selection-flash 0.3s ease-out;
    }

    /* Mode button interactions */
    .mode-btn {
        transition: all 0.2s ease;
    }
    .mode-btn:hover {
        transform: translateY(-2px);
    }
    .mode-btn:active {
        transform: translateY(0) scale(0.98);
    }

    /* Setting row hover */
    .setting-row:hover {
        background: rgba(255, 255, 255, 0.02);
    }

    /* Nav item hover */
    .nav-item:hover:not(:disabled) {
        background: rgba(255, 255, 255, 0.02);
        color: ${colors.textSecondary};
    }

    /* Secure input focus pulse */
    .secure-input:focus-within {
        border-color: ${colors.phosphorGreen} !important;
        animation: input-pulse 1.5s ease-in-out infinite;
    }

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

    a:hover {
        opacity: 1 !important;
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

    /* Typography refinement */
    h1, h2, h3, h4, h5, h6 {
        font-family: ${typography.fontMono};
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }
    p, span, label {
        font-family: ${typography.fontFamily};
        font-weight: 300;
    }

    @media (max-width: 768px) {
        .page { grid-template-columns: 1fr !important; }
        .sidebar { display: none; }
        .scanlines { left: 0 !important; }
    }
`;
document.head.appendChild(styleSheet);

const container = document.getElementById('root');
if (container) createRoot(container).render(<OptionsPage />);
