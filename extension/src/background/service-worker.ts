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
        const tabSummary = tabs.map(t => `- ${t.title} (${new URL(t.url).hostname})`).join('\n');

        const analysis = await aiService.prompt(
            `Analyze these browser tabs and provide insights:
            - Identify any duplicates or similar pages
            - Suggest which tabs might be closed
            - Recommend how to organize them

            Tabs:\n${tabSummary}`
        );

        return { success: true, data: { analysis, tabCount: tabs.length } };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}

async function smartOrganize(): Promise<MessageResponse> {
    try {
        const tabs = await tabService.getAllTabs();
        const groups = tabService.groupByDomain(tabs);

        const organized: { groupName: string; tabIds: number[] }[] = [];

        for (const group of groups) {
            if (group.tabs.length >= 2) {
                const tabIds = group.tabs.map(t => t.id);
                await tabService.groupTabs(tabIds, group.name);
                organized.push({ groupName: group.name, tabIds });
            }
        }

        return {
            success: true,
            data: {
                organized,
                message: `Organized ${organized.length} groups`
            }
        };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}

export {};
