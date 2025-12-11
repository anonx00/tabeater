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

export interface TabAnalytics {
    topDomains: { domain: string; count: number; percentage: number }[];
    categoryBreakdown: { category: string; count: number; percentage: number }[];
    avgTabAge: number;
    oldestTabDays: number;
    healthScore: number; // 0-100
    healthLabel: 'Excellent' | 'Good' | 'Fair' | 'Needs Attention';
    insights: string[];
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
    analytics?: TabAnalytics;
    aiInsights?: string;
}

// AutoPilot operation modes
export type AutoPilotMode = 'manual' | 'auto-cleanup' | 'fly-mode';

export interface AutoPilotSettings {
    // Mode: manual (user clicks), auto-cleanup (closes stale/dupes), fly-mode (full auto)
    mode: AutoPilotMode;
    staleDaysThreshold: number;
    autoCloseStale: boolean;
    autoGroupByCategory: boolean;
    memoryThresholdMB: number;
    excludePinned: boolean;
    excludeActive: boolean;
    // Fly mode specific settings
    flyModeDebounceMs: number; // Wait time after tab load before processing
    showNotifications: boolean; // Show toast notifications for auto actions
}

const DEFAULT_SETTINGS: AutoPilotSettings = {
    mode: 'manual',
    staleDaysThreshold: 7,
    autoCloseStale: false,
    autoGroupByCategory: false,
    memoryThresholdMB: 500,
    excludePinned: true,
    excludeActive: true,
    flyModeDebounceMs: 5000, // 5 seconds after tab loads
    showNotifications: true,
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

        // FIX: Only mark duplicates EXCEPT the first/active one (keep one tab per group)
        const duplicateIds = new Set<number>();
        duplicateGroups.forEach(group => {
            // Sort to keep the active tab or the first one found
            const sortedGroup = [...group].sort((a, b) => {
                if (a.active) return -1;
                if (b.active) return 1;
                return 0;
            });

            // Add all EXCEPT the first one to the duplicateIds set (these will be closed)
            for (let i = 1; i < sortedGroup.length; i++) {
                duplicateIds.add(sortedGroup[i].id);
            }
        });

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

        // Calculate analytics
        const analytics = this.calculateAnalytics(tabs, tabHealths, categoryGroups, staleCount, duplicateCount);

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
            },
            analytics
        };
    }

    private calculateAnalytics(
        tabs: TabInfo[],
        tabHealths: TabHealth[],
        categoryGroups: { [key: string]: TabHealth[] },
        staleCount: number,
        duplicateCount: number
    ): TabAnalytics {
        const totalTabs = tabs.length;

        // Top domains
        const domainCounts: Map<string, number> = new Map();
        for (const tab of tabs) {
            try {
                const domain = new URL(tab.url).hostname.replace('www.', '');
                domainCounts.set(domain, (domainCounts.get(domain) || 0) + 1);
            } catch {
                // Skip invalid URLs
            }
        }
        const topDomains = Array.from(domainCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([domain, count]) => ({
                domain,
                count,
                percentage: Math.round((count / totalTabs) * 100)
            }));

        // Category breakdown
        const categoryBreakdown = Object.entries(categoryGroups)
            .map(([category, tabs]) => ({
                category,
                count: tabs.length,
                percentage: Math.round((tabs.length / totalTabs) * 100)
            }))
            .sort((a, b) => b.count - a.count);

        // Tab age stats
        const now = Date.now();
        const tabAges = tabHealths.map(th => th.staleDays);
        const avgTabAge = tabAges.length > 0
            ? Math.round(tabAges.reduce((a, b) => a + b, 0) / tabAges.length)
            : 0;
        const oldestTabDays = tabAges.length > 0 ? Math.max(...tabAges) : 0;

        // Health score calculation (0-100)
        let healthScore = 100;

        // Deduct for stale tabs (up to -30)
        const stalePercentage = totalTabs > 0 ? staleCount / totalTabs : 0;
        healthScore -= Math.min(30, Math.round(stalePercentage * 60));

        // Deduct for duplicates (up to -20)
        const dupePercentage = totalTabs > 0 ? duplicateCount / totalTabs : 0;
        healthScore -= Math.min(20, Math.round(dupePercentage * 40));

        // Deduct for too many tabs (up to -20)
        if (totalTabs > 50) healthScore -= 10;
        if (totalTabs > 100) healthScore -= 10;

        // Deduct for too many "Other" category (up to -15)
        const otherCount = categoryGroups['Other']?.length || 0;
        const otherPercentage = totalTabs > 0 ? otherCount / totalTabs : 0;
        healthScore -= Math.min(15, Math.round(otherPercentage * 30));

        // Bonus for good organization (up to +10)
        const categories = Object.keys(categoryGroups).filter(c => c !== 'Other').length;
        if (categories >= 3) healthScore += 5;
        if (categories >= 5) healthScore += 5;

        healthScore = Math.max(0, Math.min(100, healthScore));

        const healthLabel: TabAnalytics['healthLabel'] =
            healthScore >= 80 ? 'Excellent' :
            healthScore >= 60 ? 'Good' :
            healthScore >= 40 ? 'Fair' : 'Needs Attention';

        // Generate insights
        const insights: string[] = [];

        if (staleCount > 0) {
            insights.push(`${staleCount} tab${staleCount > 1 ? 's' : ''} haven't been accessed in ${this.settings.staleDaysThreshold}+ days`);
        }
        if (duplicateCount > 0) {
            insights.push(`${duplicateCount} duplicate tab${duplicateCount > 1 ? 's' : ''} found`);
        }
        if (topDomains[0] && topDomains[0].percentage > 30) {
            insights.push(`${topDomains[0].domain} dominates your tabs (${topDomains[0].percentage}%)`);
        }
        if (totalTabs > 50) {
            insights.push(`You have ${totalTabs} tabs open - consider closing some`);
        }
        if (avgTabAge > 3) {
            insights.push(`Average tab age is ${avgTabAge} days`);
        }
        if (oldestTabDays > 14) {
            insights.push(`Your oldest tab is ${oldestTabDays} days old`);
        }
        if (insights.length === 0) {
            insights.push('Your tabs are well organized!');
        }

        return {
            topDomains,
            categoryBreakdown,
            avgTabAge,
            oldestTabDays,
            healthScore,
            healthLabel,
            insights
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

    // Made public for auto-grouping feature
    categorizeTab(tab: TabInfo): string {
        const url = tab.url.toLowerCase();
        const title = tab.title.toLowerCase();

        // AI & Chat Assistants (highest priority - recognize all AI tools)
        if (url.includes('chat.openai.com') || url.includes('chatgpt.com') ||
            url.includes('claude.ai') || url.includes('anthropic.com') ||
            url.includes('grok.x.ai') || url.includes('x.com/i/grok') ||
            url.includes('gemini.google.com') || url.includes('bard.google.com') ||
            url.includes('aistudio.google.com') || url.includes('ai.google') ||
            url.includes('perplexity.ai') || url.includes('poe.com') ||
            url.includes('character.ai') || url.includes('huggingface.co/chat') ||
            url.includes('copilot.microsoft.com') || url.includes('bing.com/chat') ||
            url.includes('you.com') || url.includes('phind.com') ||
            url.includes('mistral.ai') || url.includes('cohere.ai') ||
            title.includes('chatgpt') || title.includes('claude') ||
            title.includes('grok') || title.includes('gemini') ||
            title.includes('copilot') || title.includes('perplexity')) {
            return 'AI';
        }

        // Cloud & DevOps
        if (url.includes('console.cloud.google') || url.includes('cloud.google.com') ||
            url.includes('console.aws.amazon') || url.includes('aws.amazon.com') ||
            url.includes('portal.azure.com') || url.includes('azure.microsoft.com') ||
            url.includes('vercel.com') || url.includes('netlify.com') ||
            url.includes('heroku.com') || url.includes('railway.app') ||
            url.includes('firebase.google.com') || url.includes('supabase.com') ||
            url.includes('digitalocean.com') || url.includes('cloudflare.com')) {
            return 'Cloud';
        }

        // Development
        if (url.includes('github.com') || url.includes('gitlab.com') ||
            url.includes('bitbucket.org') || url.includes('stackoverflow.com') ||
            url.includes('localhost') || url.includes('127.0.0.1') ||
            url.includes('codepen.io') || url.includes('codesandbox.io') ||
            url.includes('replit.com') || url.includes('jsfiddle.net') ||
            url.includes('npmjs.com') || url.includes('pypi.org') ||
            title.includes('documentation') || title.includes('api reference') ||
            title.includes('docs') || url.includes('/docs')) {
            return 'Dev';
        }

        // Social Media
        if (url.includes('facebook.com') || url.includes('twitter.com') ||
            url.includes('x.com') || url.includes('instagram.com') ||
            url.includes('linkedin.com') || url.includes('reddit.com') ||
            url.includes('tiktok.com') || url.includes('threads.net') ||
            url.includes('mastodon')) {
            return 'Social';
        }

        // Email & Communication
        if (url.includes('mail.google.com') || url.includes('outlook.') ||
            url.includes('protonmail.com') || url.includes('yahoo.com/mail') ||
            url.includes('slack.com') || url.includes('discord.com') ||
            url.includes('teams.microsoft.com') || url.includes('zoom.us') ||
            url.includes('meet.google.com')) {
            return 'Communication';
        }

        // Payments & Finance
        if (url.includes('stripe.com') || url.includes('paypal.com') ||
            url.includes('square.com') || url.includes('venmo.com') ||
            url.includes('coinbase.com') || url.includes('robinhood.com') ||
            url.includes('bank') || url.includes('billing') ||
            title.includes('payment') || title.includes('checkout') ||
            title.includes('invoice') || title.includes('billing')) {
            return 'Finance';
        }

        // Shopping
        if (url.includes('amazon.') || url.includes('ebay.') ||
            url.includes('shopify') || url.includes('etsy.com') ||
            url.includes('aliexpress.com') || url.includes('walmart.com') ||
            title.includes('cart') || title.includes('shopping')) {
            return 'Shopping';
        }

        // Streaming & Entertainment
        if (url.includes('youtube.com') || url.includes('netflix.com') ||
            url.includes('spotify.com') || url.includes('twitch.tv') ||
            url.includes('hulu.com') || url.includes('disney') ||
            url.includes('primevideo.com') || url.includes('hbomax.com') ||
            url.includes('crunchyroll.com') || url.includes('anime') ||
            url.includes('stan.com.au')) {
            return 'Entertainment';
        }

        // News & Reading
        if (url.includes('news') || url.includes('cnn.com') ||
            url.includes('bbc.') || url.includes('nytimes.com') ||
            url.includes('medium.com') || url.includes('substack.com') ||
            url.includes('techcrunch.com') || url.includes('theverge.com') ||
            url.includes('arstechnica.com')) {
            return 'News';
        }

        // Productivity
        if (url.includes('docs.google.com') || url.includes('sheets.google.com') ||
            url.includes('slides.google.com') || url.includes('notion.') ||
            url.includes('trello.com') || url.includes('asana.com') ||
            url.includes('monday.com') || url.includes('clickup.com') ||
            url.includes('figma.com') || url.includes('canva.com') ||
            url.includes('miro.com') || url.includes('airtable.com')) {
            return 'Productivity';
        }

        // Search
        if (url.includes('google.com/search') || url.includes('bing.com/search') ||
            url.includes('duckduckgo.com') || url.includes('ecosia.org')) {
            return 'Search';
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

    // Fly Mode: Check if a newly loaded tab is a duplicate
    async checkDuplicate(tab: TabInfo): Promise<{ isDuplicate: boolean; existingTabId?: number }> {
        const allTabs = await tabService.getAllTabs();
        const sameUrlTabs = allTabs.filter(t => t.url === tab.url && t.id !== tab.id);

        if (sameUrlTabs.length > 0) {
            // Keep the older tab (lower ID) or the active one
            const existingTab = sameUrlTabs.find(t => t.active) || sameUrlTabs[0];
            return { isDuplicate: true, existingTabId: existingTab.id };
        }

        return { isDuplicate: false };
    }

    // Fly Mode: Process a newly loaded tab
    async processNewTab(tab: TabInfo): Promise<{
        action: 'none' | 'closed-duplicate' | 'grouped';
        message?: string;
    }> {
        await this.loadSettings();

        // Only process in fly-mode or auto-cleanup mode
        if (this.settings.mode === 'manual') {
            return { action: 'none' };
        }

        // Skip pinned/active if configured
        if (this.settings.excludePinned && tab.pinned) {
            return { action: 'none' };
        }
        if (this.settings.excludeActive && tab.active) {
            return { action: 'none' };
        }

        // Check for duplicates (works in both auto-cleanup and fly-mode)
        const dupCheck = await this.checkDuplicate(tab);
        if (dupCheck.isDuplicate) {
            // Close the new tab (the duplicate)
            await tabService.closeTab(tab.id);
            return {
                action: 'closed-duplicate',
                message: `Closed duplicate: ${tab.title.slice(0, 30)}...`
            };
        }

        // Auto-grouping only in fly-mode
        if (this.settings.mode === 'fly-mode') {
            const category = this.categorizeTab(tab);
            if (category && category !== 'Other') {
                // Find existing group with this category
                try {
                    const groups = await chrome.tabGroups.query({ title: category, windowId: tab.windowId });
                    if (groups.length > 0) {
                        await chrome.tabs.group({ tabIds: tab.id, groupId: groups[0].id });
                        return {
                            action: 'grouped',
                            message: `Added to ${category} group`
                        };
                    }
                } catch {
                    // Silently fail - grouping is optional
                }
            }
        }

        return { action: 'none' };
    }

    // Get the current autopilot mode
    getMode(): AutoPilotMode {
        return this.settings.mode;
    }

    // Check if fly mode is active
    isFlyModeActive(): boolean {
        return this.settings.mode === 'fly-mode';
    }

    // Check if auto-cleanup is active
    isAutoCleanupActive(): boolean {
        return this.settings.mode === 'auto-cleanup' || this.settings.mode === 'fly-mode';
    }
}

export const autoPilotService = new AutoPilotService();
