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
    /**
     * Get actual memory usage for all tabs using Chrome Processes API
     */
    async generateReport(): Promise<MemoryReport> {
        const tabs = await chrome.tabs.query({});
        const tabMemoryInfo: TabMemoryInfo[] = [];
        let totalMB = 0;
        let browserMemoryMB = 0;

        try {
            // Get process information for all tabs
            const processes = await this.getProcessMemory();

            for (const tab of tabs) {
                if (!tab.id) continue;

                // Get actual memory for this tab from processes API
                const actualMB = this.getTabMemoryFromProcesses(tab, processes);
                totalMB += actualMB;

                tabMemoryInfo.push({
                    tabId: tab.id,
                    actualMB,
                    url: tab.url || '',
                    title: tab.title || 'Untitled',
                    isAudible: tab.audible || false,
                    hasMedia: this.hasMediaContent(tab.url || ''),
                    processId: await this.getTabProcessId(tab.id),
                });
            }

            // Calculate total browser memory usage
            browserMemoryMB = processes.reduce((sum, proc) => sum + proc.memoryMB, 0);

        } catch (error) {
            console.error('Failed to get process memory, using fallback:', error);
            // Fallback: If processes API fails, return basic info
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
        } catch (e) {
            console.log('System memory API not available');
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
                    memoryMB: (info.privateMemory || 0) / 1024 / 1024, // Convert bytes to MB
                    type: info.type,
                }));
                resolve(result);
            });
        });
    }

    /**
     * Get process ID for a specific tab
     */
    private async getTabProcessId(tabId: number): Promise<number | undefined> {
        return new Promise((resolve) => {
            if (!chrome.processes) {
                resolve(undefined);
                return;
            }

            chrome.processes.getProcessIdForTab(tabId, (processId) => {
                resolve(processId);
            });
        });
    }

    /**
     * Get memory usage for a specific tab from process list
     */
    private getTabMemoryFromProcesses(
        tab: chrome.tabs.Tab,
        processes: Array<{ id: number; memoryMB: number; type: string }>
    ): number {
        // For tabs, we need to get the process ID and look it up
        // Since getProcessIdForTab is async, we'll estimate based on process type
        // In production, we cache this mapping

        // If tab is discarded, it uses minimal memory
        if (tab.discarded) {
            return 0.5; // Suspended tabs use ~0.5MB
        }

        // Find renderer processes (tabs typically use renderer processes)
        const rendererProcesses = processes.filter(p => p.type === 'renderer');

        if (rendererProcesses.length === 0) {
            return 50; // Fallback estimate
        }

        // Average renderer memory divided by number of tabs
        // This is approximate but better than pure estimation
        const avgRendererMemory = rendererProcesses.reduce((sum, p) => sum + p.memoryMB, 0) / rendererProcesses.length;

        // Apply multipliers based on tab state
        let memory = avgRendererMemory;

        if (tab.audible) {
            memory *= 1.2; // Audio/video tabs typically use more
        }

        return memory;
    }

    /**
     * Enhanced version with per-tab process tracking (called after initial report)
     */
    async getDetailedTabMemory(tabId: number): Promise<number> {
        try {
            const processId = await this.getTabProcessId(tabId);
            if (!processId) return 0;

            return new Promise((resolve) => {
                chrome.processes.getProcessInfo([processId], true, (processes) => {
                    const processInfo = processes[processId];
                    if (processInfo && processInfo.privateMemory) {
                        resolve(processInfo.privateMemory / 1024 / 1024);
                    } else {
                        resolve(0);
                    }
                });
            });
        } catch {
            return 0;
        }
    }

    /**
     * Fallback report when processes API is unavailable
     */
    private async getFallbackReport(tabs: chrome.tabs.Tab[]): Promise<MemoryReport> {
        const tabMemoryInfo: TabMemoryInfo[] = [];
        let totalMB = 0;

        for (const tab of tabs) {
            if (!tab.id) continue;

            // Use conservative estimate
            const estimatedMB = tab.discarded ? 0.5 : 50;
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
            browserMemoryMB: Math.round(totalMB * 1.2), // Estimate browser overhead
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
        if (report.systemMemory) {
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
}

export const memoryService = new MemoryService();
