import { tabService, TabInfo } from './tabs';
import { aiService } from './ai';

export interface TabHealth {
    tabId: number;
    title: string;
    url: string;
    favicon?: string;
    memoryMB?: number;
    lastAccessed?: number;
    staleDays: number;
    category: string;
    isStale: boolean;
    isDuplicate: boolean;
    recommendation: 'keep' | 'close' | 'review';
    reason: string;
}

export interface AutoPilotReport {
    totalTabs: number;
    totalMemoryMB: number;
    staleCount: number;
    duplicateCount: number;
    categoryGroups: { [key: string]: TabHealth[] };
    recommendations: {
        closeSuggestions: TabHealth[];
        groupSuggestions: { name: string; tabIds: number[] }[];
        memoryHogs: TabHealth[];
    };
    aiInsights?: string;
}

export interface AutoPilotSettings {
    staleDaysThreshold: number;
    autoCloseStale: boolean;
    autoGroupByCategory: boolean;
    memoryThresholdMB: number;
    excludePinned: boolean;
    excludeActive: boolean;
}

const DEFAULT_SETTINGS: AutoPilotSettings = {
    staleDaysThreshold: 7,
    autoCloseStale: false,
    autoGroupByCategory: false,
    memoryThresholdMB: 500,
    excludePinned: true,
    excludeActive: true,
};

class AutoPilotService {
    private settings: AutoPilotSettings = DEFAULT_SETTINGS;

    async loadSettings(): Promise<AutoPilotSettings> {
        const stored = await chrome.storage.local.get(['autoPilotSettings']);
        if (stored.autoPilotSettings) {
            this.settings = { ...DEFAULT_SETTINGS, ...stored.autoPilotSettings };
        }
        return this.settings;
    }

    async saveSettings(settings: Partial<AutoPilotSettings>): Promise<void> {
        this.settings = { ...this.settings, ...settings };
        await chrome.storage.local.set({ autoPilotSettings: this.settings });
    }

    getSettings(): AutoPilotSettings {
        return this.settings;
    }

    async analyze(): Promise<AutoPilotReport> {
        await this.loadSettings();
        const tabs = await tabService.getAllTabs();
        const duplicateGroups = tabService.findDuplicates(tabs);
        const duplicateIds = new Set(duplicateGroups.flat().map(t => t.id));

        // Get tab health info for each tab
        const tabHealths: TabHealth[] = await Promise.all(
            tabs.map(tab => this.analyzeTab(tab, duplicateIds))
        );

        // Group by category
        const categoryGroups: { [key: string]: TabHealth[] } = {};
        for (const th of tabHealths) {
            if (!categoryGroups[th.category]) {
                categoryGroups[th.category] = [];
            }
            categoryGroups[th.category].push(th);
        }

        // Find close suggestions
        const closeSuggestions = tabHealths.filter(th => th.recommendation === 'close');

        // Find memory hogs (top 5 by memory, if above threshold)
        const memoryHogs = tabHealths
            .filter(th => th.memoryMB && th.memoryMB > this.settings.memoryThresholdMB)
            .sort((a, b) => (b.memoryMB || 0) - (a.memoryMB || 0))
            .slice(0, 5);

        // Generate group suggestions based on categories
        const groupSuggestions: { name: string; tabIds: number[] }[] = [];
        for (const [category, healthTabs] of Object.entries(categoryGroups)) {
            if (healthTabs.length >= 2 && category !== 'Other') {
                groupSuggestions.push({
                    name: category,
                    tabIds: healthTabs.map(th => th.tabId)
                });
            }
        }

        // Calculate totals
        const totalMemoryMB = tabHealths.reduce((sum, th) => sum + (th.memoryMB || 0), 0);
        const staleCount = tabHealths.filter(th => th.isStale).length;
        const duplicateCount = duplicateGroups.reduce((sum, g) => sum + g.length - 1, 0);

        return {
            totalTabs: tabs.length,
            totalMemoryMB: Math.round(totalMemoryMB),
            staleCount,
            duplicateCount,
            categoryGroups,
            recommendations: {
                closeSuggestions,
                groupSuggestions,
                memoryHogs
            }
        };
    }

    async analyzeWithAI(): Promise<AutoPilotReport> {
        const report = await this.analyze();

        // Get AI insights
        try {
            const tabSummary = Object.entries(report.categoryGroups)
                .map(([cat, tabs]) => `${cat}: ${tabs.length} tabs`)
                .join('\n');

            const prompt = `Analyze these browser tabs and provide brief tactical insights:

Categories:
${tabSummary}

Stats:
- Total: ${report.totalTabs} tabs
- Stale (>${this.settings.staleDaysThreshold} days): ${report.staleCount}
- Duplicates: ${report.duplicateCount}
- Memory usage: ${report.totalMemoryMB}MB

Give 2-3 actionable recommendations for better tab hygiene. Be concise.`;

            report.aiInsights = await aiService.prompt(prompt);
        } catch (err: any) {
            report.aiInsights = `AI analysis unavailable: ${err.message}`;
        }

        return report;
    }

