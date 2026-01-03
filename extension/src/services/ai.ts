import { licenseService } from './license';
import { webllmService, WebLLMState } from '../ai/webllm';

type AISession = {
    prompt: (text: string) => Promise<string>;
    destroy?: () => void;
};

type AIProvider = 'webllm' | 'nano' | 'gemini' | 'openai' | 'anthropic' | 'deepseek' | 'none';

interface AIConfig {
    cloudProvider?: 'gemini' | 'openai' | 'anthropic' | 'deepseek';
    apiKey?: string;
    model?: string;
    preferWebLLM?: boolean;  // User preference to use local WebLLM
}

const PROVIDER_CONFIGS = {
    gemini: {
        endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',
        defaultModel: 'gemini-2.0-flash',
        authHeader: (key: string) => ({ 'x-goog-api-key': key }),
    },
    openai: {
        endpoint: 'https://api.openai.com/v1/chat/completions',
        defaultModel: 'gpt-4o-mini',
        authHeader: (key: string) => ({ 'Authorization': `Bearer ${key}` }),
    },
    anthropic: {
        endpoint: 'https://api.anthropic.com/v1/messages',
        defaultModel: 'claude-3-5-haiku-latest',
        authHeader: (key: string) => ({
            'x-api-key': key,
            'anthropic-version': '2023-06-01'
        }),
    },
    deepseek: {
        endpoint: 'https://api.deepseek.com/v1/chat/completions',
        defaultModel: 'deepseek-chat',
        authHeader: (key: string) => ({ 'Authorization': `Bearer ${key}` }),
    }
};

interface NanoStatus {
    available: boolean;
    status: 'ready' | 'downloading' | 'not_available' | 'error';
    message: string;
}

// API usage tracking
interface APIUsageStats {
    totalCalls: number;
    todayCalls: number;
    hourCalls: number;
    lastCallDate: string;
    lastCallHour: number;
    estimatedCost: number; // in cents
}

// User-configurable rate limits
interface RateLimitConfig {
    maxPerHour: number;
    maxPerDay: number;
    warningThreshold: number;
}

// Default rate limits for fly mode auto-grouping
const DEFAULT_RATE_LIMITS: RateLimitConfig = {
    maxPerHour: 30,       // Max 30 calls per hour
    maxPerDay: 100,       // Max 100 calls per day
    warningThreshold: 0.8 // Warn at 80% of limit
};

class AIService {
    private session: AISession | null = null;
    private provider: AIProvider = 'none';
    private config: AIConfig = {};
    private nanoStatus: NanoStatus = { available: false, status: 'not_available', message: 'Not checked' };
    private rateLimits: RateLimitConfig = { ...DEFAULT_RATE_LIMITS };
    private usageStats: APIUsageStats = {
        totalCalls: 0,
        todayCalls: 0,
        hourCalls: 0,
        lastCallDate: '',
        lastCallHour: -1,
        estimatedCost: 0
    };

    // Request queue for batching and deduplication
    private pendingRequests: Map<string, Promise<string>> = new Map();

    async initialize(): Promise<AIProvider> {
        const stored = await chrome.storage.local.get(['aiConfig', 'apiUsageStats', 'rateLimits']);
        if (stored.aiConfig) {
            this.config = stored.aiConfig;
        }
        if (stored.apiUsageStats) {
            this.usageStats = { ...this.usageStats, ...stored.apiUsageStats };
        }
        // Load custom rate limits if set
        if (stored.rateLimits) {
            this.rateLimits = { ...DEFAULT_RATE_LIMITS, ...stored.rateLimits };
        }
        // Reset counters if needed
        this.resetCountersIfNeeded();

        // Priority 1: WebLLM (if user prefers and it's ready)
        if (this.config.preferWebLLM && webllmService.isReady()) {
            this.provider = 'webllm';
            return 'webllm';
        }

        // Priority 2: Gemini Nano (Chrome's built-in AI)
        if (await this.initializeNano()) {
            this.provider = 'nano';
            return 'nano';
        }

        // Priority 3: WebLLM (try to initialize if preferred)
        if (this.config.preferWebLLM) {
            const webllmReady = await webllmService.initialize();
            if (webllmReady) {
                this.provider = 'webllm';
                return 'webllm';
            }
        }

        // Priority 4: Cloud provider
        if (this.config.apiKey && this.config.cloudProvider) {
            this.provider = this.config.cloudProvider;
            return this.config.cloudProvider;
        }

        this.provider = 'none';
        return 'none';
    }

