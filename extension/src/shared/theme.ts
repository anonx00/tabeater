// TabEater - Minimalist Consumer-Grade Theme
// Clean, professional design inspired by Linear, Notion, and Apple

export const colors = {
    // Primary palette - Clean blue accent
    primary: '#3b82f6',
    primaryLight: '#60a5fa',
    primaryDark: '#2563eb',
    primaryBg: 'rgba(59, 130, 246, 0.08)',
    primaryHover: 'rgba(59, 130, 246, 0.12)',

    // Accent colors
    accent: '#8b5cf6',
    accentLight: '#a78bfa',
    accentBg: 'rgba(139, 92, 246, 0.08)',

    // Background colors - Solid, no transparency
    bgDarkest: '#0a0a0a',
    bgDarker: '#111111',
    bgDark: '#161616',
    bgCard: '#1a1a1a',
    bgCardHover: '#1f1f1f',
    bgInput: '#1a1a1a',
    bgElevated: '#222222',

    // Border colors - Clean and subtle
    borderDark: '#1f1f1f',
    borderMedium: '#2a2a2a',
    borderLight: '#333333',
    borderFocus: '#3b82f6',

    // Text colors - Clear hierarchy
    textPrimary: '#ffffff',
    textSecondary: '#e5e5e5',
    textMuted: '#a3a3a3',
    textDim: '#737373',
    textDimmer: '#525252',
    textDimmest: '#404040',

    // Status colors - Softer tones
    success: '#22c55e',
    successBg: 'rgba(34, 197, 94, 0.1)',
    successText: '#4ade80',
    warning: '#f59e0b',
    warningBg: 'rgba(245, 158, 11, 0.1)',
    warningText: '#fbbf24',
    error: '#ef4444',
    errorBg: 'rgba(239, 68, 68, 0.1)',
    errorText: '#f87171',
    info: '#3b82f6',
    infoBg: 'rgba(59, 130, 246, 0.1)',

    // Provider colors
    providerNano: '#22c55e',
    providerGemini: '#4285f4',
    providerOpenai: '#10a37f',
    providerAnthropic: '#d4a574',

    // License colors
    licensePro: '#3b82f6',
    licenseTrial: '#f59e0b',
    licenseExpired: '#ef4444',
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
    // Clean system font stack
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', Roboto, sans-serif",
    fontMono: "'SF Mono', 'Fira Code', 'Consolas', monospace",

    // Font sizes - Refined scale
    sizeXs: 11,
    sizeSm: 12,
    sizeMd: 13,
    sizeBase: 14,
    sizeLg: 15,
    sizeXl: 16,
    sizeXxl: 18,
    sizeDisplay: 20,
    sizeHero: 24,

    // Font weights
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,

    // Letter spacing - Minimal
    letterTight: -0.2,
    letterNormal: 0,
    letterWide: 0.3,
};

export const borderRadius = {
    xs: 4,
    sm: 6,
    md: 8,
    lg: 12,
    xl: 16,
    full: 9999,
};

// Clean shadows - No glows
export const shadows = {
    xs: '0 1px 2px rgba(0, 0, 0, 0.1)',
    sm: '0 1px 3px rgba(0, 0, 0, 0.12)',
    md: '0 4px 6px rgba(0, 0, 0, 0.15)',
    lg: '0 10px 15px rgba(0, 0, 0, 0.2)',
    xl: '0 20px 25px rgba(0, 0, 0, 0.25)',
    focus: '0 0 0 2px rgba(59, 130, 246, 0.4)',
};

export const transitions = {
    fast: '0.15s ease',
    normal: '0.2s ease',
    slow: '0.3s ease',
};

// No glass effects - solid backgrounds only
export const effects = {
    // Keeping for backwards compatibility but not used
    glassLight: 'none',
    glassMedium: 'none',
    glassHeavy: 'none',
    glassSubtle: 'none',
};

// Common button base styles
export const buttonBase: React.CSSProperties = {
    cursor: 'pointer',
    border: 'none',
    borderRadius: borderRadius.sm,
    fontFamily: typography.fontFamily,
    fontWeight: typography.medium,
    transition: `all ${transitions.fast}`,
    outline: 'none',
};

// Common input base styles
export const inputBase: React.CSSProperties = {
    fontFamily: typography.fontFamily,
    fontSize: typography.sizeBase,
    color: colors.textPrimary,
    background: colors.bgInput,
    border: `1px solid ${colors.borderLight}`,
    borderRadius: borderRadius.sm,
    outline: 'none',
    transition: `border-color ${transitions.fast}`,
    boxSizing: 'border-box' as const,
};

// Simple favicon fallback
export const faviconFallback = `data:image/svg+xml,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="${colors.textDimmest}">
  <rect x="2" y="2" width="12" height="12" rx="3" fill="none" stroke="currentColor" stroke-width="1.5"/>
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
