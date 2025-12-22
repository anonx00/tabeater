import { GeminiNanoService } from '../ai/gemini-nano';
import { CloudFallbackService } from '../ai/cloud-fallback';
import { TabData, PROMPTS, formatTabsWithContent } from '../ai/prompts';
import browser from 'webextension-polyfill';

interface TabAnalysis {
    category?: string;
    content?: string;
    lastAnalyzed?: number;
}

interface ClusterGroup {
    name: string;
    tabIds: number[];
    reason: string;
}

export class TabManager {
    private nanoService: GeminiNanoService;
    private cloudService: CloudFallbackService;
    private analysisCache: Record<number, TabAnalysis> = {};

    constructor() {
        this.nanoService = new GeminiNanoService();
        this.cloudService = new CloudFallbackService();
    }

    // Extract page content from a tab using scripting API
    private async extractTabContent(tabId: number): Promise<string> {
        try {
            const results = await (browser.scripting as any).executeScript({
                target: { tabId },
                func: () => {
                    // Extract meaningful text content from the page
                    const getTextContent = (element: Element): string => {
                        const ignoreTags = ['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'OBJECT', 'EMBED'];
                        if (ignoreTags.includes(element.tagName)) return '';

                        let text = '';
                        element.childNodes.forEach(child => {
                            if (child.nodeType === Node.TEXT_NODE) {
                                text += child.textContent?.trim() + ' ';
                            } else if (child.nodeType === Node.ELEMENT_NODE) {
                                text += getTextContent(child as Element);
                            }
                        });
                        return text;
                    };

                    // Get main content areas first
                    const mainContent = document.querySelector('main, article, [role="main"], .content, #content');
                    if (mainContent) {
                        return getTextContent(mainContent).slice(0, 1000);
                    }

                    // Fallback to body
                    return getTextContent(document.body).slice(0, 1000);
                }
            });
            return results?.[0]?.result || '';
        } catch {
            // Content script may fail on certain pages
            return '';
        }
    }

    // Analyze tabs with content for contextual grouping
    async analyzeTabsContextually(): Promise<TabData[]> {
        const tabs = await browser.tabs.query({});
        const tabsWithContent: TabData[] = [];

        for (const tab of tabs) {
            if (!tab.id || !tab.url || !tab.title) continue;
            if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) continue;

            const content = await this.extractTabContent(tab.id);

            tabsWithContent.push({
                id: tab.id,
                title: tab.title,
                url: tab.url,
                content: content || undefined
            });

            // Update cache with content
            this.analysisCache[tab.id] = {
                ...this.analysisCache[tab.id],
                content,
                lastAnalyzed: Date.now()
            };
        }

        await browser.storage.local.set({ tabAnalysis: this.analysisCache });
        return tabsWithContent;
    }

    // Contextual clustering based on page content
    async contextualClusterTabs(): Promise<ClusterGroup[]> {
        const tabsWithContent = await this.analyzeTabsContextually();
        if (tabsWithContent.length < 2) return [];

        const prompt = PROMPTS.CONTEXTUAL_CLUSTER.replace('${tabs}', formatTabsWithContent(tabsWithContent));

        try {
            // Use cloud AI for contextual analysis (requires more context)
            const response = await this.cloudService.callPrompt(prompt);
            const clusters = JSON.parse(response);
            return clusters as ClusterGroup[];
        } catch (error) {
            console.error('Contextual clustering failed:', error);
            return [];
        }
    }

    // Apply contextual groups to tabs
    async applyContextualGroups(): Promise<{ success: boolean; groups: string[] }> {
        try {
            const clusters = await this.contextualClusterTabs();
            const appliedGroups: string[] = [];

            for (const cluster of clusters) {
                if (cluster.tabIds.length >= 2) {
                    const groupId = await (browser.tabs as any).group({ tabIds: cluster.tabIds });
                    await (browser as any).tabGroups.update(groupId, {
                        title: cluster.name,
                        color: this.getGroupColor(cluster.name)
                    });
                    appliedGroups.push(cluster.name);
                }
            }

            return { success: true, groups: appliedGroups };
        } catch (error) {
            console.error('Failed to apply contextual groups:', error);
            return { success: false, groups: [] };
        }
    }

    // Get appropriate color for group based on name
    private getGroupColor(name: string): string {
        const nameLower = name.toLowerCase();
        if (nameLower.includes('work') || nameLower.includes('project')) return 'blue';
        if (nameLower.includes('research') || nameLower.includes('learn')) return 'purple';
        if (nameLower.includes('shop') || nameLower.includes('buy')) return 'pink';
        if (nameLower.includes('dev') || nameLower.includes('code')) return 'cyan';
        if (nameLower.includes('news') || nameLower.includes('read')) return 'orange';
        if (nameLower.includes('entertainment') || nameLower.includes('video')) return 'red';
        return 'grey';
    }

    async analyzeTabs(): Promise<void> {
        const tabs = await browser.tabs.query({});
        const tabsToAnalyze: TabData[] = tabs
            .filter(t => t.id && t.url && t.title && !t.url.startsWith('chrome://'))
            .map(t => ({ id: t.id!, title: t.title!, url: t.url! }));

        if (tabsToAnalyze.length === 0) return;

        let categories: Record<number, string> = {};

        const BATCH_SIZE = 20;

        // Process in batches to respect token limits
        for (let i = 0; i < tabsToAnalyze.length; i += BATCH_SIZE) {
            const batch = tabsToAnalyze.slice(i, i + BATCH_SIZE);

            try {
                let batchCategories = {};

                // Try Gemini Nano first
                if (await this.nanoService.isAvailable()) {
                    batchCategories = await this.nanoService.categorizeTabs(batch);
                } else {
                    throw new Error('Nano unavailable');
                }

                Object.assign(categories, batchCategories);

            } catch {
                try {
                    // Fallback to Cloud
                    const cloudCats = await this.cloudService.categorizeTabs(batch);
                    Object.assign(categories, cloudCats);
                } catch {
                    // Continue to next batch instead of aborting entirely
                }
            }
        }

        // Update Cache and Storage
        tabsToAnalyze.forEach(tab => {
            this.analysisCache[tab.id] = {
                category: categories[tab.id] || 'UNCATEGORIZED',
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
