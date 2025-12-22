import '@testing-library/jest-dom';

// Mock Chrome API
global.chrome = {
    runtime: {
        sendMessage: jest.fn(),
        onMessage: {
            addListener: jest.fn(),
        },
        onInstalled: {
            addListener: jest.fn(),
        },
    },
    tabs: {
        query: jest.fn(),
        create: jest.fn(),
        group: jest.fn(),
        remove: jest.fn(),
    },
    tabGroups: {
        update: jest.fn(),
    },
    storage: {
        local: {
            get: jest.fn(),
            set: jest.fn(),
        },
    },
} as any;

// Mock WebExtension Polyfill
jest.mock('webextension-polyfill', () => ({
    runtime: {
        sendMessage: jest.fn(),
        onMessage: {
            addListener: jest.fn(),
        },
        onInstalled: {
            addListener: jest.fn(),
        },
    },
    tabs: {
        query: jest.fn(),
        create: jest.fn(),
        group: jest.fn(),
        remove: jest.fn(),
    },
    tabGroups: {
        update: jest.fn(),
    },
    storage: {
        local: {
            get: jest.fn(),
            set: jest.fn(),
        },
    },
}));
