import { GeminiNanoService } from '../ai/gemini-nano';
import { CloudFallbackService } from '../ai/cloud-fallback';
import { TabData } from '../ai/prompts';
import browser from 'webextension-polyfill';

interface TabAnalysis {
    category?: string;
    priority?: string;
    reason?: string;
    lastAnalyzed?: number;
}

export class TabManager {
    private nanoService: GeminiNanoService;
    private cloudService: CloudFallbackService;
    private analysisCache: Record<number, TabAnalysis> = {};

    constructor() {
        this.nanoService = new GeminiNanoService();
        this.cloudService = new CloudFallbackService();
    }

    async analyzeTabs(): Promise<void> {
        const tabs = await browser.tabs.query({});
        const tabsToAnalyze: TabData[] = tabs
            .filter(t => t.id && t.url && t.title && !t.url.startsWith('chrome://'))
            .map(t => ({ id: t.id!, title: t.title!, url: t.url! }));

        if (tabsToAnalyze.length === 0) return;

        let categories: Record<number, string> = {};
        let priorities: Record<number, { priority: string; reason: string }> = {};

        const BATCH_SIZE = 20;

        // Process in batches to respect token limits
        for (let i = 0; i < tabsToAnalyze.length; i += BATCH_SIZE) {
            const batch = tabsToAnalyze.slice(i, i + BATCH_SIZE);

            try {
                let batchCategories = {};
                let batchPriorities = {};

                // Try Gemini Nano first
                if (await this.nanoService.isAvailable()) {
                    [batchCategories, batchPriorities] = await Promise.all([
                        this.nanoService.categorizeTabs(batch),
                        this.nanoService.prioritizeTabs(batch)
                    ]);
                } else {
                    throw new Error('Nano unavailable');
                }

                Object.assign(categories, batchCategories);
                Object.assign(priorities, batchPriorities);

            } catch {
                try {
                    // Fallback to Cloud
                    const [cloudCats, cloudPrios] = await Promise.all([
                        this.cloudService.categorizeTabs(batch),
                        this.cloudService.prioritizeTabs(batch)
                    ]);
                    Object.assign(categories, cloudCats);
                    Object.assign(priorities, cloudPrios);
                } catch {
                    // Continue to next batch instead of aborting entirely
                }
            }
        }

        // Update Cache and Storage
        tabsToAnalyze.forEach(tab => {
            this.analysisCache[tab.id] = {
                category: categories[tab.id] || 'UNCATEGORIZED',
                priority: priorities[tab.id]?.priority || 'UNKNOWN',
                reason: priorities[tab.id]?.reason || 'No intelligence available',
                lastAnalyzed: Date.now()
            };
        });

        await browser.storage.local.set({ tabAnalysis: this.analysisCache });
    }

    async autoGroupTabs(): Promise<void> {
        const analysis = await browser.storage.local.get('tabAnalysis');
        const cache = analysis.tabAnalysis as Record<string, TabAnalysis>;
        if (!cache) return;

        const tabs = await browser.tabs.query({ currentWindow: true });
        const groups: Record<string, number[]> = {};

        tabs.forEach(tab => {
            if (!tab.id) return;
            const data = cache[tab.id];
            if (data && data.category) {
                if (!groups[data.category]) groups[data.category] = [];
                groups[data.category].push(tab.id);
            }
        });

        for (const [category, tabIds] of Object.entries(groups)) {
            if (tabIds.length > 1) {
                const groupId = await (browser.tabs as any).group({ tabIds });
                await (browser as any).tabGroups.update(groupId, { title: category });
            }
        }
    }
}
