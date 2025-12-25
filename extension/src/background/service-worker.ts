import { aiService } from '../services/ai';
import { tabService } from '../services/tabs';

// Message types
interface Message {
    action: string;
    payload?: any;
}

interface MessageResponse {
    success: boolean;
    data?: any;
    error?: string;
}

// Services initialization
let servicesInitialized = false;

async function initializeServices(): Promise<void> {
    if (servicesInitialized) return;

    try {
        await aiService.initialize();
        servicesInitialized = true;
        console.log('[ServiceWorker] Services initialized');
    } catch (error) {
        console.error('[ServiceWorker] Failed to initialize:', error);
    }
}

async function ensureServicesInitialized(): Promise<void> {
    if (!servicesInitialized) {
        await initializeServices();
    }
}

// Initialize on extension startup
chrome.runtime.onInstalled.addListener(async (details) => {
    console.log('[ServiceWorker] Extension installed/updated:', details.reason);
    await initializeServices();
});

chrome.runtime.onStartup.addListener(async () => {
    console.log('[ServiceWorker] Browser startup');
    await initializeServices();
});

// Message handler
chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
    handleMessage(message)
        .then(sendResponse)
        .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async response
});

async function handleMessage(message: Message): Promise<MessageResponse> {
    await ensureServicesInitialized();

    try {
        switch (message.action) {
            // Tab operations
            case 'analyze':
                return await analyzeAllTabs();

            case 'summarize':
                if (!message.payload?.tabId) {
                    return { success: false, error: 'Tab ID required' };
                }
                return await summarizeTab(message.payload.tabId);

            case 'organize':
                return await smartOrganize();

            case 'find-duplicates':
                return await findDuplicates();

            case 'close-tabs':
                if (!message.payload?.tabIds) {
                    return { success: false, error: 'Tab IDs required' };
                }
                await tabService.closeTabs(message.payload.tabIds);
                return { success: true };

            case 'group-tabs':
                if (!message.payload?.tabIds || !message.payload?.title) {
                    return { success: false, error: 'Tab IDs and title required' };
                }
                const groupId = await tabService.groupTabs(message.payload.tabIds, message.payload.title);
                return { success: true, data: { groupId } };

            // AI configuration
            case 'initialize-ai':
                const provider = await aiService.initialize();
                return { success: true, data: { provider } };

            case 'get-provider':
                return { success: true, data: { provider: aiService.getProvider() } };

            case 'set-config':
                await aiService.setConfig(message.payload);
                return { success: true };

            case 'get-config':
                return { success: true, data: aiService.getConfig() };

            case 'get-privacy-info':
                return { success: true, data: aiService.getPrivacyInfo() };

            // Usage stats
            case 'get-usage-stats':
                const stats = await aiService.getUsageStats();
                return { success: true, data: stats };

            case 'reset-usage-stats':
                await aiService.resetUsageStats();
                return { success: true };

            case 'set-rate-limits':
                await aiService.setRateLimits(message.payload);
                return { success: true };

            case 'get-rate-limits':
                const limits = aiService.getRateLimits();
                return { success: true, data: limits };

            // Tab data
            case 'get-all-tabs':
                const allTabs = await tabService.getAllTabs();
                return { success: true, data: allTabs };

            default:
                return { success: false, error: `Unknown action: ${message.action}` };
        }
    } catch (error: any) {
        console.error(`[ServiceWorker] Error handling ${message.action}:`, error);
        return { success: false, error: error.message || 'Unknown error occurred' };
    }
}

