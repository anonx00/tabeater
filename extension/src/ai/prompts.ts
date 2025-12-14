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

    // Contextual clustering with page content analysis
    CONTEXTUAL_CLUSTER: `
Analyze these browser tabs using their ACTUAL PAGE CONTENT to create intelligent groups.
Focus on semantic meaning, topics, and user intent - NOT just URLs or domains.

IMPORTANT: Analyze the page content snippets to understand:
- What topic/subject the page covers
- What task the user might be doing
- Related concepts that connect pages together

Examples of contextual grouping:
- Pages about machine learning + AI documentation + Python tutorials → "ML Development"
- Product pages + reviews + comparison sites → "Product Research"
- Job listings + company info + salary sites → "Job Search"
- Recipe pages + ingredient lists + cooking videos → "Cooking Project"

Rules:
- PRIORITIZE content analysis over URL patterns
- Create specific, descriptive group names (2-4 words)
- Group by semantic similarity and user intent
- Minimum 2 tabs per group
- Maximum 6 groups total

Tabs with content:
\${tabs}

Return ONLY a JSON array:
[{"name": "Group Name", "tabIds": [1, 2, 3], "reason": "semantic connection based on content"}]
`,

    // Simple categorization for quick/offline grouping
    CATEGORIZE: `
Classify these tabs into categories. Return ONLY a JSON object mapping Tab IDs to category names.
Use short category names: AI, Dev, Cloud, Social, Finance, Shopping, Entertainment, Productivity, News, Communication, Other.

Tabs:
\${tabs}
`,

    // Content-aware categorization
    CONTEXTUAL_CATEGORIZE: `
Classify these tabs into categories based on their ACTUAL PAGE CONTENT, not just URLs.
Analyze the content snippets to determine the true topic and purpose.

Return ONLY a JSON object mapping Tab IDs to category names.
Use these categories: Research, Learning, Shopping, Work, Communication, Entertainment, Finance, News, Development, Creative, Health, Travel, Other.

Tabs with content:
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
    content?: string; // Page content snippet for contextual analysis
}

export const formatTabsForPrompt = (tabs: TabData[]): string => {
    return tabs.map(t => `[ID:${t.id}] ${t.title} (${t.url})`).join('\n');
};

// Format tabs with content for contextual grouping
export const formatTabsWithContent = (tabs: TabData[]): string => {
    return tabs.map(t => {
        const contentSnippet = t.content
            ? `\nContent: ${t.content.slice(0, 300)}${t.content.length > 300 ? '...' : ''}`
            : '';
        return `[ID:${t.id}] ${t.title}\nURL: ${t.url}${contentSnippet}`;
    }).join('\n\n');
};
