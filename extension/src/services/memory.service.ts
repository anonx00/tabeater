/**
 * Memory Service - Production Memory Tracking
 * Uses Chrome Processes API for actual memory usage
 */

interface TabMemoryInfo {
    tabId: number;
    actualMB: number;  // Real memory from Chrome API
    url: string;
    title: string;
    isAudible: boolean;
    hasMedia: boolean;
    processId?: number;
}

interface MemoryReport {
    totalMB: number;
    tabs: TabMemoryInfo[];
    heavyTabs: TabMemoryInfo[];
    systemMemory?: {
        availableMB: number;
        capacityMB: number;
        usedMB: number;
    };
    browserMemoryMB: number;
}

class MemoryService {
    private processCache: Map<number, number> = new Map(); // tabId -> processId
    private lastCacheUpdate: number = 0;
    private readonly CACHE_TTL = 5000; // 5 seconds

    /**
     * Get actual memory usage for all tabs using Chrome Processes API
     */
    async generateReport(): Promise<MemoryReport> {
        const tabs = await chrome.tabs.query({});
        const tabMemoryInfo: TabMemoryInfo[] = [];
        let totalMB = 0;
        let browserMemoryMB = 0;

        try {
            // Step 1: Get process info for all processes
            const processes = await this.getProcessMemory();
            const processMap = new Map(processes.map(p => [p.id, p]));

            // Step 2: Get process IDs for all tabs
            await this.updateProcessCache(tabs.map(t => t.id!).filter(Boolean));

            // Step 3: Match tabs to their process memory
            for (const tab of tabs) {
                if (!tab.id) continue;

                const processId = this.processCache.get(tab.id);
                const process = processId ? processMap.get(processId) : null;

                const actualMB = process ? process.memoryMB : this.getEstimatedMemory(tab);
                totalMB += actualMB;

                tabMemoryInfo.push({
                    tabId: tab.id,
                    actualMB,
                    url: tab.url || '',
                    title: tab.title || 'Untitled',
                    isAudible: tab.audible || false,
                    hasMedia: this.hasMediaContent(tab.url || ''),
                    processId,
                });
            }

            // Calculate total browser memory usage
            browserMemoryMB = processes.reduce((sum, proc) => sum + proc.memoryMB, 0);

        } catch (error) {
            console.error('Failed to get process memory:', error);
            return this.getFallbackReport(tabs);
        }

        // Sort by memory usage (descending)
        const heavyTabs = [...tabMemoryInfo]
            .sort((a, b) => b.actualMB - a.actualMB)
            .slice(0, 10);

        // Get system memory
        let systemMemory: MemoryReport['systemMemory'];
        try {
            if (chrome.system && chrome.system.memory) {
                const memInfo = await chrome.system.memory.getInfo();
                const capacityMB = memInfo.capacity / 1024 / 1024;
                const availableMB = memInfo.availableCapacity / 1024 / 1024;
                systemMemory = {
                    availableMB: Math.round(availableMB),
                    capacityMB: Math.round(capacityMB),
                    usedMB: Math.round(capacityMB - availableMB),
                };
            }
        } catch {
            // System memory API not available
        }

        return {
            totalMB: Math.round(totalMB),
            tabs: tabMemoryInfo,
            heavyTabs,
            systemMemory,
            browserMemoryMB: Math.round(browserMemoryMB),
        };
    }

    /**
     * Update process cache for given tab IDs
     */
    private async updateProcessCache(tabIds: number[]): Promise<void> {
        const now = Date.now();
        if (now - this.lastCacheUpdate < this.CACHE_TTL) {
            return; // Cache still valid
        }

        if (!chrome.processes) return;

        // Get process IDs for all tabs in parallel
        const processPromises = tabIds.map(tabId =>
            new Promise<{ tabId: number; processId: number }>((resolve) => {
                chrome.processes.getProcessIdForTab(tabId, (processId) => {
                    resolve({ tabId, processId });
                });
            })
        );

        const results = await Promise.all(processPromises);
        results.forEach(({ tabId, processId }) => {
            if (processId) {
                this.processCache.set(tabId, processId);
            }
        });

        this.lastCacheUpdate = now;
    }

    /**
     * Get memory usage for all Chrome processes
     */
    private async getProcessMemory(): Promise<Array<{ id: number; memoryMB: number; type: string }>> {
        return new Promise((resolve) => {
            if (!chrome.processes) {
                resolve([]);
                return;
            }

            chrome.processes.getProcessInfo([], true, (processes) => {
                const result = Object.entries(processes).map(([id, info]) => ({
                    id: parseInt(id),
                    memoryMB: (info.privateMemory || 0) / 1024 / 1024,
                    type: info.type,
                }));
                resolve(result);
            });
        });
    }

    /**
     * Get estimated memory when process info unavailable
     */
    private getEstimatedMemory(tab: chrome.tabs.Tab): number {
        if (tab.discarded) return 0.5;

        const url = tab.url?.toLowerCase() || '';

        // Video/streaming
        if (url.includes('youtube.com/watch') || url.includes('netflix.com/watch') ||
            url.includes('twitch.tv') || url.includes('hianime')) {
            return tab.audible ? 200 : 150;
        }

        // Heavy web apps
        if (url.includes('docs.google.com') || url.includes('sheets.google.com') ||
            url.includes('figma.com') || url.includes('canva.com')) {
            return 120;
        }

        // Development
        if (url.includes('github.com') || url.includes('console.cloud.google.com') ||
            url.includes('vercel.com') || url.includes('netlify.com')) {
            return 100;
        }

        // AI tools
        if (url.includes('chatgpt.com') || url.includes('claude.ai') ||
            url.includes('gemini.google.com') || url.includes('aistudio.google.com')) {
            return 90;
        }

        // Social media
        if (url.includes('twitter.com') || url.includes('x.com') ||
            url.includes('facebook.com') || url.includes('instagram.com')) {
            return 80;
        }

        // Default for regular pages
        return 60;
    }

