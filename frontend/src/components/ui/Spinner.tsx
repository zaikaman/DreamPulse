import React from 'react';
import { Loader2 } from 'lucide-react';

export interface SpinnerProps extends React.HTMLAttributes<HTMLSpanElement> {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number;
  variant?: 'cyan' | 'amber' | 'green' | 'rose' | 'white' | 'muted';
  glow?: boolean;
}

const SIZE_MAP = {
  xs: 11,
  sm: 14,
  md: 18,
  lg: 24,
  xl: 32,
};

const COLOR_MAP = {
  cyan: 'var(--brand-cyan, #00ffcc)',
  amber: 'var(--trade-anomaly, #f59e0b)',
  green: 'var(--trade-yes, #10b981)',
  rose: 'var(--trade-no, #f43f5e)',
  white: '#ffffff',
  muted: 'var(--muted-foreground, #a1a1aa)',
};

export const Spinner: React.FC<SpinnerProps> = ({
  size = 'md',
  variant = 'cyan',
  glow = false,
  className = '',
  style,
  ...props
}) => {
  const pixelSize = typeof size === 'number' ? size : SIZE_MAP[size] || 18;
  const color = COLOR_MAP[variant] || COLOR_MAP.cyan;

  return (
    <span
      className={`dreampulse-spinner-wrapper ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        lineHeight: 0,
        color,
        filter: glow ? `drop-shadow(0 0 6px ${color})` : undefined,
        ...style,
      }}
      role="status"
      aria-label="Loading"
      {...props}
    >
      <Loader2
        size={pixelSize}
        style={{
          animation: 'dreampulse-spin 0.85s linear infinite',
          transformOrigin: 'center center',
        }}
      />
    </span>
  );
};

export interface InlineLoaderProps {
  text?: string;
  size?: 'xs' | 'sm' | 'md';
  variant?: 'cyan' | 'amber' | 'green' | 'rose' | 'white' | 'muted';
  className?: string;
}

export const InlineLoader: React.FC<InlineLoaderProps> = ({
  text = 'Loading...',
  size = 'sm',
  variant = 'cyan',
  className = '',
}) => {
  return (
    <span
      className={`inline-loader-container ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: size === 'xs' ? '11px' : size === 'sm' ? '12px' : '13px',
        color: COLOR_MAP[variant],
        fontFamily: 'var(--font-mono, monospace)',
      }}
    >
      <Spinner size={size} variant={variant} />
      <span>{text}</span>
    </span>
  );
};
