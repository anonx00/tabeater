export const PROMPTS = {
    CATEGORIZE: `
You are a tactical intelligence officer analyzing browser tabs.
Classify the following tabs into distinct operational groups.
Use brief, military-style category names (e.g., "RESEARCH_INTEL", "COMMS_CHANNELS", "DEV_OPS").
Return ONLY a JSON object mapping Tab IDs to Category Names.

Tabs:
\${tabs}
`,
    PRIORITIZE: `
Analyze the mission criticality of these tabs.
Assign a priority level: HIGH (Immediate Action), MEDIUM (Standby), LOW (Archive/Close).
Justify with a brief tactical reason.
Return ONLY a JSON object mapping Tab IDs to { priority, reason }.

Tabs:
\${tabs}
`,
    SUMMARIZE: `
Generate a SITREP (Situation Report) for this content.
Format:
- MISSION: One sentence summary.
- INTEL: 3 key bullet points.
- ACTION: Recommended next step.

Content:
\${content}
`
};

export interface TabData {
    id: number;
    title: string;
    url: string;
}

export const formatTabsForPrompt = (tabs: TabData[]): string => {
    return tabs.map(t => `[ID:${t.id}] ${t.title} (${t.url})`).join('\n');
};
