/**
 * Offscreen Document for WebLLM Processing
 *
 * This runs in a hidden document with WebGPU access.
 * It persists even when popup/sidepanel close, allowing
 * AI operations to complete in the background.
 *
 * Features:
 * - Model cache detection for instant loading
 * - Auto-preload on startup if previously enabled
 * - Keepalive to prevent document from being closed
 */

import * as webllm from '@mlc-ai/web-llm';

// Default model - smaller for better compatibility
const DEFAULT_MODEL_ID = 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC';

// Global engine instance
let webllmEngine: webllm.MLCEngineInterface | null = null;
let isInitializing = false;
let currentModelId: string = DEFAULT_MODEL_ID;
let lastActivityTime = Date.now();

// Keepalive - ping every 20 seconds to prevent Chrome from closing the offscreen document
setInterval(() => {
    lastActivityTime = Date.now();
    // Send heartbeat to service worker
    chrome.runtime.sendMessage({
        target: 'service-worker',
        action: 'offscreen-heartbeat',
        data: { alive: true, engineReady: webllmEngine !== null, modelId: currentModelId }
    }).catch(() => {});
}, 20000);

// Send status updates to service worker
function sendStatus(status: string, progress: number = 0, message: string = '') {
    chrome.runtime.sendMessage({
        target: 'service-worker',
        action: 'webllm-status',
        data: { status, progress, message, modelId: currentModelId }
    }).catch(() => {});
}

// Check if model is already cached in IndexedDB
async function isModelCached(modelId: string): Promise<boolean> {
    try {
        // WebLLM uses IndexedDB with 'webllm-model-cache' database
        return new Promise((resolve) => {
            const request = indexedDB.open('webllm-model-cache');
            request.onerror = () => resolve(false);
            request.onsuccess = () => {
                const db = request.result;
                try {
                    // Check if the model's store exists
                    const hasStore = db.objectStoreNames.contains(modelId) ||
                                   db.objectStoreNames.contains('model-cache');
                    db.close();

                    // Also check tvmjs cache for wasm
                    const tvmRequest = indexedDB.open('tvmjs');
                    tvmRequest.onerror = () => resolve(hasStore);
                    tvmRequest.onsuccess = () => {
                        const tvmDb = tvmRequest.result;
                        const hasTvm = tvmDb.objectStoreNames.length > 0;
                        tvmDb.close();
                        resolve(hasStore && hasTvm);
                    };
                } catch {
                    db.close();
                    resolve(false);
                }
            };
        });
    } catch {
        return false;
    }
}

// Initialize WebLLM engine with cache detection
async function initializeEngine(modelId?: string): Promise<boolean> {
    const targetModel = modelId || currentModelId;

    // Already initialized with same model
    if (webllmEngine && currentModelId === targetModel) {
        console.log('[Offscreen] Engine already ready');
        sendStatus('ready', 100, 'AI ready');
        return true;
    }

    // Unload if switching models
    if (webllmEngine && currentModelId !== targetModel) {
        console.log('[Offscreen] Switching models, unloading current...');
        try {
            await webllmEngine.unload();
        } catch (e) {
            console.warn('[Offscreen] Unload error:', e);
        }
        webllmEngine = null;
    }

    if (isInitializing) {
        console.log('[Offscreen] Already initializing, waiting...');
        while (isInitializing) {
            await new Promise(r => setTimeout(r, 100));
        }
        return webllmEngine !== null;
    }

    isInitializing = true;
    currentModelId = targetModel;

    try {
        // Check if model is cached for better UX
        const cached = await isModelCached(targetModel);
        const initMessage = cached ? 'Loading from cache...' : 'Downloading model...';
        const initStatus = cached ? 'loading' : 'downloading';

        console.log(`[Offscreen] Model cached: ${cached}, starting ${initStatus}`);
        sendStatus(initStatus, cached ? 10 : 0, initMessage);

        const startTime = Date.now();

        webllmEngine = await webllm.CreateMLCEngine(targetModel, {
            initProgressCallback: (progress) => {
                const percent = Math.round(progress.progress * 100);
                const text = progress.text || 'Loading...';

                // Determine status based on progress text and cache status
                let status = 'downloading';
                if (cached || percent > 90 || text.includes('Loading') || text.includes('Compil')) {
                    status = 'loading';
                }

                sendStatus(status, percent, text);
            }
        });

        const loadTime = ((Date.now() - startTime) / 1000).toFixed(1);
        sendStatus('ready', 100, `AI ready (${loadTime}s)`);
        console.log(`[Offscreen] Engine initialized in ${loadTime}s`);

        // Persist ready state
        chrome.storage.local.set({
            webllmReady: true,
            webllmModel: targetModel,
            offscreenAIStatus: { status: 'ready', progress: 100, message: 'AI ready', modelId: targetModel }
        }).catch(() => {});

        isInitializing = false;
        return true;

    } catch (err: any) {
        console.error('[Offscreen] Init failed:', err);
        let errorMsg = err.message || 'Unknown error';

        if (errorMsg.includes('OUTOFMEMORY') || errorMsg.includes('D3D12') ||
            errorMsg.includes('memory') || errorMsg.includes('OOM')) {
            errorMsg = 'Not enough GPU memory. Try closing other apps or use smaller model.';
        } else if (errorMsg.includes('WebGPU') || errorMsg.includes('requestAdapter')) {
            errorMsg = 'WebGPU not available. Check browser compatibility.';
        }

        sendStatus('error', 0, errorMsg);
        isInitializing = false;
        return false;
    }
}