    private async analyzeTab(tab: TabInfo, duplicateIds: Set<number>): Promise<TabHealth> {
        const now = Date.now();
        const lastAccessed = tab.lastAccessed || now;
        const staleDays = Math.floor((now - lastAccessed) / (1000 * 60 * 60 * 24));
        const isStale = staleDays >= this.settings.staleDaysThreshold;
        const isDuplicate = duplicateIds.has(tab.id);

        // Categorize by domain
        const category = this.categorizeTab(tab);

        // Determine recommendation
        let recommendation: 'keep' | 'close' | 'review' = 'keep';
        let reason = 'Active tab';

        if (tab.pinned && this.settings.excludePinned) {
            recommendation = 'keep';
            reason = 'Pinned tab';
        } else if (tab.active && this.settings.excludeActive) {
            recommendation = 'keep';
            reason = 'Currently active';
        } else if (isDuplicate) {
            recommendation = 'close';
            reason = 'Duplicate tab';
        } else if (isStale) {
            recommendation = 'close';
            reason = `Not accessed in ${staleDays} days`;
        } else if (staleDays >= Math.floor(this.settings.staleDaysThreshold / 2)) {
            recommendation = 'review';
            reason = `Not accessed in ${staleDays} days`;
        }

        return {
            tabId: tab.id,
            title: tab.title,
            url: tab.url,
            favicon: tab.favIconUrl,
            lastAccessed,
            staleDays,
            category,
            isStale,
            isDuplicate,
            recommendation,
            reason
        };
    }

    private categorizeTab(tab: TabInfo): string {
        const url = tab.url.toLowerCase();
        const title = tab.title.toLowerCase();

        // Social Media
        if (url.includes('facebook.com') || url.includes('twitter.com') ||
            url.includes('instagram.com') || url.includes('linkedin.com') ||
            url.includes('reddit.com') || url.includes('tiktok.com')) {
            return 'Social Media';
        }

        // Development
        if (url.includes('github.com') || url.includes('gitlab.com') ||
            url.includes('stackoverflow.com') || url.includes('localhost') ||
            url.includes('codepen.io') || url.includes('codesandbox.io') ||
            title.includes('documentation') || title.includes('api reference')) {
            return 'Development';
        }

        // Email & Communication
        if (url.includes('mail.google.com') || url.includes('outlook.') ||
            url.includes('slack.com') || url.includes('discord.com') ||
            url.includes('teams.microsoft.com')) {
            return 'Communication';
        }

        // Shopping
        if (url.includes('amazon.') || url.includes('ebay.') ||
            url.includes('shopify') || url.includes('etsy.com') ||
            title.includes('cart') || title.includes('checkout')) {
            return 'Shopping';
        }

        // Entertainment
        if (url.includes('youtube.com') || url.includes('netflix.com') ||
            url.includes('spotify.com') || url.includes('twitch.tv') ||
            url.includes('hulu.com') || url.includes('disney')) {
            return 'Entertainment';
        }

        // News & Media
        if (url.includes('news') || url.includes('cnn.com') ||
            url.includes('bbc.') || url.includes('nytimes.com') ||
            url.includes('medium.com') || url.includes('substack.com')) {
            return 'News & Reading';
        }

        // Productivity
        if (url.includes('docs.google.com') || url.includes('notion.') ||
            url.includes('trello.com') || url.includes('asana.com') ||
            url.includes('figma.com') || url.includes('canva.com')) {
            return 'Productivity';
        }

        // Search
        if (url.includes('google.com/search') || url.includes('bing.com/search') ||
            url.includes('duckduckgo.com')) {
            return 'Search';
        }

        // Finance
        if (url.includes('bank') || url.includes('paypal.com') ||
            url.includes('venmo.com') || url.includes('coinbase.com') ||
            url.includes('robinhood.com')) {
            return 'Finance';
        }

        return 'Other';
    }

    async executeCleanup(tabIds: number[]): Promise<{ closed: number }> {
        await tabService.closeTabs(tabIds);
        return { closed: tabIds.length };
    }

    async executeGrouping(groups: { name: string; tabIds: number[] }[]): Promise<{ grouped: number }> {
        let totalGrouped = 0;
        for (const group of groups) {
            if (group.tabIds.length >= 2) {
                await tabService.groupTabs(group.tabIds, group.name);
                totalGrouped += group.tabIds.length;
            }
        }
        return { grouped: totalGrouped };
    }

    async executeAutoPilot(): Promise<{
        report: AutoPilotReport;
        actions: { closed: number; grouped: number };
    }> {
        await this.loadSettings();
        const report = await this.analyzeWithAI();
        const actions = { closed: 0, grouped: 0 };

        // Auto-close stale tabs if enabled
        if (this.settings.autoCloseStale && report.recommendations.closeSuggestions.length > 0) {
            const tabsToClose = report.recommendations.closeSuggestions
                .filter(th => th.isStale || th.isDuplicate)
                .map(th => th.tabId);
            if (tabsToClose.length > 0) {
                const result = await this.executeCleanup(tabsToClose);
                actions.closed = result.closed;
            }
        }

        // Auto-group by category if enabled
        if (this.settings.autoGroupByCategory && report.recommendations.groupSuggestions.length > 0) {
            const result = await this.executeGrouping(report.recommendations.groupSuggestions);
            actions.grouped = result.grouped;
        }

        return { report, actions };
    }
}

export const autoPilotService = new AutoPilotService();
