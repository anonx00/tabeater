import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'danger';
    fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
    children,
    variant = 'primary',
    fullWidth = false,
    style,
    ...props
}) => {
    const baseStyle: React.CSSProperties = {
        backgroundColor: 'transparent',
        border: '1px solid',
        borderColor: variant === 'danger' ? 'var(--color-secondary)' : 'var(--color-primary)',
        color: variant === 'danger' ? 'var(--color-secondary)' : 'var(--color-primary)',
        padding: '0.5rem 1rem',
        fontFamily: 'var(--font-mono)',
        textTransform: 'uppercase',
        cursor: 'pointer',
        width: fullWidth ? '100%' : 'auto',
        transition: 'all 0.2s ease',
        ...style
    };

    return (
        <button
            {...props}
            style={baseStyle}
            onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = variant === 'danger' ? 'rgba(255, 69, 0, 0.1)' : 'rgba(0, 255, 65, 0.1)';
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
            }}
        >
            {children}
        </button>
    );
};
