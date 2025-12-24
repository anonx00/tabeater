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
`,

    // ============= REASONING PROMPTS FOR DEEPSEEK-R1 =============
    // Chain-of-thought clustering with explicit reasoning steps

    REASONING_CLUSTER: `
You are an expert at analyzing browser tabs and organizing them into meaningful groups.

TASK: Analyze these browser tabs and group them intelligently.

INSTRUCTIONS:
1. First, think step-by-step about what the user is trying to accomplish
2. Identify patterns, related tasks, and semantic connections
3. Create groups that reflect user intent, not just domain names
4. Provide your reasoning before the final output

THINKING PROCESS (explain your reasoning):
- What patterns do you see in the tab titles and URLs?
- What tasks or projects might the user be working on?
- Which tabs are semantically related?
- What specific, descriptive names best describe each group?

RULES:
- Group by PURPOSE and user INTENT, not by domain
- Use specific, descriptive group names (2-3 words max)
- Examples of good names: "React Tutorial", "Holiday Shopping", "Q4 Report"
- Examples of bad names: "Dev", "Shopping", "Work" (too generic)
- Minimum 2 tabs per group
- Maximum 6 groups total
- Look at both titles AND URLs to understand context

Tabs:
\${tabs}

OUTPUT FORMAT (JSON only):
{
  "thinking": "Your step-by-step reasoning process here",
  "groups": [
    {"name": "Group Name", "ids": [1, 2, 3]}
  ]
}

Think carefully and provide detailed reasoning before grouping.
`,

    REASONING_CONTEXTUAL_CLUSTER: `
You are an expert at semantic analysis and information organization.

TASK: Analyze these browser tabs using their ACTUAL PAGE CONTENT and create intelligent groups.

DEEP ANALYSIS PROCESS:
1. Read and understand the content snippet for each tab
2. Identify the main topic, purpose, and semantic meaning
3. Find conceptual connections between different tabs
4. Determine the user's likely goals or projects
5. Create groups that reflect these semantic relationships

THINKING FRAMEWORK:
- What is the core topic or subject of each page?
- What task or project might the user be working on?
- Which pages share conceptual or topical connections?
- What specific project names best describe these connections?
- Are there any outliers that don't fit well?

EXAMPLES OF SEMANTIC GROUPING:
- Machine learning tutorials + AI docs + Python guides → "ML Development"
- Product pages + reviews + price comparisons → "Product Research"
- Job listings + company profiles + salary data → "Job Search"
- Recipe pages + ingredient lists + cooking videos → "Dinner Recipe"

RULES:
- PRIORITIZE semantic content analysis over URL patterns
- Create SPECIFIC group names that describe the actual topic (2-4 words)
- Group by meaning and user intent
- Minimum 2 tabs per group
- Maximum 6 groups total

Tabs with content:
\${tabs}

OUTPUT FORMAT (JSON only):
{
  "thinking": "Detailed analysis: What patterns do you see? What is the user working on? How should tabs be grouped semantically?",
  "groups": [
    {"name": "Specific Group Name", "ids": [1, 2, 3]}
  ]
}

Analyze deeply and think step-by-step before grouping.
`,

    REASONING_CATEGORIZE: `
You are an expert classifier analyzing browser tabs.

TASK: Classify each tab into the most appropriate category based on content analysis.

THINKING PROCESS:
1. Analyze each tab's title, URL, and content
2. Determine the primary purpose and topic
3. Select the best-fitting category
4. Explain your reasoning for ambiguous cases

AVAILABLE CATEGORIES:
- Research: Academic papers, documentation, learning resources
- Development: Coding, technical tools, developer platforms
- Shopping: E-commerce, product pages, price comparisons
- Work: Professional tools, business applications, productivity
- Communication: Email, messaging, social platforms
- Entertainment: Videos, games, streaming, leisure content
- Finance: Banking, investments, crypto, financial tools
- News: News sites, current events, journalism
- Creative: Design, art, writing, multimedia creation
- Health: Medical info, fitness, wellness
- Travel: Booking, destinations, travel planning
- Other: Anything that doesn't fit above

Tabs:
\${tabs}

OUTPUT FORMAT (JSON only):
{
  "thinking": "Analysis of each tab and category selection reasoning",
  "categories": {
    "1": "Category Name",
    "2": "Category Name"
  }
}

Think carefully about edge cases and provide clear reasoning.
`,

    REASONING_INSIGHTS: `
You are a tab management expert analyzing user behavior patterns.

TASK: Provide actionable recommendations for tab organization.

DEEP ANALYSIS:
1. Review the tab statistics and patterns
2. Identify problem areas (duplicates, stale tabs, disorganization)
3. Determine root causes and user behavior patterns
4. Formulate specific, actionable recommendations
5. Prioritize by impact and ease of implementation

THINKING FRAMEWORK:
- What are the biggest organizational problems?
- What patterns indicate user workflow issues?
- Which actions would have the highest impact?
- How can the user improve their tab hygiene?

Statistics:
\${stats}

OUTPUT FORMAT (JSON only):
{
  "thinking": "Analysis of the tab situation and reasoning for recommendations",
  "recommendations": [
    "Specific actionable recommendation 1",
    "Specific actionable recommendation 2"
  ]
}

Analyze thoroughly and provide reasoning before recommendations.
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
