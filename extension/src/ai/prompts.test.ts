import { formatTabsForPrompt, TabData } from './prompts';

describe('Prompts Logic', () => {
    it('formats tabs correctly for the prompt', () => {
        const tabs: TabData[] = [
            { id: 1, title: 'Google', url: 'https://google.com' },
            { id: 2, title: 'GitHub', url: 'https://github.com' }
        ];

        const output = formatTabsForPrompt(tabs);

        expect(output).toContain('[ID:1] Google (https://google.com)');
        expect(output).toContain('[ID:2] GitHub (https://github.com)');
        expect(output.split('\n')).toHaveLength(2);
    });

    it('handles empty tab list', () => {
        const output = formatTabsForPrompt([]);
        expect(output).toBe('');
    });
});
