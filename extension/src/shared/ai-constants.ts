/**
 * AI Provider Configuration Constants
 * Centralized location for model names and provider settings
 * Update this file when AI providers update their model names
 */

export const AI_MODELS = {
    gemini: {
        default: 'gemini-2.0-flash',
        available: [
            'gemini-2.0-flash',
            'gemini-1.5-flash',
            'gemini-1.5-pro',
        ],
    },
    openai: {
        default: 'gpt-4o-mini',
        available: [
            'gpt-4o-mini',
            'gpt-4o',
            'gpt-4-turbo',
        ],
    },
    anthropic: {
        default: 'claude-3-5-haiku-latest',
        available: [
            'claude-3-5-haiku-latest',
            'claude-3-5-sonnet-latest',
            'claude-3-opus-latest',
        ],
    },
};

export const AI_ENDPOINTS = {
    gemini: 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',
    openai: 'https://api.openai.com/v1/chat/completions',
    anthropic: 'https://api.anthropic.com/v1/messages',
};

export const AI_PROVIDER_INFO = {
    gemini: {
        name: 'Google Gemini',
        description: 'Fast & efficient',
        color: '#4285f4',
        getKeyUrl: 'https://aistudio.google.com/app/apikey',
    },
    openai: {
        name: 'OpenAI',
        description: 'GPT-4 powered',
        color: '#10a37f',
        getKeyUrl: 'https://platform.openai.com/api-keys',
    },
    anthropic: {
        name: 'Anthropic',
        description: 'Claude AI',
        color: '#d4a574',
        getKeyUrl: 'https://console.anthropic.com/settings/keys',
    },
};

export type AIProviderType = 'webllm' | 'nano' | 'gemini' | 'openai' | 'anthropic' | 'none';
export type CloudProviderType = 'gemini' | 'openai' | 'anthropic';
export type LocalProviderType = 'webllm' | 'nano';

export const LOCAL_AI_INFO = {
    webllm: {
        name: 'SmolLM2 360M',
        description: 'Fast local AI via WebGPU',
        color: '#00ff88',
        modelSize: '~200 MB',
        requirements: 'Chrome 113+ with WebGPU',
    },
    nano: {
        name: 'Gemini Nano',
        description: 'Chrome built-in AI',
        color: '#4285f4',
        modelSize: '~1.7 GB',
        requirements: 'Chrome 128+ with flags',
    },
};