    /**
     * Initialize WebLLM explicitly (for manual activation)
     */
    async initializeWebLLM(): Promise<boolean> {
        const success = await webllmService.initialize();
        if (success) {
            this.provider = 'webllm';
            // Save preference
            this.config.preferWebLLM = true;
            await chrome.storage.local.set({ aiConfig: this.config });
        }
        return success;
    }

    /**
     * Get WebLLM state for UI updates
     */
    getWebLLMState(): WebLLMState {
        return webllmService.getState();
    }

    /**
     * Check WebGPU capabilities
     */
    async checkWebGPUSupport() {
        return webllmService.checkWebGPUSupport();
    }

    /**
     * Unload WebLLM to free memory
     */
    async unloadWebLLM(): Promise<void> {
        await webllmService.unload();
        this.config.preferWebLLM = false;
        await chrome.storage.local.set({ aiConfig: this.config });
        // Re-initialize to fall back to another provider
        await this.initialize();
    }

    /**
     * Subscribe to WebLLM state changes
     */
    onWebLLMStateChange(listener: (state: WebLLMState) => void): () => void {
        return webllmService.onStateChange(listener);
    }

    private getAIApi(): any {
        // Chrome Built-in AI (Gemini Nano) access patterns
        // The API location varies by Chrome version and context
        try {
            // Chrome 128+: self.ai in service workers
            if (typeof self !== 'undefined' && (self as any).ai?.languageModel) {
                return (self as any).ai;
            }
            // Alternative: globalThis.ai
            if (typeof globalThis !== 'undefined' && (globalThis as any).ai?.languageModel) {
                return (globalThis as any).ai;
            }
            // Chrome extension specific: chrome.aiOriginTrial or chrome.ai
            if (typeof chrome !== 'undefined') {
                if ((chrome as any).aiOriginTrial?.languageModel) {
                    return (chrome as any).aiOriginTrial;
                }
                if ((chrome as any).ai?.languageModel) {
                    return (chrome as any).ai;
                }
            }
            return null;
        } catch {
            return null;
        }
    }

    async checkNanoAvailability(): Promise<NanoStatus> {
        try {
            // Debug: Check what's available
            const hasGlobalAi = typeof globalThis !== 'undefined' && !!(globalThis as any).ai;
            const hasSelfAi = typeof self !== 'undefined' && !!(self as any).ai;
            const hasChromeAi = typeof chrome !== 'undefined' && !!(chrome as any).ai;

            const ai = this.getAIApi();

            if (!ai) {
                // Provide detailed info about why it's not available
                let details = 'Gemini Nano not detected. ';
                if (!hasGlobalAi && !hasSelfAi && !hasChromeAi) {
                    details += 'Chrome 128+ required with flags enabled. ';
                }
                details += 'Using cloud AI instead.';

                this.nanoStatus = {
                    available: false,
                    status: 'not_available',
                    message: details
                };
                return this.nanoStatus;
            }

            if (!ai.languageModel) {
                this.nanoStatus = {
                    available: false,
                    status: 'not_available',
                    message: 'Language Model API found but not ready. Enable chrome://flags/#prompt-api-for-gemini-nano'
                };
                return this.nanoStatus;
            }

            const capabilities = await ai.languageModel.capabilities();

            if (capabilities.available === 'no') {
                this.nanoStatus = {
                    available: false,
                    status: 'not_available',
                    message: 'Nano model not available. Ensure both Chrome flags are enabled and Chrome is relaunched.'
                };
                return this.nanoStatus;
            }

            if (capabilities.available === 'after-download') {
                this.nanoStatus = {
                    available: false,
                    status: 'downloading',
                    message: 'Downloading Gemini Nano model (~1.7GB). Check chrome://components for progress.'
                };
                // Trigger the download
                try {
                    await ai.languageModel.create();
                } catch {
                    // Download may be in progress
                }
                return this.nanoStatus;
            }

            if (capabilities.available === 'readily') {
                this.nanoStatus = {
                    available: true,
                    status: 'ready',
                    message: 'Gemini Nano ready - local AI enabled!'
                };
                return this.nanoStatus;
            }

            this.nanoStatus = {
                available: false,
                status: 'not_available',
                message: `Status: ${capabilities.available}. Try relaunching Chrome.`
            };
            return this.nanoStatus;
        } catch (err: any) {
            this.nanoStatus = {
                available: false,
                status: 'error',
                message: `Detection error: ${err.message}`
            };
            return this.nanoStatus;
        }
    }