// Auto-preload engine on startup if previously enabled
async function autoPreload() {
    try {
        const stored = await chrome.storage.local.get(['webllmReady', 'webllmModel', 'aiConfig']);

        // Only preload if user previously had WebLLM enabled
        if (stored.webllmReady || stored.aiConfig?.preferWebLLM) {
            const modelId = stored.webllmModel || DEFAULT_MODEL_ID;
            console.log('[Offscreen] Auto-preloading model:', modelId);

            // Check if cached for faster startup indication
            const cached = await isModelCached(modelId);
            if (cached) {
                sendStatus('loading', 5, 'Warming up AI...');
            }

            // Initialize in background
            await initializeEngine(modelId);
        } else {
            console.log('[Offscreen] No previous WebLLM config, skipping preload');
        }
    } catch (err) {
        console.warn('[Offscreen] Auto-preload failed:', err);
    }
}

// Domain to category mapping for rule-based categorization
const DOMAIN_CATEGORIES: Record<string, string> = {
    // Video/Streaming
    'youtube': 'Video', 'netflix': 'Video', 'twitch': 'Video', 'hulu': 'Video',
    'disneyplus': 'Video', 'disney': 'Video', 'primevideo': 'Video', 'vimeo': 'Video',
    'hbomax': 'Video', 'max': 'Video', 'stan': 'Video', 'peacock': 'Video',
    'crunchyroll': 'Video', 'funimation': 'Video', 'dailymotion': 'Video',

    // Code/Development
    'github': 'Code', 'gitlab': 'Code', 'stackoverflow': 'Code', 'codepen': 'Code',
    'replit': 'Code', 'codesandbox': 'Code', 'npmjs': 'Code', 'npm': 'Code',
    'jsfiddle': 'Code', 'bitbucket': 'Code', 'vercel': 'Code', 'netlify': 'Code',
    'heroku': 'Code', 'aws': 'Code', 'azure': 'Code', 'gcloud': 'Code',

    // Mail
    'mail': 'Mail', 'gmail': 'Mail', 'outlook': 'Mail', 'yahoo': 'Mail',
    'proton': 'Mail', 'protonmail': 'Mail', 'icloud': 'Mail', 'zoho': 'Mail',

    // Social
    'twitter': 'Social', 'x': 'Social', 'reddit': 'Social', 'facebook': 'Social',
    'instagram': 'Social', 'linkedin': 'Social', 'discord': 'Social', 'tiktok': 'Social',
    'snapchat': 'Social', 'pinterest': 'Social', 'tumblr': 'Social', 'threads': 'Social',
    'mastodon': 'Social', 'bluesky': 'Social',

    // Shopping
    'amazon': 'Shop', 'ebay': 'Shop', 'etsy': 'Shop', 'walmart': 'Shop',
    'target': 'Shop', 'aliexpress': 'Shop', 'alibaba': 'Shop', 'shopify': 'Shop',
    'bestbuy': 'Shop', 'newegg': 'Shop', 'wish': 'Shop',

    // News
    'cnn': 'News', 'bbc': 'News', 'nytimes': 'News', 'theguardian': 'News',
    'washingtonpost': 'News', 'reuters': 'News', 'apnews': 'News', 'foxnews': 'News',
    'nbcnews': 'News', 'medium': 'News', 'substack': 'News', 'news': 'News',

    // Work/Productivity
    'notion': 'Work', 'slack': 'Work', 'trello': 'Work', 'asana': 'Work',
    'jira': 'Work', 'confluence': 'Work', 'monday': 'Work', 'clickup': 'Work',
    'airtable': 'Work', 'basecamp': 'Work', 'figma': 'Work', 'miro': 'Work',
    'docs': 'Work', 'sheets': 'Work', 'drive': 'Work', 'dropbox': 'Work',
    'onedrive': 'Work', 'box': 'Work', 'zoom': 'Work', 'meet': 'Work', 'teams': 'Work',

    // Music
    'spotify': 'Music', 'soundcloud': 'Music', 'pandora': 'Music', 'deezer': 'Music',
    'tidal': 'Music', 'bandcamp': 'Music', 'music': 'Music',

    // AI
    'openai': 'AI', 'anthropic': 'AI', 'claude': 'AI', 'chatgpt': 'AI',
    'gemini': 'AI', 'perplexity': 'AI', 'huggingface': 'AI', 'bard': 'AI',
    'poe': 'AI', 'character': 'AI', 'midjourney': 'AI', 'stability': 'AI',
    'replicate': 'AI', 'cohere': 'AI',

    // Gaming (twitch is in Video for streaming, but gaming content goes there too)
    'steam': 'Games', 'epicgames': 'Games', 'itch': 'Games', 'gog': 'Games',
    'roblox': 'Games', 'ea': 'Games', 'ubisoft': 'Games', 'playstation': 'Games',
    'xbox': 'Games', 'nintendo': 'Games',

    // Reference/Reading
    'wikipedia': 'Read', 'wikimedia': 'Read', 'britannica': 'Read', 'quora': 'Read',
    'stackexchange': 'Read', 'goodreads': 'Read',

    // Search
    'google': 'Search', 'bing': 'Search', 'duckduckgo': 'Search', 'brave': 'Search',
};

