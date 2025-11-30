import React from 'react';
import { colors, typography, spacing } from '../../shared/theme';

interface MicroLabelProps {
    /** The label text (e.g., "URL", "MEM", "ID") */
    label: string;
    /** The value to display after the label */
    value: string | number | React.ReactNode;
    /** Color of the label */
    color?: string;
    /** Additional style for the container */
    style?: React.CSSProperties;
}

/**
 * MGS-style micro-label component
 * Displays technical labels before data values (e.g., "URL: example.com")
 */
export const MicroLabel: React.FC<MicroLabelProps> = ({
    label,
    value,
    color = colors.accent,
    style = {},
}) => {
    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: spacing.xs,
                fontFamily: typography.fontMono,
                fontSize: typography.sizeSm,
                ...style,
            }}
        >
            <span
                style={{
                    color,
                    fontWeight: typography.semibold,
                    letterSpacing: typography.letterWide,
                    textTransform: 'uppercase',
                    flexShrink: 0,
                }}
            >
                {label}:
            </span>
            <span
                style={{
                    color: colors.textSecondary,
                    fontFamily: typography.fontFamily,
                    fontSize: typography.sizeBase,
                }}
            >
                {value}
            </span>
        </div>
    );
};
