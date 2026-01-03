/**
 * WebLLM Service - Local AI powered by SmolLM2-360M
 * Runs entirely in the browser using WebGPU acceleration
 * No data leaves the device - maximum privacy
 */

import * as webllm from '@mlc-ai/web-llm';

// WebGPU type declarations (not in standard TypeScript lib)
declare global {
    interface Navigator {
        gpu?: {
            requestAdapter(): Promise<GPUAdapter | null>;
        };
    }
    interface GPUAdapter {
        requestAdapterInfo(): Promise<GPUAdapterInfo>;
        limits: GPUAdapterLimits;
    }
    interface GPUAdapterInfo {
        vendor?: string;
        architecture?: string;
        device?: string;
        description?: string;
    }
    interface GPUAdapterLimits {
        maxBufferSize?: number;
    }
}

// Model configuration - SmolLM2-360M is optimal for tab management tasks
// Small enough to load quickly (~200MB), capable enough for categorization
const MODEL_ID = 'SmolLM2-360M-Instruct-q4f16_1-MLC';

// Alternative models if needed (larger but more capable)
const _FALLBACK_MODELS = [
    'SmolLM2-360M-Instruct-q4f32_1-MLC',  // Slightly larger, better precision
    'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',  // Larger, better reasoning
];

export type WebLLMStatus =
    | 'not_initialized'
    | 'checking_support'
    | 'not_supported'
    | 'ready_to_download'
    | 'downloading'
    | 'loading'
    | 'ready'
    | 'error';

export interface WebLLMState {
    status: WebLLMStatus;
    progress: number;  // 0-100
    message: string;
    modelId: string;
    error?: string;
    downloadedMB?: number;
    totalMB?: number;
}

export interface WebLLMCapabilities {
    webgpuSupported: boolean;
    webgpuAdapter: string | null;
    estimatedVRAM: number | null;
    recommendedModel: string;
}

class WebLLMService {
    private engine: webllm.MLCEngineInterface | null = null;
    private state: WebLLMState = {
        status: 'not_initialized',
        progress: 0,
        message: 'Not initialized',
        modelId: MODEL_ID,
    };
    private initPromise: Promise<boolean> | null = null;
    private stateListeners: Set<(state: WebLLMState) => void> = new Set();

    /**
     * Check if WebGPU is supported in this browser
     */
    async checkWebGPUSupport(): Promise<WebLLMCapabilities> {
        try {
            if (!navigator.gpu) {
                return {
                    webgpuSupported: false,
                    webgpuAdapter: null,
                    estimatedVRAM: null,
                    recommendedModel: MODEL_ID,
                };
            }

            const adapter = await navigator.gpu.requestAdapter();
            if (!adapter) {
                return {
                    webgpuSupported: false,
                    webgpuAdapter: null,
                    estimatedVRAM: null,
                    recommendedModel: MODEL_ID,
                };
            }

            // Get adapter info
            const adapterInfo = await adapter.requestAdapterInfo();
            const limits = adapter.limits;

            // Estimate VRAM from max buffer size (rough approximation)
            const estimatedVRAM = limits.maxBufferSize
                ? Math.round(limits.maxBufferSize / (1024 * 1024 * 1024) * 10) / 10
                : null;

            return {
                webgpuSupported: true,
                webgpuAdapter: adapterInfo.description || adapterInfo.vendor || 'Unknown GPU',
                estimatedVRAM,
                recommendedModel: MODEL_ID,
            };
        } catch (err) {
            console.warn('[WebLLM] WebGPU check failed:', err);
            return {
                webgpuSupported: false,
                webgpuAdapter: null,
                estimatedVRAM: null,
                recommendedModel: MODEL_ID,
            };
        }
    }

    /**
     * Subscribe to state changes
     */
    onStateChange(listener: (state: WebLLMState) => void): () => void {
        this.stateListeners.add(listener);
        // Immediately call with current state
        listener(this.state);
        return () => this.stateListeners.delete(listener);
    }

    private updateState(updates: Partial<WebLLMState>): void {
        this.state = { ...this.state, ...updates };
        this.stateListeners.forEach(listener => listener(this.state));

        // Also persist key state to storage for cross-context access
        chrome.storage.local.set({
            webllmState: {
                status: this.state.status,
                progress: this.state.progress,
                message: this.state.message,
                modelId: this.state.modelId,
            }
        }).catch(() => {});
    }

    /**
     * Get current state
     */
    getState(): WebLLMState {
        return { ...this.state };
    }

    /**
     * Initialize and load the model
     * Returns true if successful, false otherwise
     */
    async initialize(): Promise<boolean> {
        // Prevent duplicate initialization
        if (this.initPromise) {
            return this.initPromise;
        }

        this.initPromise = this._doInitialize();
        return this.initPromise;
    }

