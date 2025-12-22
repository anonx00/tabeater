import React from 'react';
import { colors, spacing, typography } from './theme';

/**
 * Simple markdown-to-React converter for AI responses
 * Handles: bold, lists, line breaks, sections
 */
export function formatMarkdown(text: string): React.ReactNode[] {
    if (!text) return [];

    const lines = text.split('\n');
    const elements: React.ReactNode[] = [];
    let key = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue; // Skip empty lines

        // Section headers (starting with **)
        if (line.startsWith('**') && line.endsWith('**')) {
            const headerText = line.slice(2, -2);
            elements.push(
                <div
                    key={key++}
                    style={{
                        fontWeight: typography.semibold,
                        color: colors.primary,
                        marginTop: i > 0 ? spacing.lg : 0,
                        marginBottom: spacing.sm,
                        fontSize: typography.sizeXl,
                    }}
                >
                    {headerText}
                </div>
            );
            continue;
        }

        // List items (starting with * or -)
        if (line.startsWith('* ') || line.startsWith('- ')) {
            const itemText = line.slice(2);
            elements.push(
                <div
                    key={key++}
                    style={{
                        display: 'flex',
                        gap: spacing.sm,
                        marginBottom: spacing.xs,
                        paddingLeft: spacing.md,
                    }}
                >
                    <span style={{ color: colors.accent, flexShrink: 0 }}>•</span>
                    <span style={{ flex: 1 }}>{parseBold(itemText)}</span>
                </div>
            );
            continue;
        }

        // Numbered lists
        const numberedMatch = line.match(/^(\d+)\.\s+(.+)$/);
        if (numberedMatch) {
            const [, number, itemText] = numberedMatch;
            elements.push(
                <div
                    key={key++}
                    style={{
                        display: 'flex',
                        gap: spacing.sm,
                        marginBottom: spacing.xs,
                        paddingLeft: spacing.md,
                    }}
                >
                    <span style={{ color: colors.accent, flexShrink: 0, fontWeight: typography.medium }}>
                        {number}.
                    </span>
                    <span style={{ flex: 1 }}>{parseBold(itemText)}</span>
                </div>
            );
            continue;
        }

        // Regular paragraph
        elements.push(
            <div
                key={key++}
                style={{
                    marginBottom: spacing.sm,
                    lineHeight: 1.6,
                }}
            >
                {parseBold(line)}
            </div>
        );
    }

    return elements;
}

/**
 * Parse inline bold formatting (**text**)
 */
function parseBold(text: string): React.ReactNode {
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let key = 0;

    // Regex to match **bold text**
    const boldRegex = /\*\*(.+?)\*\*/g;
    let match;

    while ((match = boldRegex.exec(text)) !== null) {
        // Add text before the match
        if (match.index > lastIndex) {
            parts.push(text.substring(lastIndex, match.index));
        }

        // Add bolded text
        parts.push(
            <strong
                key={key++}
                style={{
                    fontWeight: typography.semibold,
                    color: colors.textPrimary,
                }}
            >
                {match[1]}
            </strong>
        );

        lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < text.length) {
        parts.push(text.substring(lastIndex));
    }

    return parts.length > 0 ? parts : text;
}

/**
 * Format insights array into a clean list
 */
export function formatInsights(insights: string[]): React.ReactNode {
    if (!insights || insights.length === 0) return null;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
            {insights.map((insight, i) => (
                <div
                    key={i}
                    style={{
                        display: 'flex',
                        gap: spacing.sm,
                        lineHeight: 1.6,
                    }}
                >
                    <span style={{ color: colors.accent, flexShrink: 0 }}>•</span>
                    <span style={{ flex: 1 }}>{insight}</span>
                </div>
            ))}
        </div>
    );
}
