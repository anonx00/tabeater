/**
 * Offscreen Document for WebLLM Processing
 *
 * This runs in a hidden document with WebGPU access.
 * It persists even when popup/sidepanel close, allowing
 * AI operations to complete in the background.
 */

import * as webllm from '@mlc-ai/web-llm';

// Default model - smaller for better compatibility
const DEFAULT_MODEL_ID = 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC';

// Global engine instance
let webllmEngine: webllm.MLCEngineInterface | null = null;
let isInitializing = false;
let currentModelId: string = DEFAULT_MODEL_ID;

// Send status updates to service worker
function sendStatus(status: string, progress: number = 0, message: string = '') {
    chrome.runtime.sendMessage({
        target: 'service-worker',
        action: 'webllm-status',
        data: { status, progress, message, modelId: currentModelId }
    }).catch(() => {});
}

// Initialize WebLLM engine
async function initializeEngine(modelId?: string): Promise<boolean> {
    const targetModel = modelId || currentModelId;

    // Already initialized with same model
    if (webllmEngine && currentModelId === targetModel) {
        console.log('[Offscreen] Engine already ready');
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
        sendStatus('downloading', 0, 'Starting download...');

        webllmEngine = await webllm.CreateMLCEngine(targetModel, {
            initProgressCallback: (progress) => {
                const percent = Math.round(progress.progress * 100);
                const text = progress.text || 'Loading...';
                const status = percent > 95 ? 'loading' : 'downloading';
                sendStatus(status, percent, text);
            }
        });

        sendStatus('ready', 100, 'AI ready');
        console.log('[Offscreen] Engine initialized successfully');
        isInitializing = false;
        return true;

    } catch (err: any) {
        console.error('[Offscreen] Init failed:', err);
        let errorMsg = err.message || 'Unknown error';

        if (errorMsg.includes('OUTOFMEMORY') || errorMsg.includes('D3D12') ||
            errorMsg.includes('memory') || errorMsg.includes('OOM')) {
            errorMsg = 'Not enough GPU memory. Try closing other apps or use smaller model.';
        }

        sendStatus('error', 0, errorMsg);
        isInitializing = false;
        return false;
    }
}

// Process tab grouping request
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

    try {
        // Build tab list
        const tabList = tabs.map((t, idx) => {
            try {
                const hostname = new URL(t.url).hostname.replace('www.', '');
                return `${idx}. "${t.title}" [${hostname}]`;
            } catch {
                return `${idx}. "${t.title}"`;
            }
        }).join('\n');

        const minGroups = Math.max(2, Math.ceil(tabs.length / 8));
        const maxGroups = Math.min(8, Math.ceil(tabs.length / 3));

        const prompt = `You are organizing browser tabs into groups. Look at each tab's title and domain to understand what it's for.

TABS:
${tabList}

TASK: Group these tabs by their PURPOSE (what they're used for).

Examples of good groupings:
- Video streaming sites (netflix, youtube, hulu) → "Video"
- Code/dev sites (github, stackoverflow, docs) → "Code"
- Email/messaging (gmail, outlook, slack) → "Mail"
- Social media (twitter/x, reddit, facebook) → "Social"
- Shopping sites (amazon, ebay, store pages) → "Shop"
- News/articles (news sites, blogs, articles) → "News"

Output ONLY valid JSON (no other text):
[{"name":"Video","ids":[0,2,5]},{"name":"Code","ids":[1,3,4]}]

Rules:
- name: Short word describing the group's purpose (max 5 letters)
- ids: Array of tab numbers that belong together (minimum 2 tabs per group)
- Every tab number must appear exactly once
- Output must be a flat JSON array

JSON:`;

        const response = await webllmEngine!.chat.completions.create({
            messages: [{ role: 'user', content: prompt }],
            max_tokens: Math.min(4000, Math.max(1500, tabs.length * 50)),
            temperature: 0.0,
        });

        let aiText = response.choices[0]?.message?.content?.trim() || '';

        // Strip markdown code blocks
        aiText = aiText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

        console.log('[Offscreen] AI response:', aiText);

        // Extract JSON
        let groups = null;
        const jsonStart = aiText.indexOf('[');
        const jsonEnd = aiText.lastIndexOf(']');

        if (jsonStart >= 0 && jsonEnd > jsonStart) {
            try {
                let jsonStr = aiText.substring(jsonStart, jsonEnd + 1);
                jsonStr = jsonStr.replace(/,\s*}/g, '}').replace(/,\s*\]/g, ']');
                groups = JSON.parse(jsonStr);
            } catch (e) {
                console.log('[Offscreen] JSON parse failed:', e);
            }
        }

        if (!groups) {
            try {
                groups = JSON.parse(aiText);
            } catch (e) {
                console.log('[Offscreen] Direct parse failed');
            }
        }

        if (!groups || !Array.isArray(groups)) {
            return { success: false, error: 'AI did not return valid groups' };
        }

        // Flatten nested arrays
        if (Array.isArray(groups[0]) && groups[0].length > 0) {
            groups = groups.flat().filter((g: any) => g && typeof g === 'object');
        }

        // Helper to get ids from various formats
        const getGroupIds = (g: any): number[] => {
            const arr = g.ids || g.tabIds || g.tabs || g.indices || [];
            return Array.isArray(arr) ? arr : [];
        };

        // Map indices to real tab IDs
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
                    name: g.name.substring(0, 5),
                    tabIds: realTabIds
                };
            })
            .filter(g => g.tabIds.length >= 2);

        if (validGroups.length === 0) {
            return { success: false, error: 'No valid groups created' };
        }

        return { success: true, groups: validGroups };

    } catch (err: any) {
        console.error('[Offscreen] Grouping error:', err);
        return { success: false, error: err.message || 'AI processing failed' };
    }
}

// Handle messages from service worker
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.target !== 'offscreen') return;

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

        case 'get-status':
            sendResponse({
                ready: webllmEngine !== null,
                modelId: currentModelId,
                initializing: isInitializing
            });
            return true;

        case 'unload':
            if (webllmEngine) {
                webllmEngine.unload().then(() => {
                    webllmEngine = null;
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

console.log('[Offscreen] Document loaded and ready');
