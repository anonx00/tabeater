import { aiService } from '../services/ai';
import { tabService, TabInfo } from '../services/tabs';
import { licenseService } from '../services/license';
import { autoPilotService } from '../services/autopilot';

interface Message {
    action: string;
    payload?: any;
}

interface MessageResponse {
    success: boolean;
    data?: any;
    error?: string;
}

chrome.runtime.onInstalled.addListener(async () => {
    await licenseService.initialize();
    await aiService.initialize();
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
});

chrome.runtime.onStartup.addListener(async () => {
    await licenseService.initialize();
    await aiService.initialize();
});

chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
    handleMessage(message)
        .then(sendResponse)
        .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
});

async function handleMessage(message: Message): Promise<MessageResponse> {
    switch (message.action) {
        case 'getTabs':
            return { success: true, data: await tabService.getAllTabs() };

        case 'getWindowTabs':
            return { success: true, data: await tabService.getWindowTabs() };

        case 'getActiveTab':
            return { success: true, data: await tabService.getActiveTab() };

        case 'closeTab':
            await tabService.closeTab(message.payload.tabId);
            return { success: true };

        case 'closeTabs':
            await tabService.closeTabs(message.payload.tabIds);
            return { success: true };

        case 'groupTabs':
            const groupId = await tabService.groupTabs(
                message.payload.tabIds,
                message.payload.title
            );
            return { success: true, data: { groupId } };

        case 'searchTabs':
            return { success: true, data: await tabService.searchTabs(message.payload.query) };

        case 'getDuplicates':
            const tabs = await tabService.getAllTabs();
            return { success: true, data: tabService.findDuplicates(tabs) };

        case 'getGroupedByDomain':
            const allTabs = await tabService.getAllTabs();
            return { success: true, data: tabService.groupByDomain(allTabs) };

        case 'summarizeTab':
            return await summarizeTab(message.payload.tabId);

        case 'analyzeAllTabs':
            return await analyzeAllTabs();

        case 'smartOrganize':
            return await smartOrganize();

        case 'smartOrganizePreview':
            return await smartOrganizePreview();

        case 'getAIProvider':
            return { success: true, data: { provider: aiService.getProvider() } };

        case 'checkNanoStatus':
            const nanoStatus = await aiService.checkNanoAvailability();
            return { success: true, data: nanoStatus };

        case 'reinitializeAI':
            const newProvider = await aiService.initialize();
            const currentNanoStatus = aiService.getNanoStatus();
            return { success: true, data: { provider: newProvider, nanoStatus: currentNanoStatus } };

        case 'setAIConfig':
            await aiService.setConfig(message.payload);
            return { success: true, data: { provider: aiService.getProvider() } };

        case 'askAI':
            const response = await aiService.prompt(message.payload.prompt);
            return { success: true, data: { response } };

        case 'getLicenseStatus':
            const status = await licenseService.getStatus(message.payload?.forceRefresh);
            return { success: true, data: status };

        case 'getCheckoutUrl':
            const checkoutUrl = await licenseService.getCheckoutUrl();
            return { success: true, data: { url: checkoutUrl } };

        // Auto Pilot actions
        case 'autoPilotAnalyze':
            const analyzeReport = await autoPilotService.analyze();
            return { success: true, data: analyzeReport };

        case 'autoPilotAnalyzeWithAI':
            const aiReport = await autoPilotService.analyzeWithAI();
            return { success: true, data: aiReport };

        case 'autoPilotExecute':
            const executeResult = await autoPilotService.executeAutoPilot();
            return { success: true, data: executeResult };

        case 'autoPilotCleanup':
            const cleanupResult = await autoPilotService.executeCleanup(message.payload.tabIds);
            return { success: true, data: cleanupResult };

        case 'autoPilotGroup':
            const groupResult = await autoPilotService.executeGrouping(message.payload.groups);
            return { success: true, data: groupResult };

        case 'getAutoPilotSettings':
            const settings = await autoPilotService.loadSettings();
            return { success: true, data: settings };

        case 'setAutoPilotSettings':
            await autoPilotService.saveSettings(message.payload);
            return { success: true };

        default:
            return { success: false, error: 'Unknown action' };
    }
}