    private async initializeNano(): Promise<boolean> {
        try {
            const ai = this.getAIApi();
            if (!ai?.languageModel) {
                this.nanoStatus = { available: false, status: 'not_available', message: 'Nano unavailable - using cloud AI' };
                return false;
            }

            const capabilities = await ai.languageModel.capabilities();
            if (capabilities.available === 'no') {
                this.nanoStatus = { available: false, status: 'not_available', message: 'Not available' };
                return false;
            }

            if (capabilities.available === 'after-download') {
                this.nanoStatus = { available: false, status: 'downloading', message: 'Model downloading...' };
                // Try to trigger download but don't wait
                ai.languageModel.create().catch(() => {});
                return false;
            }

            this.session = await ai.languageModel.create({
                systemPrompt: `You are TabEater, a tactical tab intelligence assistant.
                Provide concise, actionable insights about browser tabs and web content.
                Keep responses brief and focused.`
            });

            this.nanoStatus = { available: true, status: 'ready', message: 'Ready' };
            return true;
        } catch (err: any) {
            this.nanoStatus = { available: false, status: 'error', message: err.message };
            return false;
        }
    }

    getNanoStatus(): NanoStatus {
        return this.nanoStatus;
    }

    // Reset counters if day/hour changed
    private resetCountersIfNeeded(): void {
        const now = new Date();
        const today = now.toISOString().split('T')[0];
        const currentHour = now.getHours();

        // Reset daily counter if new day
        if (this.usageStats.lastCallDate !== today) {
            this.usageStats.todayCalls = 0;
            this.usageStats.hourCalls = 0;
            this.usageStats.lastCallDate = today;
            this.usageStats.lastCallHour = currentHour;
        }

        // Reset hourly counter if new hour
        if (this.usageStats.lastCallHour !== currentHour) {
            this.usageStats.hourCalls = 0;
            this.usageStats.lastCallHour = currentHour;
        }
    }

    // Check if we can make an API call (rate limiting)
    async canMakeCall(): Promise<{ allowed: boolean; reason?: string; warning?: string }> {
        // Reload limits in case they changed
        const stored = await chrome.storage.local.get(['rateLimits']);
        if (stored.rateLimits) {
            this.rateLimits = { ...DEFAULT_RATE_LIMITS, ...stored.rateLimits };
        }
        this.resetCountersIfNeeded();

        // Nano is free - no limits
        if (this.provider === 'nano') {
            return { allowed: true };
        }

        // Check hourly limit
        if (this.usageStats.hourCalls >= this.rateLimits.maxPerHour) {
            return {
                allowed: false,
                reason: `Hourly limit reached (${this.rateLimits.maxPerHour}/hr). Resets at the next hour.`
            };
        }

        // Check daily limit
        if (this.usageStats.todayCalls >= this.rateLimits.maxPerDay) {
            return {
                allowed: false,
                reason: `Daily limit reached (${this.rateLimits.maxPerDay}/day). Resets at midnight.`
            };
        }

        // Warning if approaching limits
        const hourlyUsage = this.usageStats.hourCalls / this.rateLimits.maxPerHour;
        const dailyUsage = this.usageStats.todayCalls / this.rateLimits.maxPerDay;

        if (hourlyUsage >= this.rateLimits.warningThreshold || dailyUsage >= this.rateLimits.warningThreshold) {
            return {
                allowed: true,
                warning: `API usage high: ${this.usageStats.hourCalls}/${this.rateLimits.maxPerHour} this hour, ${this.usageStats.todayCalls}/${this.rateLimits.maxPerDay} today`
            };
        }

        return { allowed: true };
    }

    // Set custom rate limits
    async setRateLimits(limits: Partial<RateLimitConfig>): Promise<void> {
        this.rateLimits = { ...this.rateLimits, ...limits };
        await chrome.storage.local.set({ rateLimits: this.rateLimits });
    }

    // Get current rate limits
    getRateLimits(): RateLimitConfig {
        return { ...this.rateLimits };
    }

