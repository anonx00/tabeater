import React from 'react';
import { colors } from '../../shared/theme';

interface CornerBracketsProps {
    /** Size of the bracket corners in pixels */
    size?: number;
    /** Color of the brackets */
    color?: string;
    /** Thickness of the bracket lines */
    thickness?: number;
    /** Additional style for the container */
    style?: React.CSSProperties;
    /** Children to render inside the bracketed area */
    children?: React.ReactNode;
}

/**
 * MGS-inspired corner brackets that frame content
 * Replaces full borders with tactical corner markers
 */
export const CornerBrackets: React.FC<CornerBracketsProps> = ({
    size = 12,
    color = colors.primary,
    thickness = 1.5,
    style = {},
    children,
}) => {
    return (
        <div
            style={{
                position: 'relative',
                ...style,
            }}
        >
            {/* Top Left */}
            <svg
                width={size}
                height={size}
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    pointerEvents: 'none',
                }}
            >
                <path
                    d={`M ${size} 0 L 0 0 L 0 ${size}`}
                    stroke={color}
                    strokeWidth={thickness}
                    fill="none"
                />
            </svg>

            {/* Top Right */}
            <svg
                width={size}
                height={size}
                style={{
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    pointerEvents: 'none',
                }}
            >
                <path
                    d={`M 0 0 L ${size} 0 L ${size} ${size}`}
                    stroke={color}
                    strokeWidth={thickness}
                    fill="none"
                />
            </svg>

            {/* Bottom Left */}
            <svg
                width={size}
                height={size}
                style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    pointerEvents: 'none',
                }}
            >
                <path
                    d={`M 0 0 L 0 ${size} L ${size} ${size}`}
                    stroke={color}
                    strokeWidth={thickness}
                    fill="none"
                />
            </svg>

            {/* Bottom Right */}
            <svg
                width={size}
                height={size}
                style={{
                    position: 'absolute',
                    bottom: 0,
                    right: 0,
                    pointerEvents: 'none',
                }}
            >
                <path
                    d={`M ${size} 0 L ${size} ${size} L 0 ${size}`}
                    stroke={color}
                    strokeWidth={thickness}
                    fill="none"
                />
            </svg>

            {children}
        </div>
    );
};