    /**
     * Fallback report when processes API is unavailable
     */
    private async getFallbackReport(tabs: chrome.tabs.Tab[]): Promise<MemoryReport> {
        const tabMemoryInfo: TabMemoryInfo[] = [];
        let totalMB = 0;

        for (const tab of tabs) {
            if (!tab.id) continue;

            const estimatedMB = this.getEstimatedMemory(tab);
            totalMB += estimatedMB;

            tabMemoryInfo.push({
                tabId: tab.id,
                actualMB: estimatedMB,
                url: tab.url || '',
                title: tab.title || 'Untitled',
                isAudible: tab.audible || false,
                hasMedia: this.hasMediaContent(tab.url || ''),
            });
        }

        const heavyTabs = [...tabMemoryInfo]
            .sort((a, b) => b.actualMB - a.actualMB)
            .slice(0, 10);

        return {
            totalMB: Math.round(totalMB),
            tabs: tabMemoryInfo,
            heavyTabs,
            browserMemoryMB: Math.round(totalMB * 1.3), // Estimate browser overhead
        };
    }

    /**
     * Helper: Check if URL has media content
     */
    private hasMediaContent(url: string): boolean {
        const hostname = this.getHostname(url);
        return this.isVideoSite(hostname) ||
               url.includes('/watch') ||
               url.includes('/video') ||
               url.includes('/player');
    }

    /**
     * Helper: Extract hostname from URL
     */
    private getHostname(url: string): string {
        try {
            return new URL(url).hostname.toLowerCase();
        } catch {
            return '';
        }
    }

    /**
     * Helper: Check if video streaming site
     */
    private isVideoSite(hostname: string): boolean {
        return hostname.includes('youtube') ||
               hostname.includes('netflix') ||
               hostname.includes('twitch') ||
               hostname.includes('vimeo') ||
               hostname.includes('hianime') ||
               hostname.includes('crunchyroll');
    }

    /**
     * Get memory optimization suggestions based on actual usage
     */
    async getOptimizationSuggestions(): Promise<string[]> {
        const report = await this.generateReport();
        const suggestions: string[] = [];

        // Check if browser is using too much memory
        if (report.systemMemory && report.browserMemoryMB > 0) {
            const browserPercent = (report.browserMemoryMB / report.systemMemory.capacityMB) * 100;
            if (browserPercent > 25) {
                suggestions.push(`Browser using ${browserPercent.toFixed(1)}% of system RAM. Consider closing tabs.`);
            }
        }

        // Check total tab memory
        if (report.totalMB > 2048) {
            suggestions.push(`Tabs using ${(report.totalMB / 1024).toFixed(1)} GB. High memory usage detected.`);
        }

        // Identify top memory hog
        if (report.heavyTabs.length > 0) {
            const topHog = report.heavyTabs[0];
            if (topHog.actualMB > 200) {
                suggestions.push(`"${topHog.title}" using ${topHog.actualMB.toFixed(0)} MB. Close if not needed.`);
            }
        }

        // Check for media tabs
        const mediaTabs = report.tabs.filter(t => t.hasMedia);
        if (mediaTabs.length > 2) {
            const mediaMemory = mediaTabs.reduce((sum, t) => sum + t.actualMB, 0);
            suggestions.push(`${mediaTabs.length} media tabs using ${mediaMemory.toFixed(0)} MB total.`);
        }

        // Check for audible tabs
        const audibleTabs = report.tabs.filter(t => t.isAudible);
        if (audibleTabs.length > 1) {
            suggestions.push(`${audibleTabs.length} tabs playing audio. Pause to reduce memory.`);
        }

        if (suggestions.length === 0) {
            suggestions.push('Memory usage is optimized. No actions needed.');
        }

        return suggestions;
    }

    /**
     * Monitor memory usage in real-time
     */
    startMonitoring(callback: (report: MemoryReport) => void, intervalMs: number = 5000): () => void {
        const interval = setInterval(async () => {
            const report = await this.generateReport();
            callback(report);
        }, intervalMs);

        return () => clearInterval(interval);
    }

    /**
     * Check if advanced memory features (processes API) are available
     */
    hasAdvancedMemory(): boolean {
        return typeof chrome.processes !== 'undefined';
    }

    /**
     * Request the optional processes permission for accurate memory data
     * Note: This can only be called in response to a user action (button click)
     */
    async requestAdvancedMemoryPermission(): Promise<boolean> {
        try {
            // First check if we already have the permission
            const hasPermission = await chrome.permissions.contains({
                permissions: ['processes']
            });

            if (hasPermission) {
                return true;
            }

            // Request the permission (must be triggered by user action)
            const granted = await chrome.permissions.request({
                permissions: ['processes']
            });
            return granted;
        } catch (e: any) {
            // Only log unexpected errors, not user gesture errors
            if (!e.message?.includes('user gesture')) {
                console.error('Failed to request processes permission:', e);
            }
            return false;
        }
    }
}

export const memoryService = new MemoryService();