// Categorize a single tab based on domain
function categorizeTab(url: string, title: string): string {
    try {
        const hostname = new URL(url).hostname.toLowerCase().replace('www.', '');

        // Check each part of the hostname
        const parts = hostname.split('.');
        for (const part of parts) {
            if (DOMAIN_CATEGORIES[part]) {
                return DOMAIN_CATEGORIES[part];
            }
        }

        // Check if hostname contains any known domain
        for (const [domain, category] of Object.entries(DOMAIN_CATEGORIES)) {
            if (hostname.includes(domain)) {
                return category;
            }
        }

        // Fallback: check title for hints
        const titleLower = title.toLowerCase();
        if (titleLower.includes('mail') || titleLower.includes('inbox')) return 'Mail';
        if (titleLower.includes('video') || titleLower.includes('watch')) return 'Video';
        if (titleLower.includes('chat') || titleLower.includes('message')) return 'Social';

        return 'Other';
    } catch {
        return 'Other';
    }
}

// Process tab grouping request - uses rule-based categorization with AI fallback
async function groupTabs(tabs: { id: number; title: string; url: string }[]): Promise<{
    success: boolean;
    groups?: { name: string; tabIds: number[] }[];
    error?: string;
}> {
    console.log(`[Offscreen] Grouping ${tabs.length} tabs`);

    try {
        // First, try rule-based categorization (faster and more reliable)
        const categoryMap = new Map<string, number[]>();

        for (let i = 0; i < tabs.length; i++) {
            const tab = tabs[i];
            const category = categorizeTab(tab.url, tab.title);

            console.log(`[Offscreen] Tab ${i}: ${new URL(tab.url).hostname} -> ${category}`);

            if (!categoryMap.has(category)) {
                categoryMap.set(category, []);
            }
            categoryMap.get(category)!.push(tab.id);
        }

        // Convert to groups array, filter groups with less than 2 tabs
        const groups: { name: string; tabIds: number[] }[] = [];
        const ungroupedTabs: number[] = [];

        categoryMap.forEach((tabIds, name) => {
            if (tabIds.length >= 2) {
                groups.push({ name, tabIds });
            } else {
                ungroupedTabs.push(...tabIds);
            }
        });

        // Add ungrouped tabs to "Other" if there are enough
        if (ungroupedTabs.length >= 2) {
            const existingOther = groups.find(g => g.name === 'Other');
            if (existingOther) {
                existingOther.tabIds.push(...ungroupedTabs);
            } else {
                groups.push({ name: 'Other', tabIds: ungroupedTabs });
            }
        }

        console.log(`[Offscreen] Rule-based grouping result:`, groups.map(g => `${g.name}(${g.tabIds.length})`).join(', '));

        if (groups.length === 0) {
            return { success: false, error: 'Not enough tabs in any category to form groups (min 2)' };
        }

        return { success: true, groups };

    } catch (err: any) {
        console.error('[Offscreen] Grouping error:', err);
        return { success: false, error: err.message || 'Grouping failed' };
    }
}