// AI-powered smart organize
async function smartOrganize(): Promise<MessageResponse> {
    try {
        const tabs = await tabService.getAllTabs();

        if (tabs.length < 2) {
            return {
                success: true,
                data: {
                    organized: [],
                    message: 'Need at least 2 tabs to organize'
                }
            };
        }

        // Format tab list for AI
        const tabList = tabs
            .map(t => `${t.id}|${t.title}|${new URL(t.url || '').hostname}`)
            .join('\n');

        const prompt = `Categorize these browser tabs into logical groups. Return ONLY valid JSON array.

Tabs (format: id|title|domain):
${tabList}

Rules:
- Group by PURPOSE and CONTEXT, not domain
- Categories: AI, Cloud, Dev, Social, Streaming, Music, Finance, News, Docs, Shopping, Work, Research
- AI tools together: ChatGPT, Claude, Grok, Gemini, Perplexity, Copilot
- Dev tools together: GitHub, GitLab, Stack Overflow, documentation sites
- Only create groups with 2+ tabs
- Use 1-word category names
- Max 8 groups

Return JSON array format:
[{"name":"Dev","tabIds":[1,2,3]},{"name":"Social","tabIds":[4,5]}]`;

        const aiResponse = await aiService.prompt(prompt);

        // Parse JSON from AI response (handle markdown code blocks)
        const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
            throw new Error('No JSON array found in AI response');
        }

        const groups = JSON.parse(jsonMatch[0]) as Array<{ name: string; tabIds: number[] }>;

        // Validate and create groups
        const validTabIds = new Set(tabs.map(t => t.id));
        const organized: Array<{ groupName: string; tabIds: number[] }> = [];

        for (const group of groups) {
            // Filter to only valid tab IDs
            const validIds = group.tabIds.filter(id => validTabIds.has(id));

            if (validIds.length >= 2) {
                await tabService.groupTabs(validIds, group.name);
                organized.push({
                    groupName: group.name,
                    tabIds: validIds
                });
            }
        }

        return {
            success: true,
            data: {
                organized,
                message: `Created ${organized.length} groups`
            }
        };

    } catch (error: any) {
        console.error('[ServiceWorker] Smart organize error:', error);
        return {
            success: false,
            error: error.message || 'Failed to organize tabs'
        };
    }
}

// Summarize a specific tab
async function summarizeTab(tabId: number): Promise<MessageResponse> {
    try {
        const tab = await chrome.tabs.get(tabId);

        if (!tab.title || !tab.url) {
            return { success: false, error: 'Tab has no title or URL' };
        }

        const prompt = `Summarize this web page in 2-3 sentences:
Title: ${tab.title}
URL: ${tab.url}

Be concise and focus on what the page is about.`;

        const summary = await aiService.prompt(prompt);

        return {
            success: true,
            data: {
                tabId,
                title: tab.title,
                url: tab.url,
                summary
            }
        };

    } catch (error: any) {
        console.error('[ServiceWorker] Summarize tab error:', error);
        return {
            success: false,
            error: error.message || 'Failed to summarize tab'
        };
    }
}

// Analyze all open tabs
async function analyzeAllTabs(): Promise<MessageResponse> {
    try {
        const tabs = await tabService.getAllTabs();

        if (tabs.length === 0) {
            return {
                success: true,
                data: {
                    analysis: 'No tabs open',
                    recommendations: []
                }
            };
        }

        // Group tabs by domain for analysis
        const domainGroups: { [domain: string]: number } = {};
        tabs.forEach(tab => {
            const domain = new URL(tab.url || '').hostname;
            domainGroups[domain] = (domainGroups[domain] || 0) + 1;
        });

        const domainSummary = Object.entries(domainGroups)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10)
            .map(([domain, count]) => `${domain}: ${count} tabs`)
            .join('\n');

        const prompt = `Analyze these browser tabs and provide insights:

Total tabs: ${tabs.length}
Top domains:
${domainSummary}

Provide:
1. Brief overview of browsing activity
2. 2-3 actionable recommendations (e.g., group similar tabs, close unused tabs)

Keep response under 150 words.`;

        const analysis = await aiService.prompt(prompt);

        return {
            success: true,
            data: {
                totalTabs: tabs.length,
                topDomains: Object.entries(domainGroups)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 5),
                analysis
            }
        };

    } catch (error: any) {
        console.error('[ServiceWorker] Analyze tabs error:', error);
        return {
            success: false,
            error: error.message || 'Failed to analyze tabs'
        };
    }
}

// Find duplicate tabs
async function findDuplicates(): Promise<MessageResponse> {
    try {
        const tabs = await tabService.getAllTabs();
        const duplicates = tabService.findDuplicates(tabs);

        return {
            success: true,
            data: {
                duplicates,
                count: duplicates.length
            }
        };

    } catch (error: any) {
        console.error('[ServiceWorker] Find duplicates error:', error);
        return {
            success: false,
            error: error.message || 'Failed to find duplicates'
        };
    }
}
