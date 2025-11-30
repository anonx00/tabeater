type AISession = {
    prompt: (text: string) => Promise<string>;
    destroy?: () => void;
};

type AIProvider = 'nano' | 'cloud' | 'none';

interface AIConfig {
    cloudApiKey?: string;
    cloudEndpoint?: string;
}

class AIService {
    private session: AISession | null = null;
    private provider: AIProvider = 'none';
    private config: AIConfig = {};

    async initialize(): Promise<AIProvider> {
        const stored = await chrome.storage.local.get(['aiConfig']);
        if (stored.aiConfig) {
            this.config = stored.aiConfig;
        }

        if (await this.initializeNano()) {
            this.provider = 'nano';
            return 'nano';
        }

        if (this.config.cloudApiKey) {
            this.provider = 'cloud';
            return 'cloud';
        }

        this.provider = 'none';
        return 'none';
    }

    private async initializeNano(): Promise<boolean> {
        try {
            const ai = (globalThis as any).ai || (chrome as any).ai;
            if (!ai?.languageModel) return false;

            const capabilities = await ai.languageModel.capabilities();
            if (capabilities.available === 'no') return false;

            if (capabilities.available === 'after-download') {
                await ai.languageModel.create();
            }

            this.session = await ai.languageModel.create({
                systemPrompt: `You are PHANTOM TABS, a tactical tab intelligence assistant.
                Provide concise, actionable insights about browser tabs and web content.
                Keep responses brief and focused.`
            });

            return true;
        } catch {
            return false;
        }
    }

    async prompt(text: string): Promise<string> {
        if (this.provider === 'nano' && this.session) {
            return await this.session.prompt(text);
        }

        if (this.provider === 'cloud' && this.config.cloudApiKey) {
            return await this.cloudPrompt(text);
        }

        throw new Error('No AI provider available. Configure API key in options.');
    }

    private async cloudPrompt(text: string): Promise<string> {
        const endpoint = this.config.cloudEndpoint || 'https://api.nano.ai/v1/chat';

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.config.cloudApiKey}`
            },
            body: JSON.stringify({
                model: 'nano',
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
            throw new Error(`Cloud API error: ${response.status}`);
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

    destroy(): void {
        if (this.session?.destroy) {
            this.session.destroy();
        }
        this.session = null;
    }
}

export const aiService = new AIService();
export type { AIConfig, AIProvider };
