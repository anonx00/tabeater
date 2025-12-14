// TabEater - Premium MGS-Inspired Theme
// Tactical, professional design with orange accent

export const colors = {
    // Primary - Tactical Orange
    primary: '#f97316',
    primaryLight: '#fb923c',
    primaryDark: '#ea580c',
    primaryBg: 'rgba(249, 115, 22, 0.08)',
    primaryHover: 'rgba(249, 115, 22, 0.12)',

    // Accent - Electric Blue
    accent: '#06b6d4',
    accentLight: '#22d3ee',
    accentBg: 'rgba(6, 182, 212, 0.08)',

    // Background colors - Deep tactical blacks
    bgDarkest: '#09090b',
    bgDarker: '#0f0f12',
    bgDark: '#141418',
    bgCard: '#18181c',
    bgCardHover: '#1e1e24',
    bgInput: '#141418',
    bgElevated: '#1c1c22',

    // Border colors
    borderDark: '#1c1c22',
    borderMedium: '#27272f',
    borderLight: '#323240',
    borderFocus: '#f97316',

    // Text colors
    textPrimary: '#fafafa',
    textSecondary: '#e4e4e7',
    textMuted: '#a1a1aa',
    textDim: '#71717a',
    textDimmer: '#52525b',
    textDimmest: '#3f3f46',

    // Status colors
    success: '#22c55e',
    successBg: 'rgba(34, 197, 94, 0.1)',
    successText: '#4ade80',
    warning: '#f59e0b',
    warningBg: 'rgba(245, 158, 11, 0.1)',
    warningText: '#fbbf24',
    error: '#ef4444',
    errorBg: 'rgba(239, 68, 68, 0.1)',
    errorText: '#f87171',
    info: '#06b6d4',
    infoBg: 'rgba(6, 182, 212, 0.1)',

    // Provider colors
    providerNano: '#22c55e',
    providerGemini: '#4285f4',
    providerOpenai: '#10a37f',
    providerAnthropic: '#d4a574',

    // License colors
    licensePro: '#f97316',
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
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    fontMono: "'JetBrains Mono', 'SF Mono', 'Fira Code', 'Consolas', monospace",

    sizeXs: 11,
    sizeSm: 12,
    sizeMd: 13,
    sizeBase: 14,
    sizeLg: 15,
    sizeXl: 16,
    sizeXxl: 18,
    sizeDisplay: 20,
    sizeHero: 24,

    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,

    letterTight: -0.3,
    letterNormal: 0,
    letterWide: 0.5,
};

export const borderRadius = {
    xs: 4,
    sm: 6,
    md: 8,
    lg: 12,
    xl: 16,
    full: 9999,
};

export const shadows = {
    xs: '0 1px 2px rgba(0, 0, 0, 0.2)',
    sm: '0 2px 4px rgba(0, 0, 0, 0.25)',
    md: '0 4px 8px rgba(0, 0, 0, 0.3)',
    lg: '0 8px 16px rgba(0, 0, 0, 0.35)',
    xl: '0 16px 32px rgba(0, 0, 0, 0.4)',
    glow: '0 0 20px rgba(249, 115, 22, 0.15)',
    focus: '0 0 0 2px rgba(249, 115, 22, 0.3)',
};

export const transitions = {
    fast: '0.15s ease',
    normal: '0.2s ease',
    slow: '0.3s ease',
};

export const effects = {
    glassLight: 'none',
    glassMedium: 'none',
    glassHeavy: 'none',
    glassSubtle: 'none',
};

export const buttonBase: React.CSSProperties = {
    cursor: 'pointer',
    border: 'none',
    borderRadius: borderRadius.sm,
    fontFamily: typography.fontFamily,
    fontWeight: typography.medium,
    transition: `all ${transitions.fast}`,
    outline: 'none',
};

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

export const faviconFallback = `data:image/svg+xml,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="${colors.textDimmest}">
  <rect x="2" y="2" width="12" height="12" rx="3" fill="none" stroke="currentColor" stroke-width="1.5"/>
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
};
