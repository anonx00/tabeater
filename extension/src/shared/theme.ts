// Phantom Tabs - Shared Theme Constants
// Centralized styling for consistent UI across all components

export const colors = {
    // Primary palette
    primary: '#00ff88',
    primaryDark: '#00cc6a',
    primaryBg: '#002200',

    // Background colors
    bgDarkest: '#000000',
    bgDarker: '#0a0a0a',
    bgDark: '#0d0d0d',
    bgCard: '#111111',
    bgCardHover: '#1a1a1a',
    bgInput: '#0a0a0a',

    // Border colors
    borderDark: '#1a1a1a',
    borderMedium: '#222222',
    borderLight: '#333333',
    borderPrimary: '#00ff88',

    // Text colors
    textPrimary: '#ffffff',
    textSecondary: '#e0e0e0',
    textMuted: '#c0c0c0',
    textDim: '#888888',
    textDimmer: '#666666',
    textDimmest: '#444444',

    // Status colors
    success: '#00ff88',
    warning: '#ff8800',
    warningBg: '#1a1a00',
    warningText: '#ffcc00',
    error: '#ff4444',
    errorBg: '#330000',
    info: '#4488ff',
    infoBg: '#0a0a1a',

    // Provider colors
    providerNano: '#00ff88',
    providerGemini: '#4285f4',
    providerOpenai: '#10a37f',
    providerAnthropic: '#d4a574',

    // License colors
    licensePro: '#00ff88',
    licenseTrial: '#ff8800',
    licenseExpired: '#ff4444',
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
    fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
    fontMono: "'SF Mono', 'Consolas', 'Monaco', monospace",

    // Font sizes
    sizeXs: 9,
    sizeSm: 10,
    sizeMd: 11,
    sizeBase: 12,
    sizeLg: 13,
    sizeXl: 14,
    sizeXxl: 16,
    sizeDisplay: 18,
    sizeHero: 24,

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
