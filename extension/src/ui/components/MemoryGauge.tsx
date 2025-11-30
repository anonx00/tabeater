import React from 'react';
import { colors, typography, spacing } from '../../shared/theme';

interface MemoryGaugeProps {
    /** Current memory usage in MB */
    currentMB: number;
    /** Maximum memory or total available in MB */
    maxMB?: number;
    /** Show label */
    showLabel?: boolean;
    /** Compact mode (smaller size) */
    compact?: boolean;
}

/**
 * MGS-style memory gauge/RAM bar
 * Displays memory usage with a visual progress indicator
 */
export const MemoryGauge: React.FC<MemoryGaugeProps> = ({
    currentMB,
    maxMB = 1024, // Default to 1GB max
    showLabel = true,
    compact = false,
}) => {
    const [prevMB, setPrevMB] = React.useState(currentMB);
    const [isUpdating, setIsUpdating] = React.useState(false);

    React.useEffect(() => {
        if (currentMB !== prevMB) {
            setIsUpdating(true);
            setPrevMB(currentMB);
            const timer = setTimeout(() => setIsUpdating(false), 500);
            return () => clearTimeout(timer);
        }
    }, [currentMB, prevMB]);

    const percentage = Math.min((currentMB / maxMB) * 100, 100);
    const isWarning = percentage > 70;
    const isCritical = percentage > 90;

    const barColor = isCritical
        ? colors.error
        : isWarning
        ? colors.warning
        : colors.primary;

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: spacing.sm,
                fontFamily: typography.fontMono,
                fontSize: compact ? typography.sizeXs : typography.sizeSm,
            }}
        >
            {showLabel && (
                <span
                    style={{
                        color: colors.accent,
                        fontWeight: typography.semibold,
                        letterSpacing: typography.letterWide,
                        textTransform: 'uppercase',
                        flexShrink: 0,
                    }}
                >
                    MEM:
                </span>
            )}

            {/* Memory bar */}
            <div
                style={{
                    flex: 1,
                    height: compact ? 6 : 8,
                    background: 'rgba(0, 0, 0, 0.4)',
                    border: `1px solid ${isUpdating ? barColor : colors.borderMedium}`,
                    borderRadius: 1,
                    overflow: 'hidden',
                    position: 'relative',
                    boxShadow: isUpdating ? `0 0 8px ${barColor}` : 'none',
                    transition: 'border-color 0.3s ease, box-shadow 0.3s ease',
                }}
            >
                {/* Fill */}
                <div
                    style={{
                        height: '100%',
                        width: `${percentage}%`,
                        background: barColor,
                        boxShadow: `0 0 8px ${barColor}`,
                        transition: 'width 0.3s ease, background 0.3s ease',
                    }}
                />

                {/* Segments (optional grid lines) */}
                <div
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: `repeating-linear-gradient(
                            to right,
                            transparent,
                            transparent 19%,
                            ${colors.borderDark} 19%,
                            ${colors.borderDark} 20%
                        )`,
                        pointerEvents: 'none',
                    }}
                />
            </div>

            {/* Memory value */}
            <span
                style={{
                    color: colors.textSecondary,
                    fontWeight: typography.medium,
                    minWidth: compact ? 50 : 60,
                    textAlign: 'right',
                }}
            >
                {currentMB.toFixed(0)} MB
            </span>
        </div>
    );
};
