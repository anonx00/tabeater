// TabEater - Shared Theme Constants
// Centralized styling for consistent UI across all components

export const colors = {
    // Primary palette - Cyber security theme
    primary: '#00ff88',
    primaryLight: '#33ffaa',
    primaryDark: '#00cc66',
    primaryBg: 'rgba(0, 255, 136, 0.08)',
    primaryGlow: '0 0 8px rgba(0, 255, 136, 0.4), 0 0 12px rgba(0, 255, 136, 0.2)',

    // Accent colors - Matrix green
    accent: '#00ff41',
    accentLight: '#66ff77',
    accentBg: 'rgba(0, 255, 65, 0.08)',
    accentGlow: '0 0 6px rgba(0, 255, 65, 0.3)',

    // Background colors - softened for reduced eye strain
    bgDarkest: '#121212',
    bgDarker: '#1a1a1a',
    bgDark: '#1d1d1d',
    bgCard: '#212121',
    bgCardHover: '#2a2a2a',
    bgInput: '#1a1a1a',

    // Border colors - cyber theme
    borderDark: '#1a1a1a',
    borderMedium: '#2a2a2a',
    borderLight: '#3a3a3a',
    borderPrimary: '#00ff88',
    borderAccent: '#00ff41',
    borderCyber: 'rgba(0, 255, 136, 0.3)',

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
    glow: '0 0 10px rgba(0, 255, 136, 0.3), 0 0 20px rgba(0, 255, 136, 0.1)',
    glowSm: '0 0 6px rgba(0, 255, 136, 0.2)',
    glowAccent: '0 0 10px rgba(0, 255, 65, 0.3)',
};

export const transitions = {
    fast: '0.1s ease',
    normal: '0.2s ease',
    slow: '0.3s ease',
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
