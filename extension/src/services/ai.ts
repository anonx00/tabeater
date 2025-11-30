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

class AIService {
    private session: AISession | null = null;
    private provider: AIProvider = 'none';
    private config: AIConfig = {};
    private nanoStatus: NanoStatus = { available: false, status: 'not_available', message: 'Not checked' };

    async initialize(): Promise<AIProvider> {
        const stored = await chrome.storage.local.get(['aiConfig']);
        if (stored.aiConfig) {
            this.config = stored.aiConfig;
        }

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
        // Try multiple access patterns for Chrome built-in AI
        // Note: window doesn't exist in service workers, only use globalThis/self/chrome
        try {
            if (typeof globalThis !== 'undefined' && (globalThis as any).ai) {
                return (globalThis as any).ai;
            }
            if (typeof self !== 'undefined' && (self as any).ai) {
                return (self as any).ai;
            }
            if (typeof chrome !== 'undefined' && (chrome as any).ai) {
                return (chrome as any).ai;
            }
            return null;
        } catch {
            return null;
        }
    }

    async checkNanoAvailability(): Promise<NanoStatus> {
        try {
            const ai = this.getAIApi();

            if (!ai) {
                this.nanoStatus = {
                    available: false,
                    status: 'not_available',
                    message: 'Chrome AI API not found. Make sure you have Chrome 127+ with flags enabled.'
                };
                return this.nanoStatus;
            }

            if (!ai.languageModel) {
                this.nanoStatus = {
                    available: false,
                    status: 'not_available',
                    message: 'Language Model API not available. Enable chrome://flags/#prompt-api-for-gemini-nano'
                };
                return this.nanoStatus;
            }

            const capabilities = await ai.languageModel.capabilities();

            if (capabilities.available === 'no') {
                this.nanoStatus = {
                    available: false,
                    status: 'not_available',
                    message: 'Gemini Nano not available on this device. Check chrome://flags settings.'
                };
                return this.nanoStatus;
            }

            if (capabilities.available === 'after-download') {
                this.nanoStatus = {
                    available: false,
                    status: 'downloading',
                    message: 'Gemini Nano is downloading. This may take a few minutes. Try again soon.'
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
                    message: 'Gemini Nano is ready to use!'
                };
                return this.nanoStatus;
            }

            this.nanoStatus = {
                available: false,
                status: 'not_available',
                message: `Unknown status: ${capabilities.available}`
            };
            return this.nanoStatus;
        } catch (err: any) {
            this.nanoStatus = {
                available: false,
                status: 'error',
                message: `Error checking Nano: ${err.message}`
            };
            return this.nanoStatus;
        }
    }

    private async initializeNano(): Promise<boolean> {
        try {
            const ai = this.getAIApi();
            if (!ai?.languageModel) {
                this.nanoStatus = { available: false, status: 'not_available', message: 'API not found' };
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
                systemPrompt: `You are PHANTOM TABS, a tactical tab intelligence assistant.
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
                        text: `You are PHANTOM TABS, a tactical tab intelligence assistant. Provide concise, actionable insights.\n\n${text}`
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
                        content: 'You are PHANTOM TABS, a tactical tab intelligence assistant. Provide concise, actionable insights.'
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
                system: 'You are PHANTOM TABS, a tactical tab intelligence assistant. Provide concise, actionable insights.',
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

    destroy(): void {
        if (this.session?.destroy) {
            this.session.destroy();
        }
        this.session = null;
    }
}

export const aiService = new AIService();
export type { AIConfig, AIProvider, NanoStatus };
