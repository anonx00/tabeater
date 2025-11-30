interface TabInfo {
    id: number;
    title: string;
    url: string;
    favIconUrl?: string;
    active: boolean;
    pinned: boolean;
    groupId: number;
    windowId: number;
    lastAccessed?: number;
}

interface TabGroup {
    id: string;
    name: string;
    tabs: TabInfo[];
    color?: string;
}

interface TabAnalysis {
    category: string;
    priority: 'high' | 'medium' | 'low';
    suggestion?: string;
}

class TabService {
    async getAllTabs(): Promise<TabInfo[]> {
        const tabs = await chrome.tabs.query({});
        return tabs.map(this.mapTab);
    }

    async getWindowTabs(windowId?: number): Promise<TabInfo[]> {
        const tabs = await chrome.tabs.query({
            windowId: windowId || chrome.windows.WINDOW_ID_CURRENT
        });
        return tabs.map(this.mapTab);
    }

    async getActiveTab(): Promise<TabInfo | null> {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        return tabs[0] ? this.mapTab(tabs[0]) : null;
    }

    private mapTab(tab: chrome.tabs.Tab): TabInfo {
        return {
            id: tab.id!,
            title: tab.title || 'Untitled',
            url: tab.url || '',
            favIconUrl: tab.favIconUrl,
            active: tab.active,
            pinned: tab.pinned,
            groupId: tab.groupId,
            windowId: tab.windowId,
            lastAccessed: (tab as any).lastAccessed
        };
    }

    async closeTab(tabId: number): Promise<void> {
        await chrome.tabs.remove(tabId);
    }

    async closeTabs(tabIds: number[]): Promise<void> {
        await chrome.tabs.remove(tabIds);
    }

    async groupTabs(tabIds: number[], title: string): Promise<number> {
        // Check if a group with this title already exists
        const existingGroups = await chrome.tabGroups.query({ title });

        if (existingGroups.length > 0) {
            // Add tabs to existing group instead of creating duplicate
            const groupId = existingGroups[0].id;
            await chrome.tabs.group({ tabIds, groupId });
            return groupId;
        }

        // Create new group if none exists
        const groupId = await chrome.tabs.group({ tabIds });
        await chrome.tabGroups.update(groupId, { title });
        return groupId;
    }

    async getTabContent(tabId: number): Promise<string> {
        try {
            const results = await chrome.scripting.executeScript({
                target: { tabId },
                func: () => {
                    const content = document.body?.innerText || '';
                    return content.slice(0, 5000);
                }
            });
            return results[0]?.result || '';
        } catch {
            return '';
        }
    }

    groupByDomain(tabs: TabInfo[]): TabGroup[] {
        const groups: Map<string, TabInfo[]> = new Map();

        for (const tab of tabs) {
            try {
                const domain = new URL(tab.url).hostname || 'Other';
                if (!groups.has(domain)) {
                    groups.set(domain, []);
                }
                groups.get(domain)!.push(tab);
            } catch {
                if (!groups.has('Other')) {
                    groups.set('Other', []);
                }
                groups.get('Other')!.push(tab);
            }
        }

        return Array.from(groups.entries()).map(([name, tabs]) => ({
            id: name,
            name,
            tabs
        }));
    }

    findDuplicates(tabs: TabInfo[]): TabInfo[][] {
        const urlMap: Map<string, TabInfo[]> = new Map();

        for (const tab of tabs) {
            const normalizedUrl = this.normalizeUrl(tab.url);
            if (!urlMap.has(normalizedUrl)) {
                urlMap.set(normalizedUrl, []);
            }
            urlMap.get(normalizedUrl)!.push(tab);
        }

        return Array.from(urlMap.values()).filter(group => group.length > 1);
    }

    private normalizeUrl(url: string): string {
        try {
            const parsed = new URL(url);
            // Include hostname, pathname, and search params for accurate duplicate detection
            // Only tabs with EXACT same URL (minus fragment) are considered duplicates
            let normalized = `${parsed.hostname}${parsed.pathname}`;
            if (parsed.search) {
                normalized += parsed.search;
            }
            return normalized.replace(/\/$/, '');
        } catch {
            return url;
        }
    }

    async searchTabs(query: string): Promise<TabInfo[]> {
        const tabs = await this.getAllTabs();
        const lowerQuery = query.toLowerCase();

        return tabs.filter(tab =>
            tab.title.toLowerCase().includes(lowerQuery) ||
            tab.url.toLowerCase().includes(lowerQuery)
        );
    }
}

export const tabService = new TabService();
export type { TabInfo, TabGroup, TabAnalysis };
