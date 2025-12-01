import React, { useState, useEffect } from 'react';

interface ScanlineOverlayProps {
    disabled?: boolean;
}

/**
 * MGS-inspired scanline overlay for CRT monitor effect
 * Creates horizontal scanlines across the entire interface
 * Can be disabled via props or the cleanMode setting in storage
 */
export const ScanlineOverlay: React.FC<ScanlineOverlayProps> = ({ disabled: propDisabled }) => {
    const [isDisabled, setIsDisabled] = useState(propDisabled ?? false);

    useEffect(() => {
        // Check storage for clean mode setting
        chrome.storage.local.get(['cleanMode'], (result) => {
            if (result.cleanMode === true) {
                setIsDisabled(true);
            }
        });

        // Listen for changes
        const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
            if (changes.cleanMode) {
                setIsDisabled(changes.cleanMode.newValue === true);
            }
        };
        chrome.storage.onChanged.addListener(listener);
        return () => chrome.storage.onChanged.removeListener(listener);
    }, []);

    // If disabled, render nothing
    if (isDisabled || propDisabled) {
        return null;
    }

    return (
        <>
            {/* Scanlines */}
            <div
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: `repeating-linear-gradient(
                        0deg,
                        rgba(0, 0, 0, 0.15),
                        rgba(0, 0, 0, 0.15) 1px,
                        transparent 1px,
                        transparent 2px
                    )`,
                    pointerEvents: 'none',
                    zIndex: 9999,
                    opacity: 0.5,
                }}
            />

            {/* CRT vignette */}
            <div
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: `radial-gradient(
                        ellipse at center,
                        transparent 0%,
                        transparent 60%,
                        rgba(0, 0, 0, 0.3) 100%
                    )`,
                    pointerEvents: 'none',
                    zIndex: 9998,
                }}
            />

            {/* Subtle screen flicker */}
            <div
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(95, 184, 120, 0.02)',
                    pointerEvents: 'none',
                    zIndex: 9997,
                    animation: 'flicker 0.15s infinite',
                }}
            />

            <style>
                {`
                    @keyframes flicker {
                        0% { opacity: 0.95; }
                        50% { opacity: 1; }
                        100% { opacity: 0.95; }
                    }
                `}
            </style>
        </>
    );
};
