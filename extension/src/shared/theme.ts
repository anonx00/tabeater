// TabEater - Premium Minimal Design System
// Refined cassette futurism with MGS-inspired aesthetics
// Sophisticated, high-contrast with subtle accents

export const colors = {
    // Core Palette - Refined
    voidBlack: '#0a0a0a',       // Softer deep black
    panelGrey: '#131313',       // Elevated surface
    phosphorGreen: '#00FF88',   // Softer, more premium green
    signalAmber: '#FFAA00',     // Warm amber
    criticalRed: '#FF3366',     // Softer red

    // Premium Accents
    accentCyan: '#00D4FF',      // MGS codec blue
    accentPurple: '#9966FF',    // Premium purple
    accentGold: '#FFD700',      // Status gold

    // Extended Greys - Refined
    borderIdle: '#2a2a2a',
    borderHover: '#4a4a4a',
    borderFocus: '#00FF88',
    surfaceDark: '#0d0d0d',
    surfaceLight: '#1a1a1a',
    surfaceMid: '#171717',

    // Text Colors - Premium Hierarchy
    textPrimary: '#FFFFFF',
    textSecondary: '#B0B0B0',
    textMuted: '#707070',
    textDim: '#404040',

    // State Colors - Refined
    success: '#00FF88',
    successBg: 'rgba(0, 255, 136, 0.04)',
    warning: '#FFAA00',
    warningBg: 'rgba(255, 170, 0, 0.04)',
    error: '#FF3366',
    errorBg: 'rgba(255, 51, 102, 0.04)',
    info: '#00D4FF',
    infoBg: 'rgba(0, 212, 255, 0.04)',

    // Legacy aliases for compatibility
    primary: '#00FF88',
    primaryLight: '#33FF99',
    primaryDark: '#00CC6F',
    primaryBg: 'rgba(0, 255, 136, 0.04)',
    primaryHover: 'rgba(0, 255, 136, 0.08)',
    accent: '#00D4FF',
    accentLight: '#33DDFF',
    accentBg: 'rgba(0, 212, 255, 0.04)',
    bgDarkest: '#0a0a0a',
    bgDarker: '#0d0d0d',
    bgDark: '#131313',
    bgCard: '#131313',
    bgCardHover: '#1a1a1a',
    bgInput: '#0d0d0d',
    bgElevated: '#1a1a1a',
    borderDark: '#1a1a1a',
    borderMedium: '#2a2a2a',
    borderLight: '#3a3a3a',
    textDimmer: '#383838',
    textDimmest: '#282828',
    successText: '#00FF88',
    warningText: '#FFAA00',
    errorText: '#FF3366',

    // Provider colors
    providerNano: '#00FF88',
    providerGemini: '#4285f4',
    providerOpenai: '#10a37f',
    providerAnthropic: '#d4a574',

    // License colors
    licensePro: '#00FF88',
    licenseTrial: '#FFAA00',
    licenseExpired: '#FF3366',
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
    fontMono: "'JetBrains Mono', 'SF Mono', 'Fira Code', 'Consolas', monospace",
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
    sm: 3,
    md: 4,
    lg: 6,
    xl: 8,
    full: 9999,
};

export const shadows = {
    none: 'none',
    xs: '0 1px 2px rgba(0, 0, 0, 0.2)',
    sm: '0 2px 4px rgba(0, 0, 0, 0.2)',
    md: '0 4px 8px rgba(0, 0, 0, 0.2)',
    lg: '0 8px 16px rgba(0, 0, 0, 0.2)',
    xl: '0 12px 24px rgba(0, 0, 0, 0.2)',
    glow: '0 0 12px rgba(0, 255, 136, 0.2)',
    glowAmber: '0 0 12px rgba(255, 170, 0, 0.2)',
    glowRed: '0 0 12px rgba(255, 51, 102, 0.2)',
    glowCyan: '0 0 12px rgba(0, 212, 255, 0.2)',
    focus: '0 0 0 1px rgba(0, 255, 136, 0.5)',
    // Premium phantom glow effects - subtle
    phantomGreen: '0 0 20px rgba(0, 255, 136, 0.15)',
    phantomAmber: '0 0 20px rgba(255, 170, 0, 0.15)',
    phantomRed: '0 0 20px rgba(255, 51, 102, 0.15)',
    phantomBlue: '0 0 20px rgba(0, 212, 255, 0.15)',
    phantomCyan: '0 0 20px rgba(0, 212, 255, 0.15)',
    // Hover lift effect
    hoverLift: '0 6px 16px rgba(0, 0, 0, 0.3)',
    cardHover: '0 4px 12px rgba(0, 0, 0, 0.25)',
    // Inner glow
    innerGlow: 'inset 0 1px 0 rgba(255, 255, 255, 0.03)',
};

export const transitions = {
    fast: '0.1s ease',
    normal: '0.2s ease',
    slow: '0.3s ease',
    smooth: '0.25s cubic-bezier(0.4, 0, 0.2, 1)',
};

// Subtle scanline overlay - very minimal
export const scanlineOverlay = `repeating-linear-gradient(
    0deg,
    rgba(0, 0, 0, 0.03) 0px,
    rgba(0, 0, 0, 0.03) 1px,
    transparent 1px,
    transparent 3px
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
    transition: `all ${transitions.normal}`,
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
  <rect x="2" y="2" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <circle cx="8" cy="8" r="2" fill="currentColor"/>
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