    private async _doInitialize(): Promise<boolean> {
        try {
            this.updateState({
                status: 'checking_support',
                message: 'Checking WebGPU support...',
                progress: 0,
            });

            // Check WebGPU support
            const capabilities = await this.checkWebGPUSupport();

            if (!capabilities.webgpuSupported) {
                this.updateState({
                    status: 'not_supported',
                    message: 'WebGPU not supported in this browser. Use Chrome 113+ or Edge 113+.',
                    error: 'WebGPU not available',
                });
                return false;
            }

            this.updateState({
                status: 'downloading',
                message: `Loading ${MODEL_ID}...`,
                progress: 0,
            });

            // Create engine with progress callback
            this.engine = await webllm.CreateMLCEngine(MODEL_ID, {
                initProgressCallback: (progress) => {
                    const percent = Math.round(progress.progress * 100);
                    let message = progress.text || 'Loading model...';

                    // Parse download progress if available
                    let downloadedMB: number | undefined;
                    let totalMB: number | undefined;

                    if (message.includes('MB')) {
                        const match = message.match(/(\d+(?:\.\d+)?)\s*MB.*?(\d+(?:\.\d+)?)\s*MB/);
                        if (match) {
                            downloadedMB = parseFloat(match[1]);
                            totalMB = parseFloat(match[2]);
                        }
                    }

                    // Determine status based on progress
                    let status: WebLLMStatus = 'downloading';
                    if (progress.progress > 0.95) {
                        status = 'loading';
                        message = 'Initializing model...';
                    }

                    this.updateState({
                        status,
                        progress: percent,
                        message,
                        downloadedMB,
                        totalMB,
                    });
                },
            });

            this.updateState({
                status: 'ready',
                progress: 100,
                message: 'Local AI ready',
            });

            return true;
        } catch (err: any) {
            console.error('[WebLLM] Initialization failed:', err);

            let errorMessage = err.message || 'Unknown error';

            // Provide helpful error messages
            if (errorMessage.includes('WebGPU')) {
                errorMessage = 'WebGPU initialization failed. Try updating your browser or GPU drivers.';
            } else if (errorMessage.includes('out of memory') || errorMessage.includes('OOM')) {
                errorMessage = 'Not enough GPU memory. Close other GPU-intensive apps and try again.';
            } else if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
                errorMessage = 'Failed to download model. Check your internet connection.';
            }

            this.updateState({
                status: 'error',
                message: errorMessage,
                error: errorMessage,
                progress: 0,
            });

            this.initPromise = null;
            return false;
        }
    }

    /**
     * Check if the model is ready for inference
     */
    isReady(): boolean {
        return this.state.status === 'ready' && this.engine !== null;
    }

    /**
     * Generate a response from the model
     */
    async prompt(text: string): Promise<string> {
        if (!this.isReady() || !this.engine) {
            throw new Error('WebLLM not ready. Call initialize() first.');
        }

        try {
            const response = await this.engine.chat.completions.create({
                messages: [
                    {
                        role: 'system',
                        content: `You are TabEater, a tactical tab intelligence assistant.
Provide concise, actionable insights about browser tabs and web content.
Keep responses brief and focused. When categorizing tabs, use simple category names like:
Work, Research, Shopping, Social, Entertainment, News, Development, Reference, Other.
Always respond with valid JSON when asked for structured output.`
                    },
                    {
                        role: 'user',
                        content: text
                    }
                ],
                max_tokens: 500,
                temperature: 0.3,  // Lower temperature for more consistent categorization
            });

            return response.choices[0]?.message?.content || 'No response generated';
        } catch (err: any) {
            console.error('[WebLLM] Prompt failed:', err);
            throw new Error(`WebLLM inference failed: ${err.message}`);
        }
    }

    /**
     * Generate streaming response
     */
    async *promptStream(text: string): AsyncGenerator<string> {
        if (!this.isReady() || !this.engine) {
            throw new Error('WebLLM not ready. Call initialize() first.');
        }

        const chunks = await this.engine.chat.completions.create({
            messages: [
                {
                    role: 'system',
                    content: `You are TabEater, a tactical tab intelligence assistant.
Provide concise, actionable insights about browser tabs and web content.
Keep responses brief and focused.`
                },
                {
                    role: 'user',
                    content: text
                }
            ],
            max_tokens: 500,
            temperature: 0.3,
            stream: true,
        });

        for await (const chunk of chunks) {
            const content = chunk.choices[0]?.delta?.content;
            if (content) {
                yield content;
            }
        }
    }

    /**
     * Unload the model to free GPU memory
     */
    async unload(): Promise<void> {
        if (this.engine) {
            try {
                await this.engine.unload();
            } catch (err) {
                console.warn('[WebLLM] Unload warning:', err);
            }
            this.engine = null;
        }

        this.initPromise = null;
        this.updateState({
            status: 'not_initialized',
            progress: 0,
            message: 'Model unloaded',
        });
    }

    /**
     * Reset the engine (useful for recovering from errors)
     */
    async reset(): Promise<boolean> {
        await this.unload();
        return this.initialize();
    }

    /**
     * Get model information
     */
    getModelInfo(): { id: string; displayName: string; size: string; description: string } {
        return {
            id: MODEL_ID,
            displayName: 'SmolLM2 360M',
            size: '~200 MB',
            description: 'Fast, lightweight model optimized for browser use. Runs entirely on your device.',
        };
    }
}

// Export singleton instance
export const webllmService = new WebLLMService();
