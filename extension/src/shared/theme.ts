// TabEater - Shared Theme Constants
// Centralized styling for consistent UI across all components

export const colors = {
    // Primary palette - MGS phosphor green (desaturated)
    primary: '#5fb878',
    primaryLight: '#7fc790',
    primaryDark: '#4a9d5f',
    primaryBg: 'rgba(95, 184, 120, 0.08)',
    primaryGlow: '0 0 8px rgba(95, 184, 120, 0.3), 0 0 12px rgba(95, 184, 120, 0.15)',

    // Accent colors - Warmer phosphor
    accent: '#6bc96e',
    accentLight: '#88d68a',
    accentBg: 'rgba(107, 201, 110, 0.08)',
    accentGlow: '0 0 6px rgba(107, 201, 110, 0.25)',

    // Background colors - softened for reduced eye strain
    bgDarkest: '#121212',
    bgDarker: '#1a1a1a',
    bgDark: '#1d1d1d',
    bgCard: '#212121',
    bgCardHover: '#2a2a2a',
    bgInput: '#1a1a1a',

    // Border colors - MGS phosphor theme
    borderDark: '#1a1a1a',
    borderMedium: '#2a2a2a',
    borderLight: '#3a3a3a',
    borderPrimary: '#5fb878',
    borderAccent: '#6bc96e',
    borderCyber: 'rgba(95, 184, 120, 0.3)',

    // Text colors
    textPrimary: '#ffffff',
    textSecondary: '#e0e0e0',
    textMuted: '#c0c0c0',
    textDim: '#888888',
    textDimmer: '#666666',
    textDimmest: '#444444',

    // Status colors
    success: '#22c55e',
    successBg: 'rgba(34, 197, 94, 0.1)',
    warning: '#f59e0b',
    warningBg: 'rgba(245, 158, 11, 0.1)',
    warningText: '#fbbf24',
    error: '#ef4444',
    errorBg: 'rgba(239, 68, 68, 0.1)',
    info: '#3b82f6',
    infoBg: 'rgba(59, 130, 246, 0.1)',

    // Provider colors
    providerNano: '#22c55e',
    providerGemini: '#4285f4',
    providerOpenai: '#10a37f',
    providerAnthropic: '#d4a574',

    // License colors
    licensePro: '#00ff88',
    licenseTrial: '#f59e0b',
    licenseExpired: '#ef4444',

    // Gradient colors
    gradientStart: '#8b5cf6',
    gradientEnd: '#06b6d4',
};

export const spacing = {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    xxxl: 32,
};

export const typography = {
    // Unified font stack for better readability
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
    fontMono: "'JetBrains Mono', 'SF Mono', 'Consolas', 'Monaco', monospace",

    // Font sizes - increased for better readability
    sizeXs: 11,
    sizeSm: 12,
    sizeMd: 13,
    sizeBase: 14,
    sizeLg: 15,
    sizeXl: 16,
    sizeXxl: 18,
    sizeDisplay: 20,
    sizeHero: 28,

    // Font weights
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,

    // Letter spacing
    letterTight: 0.5,
    letterNormal: 1,
    letterWide: 2,
    letterWider: 3,
};

export const borderRadius = {
    sm: 2,
    md: 4,
    lg: 6,
    xl: 8,
    full: 9999,
};

export const shadows = {
    sm: '0 1px 2px rgba(0, 0, 0, 0.3)',
    md: '0 2px 4px rgba(0, 0, 0, 0.4)',
    lg: '0 4px 8px rgba(0, 0, 0, 0.5)',
    glow: '0 0 10px rgba(95, 184, 120, 0.25), 0 0 20px rgba(95, 184, 120, 0.1)',
    glowSm: '0 0 6px rgba(95, 184, 120, 0.2)',
    glowAccent: '0 0 10px rgba(107, 201, 110, 0.25)',
};

export const transitions = {
    fast: '0.1s ease',
    normal: '0.2s ease',
    slow: '0.3s ease',
};

export const effects = {
    // Frosted glass backdrop effects
    glassLight: 'blur(8px) saturate(180%)',
    glassMedium: 'blur(12px) saturate(180%)',
    glassHeavy: 'blur(16px) saturate(180%)',
    glassSubtle: 'blur(4px) saturate(150%)',
};

// Common button base styles
export const buttonBase: React.CSSProperties = {
    cursor: 'pointer',
    border: 'none',
    borderRadius: borderRadius.sm,
    fontFamily: typography.fontFamily,
    fontWeight: typography.semibold,
    letterSpacing: typography.letterNormal,
    transition: `all ${transitions.fast}`,
    outline: 'none',
};

// Common input base styles
export const inputBase: React.CSSProperties = {
    fontFamily: typography.fontFamily,
    fontSize: typography.sizeLg,
    color: colors.textPrimary,
    background: colors.bgInput,
    border: `1px solid ${colors.borderLight}`,
    borderRadius: borderRadius.md,
    outline: 'none',
    transition: `border-color ${transitions.fast}`,
    boxSizing: 'border-box' as const,
};

// Favicon fallback SVG data URI
export const faviconFallback = `data:image/svg+xml,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="${colors.textDimmest}">
  <rect x="2" y="2" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <circle cx="8" cy="8" r="2" fill="currentColor"/>
</svg>
`)}`;

// Export common style objects for reuse
export const commonStyles = {
    scrollbarHidden: {
        scrollbarWidth: 'none' as const,
        msOverflowStyle: 'none' as const,
    },
    truncate: {
        whiteSpace: 'nowrap' as const,
        overflow: 'hidden' as const,
        textOverflow: 'ellipsis' as const,
    },
    flexCenter: {
        display: 'flex' as const,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
    },
    flexBetween: {
        display: 'flex' as const,
        alignItems: 'center' as const,
        justifyContent: 'space-between' as const,
    },
};

// CSS classes for corner brackets (to be injected into document)
export const cornerBracketsCSS = `
    .corner-brackets {
        position: relative;
    }

    .corner-brackets::before,
    .corner-brackets::after {
        content: '';
        position: absolute;
        width: 10px;
        height: 10px;
        border-color: ${colors.primary};
        border-style: solid;
        border-width: 0;
        pointer-events: none;
    }

    .corner-brackets::before {
        top: 0;
        left: 0;
        border-top-width: 1.5px;
        border-left-width: 1.5px;
    }

    .corner-brackets::after {
        top: 0;
        right: 0;
        border-top-width: 1.5px;
        border-right-width: 1.5px;
    }

    .corner-brackets-bottom::before {
        content: '';
        position: absolute;
        bottom: 0;
        left: 0;
        width: 10px;
        height: 10px;
        border-color: ${colors.primary};
        border-style: solid;
        border-width: 0;
        border-bottom-width: 1.5px;
        border-left-width: 1.5px;
        pointer-events: none;
    }

    .corner-brackets-bottom::after {
        content: '';
        position: absolute;
        bottom: 0;
        right: 0;
        width: 10px;
        height: 10px;
        border-color: ${colors.primary};
        border-style: solid;
        border-width: 0;
        border-bottom-width: 1.5px;
        border-right-width: 1.5px;
        pointer-events: none;
    }
`;
