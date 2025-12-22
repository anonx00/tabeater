import React from 'react';
import { colorsPro, typographyPro, borderRadiusPro } from '../../shared/theme-pro';

interface RamBarProps {
    value: number; // Current value in MB
    max: number; // Maximum value in MB
    showLabel?: boolean;
    height?: number;
    color?: string;
}

export const RamBar: React.FC<RamBarProps> = ({
    value,
    max,
    showLabel = true,
    height = 6,
    color,
}) => {
    const percentage = Math.min((value / max) * 100, 100);

    // Auto color based on percentage
    const getColor = () => {
        if (color) return color;
        if (percentage >= 80) return colorsPro.error;
        if (percentage >= 60) return colorsPro.warning;
        if (percentage >= 40) return colorsPro.accentCyan;
        return colorsPro.success;
    };

    const barColor = getColor();

    const formatMemory = (mb: number) => {
        if (mb >= 1024) {
            return `${(mb / 1024).toFixed(1)}GB`;
        }
        return `${Math.round(mb)}MB`;
    };

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            width: '100%',
        }}>
            {/* Bar */}
            <div style={{
                position: 'relative',
                width: '100%',
                height: `${height}px`,
                background: colorsPro.bgCard,
                borderRadius: borderRadiusPro.full,
                overflow: 'hidden',
                border: `1px solid ${colorsPro.borderSubtle}`,
            }}>
                {/* Progress fill */}
                <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    height: '100%',
                    width: `${percentage}%`,
                    background: `linear-gradient(90deg, ${barColor} 0%, ${barColor}dd 100%)`,
                    borderRadius: borderRadiusPro.full,
                    transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
                    boxShadow: `0 0 8px ${barColor}60`,
                }}/>

                {/* Glow effect */}
                <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    height: '100%',
                    width: `${percentage}%`,
                    background: `linear-gradient(90deg, transparent 0%, ${barColor}40 50%, transparent 100%)`,
                    borderRadius: borderRadiusPro.full,
                    animation: 'shimmer 2s infinite',
                }}/>
            </div>

            {/* Label */}
            {showLabel && (
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: typographyPro.xs,
                    color: colorsPro.textDim,
                    fontFamily: typographyPro.fontMono,
                }}>
                    <span>{formatMemory(value)}</span>
                    <span style={{ color: colorsPro.textDimmer }}>
                        {percentage.toFixed(0)}%
                    </span>
                </div>
            )}
        </div>
    );
};
