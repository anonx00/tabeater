export const PROMPTS = {
    // Smart clustering prompt - generates context-aware group names
    CLUSTER: `
Analyze these browser tabs and group them by user intent, not just domain.
Create semantic clusters with specific, descriptive names (2-3 words max).

Examples of good group names:
- "React Tutorial" (not "Dev")
- "Holiday Shopping" (not "Shopping")
- "Q4 Report" (not "Work")
- "Japan Trip" (not "Travel")

Rules:
- Look at both titles and URLs to understand context
- Group by PURPOSE, not by site
- Use specific names that describe the actual content/task
- Minimum 2 tabs per group
- Maximum 6 groups total

Tabs:
\${tabs}

Return ONLY a JSON array:
[{"name": "Group Name", "tabIds": [1, 2, 3], "reason": "why these belong together"}]
`,

    // Simple categorization for quick/offline grouping
    CATEGORIZE: `
Classify these tabs into categories. Return ONLY a JSON object mapping Tab IDs to category names.
Use short category names: AI, Dev, Cloud, Social, Finance, Shopping, Entertainment, Productivity, News, Communication, Other.

Tabs:
\${tabs}
`,

    // Content summarization
    SUMMARIZE: `
Summarize this page content in 2-3 sentences. Be concise and focus on the main topic.

Content:
\${content}
`,

    // AI insights for tab hygiene
    INSIGHTS: `
Analyze these browser tab statistics and provide 2-3 brief, actionable recommendations for better organization.

\${stats}

Be concise. Focus on specific actions the user can take right now.
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
