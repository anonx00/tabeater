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
    // Pending tabs waiting to be grouped (key: windowId-category)
    private pendingGroupTabs: Map<string, { ids: number[]; windowId: number }> = new Map();
    private pendingGroupTimeout: ReturnType<typeof setTimeout> | null = null;

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

        // Generate group suggestions using AI only (no fallback - AI is the core feature)
        let groupSuggestions: { name: string; tabIds: number[] }[] = [];
        try {
            groupSuggestions = await this.generateAIGroupSuggestions(tabs);
        } catch (err) {
            // AI failed - log but don't use fallback (user needs to configure AI)
            console.warn('[AutoPilot] AI grouping failed:', err);
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

    private async generateAIGroupSuggestions(tabs: TabInfo[]): Promise<{ name: string; tabIds: number[] }[]> {
        if (tabs.length < 2) return [];

        // Prepare tab data for AI
        const tabList = tabs.map(t => {
            try {
                return `${t.id}|${t.title.slice(0, 50)}|${new URL(t.url).hostname}`;
            } catch {
                return `${t.id}|${t.title.slice(0, 50)}|unknown`;
            }
        }).join('\n');

        const response = await aiService.prompt(
            `Group these browser tabs by what the user is working on. Return ONLY a JSON array.

Tabs (id|title|domain):
${tabList}

Rules:
- Group by PURPOSE and CONTEXT, not just by website
- Tabs that are part of the same task/project should be together
- Use short 1-2 word group names that describe the activity
- Only create groups with 2+ related tabs
- Maximum 6 groups
- Skip tabs that don't fit any group

Return JSON: [{"name":"GroupName","ids":[1,2,3]}]`
        );

        // Parse AI response
        const jsonMatch = response.match(/\[[\s\S]*\]/);
        if (!jsonMatch) return [];

        const groups = JSON.parse(jsonMatch[0]) as { name: string; ids: number[] }[];

        // Validate and filter
        const validTabIds = new Set(tabs.map(t => t.id));
        return groups
            .filter(g => g.name && g.ids && g.ids.length >= 2)
            .map(g => ({
                name: g.name,
                tabIds: g.ids.filter(id => validTabIds.has(id))
            }))
            .filter(g => g.tabIds.length >= 2)
            .slice(0, 6);
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

    // AI-powered tab categorization - no hardcoded patterns
    async categorizeTabWithAI(tab: TabInfo): Promise<string> {
        try {
            const canUseAI = await aiService.canMakeCall();
            if (!canUseAI.allowed) {
                return this.fallbackCategorize(tab);
            }

            const hostname = this.getHostname(tab.url);
            const response = await aiService.prompt(
                `Categorize this browser tab in 1-2 words. Return ONLY the category name.

Tab: "${tab.title}"
Site: ${hostname}

Return a short category like: Dev, Social, Video, Music, News, Shopping, Email, Docs, Search, Chat, Finance, Gaming, or similar.
Just the category name, nothing else.`
            );

            const category = response.trim().split('\n')[0].replace(/[^a-zA-Z0-9\s]/g, '').trim();
            return category.length > 0 && category.length <= 20 ? category : this.fallbackCategorize(tab);
        } catch {
            return this.fallbackCategorize(tab);
        }
    }

    // Simple fallback when AI is unavailable - uses domain name
    private fallbackCategorize(tab: TabInfo): string {
        const hostname = this.getHostname(tab.url);
        if (!hostname || hostname === 'localhost' || hostname.match(/^[\d.]+$/)) {
            return 'Local';
        }
        // Use the main part of domain as category (e.g., "github" from "github.com")
        const parts = hostname.replace('www.', '').split('.');
        const name = parts[0];
        return name.charAt(0).toUpperCase() + name.slice(1);
    }

    private getHostname(url: string): string {
        try {
            return new URL(url).hostname;
        } catch {
            return '';
        }
    }

    // Synchronous categorize for backward compatibility - uses simple domain extraction
    categorizeTab(tab: TabInfo): string {
        return this.fallbackCategorize(tab);
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
        action: 'none' | 'closed-duplicate' | 'grouped' | 'pending-group';
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
            try {
                // First, try to find an existing group that matches
                const bestGroup = await this.findBestGroupForTab(tab);
                if (bestGroup) {
                    await chrome.tabs.group({ tabIds: tab.id, groupId: bestGroup.id });
                    return {
                        action: 'grouped',
                        message: `Added to ${bestGroup.title} group`
                    };
                }

                // No existing group found - categorize the tab and queue for grouping
                const category = this.categorizeTab(tab);

                // Skip "Other" category - too generic
                if (category === 'Other') {
                    return { action: 'none' };
                }

                // Check if there are ungrouped tabs with the same category in this window
                const allTabs = await tabService.getAllTabs();
                const sameCategoryTabs = allTabs.filter(t =>
                    t.windowId === tab.windowId &&
                    t.id !== tab.id &&
                    (t.groupId === undefined || t.groupId === -1) &&
                    this.categorizeTab(t) === category
                );

                if (sameCategoryTabs.length >= 1) {
                    // We have 2+ tabs (current + at least 1 other) - create a group now
                    const tabIdsToGroup = [tab.id, ...sameCategoryTabs.map(t => t.id)];
                    const groupId = await chrome.tabs.group({ tabIds: tabIdsToGroup });

                    // Set group title and color
                    const color = this.getCategoryColor(category);
                    await chrome.tabGroups.update(groupId, {
                        title: category,
                        color: color
                    });

                    return {
                        action: 'grouped',
                        message: `Created ${category} group with ${tabIdsToGroup.length} tabs`
                    };
                }

                // Only 1 tab of this category - add to pending queue
                const pendingKey = `${tab.windowId}-${category}`;
                if (!this.pendingGroupTabs.has(pendingKey)) {
                    this.pendingGroupTabs.set(pendingKey, { ids: [], windowId: tab.windowId });
                }
                const pending = this.pendingGroupTabs.get(pendingKey)!;
                if (!pending.ids.includes(tab.id)) {
                    pending.ids.push(tab.id);
                }

                // Schedule a check to create groups from pending tabs
                this.schedulePendingGroupCheck();

                return {
                    action: 'pending-group',
                    message: `Queued for ${category} group`
                };
            } catch (err) {
                console.warn('[AutoPilot] Auto-grouping for new tab failed:', err);
            }
        }

        return { action: 'none' };
    }

    // Schedule a check to create groups from pending tabs
    private schedulePendingGroupCheck(): void {
        if (this.pendingGroupTimeout) {
            clearTimeout(this.pendingGroupTimeout);
        }

        // Wait 10 seconds to accumulate more tabs before creating groups
        this.pendingGroupTimeout = setTimeout(async () => {
            await this.processPendingGroups();
        }, 10000);
    }

    // Process pending tabs and create groups where we have 2+ tabs
    private async processPendingGroups(): Promise<void> {
        const entries = Array.from(this.pendingGroupTabs.entries());
        for (const [key, data] of entries) {
            if (data.ids.length >= 2) {
                try {
                    // Verify tabs still exist and are ungrouped
                    const validIds: number[] = [];
                    for (const id of data.ids) {
                        try {
                            const tab = await chrome.tabs.get(id);
                            if (tab && (tab.groupId === undefined || tab.groupId === -1)) {
                                validIds.push(id);
                            }
                        } catch {
                            // Tab no longer exists
                        }
                    }

                    if (validIds.length >= 2) {
                        const category = key.split('-').slice(1).join('-'); // Extract category from key
                        const groupId = await chrome.tabs.group({ tabIds: validIds });
                        const color = this.getCategoryColor(category);
                        await chrome.tabGroups.update(groupId, {
                            title: category,
                            color: color
                        });
                        console.log(`[AutoPilot] Created ${category} group with ${validIds.length} tabs`);
                    }
                } catch (err) {
                    console.warn('[AutoPilot] Failed to create pending group:', err);
                }
            }
            this.pendingGroupTabs.delete(key);
        }
    }

    // Get a color for a category - uses hash for consistent colors
    private getCategoryColor(category: string): chrome.tabGroups.ColorEnum {
        const colors: chrome.tabGroups.ColorEnum[] = [
            'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'
        ];
        // Simple hash to get consistent color for same category name
        let hash = 0;
        for (let i = 0; i < category.length; i++) {
            hash = ((hash << 5) - hash) + category.charCodeAt(i);
            hash = hash & hash;
        }
        return colors[Math.abs(hash) % colors.length];
    }

    // AI-powered: Find the best existing group for a new tab
    private async findBestGroupForTab(tab: TabInfo): Promise<chrome.tabGroups.TabGroup | null> {
        // Get existing tab groups in this window
        const groups = await chrome.tabGroups.query({ windowId: tab.windowId });
        if (groups.length === 0) return null;

        // Check if we can make an AI call (rate limiting)
        const canUseAI = await aiService.canMakeCall();
        if (!canUseAI.allowed) {
            console.log(`[AutoPilot] AI limit reached: ${canUseAI.reason}`);
            return null; // Skip grouping when limit reached
        }

        try {
            // Get group names
            const groupNames = groups.map(g => g.title || 'Unnamed').join(', ');
            const hostname = this.getHostname(tab.url);

            // Ask AI which group fits best
            const response = await aiService.prompt(
                `Which group should this tab belong to? Return ONLY the group name or "none".

Tab: "${tab.title}" (${hostname})

Available groups: ${groupNames}

Based on what this tab is about and what the groups represent, which group fits best? Return the exact group name or "none" if it doesn't fit any.`
            );

            const suggestedGroup = response.trim().toLowerCase();
            if (suggestedGroup === 'none') return null;

            // Find matching group (case-insensitive)
            return groups.find(g =>
                g.title?.toLowerCase() === suggestedGroup ||
                g.title?.toLowerCase().includes(suggestedGroup) ||
                suggestedGroup.includes(g.title?.toLowerCase() || '')
            ) || null;
        } catch (err) {
            console.warn('[AutoPilot] AI grouping failed:', err);
            return null;
        }
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
