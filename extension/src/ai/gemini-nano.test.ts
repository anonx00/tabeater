import { GeminiNanoService } from './gemini-nano';

interface MockSession {
    prompt: jest.Mock;
    destroy: jest.Mock;
}

interface MockWindowAI {
    canCreateTextSession: jest.Mock;
    createTextSession: jest.Mock;
}

declare global {
    interface Window {
        ai?: MockWindowAI;
    }
}

describe('GeminiNanoService', () => {
    let service: GeminiNanoService;
    let mockSession: MockSession;

    beforeEach(() => {
        service = new GeminiNanoService();
        mockSession = {
            prompt: jest.fn(),
            destroy: jest.fn()
        };

        // Mock window.ai
        (window as Window & { ai?: MockWindowAI }).ai = {
            canCreateTextSession: jest.fn(),
            createTextSession: jest.fn().mockResolvedValue(mockSession)
        };
    });

    it('reports available when canCreateTextSession returns readily', async () => {
        window.ai!.canCreateTextSession.mockResolvedValue('readily');
        const isAvailable = await service.isAvailable();
        expect(isAvailable).toBe(true);
    });

    it('reports unavailable when canCreateTextSession returns no', async () => {
        window.ai!.canCreateTextSession.mockResolvedValue('no');
        const isAvailable = await service.isAvailable();
        expect(isAvailable).toBe(false);
    });

    it('categorizeTabs initializes session and prompts correctly', async () => {
        window.ai!.canCreateTextSession.mockResolvedValue('readily');
        mockSession.prompt.mockResolvedValue(JSON.stringify({ 1: 'RESEARCH' }));

        const tabs = [{ id: 1, title: 'Test', url: 'http://test.com' }];
        const result = await service.categorizeTabs(tabs);

        expect(window.ai!.createTextSession).toHaveBeenCalled();
        expect(mockSession.prompt).toHaveBeenCalled();
        expect(result).toEqual({ 1: 'RESEARCH' });
    });

    it('handles JSON parse errors gracefully', async () => {
        window.ai!.canCreateTextSession.mockResolvedValue('readily');
        mockSession.prompt.mockResolvedValue('Invalid JSON');

        const tabs = [{ id: 1, title: 'Test', url: 'http://test.com' }];
        const result = await service.categorizeTabs(tabs);

        expect(result).toEqual({});
    });

    it('cleans JSON with conversational filler', async () => {
        (window as any).ai.canCreateTextSession.mockResolvedValue('readily');
        const dirtyJson = 'Here is the analysis:\n```json\n{"1": "DEV"}\n```\nHope this helps!';
        mockSession.prompt.mockResolvedValue(dirtyJson);

        const tabs = [{ id: 1, title: 'Test', url: 'http://test.com' }];
        const result = await service.categorizeTabs(tabs);

        expect(result).toEqual({ 1: 'DEV' });
    });
});
