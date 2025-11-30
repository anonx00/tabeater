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
            `Analyze these browser tabs and return ONLY a JSON object (no explanation).

Tabs (format: id|title|domain):
${tabSummary}

Return format:
{
  "duplicates": [{"title": "...", "count": 2, "ids": [1,2]}],
  "closeable": [{"id": 1, "title": "...", "reason": "..."}],
  "groups": [{"name": "...", "tabs": ["title1", "title2"]}],
  "summary": "Brief 1-sentence overview"
}

Rules:
- Keep all arrays even if empty
- Use concise reasons (max 5 words)
- Group names should be 1-2 words`
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
        } catch (parseErr) {
            // Fallback: try to extract JSON from response
            const jsonMatch = analysis.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                parsedAnalysis = JSON.parse(jsonMatch[0]);
            } else {
                // Ultimate fallback: return plain text
                parsedAnalysis = {
                    duplicates: [],
                    closeable: [],
                    groups: [],
                    summary: analysis.slice(0, 200)
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

async function smartOrganize(): Promise<MessageResponse> {
    try {
        const tabs = await tabService.getAllTabs();

        // Skip if too few tabs
        if (tabs.length < 2) {
            return { success: true, data: { organized: [], message: 'Not enough tabs to organize' } };
        }

        const tabList = tabs.map(t => `${t.id}|${t.title}|${new URL(t.url).hostname}`).join('\n');

        // Use AI to categorize tabs
        const aiResponse = await aiService.prompt(
            `Categorize these browser tabs into logical groups. Return ONLY a JSON array, nothing else.

Tabs (format: id|title|domain):
${tabList}

Rules:
- Group by PURPOSE and CONTEXT, not by domain
- AI tools go together: ChatGPT, Claude, Grok, Gemini, Perplexity, Copilot = "AI"
- Cloud consoles together: GCP, AWS, Azure, Vercel, Firebase = "Cloud"
- Streaming services: Netflix, YouTube (non-music), Hulu, Disney+, anime sites = "Streaming"
- Music: Spotify, YouTube Music, Apple Music = "Music"
- Dev tools: GitHub, GitLab, localhost, docs, Stack Overflow = "Dev"
- Social: Twitter/X, Facebook, Instagram, Reddit, LinkedIn = "Social"
- Payment/Finance: Stripe, PayPal, bank sites, billing pages = "Finance"
- Only create groups with 2+ tabs
- Use short 1-word names: AI, Cloud, Dev, Social, Streaming, Music, Finance, News, Docs

Return format (JSON array only, no explanation):
[{"name":"GroupName","ids":[1,2,3]}]`
        );

        // Parse AI response
        let groups: { name: string; ids: number[] }[] = [];
        try {
            const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                groups = JSON.parse(jsonMatch[0]);
            }
        } catch {
            // Fallback to domain grouping if AI parsing fails
            const domainGroups = tabService.groupByDomain(tabs);
            for (const group of domainGroups) {
                if (group.tabs.length >= 2) {
                    const tabIds = group.tabs.map(t => t.id);
                    await tabService.groupTabs(tabIds, group.name);
                }
            }
            return { success: true, data: { organized: [], message: 'Organized by domain' } };
        }

        // Create tab groups
        const organized: { groupName: string; tabIds: number[] }[] = [];
        for (const group of groups) {
            if (group.ids && group.ids.length >= 2 && group.name) {
                // Validate tab IDs exist
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
