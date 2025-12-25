type AISession = {
    prompt: (text: string) => Promise<string>;
    destroy?: () => void;
};

type AIProvider = 'gemini' | 'openai' | 'anthropic' | 'none';

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

// Default rate limits for cloud API usage
const DEFAULT_RATE_LIMITS: RateLimitConfig = {
    maxPerHour: 30,       // Max 30 calls per hour
    maxPerDay: 100,       // Max 100 calls per day
    warningThreshold: 0.8 // Warn at 80% of limit
};

class AIService {
    private session: AISession | null = null;
    private provider: AIProvider = 'none';
    private config: AIConfig = {};
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

        // Cloud provider
        if (this.config.apiKey && this.config.cloudProvider) {
            this.provider = this.config.cloudProvider;
            return this.config.cloudProvider;
        }

        this.provider = 'none';
        return 'none';
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
        const costPerCall: { [key: string]: number } = {
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
        // Track usage before making call
        await this.trackAPIUsage(this.provider);

        // Cloud providers
        if (this.provider !== 'none' && this.config.apiKey) {
            return await this.cloudPrompt(text);
        }

        throw new Error('No AI provider configured. Please configure an API key in options.');
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
export type { AIConfig, AIProvider, RateLimitConfig };
export { DEFAULT_RATE_LIMITS };
