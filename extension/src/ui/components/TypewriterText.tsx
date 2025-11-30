import React from 'react';
import { useTypewriter } from '../hooks/useTypewriter';

interface TypewriterTextProps {
    /** The full text to display with typewriter effect */
    text: string;
    /** Speed in milliseconds per character */
    speed?: number;
    /** Delay before starting in milliseconds */
    delay?: number;
    /** Render function that receives the current text */
    children: (text: string) => React.ReactNode;
}

/**
 * MGS-style typewriter text component
 * Reveals text character by character
 */
export const TypewriterText: React.FC<TypewriterTextProps> = ({
    text,
    speed = 30,
    delay = 0,
    children,
}) => {
    const displayedText = useTypewriter(text, { speed, delay });
    return <>{children(displayedText)}</>;
};