    // Reset usage stats (for testing or user reset)
    async resetUsageStats(): Promise<void> {
        this.usageStats = {
            totalCalls: 0,
            todayCalls: 0,
            hourCalls: 0,
            lastCallDate: '',
            lastCallHour: -1,
            estimatedCost: 0
        };
        await chrome.storage.local.set({ apiUsageStats: this.usageStats });
    }

    // Track API usage (cost estimates in cents per call)
    private async trackAPIUsage(provider: string): Promise<void> {
        this.resetCountersIfNeeded();

        this.usageStats.totalCalls++;
        this.usageStats.todayCalls++;
        this.usageStats.hourCalls++;

        // Estimate cost per call (in cents) - rough estimates for typical usage
        // Local AI (WebLLM, Nano) is free, cloud providers vary
        const costPerCall: { [key: string]: number } = {
            'webllm': 0,     // Free (local)
            'nano': 0,       // Free (local)
            'gemini': 0.01,  // ~$0.0001 for flash
            'openai': 0.05,  // ~$0.0005 for gpt-4o-mini
            'anthropic': 0.03 // ~$0.0003 for haiku
        };
        this.usageStats.estimatedCost += costPerCall[provider] || 0;

        // Save to storage
        await chrome.storage.local.set({ apiUsageStats: this.usageStats });
    }

    // Get API usage stats with limits info (async to load from storage)
    async getUsageStats(): Promise<APIUsageStats & { limits: RateLimitConfig; nearLimit: boolean; provider: string; configuredProvider: string }> {
        // Load latest from storage
        const stored = await chrome.storage.local.get(['apiUsageStats', 'aiConfig', 'rateLimits']);
        if (stored.apiUsageStats) {
            this.usageStats = { ...this.usageStats, ...stored.apiUsageStats };
        }
        if (stored.rateLimits) {
            this.rateLimits = { ...DEFAULT_RATE_LIMITS, ...stored.rateLimits };
        }
        this.resetCountersIfNeeded();

        // Determine the configured provider (even if not active yet)
        let configuredProvider = this.provider;
        if (stored.aiConfig?.cloudProvider && stored.aiConfig?.apiKey) {
            configuredProvider = stored.aiConfig.cloudProvider;
        }

        const hourlyUsage = this.usageStats.hourCalls / this.rateLimits.maxPerHour;
        const dailyUsage = this.usageStats.todayCalls / this.rateLimits.maxPerDay;
        return {
            ...this.usageStats,
            limits: this.rateLimits,
            nearLimit: hourlyUsage >= this.rateLimits.warningThreshold || dailyUsage >= this.rateLimits.warningThreshold,
            provider: this.provider,
            configuredProvider: configuredProvider
        };
    }

    async prompt(text: string): Promise<string> {
        const useResult = await licenseService.checkAndUse();

        if (!useResult.allowed) {
            if (useResult.reason === 'trial_expired') {
                throw new Error('TRIAL_EXPIRED:Your free trial has ended. Upgrade to Pro for unlimited access.');
            }
            if (useResult.reason === 'limit_reached') {
                throw new Error('LIMIT_REACHED:Daily limit reached. Upgrade to Pro for unlimited access.');
            }
            throw new Error('LICENSE_ERROR:Unable to verify license.');
        }

        // Track usage before making call
        await this.trackAPIUsage(this.provider);

        // WebLLM - Local AI (highest priority when active)
        if (this.provider === 'webllm' && webllmService.isReady()) {
            return await webllmService.prompt(text);
        }

        // Gemini Nano - Chrome's built-in AI
        if (this.provider === 'nano' && this.session) {
            return await this.session.prompt(text);
        }

        // Cloud providers
        if (this.provider !== 'none' && this.config.apiKey) {
            return await this.cloudPrompt(text);
        }

        throw new Error('No AI provider available. Configure API key in options or enable Local AI.');
    }

    private async cloudPrompt(text: string): Promise<string> {
        const providerConfig = PROVIDER_CONFIGS[this.config.cloudProvider!];
        const model = this.config.model || providerConfig.defaultModel;

        if (this.config.cloudProvider === 'gemini') {
            return this.callGemini(text, model);
        } else if (this.config.cloudProvider === 'openai') {
            return this.callOpenAI(text, model);
        } else if (this.config.cloudProvider === 'anthropic') {
            return this.callAnthropic(text, model);
        } else if (this.config.cloudProvider === 'deepseek') {
            return this.callDeepSeek(text, model);
        }

        throw new Error('Unknown provider');
    }

