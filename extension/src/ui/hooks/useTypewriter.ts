import { useState, useEffect, useRef } from 'react';

interface TypewriterOptions {
    /** Speed in milliseconds per character */
    speed?: number;
    /** Delay before starting in milliseconds */
    delay?: number;
    /** Callback when typing completes */
    onComplete?: () => void;
}

/**
 * MGS-style typewriter effect hook
 * Reveals text character by character with optional delay
 *
 * @param text - The full text to display
 * @param options - Configuration options
 * @returns The currently displayed text (partial or complete)
 */
export function useTypewriter(
    text: string,
    options: TypewriterOptions = {}
): string {
    const { speed = 30, delay = 0, onComplete } = options;
    const [displayedText, setDisplayedText] = useState('');
    const [currentIndex, setCurrentIndex] = useState(0);
    const timerRef = useRef<NodeJS.Timeout>();
    const completedRef = useRef(false);

    useEffect(() => {
        // Reset when text changes
        setDisplayedText('');
        setCurrentIndex(0);
        completedRef.current = false;

        if (!text) return;

        // Initial delay before starting
        const startTimer = setTimeout(() => {
            setCurrentIndex(1);
        }, delay);

        return () => {
            clearTimeout(startTimer);
            if (timerRef.current) {
                clearTimeout(timerRef.current);
            }
        };
    }, [text, delay]);

    useEffect(() => {
        if (currentIndex === 0 || currentIndex > text.length) {
            return;
        }

        // Update displayed text
        setDisplayedText(text.slice(0, currentIndex));

        // Check if complete
        if (currentIndex === text.length) {
            if (!completedRef.current && onComplete) {
                completedRef.current = true;
                onComplete();
            }
            return;
        }

        // Schedule next character
        timerRef.current = setTimeout(() => {
            setCurrentIndex(prev => prev + 1);
        }, speed);

        return () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
            }
        };
    }, [currentIndex, text, speed, onComplete]);

    return displayedText;
}
