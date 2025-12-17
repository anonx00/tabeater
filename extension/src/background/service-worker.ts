import { aiService } from '../services/ai';
import { tabService, TabInfo } from '../services/tabs';
import { licenseService } from '../services/license';
import { autoPilotService } from '../services/autopilot';
import { memoryService } from '../services/memory.service';
import { TabManager } from './tab-manager';

// Parse JSON from AI response - handles markdown code blocks
function parseJSONResponse<T>(response: string, context: string): T | null {
    let clean = response.trim();

    // Strip markdown code blocks
    clean = clean.replace(/^```(?:json|JSON)?\n?/gm, '');
    clean = clean.replace(/\n?```$/gm, '');
    clean = clean.trim();

    // Find JSON array
    const match = clean.match(/\[[\s\S]*\]/);
    const jsonStr = match ? match[0] : clean;

    try {
        return JSON.parse(jsonStr);
    } catch (err) {
        console.error(`[${context}] JSON parse failed:`, err);
        console.error(`[${context}] Raw response:`, response.slice(0, 500));
        return null;
    }
}

interface Message {
    action: string;
    payload?: any;
}

interface MessageResponse {
    success: boolean;
    data?: any;
    error?: string;
}

// Single initialization promise to prevent race conditions
let initializationPromise: Promise<void> | null = null;

async function initializeServices(): Promise<void> {
    await licenseService.initialize();
    await aiService.initialize();
}

// Ensure services are initialized only once, even if called concurrently
async function ensureServicesInitialized(): Promise<void> {
    if (!initializationPromise) {
        initializationPromise = initializeServices();
    }
    return initializationPromise;
}

chrome.runtime.onInstalled.addListener(async () => {
    await ensureServicesInitialized();
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
});

chrome.runtime.onStartup.addListener(async () => {
    await ensureServicesInitialized();
});

// Debounce map for fly mode processing
const flyModeDebounceMap = new Map<number, ReturnType<typeof setTimeout>>();

// Auto Pilot: Process new tabs when they finish loading
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    // Only act when the page is fully loaded and has a url
    if (changeInfo.status === 'complete' && tab.url && !tab.url.startsWith('chrome://')) {
        try {
            await ensureServicesInitialized();

            // Load settings to check mode
            const settings = await autoPilotService.loadSettings();

            // Skip if in manual mode
            if (settings.mode === 'manual') return;

            // Auto-processing requires PRO license
            const licenseStatus = await licenseService.getStatus();
            if (!licenseStatus.paid) return;

            // Skip if tab is already in a group (for grouping logic)
            if (tab.groupId !== undefined && tab.groupId !== -1) {
                // Still check for duplicates even if grouped
                if (settings.mode === 'auto-cleanup' || settings.mode === 'fly-mode') {
                    // Check for duplicate immediately
                    const tabInfo = {
                        id: tabId,
                        title: tab.title || '',
                        url: tab.url,
                        favIconUrl: tab.favIconUrl,
                        active: tab.active,
                        pinned: tab.pinned,
                        groupId: tab.groupId ?? -1,
                        windowId: tab.windowId
                    };
                    const dupCheck = await autoPilotService.checkDuplicate(tabInfo);
                    if (dupCheck.isDuplicate) {
                        await chrome.tabs.remove(tabId);
                        // Show notification if enabled
                        if (settings.showNotifications) {
                            await showAutoPilotNotification(`Closed duplicate tab`);
                        }
                    }
                }
                return;
            }

            // Clear any existing debounce for this tab
            if (flyModeDebounceMap.has(tabId)) {
                clearTimeout(flyModeDebounceMap.get(tabId)!);
            }

            // Debounce processing to avoid rapid-fire on redirects
            const debounceMs = settings.flyModeDebounceMs || 5000;
            const timeoutId = setTimeout(async () => {
                flyModeDebounceMap.delete(tabId);

                try {
                    // Re-fetch the tab to get latest state
                    const currentTab = await chrome.tabs.get(tabId);
                    if (!currentTab || currentTab.url?.startsWith('chrome://')) return;

                    const tabInfo = {
                        id: tabId,
                        title: currentTab.title || '',
                        url: currentTab.url || '',
                        favIconUrl: currentTab.favIconUrl,
                        active: currentTab.active,
                        pinned: currentTab.pinned,
                        groupId: currentTab.groupId ?? -1,
                        windowId: currentTab.windowId
                    };

                    const result = await autoPilotService.processNewTab(tabInfo);

                    // Show notification if action was taken and notifications are enabled
                    if (result.action !== 'none' && settings.showNotifications && result.message) {
                        await showAutoPilotNotification(result.message);
                    }
                } catch (err) {
                    // Tab might have been closed, ignore
                    console.debug('Fly mode processing failed:', err);
                }
            }, debounceMs);

            flyModeDebounceMap.set(tabId, timeoutId);
        } catch (err) {
            // Silently fail - auto-processing is a convenience feature
            console.debug('Auto-pilot failed:', err);
        }
    }
});

