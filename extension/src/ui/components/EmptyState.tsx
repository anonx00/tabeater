import React from 'react';
import { colors, spacing, typography } from '../../shared/theme';

interface EmptyStateProps {
    type: 'no-tabs' | 'no-duplicates' | 'all-optimized' | 'no-results';
    message?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ type, message }) => {
    const getContent = () => {
        switch (type) {
            case 'no-duplicates':
                return {
                    icon: (
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={colors.success} strokeWidth="1.5">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                            <polyline points="22 4 12 14.01 9 11.01" />
                        </svg>
                    ),
                    title: 'All Clean!',
                    description: message || 'No duplicate tabs found. Your browser is well organized.',
                    color: colors.success,
                    animation: 'success'
                };
            case 'all-optimized':
                return {
                    icon: (
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={colors.success} strokeWidth="1.5">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                            <polyline points="22 4 12 14.01 9 11.01" />
                        </svg>
                    ),
                    title: 'Perfect!',
                    description: message || 'All tabs are optimized. Nothing to clean up.',
                    color: colors.success,
                    animation: 'success'
                };
            case 'no-results':
                return {
                    icon: (
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={colors.textDimmest} strokeWidth="1.5">
                            <circle cx="11" cy="11" r="8" />
                            <path d="m21 21-4.35-4.35" />
                        </svg>
                    ),
                    title: 'No Results',
                    description: message || 'Try adjusting your search query',
                    color: colors.textDimmest,
                    animation: 'fade'
                };
            case 'no-tabs':
            default:
                return {
                    icon: (
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={colors.textDimmest} strokeWidth="1.5">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                            <line x1="9" y1="9" x2="15" y2="15" />
                            <line x1="15" y1="9" x2="9" y2="15" />
                        </svg>
                    ),
                    title: 'No Tabs',
                    description: message || 'Open some tabs to get started',
                    color: colors.textDimmest,
                    animation: 'fade'
                };
        }
    };

    const content = getContent();

    return (
        <div style={styles.container}>
            <div
                style={{
                    ...styles.iconWrapper,
                    animation: content.animation === 'success' ? 'successPulse 1s ease-out' : 'fadeIn 0.5s ease-out'
                }}
            >
                {content.icon}
            </div>
            <h3 style={{ ...styles.title, color: content.color }}>{content.title}</h3>
            <p style={styles.description}>{content.description}</p>
        </div>
    );
};

const styles: { [key: string]: React.CSSProperties } = {
    container: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.xxxl,
        textAlign: 'center',
        minHeight: 200,
    },
    iconWrapper: {
        marginBottom: spacing.lg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        margin: 0,
        fontSize: typography.sizeXxl,
        fontWeight: typography.bold,
        marginBottom: spacing.sm,
    },
    description: {
        margin: 0,
        fontSize: typography.sizeBase,
        color: colors.textDim,
        maxWidth: 280,
        lineHeight: 1.5,
    },
};

// Add keyframe animations
if (typeof document !== 'undefined') {
    const styleSheet = document.createElement('style');
    styleSheet.textContent = `
        @keyframes fadeIn {
            from {
                opacity: 0;
                transform: translateY(10px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        @keyframes successPulse {
            0% {
                opacity: 0;
                transform: scale(0.8);
            }
            50% {
                transform: scale(1.1);
            }
            100% {
                opacity: 1;
                transform: scale(1);
            }
        }
    `;
    if (!document.head.querySelector('[data-empty-state-styles]')) {
        styleSheet.setAttribute('data-empty-state-styles', 'true');
        document.head.appendChild(styleSheet);
    }
}
