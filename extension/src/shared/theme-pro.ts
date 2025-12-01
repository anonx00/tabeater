// TabEater Pro - Glass Cyberpunk Theme
// Premium UI with glass morphism and neon accents

export const colorsPro = {
    // Base - Deep matte blacks
    bgDarkest: '#0a0a0a',
    bgDark: '#0f0f0f',
    bgBase: '#141414',
    bgSurface: '#161616',
    bgCard: '#1a1a1a',
    bgCardHover: '#1f1f1f',

    // Glass surfaces with transparency
    glassLight: 'rgba(255, 255, 255, 0.03)',
    glassMedium: 'rgba(255, 255, 255, 0.05)',
    glassHeavy: 'rgba(255, 255, 255, 0.08)',
    glassAccent: 'rgba(139, 92, 246, 0.08)',

    // Borders - 1px precision
    borderSubtle: '#222222',
    borderBase: '#2a2a2a',
    borderMedium: '#333333',
    borderBright: '#444444',

    // Primary - Purple gradient
    primaryPurple: '#8b5cf6',
    primaryPurpleDark: '#7c3aed',
    primaryPurpleLight: '#a78bfa',

    // Accent - Cyan glow
    accentCyan: '#06b6d4',
    accentCyanDark: '#0891b2',
    accentCyanLight: '#22d3ee',

    // Neon accents
    neonPurple: '#a855f7',
    neonCyan: '#22d3ee',
    neonPink: '#ec4899',
    neonGreen: '#10b981',

    // Text hierarchy
    textPrimary: '#ffffff',
    textSecondary: '#e5e5e5',
    textMuted: '#a1a1a1',
    textDim: '#737373',
    textDimmer: '#525252',

    // Status colors
    success: '#10b981',
    successGlow: '0 0 12px rgba(16, 185, 129, 0.4)',
    warning: '#f59e0b',
    warningGlow: '0 0 12px rgba(245, 158, 11, 0.4)',
    error: '#ef4444',
    errorGlow: '0 0 12px rgba(239, 68, 68, 0.4)',
    info: '#3b82f6',

    // Glow effects
    glowPurple: '0 0 20px rgba(139, 92, 246, 0.3), 0 0 40px rgba(139, 92, 246, 0.1)',
    glowCyan: '0 0 20px rgba(6, 182, 212, 0.3), 0 0 40px rgba(6, 182, 212, 0.1)',
    glowPink: '0 0 20px rgba(236, 72, 153, 0.3), 0 0 40px rgba(236, 72, 153, 0.1)',
    glowGreen: '0 0 20px rgba(16, 185, 129, 0.3), 0 0 40px rgba(16, 185, 129, 0.1)',

    // Pro badge
    proGold: '#fbbf24',
    proGoldGlow: '0 0 16px rgba(251, 191, 36, 0.5)',
};

export const spacingPro = {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    xxxl: 32,
    huge: 48,
};

export const typographyPro = {
    // Font stacks
    fontSans: "system-ui, -apple-system, 'Inter', 'Segoe UI', sans-serif",
    fontMono: "'JetBrains Mono', 'SF Mono', 'Consolas', monospace",

    // Sizes
    xs: '11px',
    sm: '12px',
    base: '13px',
    md: '14px',
    lg: '15px',
    xl: '16px',
    xxl: '18px',
    xxxl: '20px',
    huge: '24px',
    display: '32px',

    // Weights
    weightNormal: 400,
    weightMedium: 500,
    weightSemibold: 600,
    weightBold: 700,

    // Line heights
    lineHeightTight: 1.2,
    lineHeightNormal: 1.5,
    lineHeightRelaxed: 1.75,
};

export const borderRadiusPro = {
    none: '0px',
    sm: '4px',
    md: '8px',
    lg: '12px',
    xl: '16px',
    full: '9999px',
};

export const transitionsPro = {
    fast: '0.15s cubic-bezier(0.4, 0, 0.2, 1)',
    normal: '0.25s cubic-bezier(0.4, 0, 0.2, 1)',
    slow: '0.35s cubic-bezier(0.4, 0, 0.2, 1)',
    bounce: '0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
};

export const shadowsPro = {
    sm: '0 1px 2px rgba(0, 0, 0, 0.5)',
    md: '0 4px 6px rgba(0, 0, 0, 0.5)',
    lg: '0 10px 15px rgba(0, 0, 0, 0.5)',
    xl: '0 20px 25px rgba(0, 0, 0, 0.5)',
    glow: '0 0 20px rgba(139, 92, 246, 0.3)',
    glowCyan: '0 0 20px rgba(6, 182, 212, 0.3)',
    inner: 'inset 0 2px 4px rgba(0, 0, 0, 0.5)',
};

// CSS-in-JS utility classes
export const glassPanelStyle: React.CSSProperties = {
    background: colorsPro.glassHeavy,
    backdropFilter: 'blur(12px) saturate(180%)',
    WebkitBackdropFilter: 'blur(12px) saturate(180%)',
    border: `1px solid ${colorsPro.borderMedium}`,
    borderRadius: borderRadiusPro.lg,
};

export const textGradientStyle: React.CSSProperties = {
    background: `linear-gradient(135deg, ${colorsPro.primaryPurple} 0%, ${colorsPro.accentCyan} 100%)`,
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
};

export const buttonActiveStyle: React.CSSProperties = {
    transform: 'scale(0.96)',
    opacity: 0.9,
};

// Animation keyframes (to be injected)
export const animationKeyframes = `
@keyframes fadeIn {
    from {
        opacity: 0;
        transform: translateY(4px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

@keyframes slideInBottom {
    from {
        opacity: 0;
        transform: translateY(20px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

@keyframes pulse {
    0%, 100% {
        opacity: 1;
    }
    50% {
        opacity: 0.5;
    }
}

@keyframes shimmer {
    0% {
        background-position: -200% center;
    }
    100% {
        background-position: 200% center;
    }
}

@keyframes glow {
    0%, 100% {
        box-shadow: 0 0 20px rgba(139, 92, 246, 0.3);
    }
    50% {
        box-shadow: 0 0 30px rgba(139, 92, 246, 0.5);
    }
}

@keyframes scanline {
    0% {
        transform: translateY(-100%);
    }
    100% {
        transform: translateY(100%);
    }
}
`;

// Grid background pattern
export const gridBackgroundCSS = `
.grid-bg {
    background-image:
        linear-gradient(${colorsPro.borderSubtle} 1px, transparent 1px),
        linear-gradient(90deg, ${colorsPro.borderSubtle} 1px, transparent 1px);
    background-size: 20px 20px;
    background-position: -1px -1px;
}
`;
