import React from 'react';
import { colorsPro } from '../../shared/theme-pro';

interface SparklineProps {
    data: number[]; // Array of values
    width?: number;
    height?: number;
    color?: string;
    fillGradient?: boolean;
    showDots?: boolean;
}

export const Sparkline: React.FC<SparklineProps> = ({
    data,
    width = 200,
    height = 60,
    color = colorsPro.accentCyan,
    fillGradient = true,
    showDots = false,
}) => {
    if (data.length === 0) return null;

    const padding = 4;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1; // Avoid division by zero

    // Generate points for the line
    const points = data.map((value, index) => {
        const x = padding + (index / (data.length - 1)) * chartWidth;
        const y = padding + chartHeight - ((value - min) / range) * chartHeight;
        return { x, y, value };
    });

    // Create SVG path
    const pathData = points
        .map((point, index) => {
            const command = index === 0 ? 'M' : 'L';
            return `${command} ${point.x},${point.y}`;
        })
        .join(' ');

    // Create area path for gradient fill
    const areaPath = fillGradient
        ? `${pathData} L ${points[points.length - 1].x},${height - padding} L ${padding},${height - padding} Z`
        : '';

    return (
        <svg
            width={width}
            height={height}
            style={{ overflow: 'visible' }}
        >
            <defs>
                {fillGradient && (
                    <linearGradient id="sparkline-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                        <stop offset="100%" stopColor={color} stopOpacity={0.05} />
                    </linearGradient>
                )}
            </defs>

            {/* Gradient fill */}
            {fillGradient && (
                <path
                    d={areaPath}
                    fill="url(#sparkline-gradient)"
                />
            )}

            {/* Main line */}
            <path
                d={pathData}
                fill="none"
                stroke={color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                    filter: `drop-shadow(0 0 4px ${color}40)`,
                }}
            />

            {/* Dots at each point */}
            {showDots && points.map((point, index) => (
                <circle
                    key={index}
                    cx={point.x}
                    cy={point.y}
                    r={2}
                    fill={color}
                    style={{
                        filter: `drop-shadow(0 0 3px ${color}80)`,
                    }}
                />
            ))}

            {/* Current value indicator (last point) */}
            <circle
                cx={points[points.length - 1].x}
                cy={points[points.length - 1].y}
                r={3}
                fill={color}
                style={{
                    filter: `drop-shadow(0 0 6px ${color})`,
                }}
            />
        </svg>
    );
};
