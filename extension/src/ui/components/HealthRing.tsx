import React, { useEffect, useState } from 'react';
import { colorsPro, typographyPro } from '../../shared/theme-pro';

interface HealthRingProps {
    score: number; // 0-100
    size?: number;
    strokeWidth?: number;
    label?: string;
    showPercentage?: boolean;
}

export const HealthRing: React.FC<HealthRingProps> = ({
    score,
    size = 120,
    strokeWidth = 8,
    label = 'Health',
    showPercentage = true,
}) => {
    const [animatedScore, setAnimatedScore] = useState(0);
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const center = size / 2;

    // Animate score counting up
    useEffect(() => {
        let start = 0;
        const duration = 1000; // 1 second
        const step = (timestamp: number) => {
            if (!start) start = timestamp;
            const progress = timestamp - start;
            const percentage = Math.min(progress / duration, 1);
            const currentScore = percentage * score;
            setAnimatedScore(Math.floor(currentScore));

            if (percentage < 1) {
                requestAnimationFrame(step);
            }
        };
        requestAnimationFrame(step);
    }, [score]);

    const offset = circumference - (animatedScore / 100) * circumference;

    // Color based on score
    const getColor = () => {
        if (animatedScore >= 80) return colorsPro.success;
        if (animatedScore >= 60) return colorsPro.accentCyan;
        if (animatedScore >= 40) return colorsPro.warning;
        return colorsPro.error;
    };

    const getGlow = () => {
        if (animatedScore >= 80) return colorsPro.successGlow;
        if (animatedScore >= 60) return colorsPro.glowCyan;
        if (animatedScore >= 40) return colorsPro.warningGlow;
        return colorsPro.errorGlow;
    };

    const color = getColor();
    const glow = getGlow();

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px',
        }}>
            <div style={{ position: 'relative', width: size, height: size }}>
                <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
                    {/* Background circle */}
                    <circle
                        cx={center}
                        cy={center}
                        r={radius}
                        fill="none"
                        stroke={colorsPro.borderMedium}
                        strokeWidth={strokeWidth}
                    />

                    {/* Progress circle */}
                    <circle
                        cx={center}
                        cy={center}
                        r={radius}
                        fill="none"
                        stroke={color}
                        strokeWidth={strokeWidth}
                        strokeDasharray={circumference}
                        strokeDashoffset={offset}
                        strokeLinecap="round"
                        style={{
                            transition: 'stroke-dashoffset 0.5s ease, stroke 0.3s ease',
                            filter: `drop-shadow(${glow})`,
                        }}
                    />
                </svg>

                {/* Center text */}
                <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    textAlign: 'center',
                }}>
                    <div style={{
                        fontSize: typographyPro.huge,
                        fontWeight: typographyPro.weightBold,
                        color: color,
                        fontFamily: typographyPro.fontMono,
                        lineHeight: 1,
                    }}>
                        {animatedScore}
                    </div>
                    {showPercentage && (
                        <div style={{
                            fontSize: typographyPro.xs,
                            color: colorsPro.textDim,
                            marginTop: '2px',
                            fontFamily: typographyPro.fontMono,
                        }}>
                            /100
                        </div>
                    )}
                </div>
            </div>

            {label && (
                <div style={{
                    fontSize: typographyPro.sm,
                    color: colorsPro.textMuted,
                    textTransform: 'uppercase',
                    letterSpacing: '1px',
                    fontWeight: typographyPro.weightMedium,
                }}>
                    {label}
                </div>
            )}
        </div>
    );
};