async function summarizeTab(tabId: number): Promise<MessageResponse> {
    try {
        const content = await tabService.getTabContent(tabId);
        if (!content) {
            return { success: false, error: 'Could not extract page content' };
        }

        const summary = await aiService.prompt(
            `Summarize this webpage content in 2-3 sentences:\n\n${content.slice(0, 3000)}`
        );

        return { success: true, data: { summary } };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}

async function analyzeAllTabs(): Promise<MessageResponse> {
    try {
        const tabs = await tabService.getAllTabs();

        // Token budgeting: limit to 100 tabs max, truncate long URLs
        const limitedTabs = tabs.slice(0, 100);
        const tabSummary = limitedTabs.map(t => {
            const hostname = new URL(t.url).hostname;
            return `${t.id}|${t.title.slice(0, 60)}|${hostname}`;
        }).join('\n');

        const analysis = await aiService.prompt(
            `Analyze these browser tabs and return ONLY a JSON object (no explanation, no markdown).

Tabs (format: id|title|domain):
${tabSummary}

Return this exact JSON structure:
{
  "summary": "One-sentence overview (e.g., 'Mix of work, entertainment, and research tabs')",
  "duplicates": [
    {"title": "Page title", "count": 3, "ids": [1,2,3], "action": "Keep newest, close 2 others"}
  ],
  "closeable": [
    {"id": 5, "title": "Page title", "reason": "Old search result", "priority": "low"}
  ],
  "groups": [
    {"name": "Work", "tabs": ["Google Docs", "Gmail"], "reason": "Productivity apps"}
  ],
  "insights": [
    "You have 5 social media tabs open - consider closing some",
    "3 old documentation pages can be bookmarked and closed"
  ]
}

Rules:
- Keep all arrays even if empty []
- Use concise reasons (max 5 words)
- Group names: 1-2 words only
- Priority levels: high, medium, low
- Limit closeable suggestions to top 5 most obvious
- Limit groups to 4 maximum
- insights: 2-4 actionable suggestions`
        );

        // Clean and parse JSON response
        let parsedAnalysis;
        try {
            // Remove any markdown code blocks or extra text
            const cleanJson = analysis
                .replace(/```json\n?/g, '')
                .replace(/```\n?/g, '')
                .replace(/^[^{]*({[\s\S]*})[^}]*$/g, '$1')
                .trim();

            parsedAnalysis = JSON.parse(cleanJson);

            // Validate structure and provide defaults
            parsedAnalysis = {
                summary: parsedAnalysis.summary || 'Analysis complete',
                duplicates: Array.isArray(parsedAnalysis.duplicates) ? parsedAnalysis.duplicates : [],
                closeable: Array.isArray(parsedAnalysis.closeable) ? parsedAnalysis.closeable.slice(0, 5) : [],
                groups: Array.isArray(parsedAnalysis.groups) ? parsedAnalysis.groups.slice(0, 4) : [],
                insights: Array.isArray(parsedAnalysis.insights) ? parsedAnalysis.insights.slice(0, 4) : []
            };
        } catch (parseErr) {
            // Fallback: try to extract JSON from response
            const jsonMatch = analysis.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                try {
                    parsedAnalysis = JSON.parse(jsonMatch[0]);
                } catch {
                    parsedAnalysis = {
                        summary: 'Unable to parse analysis',
                        duplicates: [],
                        closeable: [],
                        groups: [],
                        insights: [analysis.slice(0, 100)]
                    };
                }
            } else {
                // Ultimate fallback: return plain text as insight
                parsedAnalysis = {
                    summary: 'Analysis complete',
                    duplicates: [],
                    closeable: [],
                    groups: [],
                    insights: [analysis.slice(0, 200)]
                };
            }
        }

        return {
            success: true,
            data: {
                analysis: parsedAnalysis,
                tabCount: tabs.length,
                isStructured: true
            }
        };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}

async function smartOrganizePreview(): Promise<MessageResponse> {
    try {
        const tabs = await tabService.getAllTabs();

        if (tabs.length < 2) {
            return { success: true, data: { groups: [], message: 'Not enough tabs to organize' } };
        }

        const tabList = tabs.map(t => `${t.id}|${t.title}|${new URL(t.url).hostname}`).join('\n');

        const aiResponse = await aiService.prompt(
            `Categorize these browser tabs into logical groups. Return ONLY a JSON array.

Tabs (format: id|title|domain):
${tabList}

Rules:
- Group by PURPOSE and CONTEXT, not by domain
- AI tools: ChatGPT, Claude, Gemini, Perplexity = "AI"
- Cloud: GCP, AWS, Azure, Vercel, Firebase = "Cloud"
- Streaming: Netflix, YouTube, Hulu, Disney+ = "Streaming"
- Music: Spotify, YouTube Music, Apple Music = "Music"
- Dev: GitHub, GitLab, localhost, docs, Stack Overflow = "Dev"
- Social: Twitter/X, Facebook, Instagram, Reddit = "Social"
- Finance: Stripe, PayPal, banks, billing = "Finance"
- Only create groups with 2+ tabs
- Max 6 groups
- Short 1-word names

Return JSON array:
[{"name":"GroupName","ids":[1,2,3],"tabTitles":["Tab 1","Tab 2"]}]`
        );

        let groups: { name: string; ids: number[]; tabTitles?: string[] }[] = [];
        try {
            const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                groups = JSON.parse(jsonMatch[0]);
            }
        } catch {
            return { success: false, error: 'Failed to parse AI response' };
        }

        // Enrich groups with tab details
        const enrichedGroups = groups
            .filter(g => g.ids && g.ids.length >= 2)
            .map(group => {
                const validIds = group.ids.filter(id => tabs.some(t => t.id === id));
                const groupTabs = validIds.map(id => {
                    const tab = tabs.find(t => t.id === id);
                    return {
                        id,
                        title: tab?.title || 'Unknown',
                        url: tab?.url || '',
                        favIconUrl: tab?.favIconUrl
                    };
                });
                return {
                    name: group.name,
                    tabCount: validIds.length,
                    tabs: groupTabs
                };
            })
            .filter(g => g.tabCount >= 2)
            .slice(0, 6);

        return {
            success: true,
            data: {
                groups: enrichedGroups,
                totalTabs: tabs.length,
                groupedTabs: enrichedGroups.reduce((sum, g) => sum + g.tabCount, 0)
            }
        };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}

async function smartOrganize(): Promise<MessageResponse> {
    try {
        const tabs = await tabService.getAllTabs();

        if (tabs.length < 2) {
            return { success: true, data: { organized: [], message: 'Not enough tabs to organize' } };
        }

        const tabList = tabs.map(t => `${t.id}|${t.title}|${new URL(t.url).hostname}`).join('\n');

        const aiResponse = await aiService.prompt(
            `Categorize these browser tabs into logical groups. Return ONLY a JSON array.

Tabs (format: id|title|domain):
${tabList}

Rules:
- Group by PURPOSE and CONTEXT, not by domain
- AI tools: ChatGPT, Claude, Gemini = "AI"
- Cloud: GCP, AWS, Azure, Vercel = "Cloud"
- Streaming: Netflix, YouTube, Hulu = "Streaming"
- Music: Spotify, YouTube Music = "Music"
- Dev: GitHub, GitLab, localhost, docs = "Dev"
- Social: Twitter, Facebook, Instagram = "Social"
- Only create groups with 2+ tabs
- Short 1-word names

Return JSON array:
[{"name":"GroupName","ids":[1,2,3]}]`
        );

        let groups: { name: string; ids: number[] }[] = [];
        try {
            const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                groups = JSON.parse(jsonMatch[0]);
            }
        } catch {
            const domainGroups = tabService.groupByDomain(tabs);
            for (const group of domainGroups) {
                if (group.tabs.length >= 2) {
                    await tabService.groupTabs(group.tabs.map(t => t.id), group.name);
                }
            }
            return { success: true, data: { organized: [], message: 'Organized by domain' } };
        }

        const organized: { groupName: string; tabIds: number[] }[] = [];
        for (const group of groups) {
            if (group.ids && group.ids.length >= 2 && group.name) {
                const validIds = group.ids.filter(id => tabs.some(t => t.id === id));
                if (validIds.length >= 2) {
                    await tabService.groupTabs(validIds, group.name);
                    organized.push({ groupName: group.name, tabIds: validIds });
                }
            }
        }

        return {
            success: true,
            data: {
                organized,
                message: organized.length > 0 ? `Created ${organized.length} groups` : 'No groups to create'
            }
        };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}

export {};
