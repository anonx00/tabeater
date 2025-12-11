import { PROMPTS, TabData, formatTabsForPrompt } from './prompts';

export class CloudFallbackService {
    private readonly API_ENDPOINT = 'https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/aiProxy';

    async categorizeTabs(tabs: TabData[]): Promise<Record<number, string>> {
        const prompt = PROMPTS.CATEGORIZE.replace('${tabs}', formatTabsForPrompt(tabs));
        return this.callCloudFunction('categorize', prompt);
    }

    async summarizeContent(content: string): Promise<string> {
        const prompt = PROMPTS.SUMMARIZE.replace('${content}', content);
        return this.callCloudFunction('summarize', prompt);
    }

    private async callCloudFunction(action: string, prompt: string): Promise<any> {
        try {
            const response = await fetch(this.API_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ action, prompt }),
            });

            if (!response.ok) {
                throw new Error(`Cloud Uplink Failed: ${response.statusText}`);
            }

            const data = await response.json();
            return data.result;
        } catch (error) {
            console.error('Cloud Fallback Failed:', error);
            throw error;
        }
    }
}
