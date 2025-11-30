/**
 * Memory Service - Tactical Memory Intelligence
 * Estimates and tracks tab memory usage with fallbacks
 */

interface TabMemoryInfo {
    tabId: number;
    estimatedMB: number;
    url: string;
    title: string;
    isAudible: boolean;
    hasMedia: boolean;
}

interface MemoryReport {
    totalMB: number;
    tabs: TabMemoryInfo[];
    heavyTabs: TabMemoryInfo[];
    systemMemory?: {
        availableMB: number;
        capacityMB: number;
    };
}

class MemoryService {
    /**
     * Base memory estimates by domain/content type (MB)
     */
    private readonly BASE_ESTIMATES = {
        video: 150,      // YouTube, Netflix, etc.
        social: 120,     // Twitter, Facebook
        development: 100, // GitHub, Cloud Console, IDE
        productivity: 80, // Google Docs, Notion
        communication: 70, // Gmail, Slack
        default: 60,      // Basic web pages
    };

    /**
     * Multipliers for tab states
     */
    private readonly MULTIPLIERS = {
        audible: 1.5,     // Playing audio/video
        pinned: 0.8,      // Often lighter
        discarded: 0.1,   // Suspended tabs
    };

    /**
     * Estimate memory usage for a single tab
     */
    estimateTabMemory(tab: chrome.tabs.Tab): number {
        const url = tab.url || '';
        const hostname = this.getHostname(url);

        let baseMB = this.getBaseEstimate(hostname, url);

        // Apply multipliers
        if (tab.audible) {
            baseMB *= this.MULTIPLIERS.audible;
        }
        if (tab.pinned) {
            baseMB *= this.MULTIPLIERS.pinned;
        }
        if (tab.discarded) {
            baseMB *= this.MULTIPLIERS.discarded;
        }

        return Math.round(baseMB);
    }

    /**
     * Get base memory estimate based on URL/hostname
     */
    private getBaseEstimate(hostname: string, url: string): number {
        // Video streaming
        if (this.isVideoSite(hostname)) {
            return this.BASE_ESTIMATES.video;
        }

        // Social media
        if (this.isSocialSite(hostname)) {
            return this.BASE_ESTIMATES.social;
        }

        // Development tools
        if (this.isDevSite(hostname)) {
            return this.BASE_ESTIMATES.development;
        }

        // Productivity
        if (this.isProductivitySite(hostname)) {
            return this.BASE_ESTIMATES.productivity;
        }

        // Communication
        if (this.isCommunicationSite(hostname)) {
            return this.BASE_ESTIMATES.communication;
        }

        return this.BASE_ESTIMATES.default;
    }

    /**
     * Generate memory report for all tabs
     */
    async generateReport(): Promise<MemoryReport> {
        const tabs = await chrome.tabs.query({});
        const tabMemoryInfo: TabMemoryInfo[] = [];
        let totalMB = 0;

        for (const tab of tabs) {
            const estimatedMB = this.estimateTabMemory(tab);
            totalMB += estimatedMB;

            tabMemoryInfo.push({
                tabId: tab.id!,
                estimatedMB,
                url: tab.url || '',
                title: tab.title || 'Untitled',
                isAudible: tab.audible || false,
                hasMedia: this.hasMediaContent(tab.url || ''),
            });
        }

        // Sort by memory usage (descending)
        const heavyTabs = [...tabMemoryInfo]
            .sort((a, b) => b.estimatedMB - a.estimatedMB)
            .slice(0, 10); // Top 10 memory hogs

        // Try to get system memory (may fail if permission not granted)
        let systemMemory: MemoryReport['systemMemory'];
        try {
            if (chrome.system && chrome.system.memory) {
                const memInfo = await chrome.system.memory.getInfo();
                systemMemory = {
                    availableMB: Math.round(memInfo.availableCapacity / 1024 / 1024),
                    capacityMB: Math.round(memInfo.capacity / 1024 / 1024),
                };
            }
        } catch (e) {
            // Permission not granted or API not available
            console.log('System memory API not available');
        }

        return {
            totalMB,
            tabs: tabMemoryInfo,
            heavyTabs,
            systemMemory,
        };
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
     * Helper: Check if social media site
     */
    private isSocialSite(hostname: string): boolean {
        return hostname.includes('twitter') ||
               hostname.includes('x.com') ||
               hostname.includes('facebook') ||
               hostname.includes('instagram') ||
               hostname.includes('linkedin') ||
               hostname.includes('reddit');
    }

    /**
     * Helper: Check if development site
     */
    private isDevSite(hostname: string): boolean {
        return hostname.includes('github') ||
               hostname.includes('console.cloud.google') ||
               hostname.includes('vercel') ||
               hostname.includes('netlify') ||
               hostname.includes('aws.amazon') ||
               hostname.includes('claude.ai') ||
               hostname.includes('chatgpt') ||
               hostname.includes('aistudio.google');
    }

    /**
     * Helper: Check if productivity site
     */
    private isProductivitySite(hostname: string): boolean {
        return hostname.includes('docs.google') ||
               hostname.includes('sheets.google') ||
               hostname.includes('notion') ||
               hostname.includes('airtable') ||
               hostname.includes('trello');
    }

    /**
     * Helper: Check if communication site
     */
    private isCommunicationSite(hostname: string): boolean {
        return hostname.includes('gmail') ||
               hostname.includes('mail.google') ||
               hostname.includes('slack') ||
               hostname.includes('discord') ||
               hostname.includes('zoom');
    }

    /**
     * Helper: Check if URL likely has media content
     */
    private hasMediaContent(url: string): boolean {
        return this.isVideoSite(this.getHostname(url)) ||
               url.includes('/watch') ||
               url.includes('/video') ||
               url.includes('/player');
    }

    /**
     * Get memory optimization suggestions
     */
    async getOptimizationSuggestions() {
        const report = await this.generateReport();
        const suggestions: string[] = [];

        if (report.totalMB > 2048) {
            suggestions.push('High memory usage detected. Consider closing unused tabs.');
        }

        if (report.heavyTabs.length > 0) {
            const topHog = report.heavyTabs[0];
            suggestions.push(`"${topHog.title}" is using ~${topHog.estimatedMB}MB. Close if not needed.`);
        }

        const videoTabs = report.tabs.filter(t => t.hasMedia);
        if (videoTabs.length > 2) {
            suggestions.push(`${videoTabs.length} tabs with media content. Pause or close videos to save memory.`);
        }

        const audibleTabs = report.tabs.filter(t => t.isAudible);
        if (audibleTabs.length > 1) {
            suggestions.push(`${audibleTabs.length} tabs playing audio. Mute or close to reduce memory.`);
        }

        return suggestions;
    }
}

export const memoryService = new MemoryService();
