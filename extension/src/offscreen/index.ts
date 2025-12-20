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

// Process tab grouping request using Local AI
async function groupTabs(tabs: { id: number; title: string; url: string }[]): Promise<{
    success: boolean;
    groups?: { name: string; tabIds: number[] }[];
    error?: string;
}> {
    // Ensure engine is ready
    if (!webllmEngine) {
        const ok = await initializeEngine();
        if (!ok) {
            return { success: false, error: 'Failed to initialize AI' };
        }
    }

    console.log(`[Offscreen] AI Grouping ${tabs.length} tabs`);

    try {
        // Build tab list with FULL hostname for better AI understanding
        const tabList = tabs.map((t, idx) => {
            try {
                const hostname = new URL(t.url).hostname.replace('www.', '');
                return `${idx}. [${hostname}] ${t.title.substring(0, 50)}`;
            } catch {
                return `${idx}. ${t.title.substring(0, 50)}`;
            }
        }).join('\n');

        console.log('[Offscreen] Tab list for AI:\n' + tabList);

        // Few-shot prompt with explicit examples matching input format
        const prompt = `Categorize browser tabs by their domain into groups.

INPUT:
0. [mail.google.com] Inbox - Gmail
1. [youtube.com] Funny Video
2. [github.com] My Repo
3. [netflix.com] Movie
4. [outlook.com] Mail
5. [claude.ai] Chat

OUTPUT:
[{"name":"Mail","ids":[0,4]},{"name":"Video","ids":[1,3]},{"name":"Code","ids":[2]},{"name":"AI","ids":[5]}]

RULES:
- Video: youtube, netflix, primevideo, stan, hulu, twitch, hianime, cineby
- Mail: gmail, mail.google, outlook, yahoo
- AI: claude, chatgpt, openai, gemini, huggingface, aistudio
- Code: github, gitlab, stackoverflow
- Social: x.com, twitter, reddit, facebook
- Cloud: console.cloud, console.twilio, analytics.google
- News: medium, producthunt, news

INPUT:
${tabList}

OUTPUT:`;

        // More tokens for many tabs
        const maxTokens = Math.max(1500, tabs.length * 50);

        console.log('[Offscreen] Sending to AI...');
        const response = await webllmEngine!.chat.completions.create({
            messages: [
                {
                    role: 'system',
                    content: 'You categorize browser tabs by looking at their domain. Output only valid JSON arrays. Match domains exactly: netflix/youtube/primevideo/stan/hianime=Video, gmail/outlook/mail=Mail, github/stackoverflow=Code, x.com/twitter/reddit=Social, claude/chatgpt/gemini/openai=AI, console.cloud/twilio/analytics=Cloud, medium/producthunt=News.'
                },
                { role: 'user', content: prompt }
            ],
            max_tokens: maxTokens,
            temperature: 0.0,  // Zero temperature for deterministic output
        });

        let aiText = response.choices[0]?.message?.content?.trim() || '';
        console.log('[Offscreen] AI raw response:', aiText);

        // Strip markdown code blocks
        aiText = aiText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

        // Extract JSON array
        let groups = null;
        const jsonStart = aiText.indexOf('[');
        const jsonEnd = aiText.lastIndexOf(']');

        if (jsonStart >= 0 && jsonEnd > jsonStart) {
            try {
                let jsonStr = aiText.substring(jsonStart, jsonEnd + 1);
                // Fix common JSON issues
                jsonStr = jsonStr.replace(/,\s*}/g, '}').replace(/,\s*\]/g, ']');
                jsonStr = jsonStr.replace(/'/g, '"'); // Single to double quotes
                groups = JSON.parse(jsonStr);
                console.log('[Offscreen] Parsed groups:', JSON.stringify(groups));
            } catch (e) {
                console.log('[Offscreen] JSON parse failed:', e);
            }
        }

        if (!groups || !Array.isArray(groups)) {
            console.log('[Offscreen] No valid JSON array found');
            return { success: false, error: 'AI did not return valid JSON groups' };
        }

        // Helper to get ids from various formats AI might use
        const getGroupIds = (g: any): number[] => {
            const arr = g.ids || g.tabIds || g.tabs || g.indices || [];
            return Array.isArray(arr) ? arr : [];
        };

        // Map indices to real tab IDs, ensuring no duplicates
        const usedIndices = new Set<number>();
        const validGroups = groups
            .filter((g: any) => g && typeof g.name === 'string' && g.name.length > 0 && getGroupIds(g).length >= 2)
            .map((g: any) => {
                const groupIds = getGroupIds(g);
                const realTabIds = groupIds
                    .map((idx: any) => {
                        const index = typeof idx === 'string' ? parseInt(idx, 10) : idx;
                        if (typeof index === 'number' && !isNaN(index) && index >= 0 && index < tabs.length && !usedIndices.has(index)) {
                            usedIndices.add(index);
                            return tabs[index].id;
                        }
                        return null;
                    })
                    .filter((id: number | null): id is number => id !== null);

                return {
                    name: g.name.substring(0, 8),  // Max 8 chars for group name
                    tabIds: realTabIds
                };
            })
            .filter(g => g.tabIds.length >= 2);

        console.log('[Offscreen] Valid groups:', validGroups.map(g => `${g.name}(${g.tabIds.length})`).join(', '));

        if (validGroups.length === 0) {
            return { success: false, error: 'AI did not create any valid groups (need 2+ tabs each)' };
        }

        return { success: true, groups: validGroups };

    } catch (err: any) {
        console.error('[Offscreen] AI Grouping error:', err);
        return { success: false, error: err.message || 'AI processing failed' };
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
