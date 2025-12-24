import { z } from 'zod';

/**
 * Zod schemas for validating AI responses
 * Ensures consistent, type-safe output from all AI providers
 */

// Tab group schema for AI grouping responses
export const TabGroupSchema = z.object({
  name: z.string().min(1).max(50),
  ids: z.array(z.number()).min(1),
  // Alternative field names that AI might use
  tabIds: z.array(z.number()).optional(),
  tabs: z.array(z.number()).optional(),
  indices: z.array(z.number()).optional(),
});

export const TabGroupsArraySchema = z.array(TabGroupSchema);

// Reasoning output schema for DeepSeek-R1 and other reasoning models
export const ReasoningOutputSchema = z.object({
  thinking: z.string().optional(), // Chain-of-thought reasoning
  reasoning: z.string().optional(), // Alternative field name
  groups: TabGroupsArraySchema,
});

// Alternative: Groups directly without reasoning wrapper
export const DirectGroupsSchema = TabGroupsArraySchema;

// Tab categorization schema
export const TabCategorySchema = z.record(z.string(), z.string()); // { tabId: "category" }

// AI insights schema
export const AIInsightsSchema = z.object({
  recommendations: z.array(z.string()),
  priority: z.array(z.string()).optional(),
  duplicates: z.array(z.string()).optional(),
});

// Export types inferred from schemas
export type TabGroup = z.infer<typeof TabGroupSchema>;
export type TabGroupsArray = z.infer<typeof TabGroupsArraySchema>;
export type ReasoningOutput = z.infer<typeof ReasoningOutputSchema>;
export type TabCategory = z.infer<typeof TabCategorySchema>;
export type AIInsights = z.infer<typeof AIInsightsSchema>;

/**
 * Parse and validate AI grouping response
 * Handles multiple response formats and normalizes field names
 */
export function parseGroupingResponse(response: string): TabGroupsArray {
  try {
    // Clean markdown code blocks
    let clean = response.trim();
    clean = clean.replace(/^```(?:json|JSON)?\n?/gm, '');
    clean = clean.replace(/\n?```$/gm, '');

    // Try multiple JSON extraction strategies
    let parsed: any = null;

    // Strategy 1: Find the first complete JSON array/object using balanced bracket matching
    const jsonMatch = findBalancedJSON(clean);
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch);
      } catch (e) {
        console.warn('Strategy 1 failed (balanced brackets):', e);
      }
    }

    // Strategy 2: Use regex as fallback
    if (!parsed) {
      const regexMatch = clean.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
      if (regexMatch) {
        try {
          parsed = JSON.parse(regexMatch[0]);
        } catch (e) {
          console.warn('Strategy 2 failed (regex):', e);
        }
      }
    }

    // Strategy 3: Try to extract from "OUTPUT:" or "groups:" markers
    if (!parsed) {
      const outputMatch = clean.match(/(?:OUTPUT:|groups:)\s*(\[[\s\S]*?\])/i);
      if (outputMatch) {
        try {
          parsed = JSON.parse(outputMatch[1]);
        } catch (e) {
          console.warn('Strategy 3 failed (OUTPUT marker):', e);
        }
      }
    }

    if (!parsed) {
      throw new Error('No valid JSON found in response');
    }

    // Try reasoning output format first
    try {
      const reasoningOutput = ReasoningOutputSchema.parse(parsed);
      console.log('🧠 Reasoning:', reasoningOutput.thinking || reasoningOutput.reasoning);
      return normalizeTabGroups(reasoningOutput.groups);
    } catch {
      // Try direct groups format
      const groups = DirectGroupsSchema.parse(parsed);
      return normalizeTabGroups(groups);
    }
  } catch (error: any) {
    console.error('❌ Failed to parse grouping response:', error);
    console.error('Response:', response.substring(0, 500));
    throw new Error(`Invalid grouping response: ${error?.message || error}`);
  }
}

/**
 * Find balanced JSON (array or object) in a string
 * Handles cases where AI adds text before/after the JSON
 */
function findBalancedJSON(text: string): string | null {
  // Try to find array first
  let depth = 0;
  let startIdx = -1;

  for (let i = 0; i < text.length; i++) {
    if (text[i] === '[') {
      if (depth === 0) startIdx = i;
      depth++;
    } else if (text[i] === ']') {
      depth--;
      if (depth === 0 && startIdx !== -1) {
        return text.substring(startIdx, i + 1);
      }
    }
  }

  // Try to find object
  depth = 0;
  startIdx = -1;

  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') {
      if (depth === 0) startIdx = i;
      depth++;
    } else if (text[i] === '}') {
      depth--;
      if (depth === 0 && startIdx !== -1) {
        return text.substring(startIdx, i + 1);
      }
    }
  }

  return null;
}

/**
 * Normalize tab groups to use consistent field names
 * AI might use 'ids', 'tabIds', 'tabs', or 'indices'
 */
function normalizeTabGroups(groups: TabGroupsArray): TabGroupsArray {
  return groups.map(group => {
    // Use whichever field has data
    const ids = group.ids || group.tabIds || group.tabs || group.indices || [];

    // Deduplicate and sort
    const uniqueIds = Array.from(new Set(ids)).sort((a, b) => a - b);

    return {
      name: group.name.trim(),
      ids: uniqueIds,
    };
  });
}

/**
 * Parse tab categorization response
 */
export function parseCategoryResponse(response: string): TabCategory {
  try {
    let clean = response.trim();
    clean = clean.replace(/^```(?:json|JSON)?\n?/gm, '');
    clean = clean.replace(/\n?```$/gm, '');

    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    return TabCategorySchema.parse(JSON.parse(jsonMatch[0]));
  } catch (error: any) {
    console.error('❌ Failed to parse category response:', error);
    throw new Error(`Invalid category response: ${error?.message || error}`);
  }
}
