import { PROMPTS, TabData, formatTabsForPrompt } from './prompts';

// Type definitions for the Chrome AI Origin Trial API
declare global {
    interface Window {
        ai: {
            canCreateTextSession(): Promise<'readily' | 'after-download' | 'no'>;
            createTextSession(options?: { systemPrompt?: string }): Promise<AISession>;
        };
    }
}

interface AISession {
    prompt(text: string): Promise<string>;
    promptStreaming(text: string): ReadableStream;
    destroy(): void;
}

export class GeminiNanoService {
    private session: AISession | null = null;

    async isAvailable(): Promise<boolean> {
        if (!window.ai) return false;
        const status = await window.ai.canCreateTextSession();
        return status === 'readily';
    }

    async initSession(systemPrompt?: string) {
        if (!window.ai) throw new Error('AI_UNAVAILABLE');
        this.session = await window.ai.createTextSession({ systemPrompt });
    }

    async categorizeTabs(tabs: TabData[]): Promise<Record<number, string>> {
        if (!this.session) await this.initSession();

        const prompt = PROMPTS.CATEGORIZE.replace('${tabs}', formatTabsForPrompt(tabs));
        const response = await this.session!.prompt(prompt);

        try {
            return JSON.parse(this.cleanJson(response));
        } catch (e) {
            console.error('Tactical Parse Error:', e);
            return {};
        }
    }

    async prioritizeTabs(tabs: TabData[]): Promise<Record<number, { priority: string; reason: string }>> {
        if (!this.session) await this.initSession();

        const prompt = PROMPTS.PRIORITIZE.replace('${tabs}', formatTabsForPrompt(tabs));
        const response = await this.session!.prompt(prompt);

        try {
            return JSON.parse(this.cleanJson(response));
        } catch (e) {
            console.error('Tactical Parse Error:', e);
            return {};
        }
    }

    async summarizeContent(content: string): Promise<string> {
        if (!this.session) await this.initSession();

        const prompt = PROMPTS.SUMMARIZE.replace('${content}', content);
        return await this.session!.prompt(prompt);
    }

    async destroy() {
        if (this.session) {
            this.session.destroy();
            this.session = null;
        }
    }

    private cleanJson(text: string): string {
        // Remove markdown code blocks
        let cleaned = text.replace(/```json\n?|\n?```/g, '').trim();

        // Attempt to find the JSON object if there's extra text
        const firstBrace = cleaned.indexOf('{');
        const lastBrace = cleaned.lastIndexOf('}');

        if (firstBrace !== -1 && lastBrace !== -1) {
            cleaned = cleaned.substring(firstBrace, lastBrace + 1);
        }

        return cleaned;
    }
}
