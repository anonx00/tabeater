import React from 'react';
import { colors, spacing, borderRadius } from '../../shared/theme';

interface SkeletonLoaderProps {
    type?: 'text' | 'card' | 'list' | 'analysis';
    count?: number;
}

export const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({
    type = 'text',
    count = 1
}) => {
    if (type === 'text') {
        return (
            <>
                {Array.from({ length: count }).map((_, i) => (
                    <div key={i} style={styles.textSkeleton} />
                ))}
            </>
        );
    }

    if (type === 'card') {
        return (
            <div style={styles.cardContainer}>
                {Array.from({ length: count }).map((_, i) => (
                    <div key={i} style={styles.cardSkeleton}>
                        <div style={styles.cardHeader} />
                        <div style={styles.cardLine1} />
                        <div style={styles.cardLine2} />
                    </div>
                ))}
            </div>
        );
    }

    if (type === 'list') {
        return (
            <div style={styles.listContainer}>
                {Array.from({ length: count }).map((_, i) => (
                    <div key={i} style={styles.listItem}>
                        <div style={styles.listIcon} />
                        <div style={styles.listContent}>
                            <div style={styles.listTitle} />
                            <div style={styles.listSubtitle} />
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    if (type === 'analysis') {
        return (
            <div style={styles.analysisContainer}>
                <div style={styles.analysisCard}>
                    <div style={styles.analysisHeader} />
                    <div style={styles.analysisLine1} />
                    <div style={styles.analysisLine2} />
                    <div style={styles.analysisLine3} />
                </div>
                <div style={styles.analysisCard}>
                    <div style={styles.analysisHeader} />
                    <div style={styles.analysisLine1} />
                    <div style={styles.analysisLine2} />
                </div>
            </div>
        );
    }

    return null;
};

const skeletonBase: React.CSSProperties = {
    background: `linear-gradient(90deg, ${colors.bgCard} 25%, ${colors.bgCardHover} 50%, ${colors.bgCard} 75%)`,
    backgroundSize: '200% 100%',
    animation: 'shimmer 1.5s infinite',
    borderRadius: borderRadius.sm,
};

const styles: { [key: string]: React.CSSProperties } = {
    textSkeleton: {
        ...skeletonBase,
        height: 16,
        marginBottom: spacing.sm,
    },
    cardContainer: {
        display: 'flex',
        flexDirection: 'column',
        gap: spacing.md,
    },
    cardSkeleton: {
        ...skeletonBase,
        padding: spacing.md,
        borderRadius: borderRadius.md,
        background: colors.bgCard,
    },
    cardHeader: {
        ...skeletonBase,
        height: 20,
        width: '60%',
        marginBottom: spacing.md,
    },
    cardLine1: {
        ...skeletonBase,
        height: 14,
        width: '100%',
        marginBottom: spacing.sm,
    },
    cardLine2: {
        ...skeletonBase,
        height: 14,
        width: '75%',
    },
    listContainer: {
        display: 'flex',
        flexDirection: 'column',
        gap: spacing.sm,
    },
    listItem: {
        display: 'flex',
        alignItems: 'center',
        gap: spacing.md,
        padding: spacing.md,
        background: colors.bgCard,
        borderRadius: borderRadius.sm,
    },
    listIcon: {
        ...skeletonBase,
        width: 16,
        height: 16,
        borderRadius: borderRadius.sm,
        flexShrink: 0,
    },
    listContent: {
        flex: 1,
    },
    listTitle: {
        ...skeletonBase,
        height: 14,
        width: '70%',
        marginBottom: spacing.xs,
    },
    listSubtitle: {
        ...skeletonBase,
        height: 12,
        width: '40%',
    },
    analysisContainer: {
        display: 'flex',
        flexDirection: 'column',
        gap: spacing.md,
    },
    analysisCard: {
        background: colors.bgCard,
        padding: spacing.md,
        borderRadius: borderRadius.md,
        borderLeft: `3px solid ${colors.borderMedium}`,
    },
    analysisHeader: {
        ...skeletonBase,
        height: 18,
        width: '40%',
        marginBottom: spacing.md,
    },
    analysisLine1: {
        ...skeletonBase,
        height: 14,
        width: '100%',
        marginBottom: spacing.sm,
    },
    analysisLine2: {
        ...skeletonBase,
        height: 14,
        width: '85%',
        marginBottom: spacing.sm,
    },
    analysisLine3: {
        ...skeletonBase,
        height: 14,
        width: '60%',
    },
};

// Add keyframe animation
if (typeof document !== 'undefined') {
    const styleSheet = document.createElement('style');
    styleSheet.textContent = `
        @keyframes shimmer {
            0% {
                background-position: -200% 0;
            }
            100% {
                background-position: 200% 0;
            }
        }
    `;
    if (!document.head.querySelector('[data-skeleton-styles]')) {
        styleSheet.setAttribute('data-skeleton-styles', 'true');
        document.head.appendChild(styleSheet);
    }
}