// Chat with AI
async function chatWithAI(messages: { role: 'system' | 'user' | 'assistant'; content: string }[]): Promise<{
    success: boolean;
    response?: string;
    error?: string;
}> {
    // Ensure engine is ready
    if (!webllmEngine) {
        const ok = await initializeEngine();
        if (!ok) {
            return { success: false, error: 'Failed to initialize AI' };
        }
    }

    try {
        const response = await webllmEngine!.chat.completions.create({
            messages: messages,
            max_tokens: 500,
            temperature: 0.7,
            frequency_penalty: 1.5,  // Strongly penalize repetition
            presence_penalty: 1.0,   // Encourage new topics
        });

        let content = response.choices[0]?.message?.content || 'No response';

        // Post-process: detect and cut off repetition
        const lines = content.split('\n');
        const seenLines = new Set<string>();
        const uniqueLines: string[] = [];
        let repetitionCount = 0;

        for (const line of lines) {
            const normalized = line.trim().toLowerCase();
            if (normalized.length < 5) {
                uniqueLines.push(line);
                continue;
            }
            if (seenLines.has(normalized)) {
                repetitionCount++;
                if (repetitionCount > 2) break; // Stop after 2 repeated lines
            } else {
                seenLines.add(normalized);
                uniqueLines.push(line);
                repetitionCount = 0;
            }
        }

        const finalResponse = uniqueLines.join('\n').trim() || 'I can help you organize your tabs. What would you like to know?';
        return { success: true, response: finalResponse };

    } catch (err: any) {
        console.error('[Offscreen] Chat error:', err);
        return { success: false, error: err.message || 'AI chat failed' };
    }
}

// Handle messages from service worker
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.target !== 'offscreen') return;

    // Update activity time
    lastActivityTime = Date.now();

    console.log('[Offscreen] Received message:', message.action);

    switch (message.action) {
        case 'init':
            initializeEngine(message.modelId).then(success => {
                sendResponse({ success });
            });
            return true;

        case 'group-tabs':
            groupTabs(message.tabs).then(result => {
                sendResponse(result);
            });
            return true;

        case 'chat':
            chatWithAI(message.messages).then(result => {
                sendResponse(result);
            });
            return true;

        case 'get-status':
            sendResponse({
                ready: webllmEngine !== null,
                modelId: currentModelId,
                initializing: isInitializing,
                lastActivity: lastActivityTime
            });
            return true;

        case 'warmup':
            // Quick warmup - just ensure engine is loaded
            if (webllmEngine) {
                sendResponse({ success: true, ready: true });
            } else {
                initializeEngine(message.modelId).then(success => {
                    sendResponse({ success, ready: success });
                });
            }
            return true;

        case 'ping':
            // Simple ping for health check
            sendResponse({ pong: true, ready: webllmEngine !== null });
            return true;

        case 'unload':
            if (webllmEngine) {
                webllmEngine.unload().then(() => {
                    webllmEngine = null;
                    chrome.storage.local.set({
                        webllmReady: false,
                        offscreenAIStatus: { status: 'not_initialized', progress: 0, message: 'Unloaded' }
                    }).catch(() => {});
                    sendResponse({ success: true });
                }).catch(e => {
                    console.warn('[Offscreen] Unload error:', e);
                    webllmEngine = null;
                    sendResponse({ success: true });
                });
            } else {
                sendResponse({ success: true });
            }
            return true;
    }
});

// Start auto-preload after a short delay to let the document fully initialize
console.log('[Offscreen] Document loaded and ready');
setTimeout(() => {
    autoPreload();
}, 500);