// Clean up debounce timers when tabs are closed
chrome.tabs.onRemoved.addListener((tabId) => {
    if (flyModeDebounceMap.has(tabId)) {
        clearTimeout(flyModeDebounceMap.get(tabId)!);
        flyModeDebounceMap.delete(tabId);
    }
});

// Show a notification for auto-pilot actions (uses chrome badge for now)
async function showAutoPilotNotification(message: string) {
    // Set badge text briefly to indicate action
    await chrome.action.setBadgeText({ text: '!' });
    await chrome.action.setBadgeBackgroundColor({ color: '#3b82f6' });

    // Clear badge after 3 seconds
    setTimeout(async () => {
        await chrome.action.setBadgeText({ text: '' });
    }, 3000);

    // Also log for debugging
    console.log('[AutoPilot]', message);
}

// Handle keyboard shortcuts
chrome.commands.onCommand.addListener(async (command) => {
    if (command === 'open_sidepanel') {
        const windows = await chrome.windows.getAll();
        if (windows.length > 0 && windows[0].id !== undefined) {
            await chrome.sidePanel.open({ windowId: windows[0].id });
        }
    }
});

chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
    ensureServicesInitialized()
        .then(() => handleMessage(message))
        .then(sendResponse)
        .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
});

async function handleMessage(message: Message): Promise<MessageResponse> {
    // Input validation helper
    const validatePayload = (required: string[]): boolean => {
        if (!message.payload) return required.length === 0;
        return required.every(key => message.payload[key] !== undefined);
    };

    switch (message.action) {
        case 'getTabs':
            return { success: true, data: await tabService.getAllTabs() };

        case 'getWindowTabs':
            return { success: true, data: await tabService.getWindowTabs() };

        case 'getActiveTab':
            return { success: true, data: await tabService.getActiveTab() };

        case 'closeTab':
            if (!validatePayload(['tabId']) || typeof message.payload.tabId !== 'number') {
                return { success: false, error: 'Invalid tabId' };
            }
            await tabService.closeTab(message.payload.tabId);
            return { success: true };

        case 'closeTabs':
            if (!validatePayload(['tabIds']) || !Array.isArray(message.payload.tabIds)) {
                return { success: false, error: 'Invalid tabIds array' };
            }
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

        // Quick Focus Score (free for all users - no AI, just analysis)
        case 'getQuickFocusScore':
            const quickReport = await autoPilotService.analyze();
            return {
                success: true,
                data: {
                    focusScore: quickReport.analytics?.healthScore || 50,
                    report: quickReport
                }
            };

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

        case 'getAIPrivacyInfo':
            return { success: true, data: aiService.getPrivacyInfo() };

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

        case 'getAPIUsageStats':
            const usageStats = await aiService.getUsageStats();
            return { success: true, data: usageStats };

        case 'setRateLimits':
            await aiService.setRateLimits(message.payload);
            return { success: true };

        // WebLLM (Local AI) handlers
        case 'initializeWebLLM':
            const webllmSuccess = await aiService.initializeWebLLM();
            return { success: true, data: { initialized: webllmSuccess, state: aiService.getWebLLMState() } };

        case 'getWebLLMState':
            return { success: true, data: aiService.getWebLLMState() };

        case 'unloadWebLLM':
            await aiService.unloadWebLLM();
            return { success: true, data: { provider: aiService.getProvider() } };

        case 'checkWebGPUSupport':
            const capabilities = await aiService.checkWebGPUSupport();
            return { success: true, data: capabilities };

        case 'getRateLimits':
            const rateLimits = aiService.getRateLimits();
            return { success: true, data: rateLimits };

        case 'resetUsageStats':
            await aiService.resetUsageStats();
            return { success: true };

        case 'getLicenseStatus':
            const status = await licenseService.getStatus(message.payload?.forceRefresh);
            return { success: true, data: status };

        case 'getCheckoutUrl':
            const checkoutUrl = await licenseService.getCheckoutUrl();
            return { success: true, data: { url: checkoutUrl } };

        case 'verifyByEmail':
            if (!message.payload?.email) {
                return { success: false, error: 'Email is required' };
            }
            const verifyResult = await licenseService.verifyByEmail(message.payload.email);
            return { success: verifyResult.verified, data: verifyResult, error: verifyResult.message };

        case 'isDeviceAuthorized':
            const authResult = await licenseService.isDeviceAuthorized();
            return { success: authResult.authorized, data: authResult };

        case 'getVerifiedEmail':
            const verifiedEmail = await licenseService.getVerifiedEmail();
            return { success: true, data: { email: verifiedEmail } };

        // Auto Pilot actions (PRO features)
        case 'autoPilotAnalyze':
            // Check if user has PRO license
            const analyzeStatus = await licenseService.getStatus();
            if (!analyzeStatus.paid) {
                return { success: false, error: 'TRIAL_EXPIRED: Auto Pilot requires Pro license' };
            }
            const analyzeReport = await autoPilotService.analyze();
            return { success: true, data: analyzeReport };

        case 'autoPilotAnalyzeWithAI':
            // Check if user has PRO license
            const aiStatus = await licenseService.getStatus();
            if (!aiStatus.paid) {
                return { success: false, error: 'TRIAL_EXPIRED: Auto Pilot requires Pro license' };
            }
            const aiReport = await autoPilotService.analyzeWithAI();
            return { success: true, data: aiReport };

        case 'autoPilotExecute':
            // Check if user has PRO license
            const executeStatus = await licenseService.getStatus();
            if (!executeStatus.paid) {
                return { success: false, error: 'TRIAL_EXPIRED: Auto Pilot requires Pro license' };
            }
            const executeResult = await autoPilotService.executeAutoPilot();
            return { success: true, data: executeResult };

        case 'autoPilotCleanup':
            // Check if user has PRO license
            const cleanupStatus = await licenseService.getStatus();
            if (!cleanupStatus.paid) {
                return { success: false, error: 'TRIAL_EXPIRED: Auto Pilot requires Pro license' };
            }
            const cleanupResult = await autoPilotService.executeCleanup(message.payload.tabIds);
            return { success: true, data: cleanupResult };

        case 'autoPilotGroup':
            // Check if user has PRO license
            const groupStatus = await licenseService.getStatus();
            if (!groupStatus.paid) {
                return { success: false, error: 'TRIAL_EXPIRED: Auto Pilot requires Pro license' };
            }
            const groupResult = await autoPilotService.executeGrouping(message.payload.groups);
            return { success: true, data: groupResult };

        // Contextual Tab Grouping - groups based on page content analysis
        case 'contextualGroup':
            // Check if user has PRO license
            const contextualStatus = await licenseService.getStatus();
            if (!contextualStatus.paid) {
                return { success: false, error: 'TRIAL_EXPIRED: Contextual grouping requires Pro license' };
            }
            const contextualResult = await contextualGroupTabs();
            return contextualResult;

        case 'getAutoPilotSettings':
            const settings = await autoPilotService.loadSettings();
            return { success: true, data: settings };

        case 'setAutoPilotSettings':
            await autoPilotService.saveSettings(message.payload);
            return { success: true };

        // Device management for Pro users
        case 'getDevices':
            const devices = await licenseService.getDevices();
            return { success: true, data: devices };

        case 'removeDevice':
            if (!message.payload?.deviceId) {
                return { success: false, error: 'Device ID required' };
            }
            const removed = await licenseService.removeDevice(message.payload.deviceId);
            return { success: removed, data: { removed } };

        // Trial info
        case 'getTrialInfo':
            const trialInfo = await licenseService.getTrialInfo();
            return { success: true, data: trialInfo };

        // Memory tracking
        case 'getMemoryReport':
            const memoryReport = await memoryService.generateReport();
            return { success: true, data: memoryReport };

        case 'getMemoryOptimizations':
            const suggestions = await memoryService.getOptimizationSuggestions();
            return { success: true, data: { suggestions } };

        case 'hasAdvancedMemory':
            return { success: true, data: { available: memoryService.hasAdvancedMemory() } };

        case 'requestAdvancedMemory':
            const granted = await memoryService.requestAdvancedMemoryPermission();
            return { success: true, data: { granted } };

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
            `You are a tab analysis assistant. Analyze these tabs and return ONLY valid JSON - no markdown, no explanation, no extra text.

Tabs (format: id|title|domain):
${tabSummary}

CRITICAL: Your entire response must be a single valid JSON object starting with { and ending with }. Do not include \`\`\`json or any other formatting.

Required JSON structure:
{
  "summary": "One-sentence overview",
  "duplicates": [{"title": "string", "count": number, "ids": [numbers], "action": "string"}],
  "closeable": [{"id": number, "title": "string", "reason": "string", "priority": "string"}],
  "groups": [{"name": "string", "tabs": ["string"], "reason": "string"}],
  "insights": ["string"]
}

Rules:
- Return ONLY the JSON object, nothing else
- Keep all arrays even if empty []
- Concise reasons (max 5 words)
- Group names: 1-2 words only
- Priority: high/medium/low
- Max 5 closeable, 4 groups, 4 insights
- Start response with { and end with }`
        );

        // Clean and parse JSON response
        let parsedAnalysis;
        try {
            // Remove markdown code blocks and extract JSON
            let cleanJson = analysis.trim();

            // Remove markdown code fences (multiple patterns)
            cleanJson = cleanJson.replace(/^```(?:json|JSON)?\s*/gm, '');
            cleanJson = cleanJson.replace(/```\s*$/gm, '');
            cleanJson = cleanJson.replace(/^`+|`+$/g, '');

            // Remove any leading/trailing text before/after the JSON object
            // Match the first { to the last matching }
            const firstBrace = cleanJson.indexOf('{');
            const lastBrace = cleanJson.lastIndexOf('}');

            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                cleanJson = cleanJson.substring(firstBrace, lastBrace + 1);
            }

            // Try to parse
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
            console.error('JSON parse error:', parseErr);
            console.error('Raw AI response:', analysis);
            console.error('Attempted to parse:', analysis.substring(0, 500));

            // Fallback: return error message with helpful info
            parsedAnalysis = {
                summary: 'AI returned invalid format',
                duplicates: [],
                closeable: [],
                groups: [],
                insights: [
                    'The AI response could not be parsed as valid JSON.',
                    'Try clicking Scan again, or check your AI configuration in Settings.'
                ]
            };
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

        // Use simple indices (0, 1, 2...) instead of Chrome's large tab IDs
        const tabList = tabs.map((t, idx) => `${idx}: ${t.title} (${new URL(t.url).hostname})`).join('\n');

        // Calculate target groups based on tab count
        const minGroups = Math.max(2, Math.ceil(tabs.length / 8));
        const maxGroups = Math.min(10, Math.ceil(tabs.length / 3));

        const aiResponse = await aiService.prompt(
            `Group these tabs by activity. Return ONLY JSON array.

${tabList}

Create ${minGroups}-${maxGroups} groups. Keep names SHORT (1 word only, max 6 letters).
Format: [{"name":"Name","ids":[0,1,2]}]`
        );

        console.log('[SmartOrganizePreview] AI response:', aiResponse);

        const groups = parseJSONResponse<{ name: string; ids: (number | string)[] }[]>(aiResponse, 'SmartOrganizePreview');
        if (!groups) {
            return { success: false, error: 'AI did not return valid JSON. Check AI configuration.' };
        }

        console.log('[SmartOrganizePreview] Parsed groups:', JSON.stringify(groups));

        // Map indices back to real tab IDs, enforce short names
        const enrichedGroups = groups
            .filter(g => g.ids && g.ids.length >= 2 && g.name)
            .map(group => {
                // Convert to numbers and treat as indices
                const indices = group.ids.map(id => typeof id === 'string' ? parseInt(id, 10) : id);
                const validTabs = indices
                    .filter(idx => !isNaN(idx) && idx >= 0 && idx < tabs.length)
                    .map(idx => tabs[idx]);

                return {
                    name: group.name,
                    tabCount: validTabs.length,
                    tabs: validTabs.map(tab => ({
                        id: tab.id,
                        title: tab.title || 'Unknown',
                        url: tab.url || '',
                        favIconUrl: tab.favIconUrl
                    }))
                };
            })
            .filter(g => g.tabCount >= 2);

        console.log('[SmartOrganizePreview] Final groups:', enrichedGroups.length);

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
        // Check license before executing (enforces free tier limit)
        const useCheck = await licenseService.checkAndUse();
        if (!useCheck.allowed) {
            const reason = useCheck.reason === 'trial_expired'
                ? 'TRIAL_EXPIRED: Upgrade to Pro for unlimited access'
                : 'LIMIT_REACHED: Daily limit reached. Upgrade to Pro for unlimited access';
            return { success: false, error: reason };
        }

        const tabs = await tabService.getAllTabs();

        if (tabs.length < 2) {
            return { success: true, data: { organized: [], message: 'Not enough tabs to organize' } };
        }

        // Use simple indices (0, 1, 2...) instead of Chrome's large tab IDs
        const tabList = tabs.map((t, idx) => `${idx}: ${t.title} (${new URL(t.url).hostname})`).join('\n');

        // Calculate target groups based on tab count
        const minGroups = Math.max(2, Math.ceil(tabs.length / 8));
        const maxGroups = Math.min(10, Math.ceil(tabs.length / 3));

        const aiResponse = await aiService.prompt(
            `Group these tabs by activity. Return ONLY JSON array.

${tabList}

Create ${minGroups}-${maxGroups} groups. Keep names SHORT (1 word only, max 6 letters).
Format: [{"name":"Name","ids":[0,1,2]}]`
        );

        const groups = parseJSONResponse<{ name: string; ids: (number | string)[] }[]>(aiResponse, 'SmartOrganize');
        if (!groups) {
            return { success: false, error: 'AI did not return valid JSON. Check AI configuration.' };
        }

        const organized: { groupName: string; tabIds: number[] }[] = [];
        for (const group of groups) {
            if (group.ids && group.ids.length >= 2 && group.name) {
                // Convert indices to real tab IDs
                const indices = group.ids.map(id => typeof id === 'string' ? parseInt(id, 10) : id);
                const validTabIds = indices
                    .filter(idx => !isNaN(idx) && idx >= 0 && idx < tabs.length)
                    .map(idx => tabs[idx].id);

                if (validTabIds.length >= 2) {
                    await tabService.groupTabs(validTabIds, group.name);
                    organized.push({ groupName: group.name, tabIds: validTabIds });
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

// Contextual Tab Grouping - analyzes page content for smarter grouping
const tabManager = new TabManager();

async function contextualGroupTabs(): Promise<MessageResponse> {
    try {
        const result = await tabManager.applyContextualGroups();

        if (result.success && result.groups.length > 0) {
            return {
                success: true,
                data: {
                    groups: result.groups,
                    message: `Created ${result.groups.length} contextual groups: ${result.groups.join(', ')}`
                }
            };
        } else {
            return {
                success: true,
                data: {
                    groups: [],
                    message: 'No contextual groups could be created (need at least 2 related tabs)'
                }
            };
        }
    } catch (err: any) {
        console.error('Contextual grouping failed:', err);
        return { success: false, error: err.message || 'Contextual grouping failed' };
    }
}

export {};
