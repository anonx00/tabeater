import React from 'react';
import { useTextScramble } from '../hooks/useTextScramble';

interface ScrambleTextProps {
    /** The text to display with scramble effect */
    text: string;
    /** Speed in milliseconds per character update */
    speed?: number;
    /** Number of scramble iterations before revealing actual character */
    scrambleIterations?: number;
    /** Additional className */
    className?: string;
    /** Additional style */
    style?: React.CSSProperties;
}

/**
 * MGS-style scrambling text component
 * Text appears to decode from random characters
 */
export const ScrambleText: React.FC<ScrambleTextProps> = ({
    text,
    speed = 50,
    scrambleIterations = 3,
    className,
    style,
}) => {
    const displayedText = useTextScramble(text, { speed, scrambleIterations });

    return (
        <span className={className} style={style}>
            {displayedText}
        </span>
    );
};
