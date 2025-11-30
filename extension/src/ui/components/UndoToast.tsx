import React, { useEffect } from 'react';
import { colors, spacing, typography, borderRadius, transitions } from '../../shared/theme';

interface UndoToastProps {
    message: string;
    onUndo: () => void;
    onDismiss: () => void;
    duration?: number;
}

export const UndoToast: React.FC<UndoToastProps> = ({
    message,
    onUndo,
    onDismiss,
    duration = 5000
}) => {
    useEffect(() => {
        const timer = setTimeout(() => {
            onDismiss();
        }, duration);

        return () => clearTimeout(timer);
    }, [duration, onDismiss]);

    return (
        <div style={styles.container}>
            <div style={styles.content}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={styles.icon}>
                    <polyline points="1 4 1 10 7 10" />
                    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                </svg>
                <span style={styles.message}>{message}</span>
            </div>
            <div style={styles.actions}>
                <button
                    style={styles.undoBtn}
                    onClick={(e) => {
                        e.stopPropagation();
                        onUndo();
                        onDismiss();
                    }}
                    aria-label="Undo action"
                >
                    Undo
                </button>
                <button
                    style={styles.closeBtn}
                    onClick={(e) => {
                        e.stopPropagation();
                        onDismiss();
                    }}
                    aria-label="Dismiss"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                </button>
            </div>
        </div>
    );
};

const styles: { [key: string]: React.CSSProperties } = {
    container: {
        position: 'fixed',
        bottom: spacing.lg,
        left: '50%',
        transform: 'translateX(-50%)',
        background: colors.bgCard,
        border: `1px solid ${colors.primary}`,
        borderRadius: borderRadius.lg,
        padding: `${spacing.md}px ${spacing.lg}px`,
        display: 'flex',
        alignItems: 'center',
        gap: spacing.lg,
        minWidth: 320,
        maxWidth: 480,
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
        zIndex: 10000,
        animation: 'slideUp 0.3s ease-out',
    },
    content: {
        display: 'flex',
        alignItems: 'center',
        gap: spacing.md,
        flex: 1,
    },
    icon: {
        color: colors.primary,
        flexShrink: 0,
    },
    message: {
        color: colors.textPrimary,
        fontSize: typography.sizeBase,
        lineHeight: 1.4,
    },
    actions: {
        display: 'flex',
        alignItems: 'center',
        gap: spacing.sm,
    },
    undoBtn: {
        padding: `${spacing.xs}px ${spacing.md}px`,
        background: colors.primary,
        border: 'none',
        borderRadius: borderRadius.sm,
        color: colors.bgDarkest,
        fontSize: typography.sizeSm,
        fontWeight: typography.semibold,
        cursor: 'pointer',
        transition: `all ${transitions.fast}`,
        fontFamily: typography.fontFamily,
    },
    closeBtn: {
        width: 24,
        height: 24,
        background: 'transparent',
        border: 'none',
        color: colors.textDim,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: borderRadius.sm,
        transition: `all ${transitions.fast}`,
    },
};

// Add keyframe animation
if (typeof document !== 'undefined') {
    const styleSheet = document.createElement('style');
    styleSheet.textContent = `
        @keyframes slideUp {
            from {
                transform: translateX(-50%) translateY(20px);
                opacity: 0;
            }
            to {
                transform: translateX(-50%) translateY(0);
                opacity: 1;
            }
        }
    `;
    if (!document.head.querySelector('[data-undo-toast-styles]')) {
        styleSheet.setAttribute('data-undo-toast-styles', 'true');
        document.head.appendChild(styleSheet);
    }
}
