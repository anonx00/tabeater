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

    // Extract JSON array or object
    const jsonMatch = clean.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

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
    console.error('Response:', response);
    throw new Error(`Invalid grouping response: ${error?.message || error}`);
  }
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