    private async callGemini(text: string, model: string): Promise<string> {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': this.config.apiKey!
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: `You are TabEater, a tactical tab intelligence assistant. Provide concise, actionable insights.\n\n${text}`
                    }]
                }],
                generationConfig: {
                    maxOutputTokens: 500,
                    temperature: 0.7
                }
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Gemini API error: ${response.status} - ${error}`);
        }

        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response';
    }

    private async callOpenAI(text: string, model: string): Promise<string> {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.config.apiKey}`
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    {
                        role: 'system',
                        content: 'You are TabEater, a tactical tab intelligence assistant. Provide concise, actionable insights.'
                    },
                    { role: 'user', content: text }
                ],
                max_tokens: 500
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`OpenAI API error: ${response.status} - ${error}`);
        }

        const data = await response.json();
        return data.choices?.[0]?.message?.content || 'No response';
    }

    private async callAnthropic(text: string, model: string): Promise<string> {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': this.config.apiKey!,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: model,
                max_tokens: 500,
                system: 'You are TabEater, a tactical tab intelligence assistant. Provide concise, actionable insights.',
                messages: [
                    { role: 'user', content: text }
                ]
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Anthropic API error: ${response.status} - ${error}`);
        }

        const data = await response.json();
        return data.content?.[0]?.text || 'No response';
    }

    private async callDeepSeek(text: string, model: string): Promise<string> {
        // Check if using reasoning model
        const isReasoningModel = model.includes('reasoner') || model.includes('r1');
        const maxTokens = isReasoningModel ? 4000 : 500;
        const systemPrompt = isReasoningModel
            ? 'You are TabEater, an expert tab intelligence assistant. Think step-by-step and provide detailed reasoning before your conclusions.'
            : 'You are TabEater, a tactical tab intelligence assistant. Provide concise, actionable insights.';

        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.config.apiKey}`
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: text }
                ],
                max_tokens: maxTokens,
                temperature: isReasoningModel ? 0.6 : 0.7,
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`DeepSeek API error: ${response.status} - ${error}`);
        }

        const data = await response.json();
        return data.choices?.[0]?.message?.content || 'No response';
    }

    async setConfig(config: AIConfig): Promise<void> {
        this.config = { ...this.config, ...config };
        await chrome.storage.local.set({ aiConfig: this.config });
        await this.initialize();
    }

    getProvider(): AIProvider {
        return this.provider;
    }

    getConfig(): AIConfig {
        return this.config;
    }

    /**
     * Check if the current provider sends data to cloud servers
     */
    isCloudProvider(): boolean {
        return this.provider === 'gemini' || this.provider === 'openai' || this.provider === 'anthropic' || this.provider === 'deepseek';
    }

    /**
     * Check if the current provider is local (no data leaves device)
     */
    isLocalProvider(): boolean {
        return this.provider === 'webllm' || this.provider === 'nano';
    }

    /**
     * Get privacy info about current provider
     */
    getPrivacyInfo(): { isLocal: boolean; provider: string; message: string } {
        if (this.provider === 'webllm') {
            return {
                isLocal: true,
                provider: 'Local AI (SmolLM2)',
                message: 'AI runs 100% locally using WebGPU. No data ever leaves your device.'
            };
        }
        if (this.provider === 'nano') {
            return {
                isLocal: true,
                provider: 'Gemini Nano',
                message: 'AI runs locally on your device. No data leaves your browser.'
            };
        }
        if (this.provider === 'gemini') {
            return {
                isLocal: false,
                provider: 'Google Gemini',
                message: 'Tab data is sent to Google servers for AI processing.'
            };
        }
        if (this.provider === 'openai') {
            return {
                isLocal: false,
                provider: 'OpenAI',
                message: 'Tab data is sent to OpenAI servers for AI processing.'
            };
        }
        if (this.provider === 'anthropic') {
            return {
                isLocal: false,
                provider: 'Anthropic Claude',
                message: 'Tab data is sent to Anthropic servers for AI processing.'
            };
        }
        return {
            isLocal: true,
            provider: 'None',
            message: 'No AI provider configured.'
        };
    }

    destroy(): void {
        if (this.session?.destroy) {
            this.session.destroy();
        }
        this.session = null;
    }
}

export const aiService = new AIService();
export type { AIConfig, AIProvider, NanoStatus, RateLimitConfig };
export type { WebLLMState } from '../ai/webllm';
export { DEFAULT_RATE_LIMITS };
