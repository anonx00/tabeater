import { useState, useEffect, useRef } from 'react';

interface TextScrambleOptions {
    /** Speed in milliseconds per character update */
    speed?: number;
    /** Number of scramble iterations before revealing actual character */
    scrambleIterations?: number;
    /** Characters to use for scrambling */
    scrambleChars?: string;
}

/**
 * MGS-style text scramble/decode effect
 * Makes text appear to decode from random characters
 *
 * @param text - The target text to display
 * @param options - Configuration options
 * @returns The currently displayed text (scrambled or final)
 */
export function useTextScramble(
    text: string,
    options: TextScrambleOptions = {}
): string {
    const {
        speed = 50,
        scrambleIterations = 3,
        scrambleChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*',
    } = options;

    const [displayedText, setDisplayedText] = useState('');
    const [currentIndex, setCurrentIndex] = useState(0);
    const [scrambleCount, setScrambleCount] = useState(0);
    const timerRef = useRef<NodeJS.Timeout>();

    useEffect(() => {
        // Reset when text changes
        setDisplayedText('');
        setCurrentIndex(0);
        setScrambleCount(0);

        if (!text) return;

        return () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
            }
        };
    }, [text]);

    useEffect(() => {
        if (!text || currentIndex >= text.length) {
            return;
        }

        const updateText = () => {
            const revealed = text.slice(0, currentIndex);
            const currentChar = text[currentIndex];

            let display: string;
            if (scrambleCount < scrambleIterations) {
                // Still scrambling current character
                const randomChar = scrambleChars[Math.floor(Math.random() * scrambleChars.length)];
                display = revealed + randomChar + text.slice(currentIndex + 1).split('').map(() => ' ').join('');
                setScrambleCount(prev => prev + 1);
            } else {
                // Reveal actual character and move to next
                display = revealed + currentChar;
                setCurrentIndex(prev => prev + 1);
                setScrambleCount(0);
            }

            setDisplayedText(display.slice(0, text.length));
        };

        timerRef.current = setTimeout(updateText, speed);

        return () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
            }
        };
    }, [currentIndex, scrambleCount, text, speed, scrambleIterations, scrambleChars]);

    return displayedText || text;
}
