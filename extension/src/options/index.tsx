import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { colors, spacing, typography, borderRadius, shadows, transitions, scanlineOverlay } from '../shared/theme';
import * as webllm from '@mlc-ai/web-llm';

// WebLLM Model ID (default) - Using smaller model for better compatibility
const WEBLLM_MODEL_ID = 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC';

// Available Local AI Models
const LOCAL_AI_MODELS = [
    { id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', name: 'Qwen 1.5B', size: '1GB', vram: '1.8GB', speed: 'Fast', quality: 'Good', recommended: true },
    { id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC', name: 'Llama 3B', size: '2GB', vram: '3GB', speed: 'Medium', quality: 'Best', recommended: false },
];

// Global engine reference (persists across re-renders)
let webllmEngine: webllm.MLCEngineInterface | null = null;

// Cleanup function to free GPU memory
const cleanupWebLLM = async () => {
    if (webllmEngine) {
        try {
            console.log('[WebLLM Options] Cleaning up engine...');
            await webllmEngine.unload();
        } catch (e) {
            console.warn('[WebLLM Options] Cleanup error:', e);
        }
        webllmEngine = null;
    }
};

// Types
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


// Local AI info
const LOCAL_AI_INFO = {
    name: 'LOCAL AI',
    desc: 'Llama 3.2',
    color: '#00ff88',
    badge: 'PRIVATE',
    size: '~700MB',
};

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
    const [activeProvider, setActiveProvider] = useState('webllm');
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

        // Cleanup WebLLM when options page closes to free GPU memory
        const handleUnload = () => {
            cleanupWebLLM();
        };
        window.addEventListener('beforeunload', handleUnload);
        window.addEventListener('unload', handleUnload);

        return () => {
            window.removeEventListener('beforeunload', handleUnload);
            window.removeEventListener('unload', handleUnload);
            cleanupWebLLM();
        };
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

    // Auto-save auto-pilot settings
    useEffect(() => {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        setSyncStatus('syncing');
        saveTimeoutRef.current = setTimeout(async () => {
            await saveAutoPilotSettings();
        }, 500);
    }, [autoPilotSettings]);

    const loadConfig = async () => {
        // Local AI is the only provider now
        setActiveProvider('webllm');
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
            let capabilities = webgpuCapabilities;
            if (!capabilities) {
                capabilities = await checkWebGPUDirectly();
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
            } else if (capabilities?.webgpuSupported && !webllmEngine) {
                // Show ready state - don't auto-download, let user click
                setWebllmState({
                    status: 'not_initialized',
                    progress: 0,
                    message: 'Click to download AI model',
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

            // Check for GPU memory errors
            if (errorMsg.includes('OUTOFMEMORY') || errorMsg.includes('E_OUTOFMEMORY') ||
                errorMsg.includes('memory') || errorMsg.includes('OOM') ||
                errorMsg.includes('D3D12')) {
                errorMsg = 'Not enough GPU memory. Try the smaller Qwen 1.5B model.';
            } else if (errorMsg.includes('WebGPU') || errorMsg.includes('requestDevice')) {
                errorMsg = 'GPU error. Try closing other apps or use a smaller model.';
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
                setApiUsage({
                    ...response.data,
                    configuredProvider: 'webllm'
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
                            <h2 style={s.panelTitle}>Local AI</h2>
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: spacing.sm,
                                fontSize: 11,
                                fontFamily: typography.fontMono,
                            }}>
                                <span style={{
                                    color: webllmState.status === 'ready' ? colors.phosphorGreen
                                        : (webllmState.status === 'downloading' || webllmState.status === 'loading') ? colors.warning
                                        : colors.textDim,
                                }}>
                                    {webllmState.status === 'ready' ? '● READY'
                                        : webllmState.status === 'downloading' ? `◐ ${webllmState.progress}%`
                                        : webllmState.status === 'loading' ? '◐ LOADING'
                                        : webllmState.status === 'error' ? '● ERROR'
                                        : '○ WAITING'}
                                </span>
                            </div>
                        </div>

                        {/* Status Card */}
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: spacing.md,
                            padding: spacing.md,
                            background: colors.surfaceLight,
                            border: `1px solid ${webllmState.status === 'ready' ? colors.phosphorGreen
                                : webllmState.status === 'error' ? colors.criticalRed
                                : colors.borderIdle}`,
                            borderRadius: borderRadius.sm,
                            marginBottom: spacing.md,
                        }}>
                            <LocalAILogo
                                size={40}
                                active={webllmState.status === 'ready'}
                                loading={webllmState.status === 'downloading' || webllmState.status === 'loading'}
                                progress={webllmState.progress}
                            />
                            <div style={{ flex: 1 }}>
                                <div style={{
                                    fontFamily: typography.fontMono,
                                    fontSize: 13,
                                    color: webllmState.status === 'error' ? colors.criticalRed : colors.textPrimary,
                                    marginBottom: 4,
                                }}>
                                    {webllmState.status === 'ready' ? 'AI Ready'
                                        : webllmState.status === 'downloading' ? 'Downloading...'
                                        : webllmState.status === 'loading' ? 'Initializing...'
                                        : webllmState.status === 'error' ? 'Error'
                                        : 'Not Downloaded'}
                                </div>
                                <div style={{ fontSize: 11, color: webllmState.status === 'error' ? colors.criticalRed : colors.textMuted }}>
                                    {webllmState.status === 'ready' ? 'Runs 100% on your device'
                                        : webllmState.status === 'error' ? webllmState.message
                                        : webllmState.status === 'not_initialized' ? 'Click Download to get started'
                                        : webllmState.message}
                                </div>
                            </div>
                            {/* Download/Retry Button */}
                            {(webllmState.status === 'not_initialized' || webllmState.status === 'error') && (
                                <button
                                    onClick={() => enableWebLLM()}
                                    disabled={webllmLoading}
                                    style={{
                                        padding: '8px 16px',
                                        background: colors.phosphorGreen,
                                        border: 'none',
                                        borderRadius: borderRadius.xs,
                                        fontSize: 11,
                                        fontFamily: typography.fontMono,
                                        color: colors.voidBlack,
                                        cursor: 'pointer',
                                        fontWeight: 600,
                                    }}
                                >
                                    {webllmState.status === 'error' ? 'Retry' : 'Download'}
                                </button>
                            )}
                            {webllmState.status === 'ready' && (
                                <span style={{
                                    padding: '4px 8px',
                                    background: 'rgba(0, 255, 136, 0.1)',
                                    border: `1px solid ${colors.phosphorGreen}`,
                                    borderRadius: borderRadius.xs,
                                    fontSize: 9,
                                    fontFamily: typography.fontMono,
                                    color: colors.phosphorGreen,
                                    letterSpacing: '0.1em',
                                }}>READY</span>
                            )}
                        </div>

                        {/* Download Progress Bar */}
                        {(webllmState.status === 'downloading' || webllmState.status === 'loading') && (
                            <div style={{ marginBottom: spacing.md }}>
                                <div style={s.progressBarBg}>
                                    <div style={{ ...s.progressBarFill, width: `${webllmState.progress}%` }} />
                                </div>
                            </div>
                        )}

                        {/* Model Settings */}
                        {webgpuCapabilities?.webgpuSupported && (
                            <div>
                                {/* Model Selector */}
                                <div style={{ marginBottom: spacing.md }}>
                                    <label style={{
                                        display: 'block',
                                        fontFamily: typography.fontMono,
                                        fontSize: 10,
                                        color: colors.textMuted,
                                        marginBottom: spacing.xs,
                                        letterSpacing: '0.1em',
                                    }}>MODEL</label>
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
                                        {LOCAL_AI_MODELS.map(m => (
                                            <option key={m.id} value={m.id}>
                                                {m.name} • {m.size} {m.recommended ? '(Recommended)' : ''}
                                            </option>
                                        ))}
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
                                            marginTop: spacing.md,
                                            padding: `${spacing.xs}px ${spacing.md}px`,
                                            background: 'transparent',
                                            border: `1px solid ${colors.borderIdle}`,
                                            borderRadius: borderRadius.xs,
                                            color: colors.textMuted,
                                            fontFamily: typography.fontMono,
                                            fontSize: 10,
                                            cursor: 'pointer',
                                            transition: transitions.fast,
                                        }}
                                    >
                                        Delete Model Data
                                    </button>
                                )}
                            </div>
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
