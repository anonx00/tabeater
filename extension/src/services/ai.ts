import { licenseService } from './license';

type AISession = {
    prompt: (text: string) => Promise<string>;
    destroy?: () => void;
};

type AIProvider = 'nano' | 'gemini' | 'openai' | 'anthropic' | 'none';

interface AIConfig {
    cloudProvider?: 'gemini' | 'openai' | 'anthropic';
    apiKey?: string;
    model?: string;
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

// Rate limits for fly mode auto-grouping
const RATE_LIMITS = {
    maxPerHour: 30,       // Max 30 calls per hour
    maxPerDay: 100,       // Max 100 calls per day
    warningThreshold: 0.8 // Warn at 80% of limit
};

class AIService {
    private session: AISession | null = null;
    private provider: AIProvider = 'none';
    private config: AIConfig = {};
    private nanoStatus: NanoStatus = { available: false, status: 'not_available', message: 'Not checked' };
    private usageStats: APIUsageStats = {
        totalCalls: 0,
        todayCalls: 0,
        hourCalls: 0,
        lastCallDate: '',
        lastCallHour: -1,
        estimatedCost: 0
    };

    async initialize(): Promise<AIProvider> {
        const stored = await chrome.storage.local.get(['aiConfig', 'apiUsageStats']);
        if (stored.aiConfig) {
            this.config = stored.aiConfig;
        }
        if (stored.apiUsageStats) {
            this.usageStats = { ...this.usageStats, ...stored.apiUsageStats };
        }
        // Reset counters if needed
        this.resetCountersIfNeeded();

        if (await this.initializeNano()) {
            this.provider = 'nano';
            return 'nano';
        }

        if (this.config.apiKey && this.config.cloudProvider) {
            this.provider = this.config.cloudProvider;
            return this.config.cloudProvider;
        }

        this.provider = 'none';
        return 'none';
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
        this.resetCountersIfNeeded();

        // Nano is free - no limits
        if (this.provider === 'nano') {
            return { allowed: true };
        }

        // Check hourly limit
        if (this.usageStats.hourCalls >= RATE_LIMITS.maxPerHour) {
            return {
                allowed: false,
                reason: `Hourly limit reached (${RATE_LIMITS.maxPerHour}/hr). Resets at the next hour.`
            };
        }

        // Check daily limit
        if (this.usageStats.todayCalls >= RATE_LIMITS.maxPerDay) {
            return {
                allowed: false,
                reason: `Daily limit reached (${RATE_LIMITS.maxPerDay}/day). Resets at midnight.`
            };
        }

        // Warning if approaching limits
        const hourlyUsage = this.usageStats.hourCalls / RATE_LIMITS.maxPerHour;
        const dailyUsage = this.usageStats.todayCalls / RATE_LIMITS.maxPerDay;

        if (hourlyUsage >= RATE_LIMITS.warningThreshold || dailyUsage >= RATE_LIMITS.warningThreshold) {
            return {
                allowed: true,
                warning: `API usage high: ${this.usageStats.hourCalls}/${RATE_LIMITS.maxPerHour} this hour, ${this.usageStats.todayCalls}/${RATE_LIMITS.maxPerDay} today`
            };
        }

        return { allowed: true };
    }

    // Track API usage (cost estimates in cents per call)
    private async trackAPIUsage(provider: string): Promise<void> {
        this.resetCountersIfNeeded();

        this.usageStats.totalCalls++;
        this.usageStats.todayCalls++;
        this.usageStats.hourCalls++;

        // Estimate cost per call (in cents) - rough estimates for typical usage
        // Nano is free, cloud providers vary
        const costPerCall: { [key: string]: number } = {
            'nano': 0,
            'gemini': 0.01,  // ~$0.0001 for flash
            'openai': 0.05,  // ~$0.0005 for gpt-4o-mini
            'anthropic': 0.03 // ~$0.0003 for haiku
        };
        this.usageStats.estimatedCost += costPerCall[provider] || 0;

        // Save to storage
        await chrome.storage.local.set({ apiUsageStats: this.usageStats });
    }

    // Get API usage stats with limits info
    getUsageStats(): APIUsageStats & { limits: typeof RATE_LIMITS; nearLimit: boolean } {
        this.resetCountersIfNeeded();
        const hourlyUsage = this.usageStats.hourCalls / RATE_LIMITS.maxPerHour;
        const dailyUsage = this.usageStats.todayCalls / RATE_LIMITS.maxPerDay;
        return {
            ...this.usageStats,
            limits: RATE_LIMITS,
            nearLimit: hourlyUsage >= RATE_LIMITS.warningThreshold || dailyUsage >= RATE_LIMITS.warningThreshold
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

        if (this.provider === 'nano' && this.session) {
            return await this.session.prompt(text);
        }

        if (this.provider !== 'none' && this.config.apiKey) {
            return await this.cloudPrompt(text);
        }

        throw new Error('No AI provider available. Configure API key in options.');
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
        return this.provider === 'gemini' || this.provider === 'openai' || this.provider === 'anthropic';
    }

    /**
     * Get privacy info about current provider
     */
    getPrivacyInfo(): { isLocal: boolean; provider: string; message: string } {
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
export type { AIConfig, AIProvider, NanoStatus };
