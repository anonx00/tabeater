// TabEater - Cassette Futurism Design System
// Inspired by 1980s sci-fi interfaces (Alien, Blade Runner)
// Tactile, high-contrast aesthetic with modern usability

export const colors = {
    // Core Palette
    voidBlack: '#050505',      // Deepest background layer
    panelGrey: '#111111',       // Cards, sidebars, inputs
    phosphorGreen: '#39FF14',   // Primary action, active states
    signalAmber: '#FFB000',     // Warning state
    criticalRed: '#FF0055',     // Destructive actions, errors

    // Extended Greys
    borderIdle: '#333333',
    borderHover: '#FFFFFF',
    borderFocus: '#39FF14',
    surfaceDark: '#0a0a0a',
    surfaceLight: '#1a1a1a',

    // Text Colors
    textPrimary: '#FFFFFF',
    textSecondary: '#CCCCCC',
    textMuted: '#888888',
    textDim: '#555555',

    // State Colors
    success: '#39FF14',
    successBg: 'rgba(57, 255, 20, 0.05)',
    warning: '#FFB000',
    warningBg: 'rgba(255, 176, 0, 0.08)',
    error: '#FF0055',
    errorBg: 'rgba(255, 0, 85, 0.08)',
    info: '#00AAFF',
    infoBg: 'rgba(0, 170, 255, 0.08)',

    // Legacy aliases for compatibility
    primary: '#39FF14',
    primaryLight: '#5FFF4F',
    primaryDark: '#2ACC10',
    primaryBg: 'rgba(57, 255, 20, 0.05)',
    primaryHover: 'rgba(57, 255, 20, 0.1)',
    accent: '#00AAFF',
    accentLight: '#33BBFF',
    accentBg: 'rgba(0, 170, 255, 0.08)',
    bgDarkest: '#050505',
    bgDarker: '#0a0a0a',
    bgDark: '#111111',
    bgCard: '#111111',
    bgCardHover: '#1a1a1a',
    bgInput: '#0a0a0a',
    bgElevated: '#1a1a1a',
    borderDark: '#222222',
    borderMedium: '#333333',
    borderLight: '#444444',
    textDimmer: '#444444',
    textDimmest: '#333333',
    successText: '#39FF14',
    warningText: '#FFB000',
    errorText: '#FF0055',

    // Provider colors
    providerNano: '#39FF14',
    providerGemini: '#4285f4',
    providerOpenai: '#10a37f',
    providerAnthropic: '#d4a574',

    // License colors
    licensePro: '#39FF14',
    licenseTrial: '#FFB000',
    licenseExpired: '#FF0055',
};

export const spacing = {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    xxxl: 32,
    xxxxl: 48,
};

export const typography = {
    // Monospace for headers and data
    fontMono: "'JetBrains Mono', 'Space Mono', 'SF Mono', 'Fira Code', 'Consolas', monospace",
    // Sans-serif for body text
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",

    sizeXs: 10,
    sizeSm: 11,
    sizeMd: 12,
    sizeBase: 13,
    sizeLg: 14,
    sizeXl: 16,
    sizeXxl: 18,
    sizeDisplay: 20,
    sizeHero: 24,

    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,

    // Terminal-style letter spacing
    letterTight: -0.3,
    letterNormal: 0,
    letterWide: '0.05em',
    letterWidest: '0.1em',
};

export const borderRadius = {
    none: 0,
    xs: 2,
    sm: 2,
    md: 2,
    lg: 2,
    xl: 2,
    full: 9999,
};

export const shadows = {
    none: 'none',
    xs: 'none',
    sm: 'none',
    md: 'none',
    lg: 'none',
    xl: 'none',
    glow: '0 0 10px rgba(57, 255, 20, 0.3)',
    glowAmber: '0 0 10px rgba(255, 176, 0, 0.3)',
    glowRed: '0 0 10px rgba(255, 0, 85, 0.3)',
    focus: '0 0 0 1px #39FF14',
};

export const transitions = {
    fast: '0.1s ease',
    normal: '0.15s ease',
    slow: '0.25s ease',
};

// Scanline overlay effect
export const scanlineOverlay = `repeating-linear-gradient(
    0deg,
    rgba(0, 0, 0, 0.1) 0px,
    rgba(0, 0, 0, 0.1) 1px,
    transparent 1px,
    transparent 2px
)`;

export const effects = {
    scanline: scanlineOverlay,
    glassLight: 'none',
    glassMedium: 'none',
    glassHeavy: 'none',
    glassSubtle: 'none',
};

export const buttonBase: React.CSSProperties = {
    cursor: 'pointer',
    border: `1px solid ${colors.borderIdle}`,
    borderRadius: borderRadius.sm,
    fontFamily: typography.fontMono,
    fontWeight: typography.medium,
    textTransform: 'uppercase',
    letterSpacing: typography.letterWide,
    transition: `all ${transitions.fast}`,
    outline: 'none',
};

export const inputBase: React.CSSProperties = {
    fontFamily: typography.fontFamily,
    fontSize: typography.sizeBase,
    color: colors.textPrimary,
    background: colors.bgInput,
    border: `1px solid ${colors.borderIdle}`,
    borderRadius: borderRadius.sm,
    outline: 'none',
    transition: `border-color ${transitions.fast}`,
    boxSizing: 'border-box' as const,
};

export const faviconFallback = `data:image/svg+xml,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="${colors.textDim}">
  <rect x="2" y="2" width="12" height="12" rx="0" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <rect x="6" y="6" width="4" height="4" fill="currentColor"/>
</svg>
`)}`;

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
    terminalText: {
        fontFamily: typography.fontMono,
        textTransform: 'uppercase' as const,
        letterSpacing: typography.letterWide,
    },
};
