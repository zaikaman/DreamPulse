import React from 'react';
import {
  ArrowPathIcon,
  ExclamationTriangleIcon,
  HomeIcon,
  WifiIcon,
} from '@heroicons/react/24/outline';
import { Spinner } from '../ui/Spinner.js';
import { isChunkLoadError } from '../../lib/lazy-with-retry.js';

// ---------------------------------------------------------------------------
// Generic Error Boundary
// ---------------------------------------------------------------------------

export interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Render-prop fallback. Receives the captured error plus a reset action. */
  fallback: (props: {
    error: Error;
    errorInfo: React.ErrorInfo | null;
    reset: () => void;
  }) => React.ReactNode;
  /** Stable identifier used in logs and diagnostics. */
  label?: string;
  /** Called once per captured error (logging / telemetry hook). */
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  /** Called when the boundary resets (retry / navigation). */
  onReset?: () => void;
  /**
   * Values that auto-reset the boundary when they change (e.g. the active
   * view name), so navigating away and back never leaves a stale error card.
   */
  resetKeys?: unknown[];
}

interface ErrorBoundaryState {
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

function reportBoundaryError(label: string, error: Error, errorInfo: React.ErrorInfo): void {
  try {
    // Always log locally so demo-time triage has something in DevTools.
    // eslint-disable-next-line no-console
    console.error(`[DreamPulse:${label}]`, error, errorInfo.componentStack);
  } catch {
    /* logging must never throw */
  }
  try {
    // Best-effort hook for any telemetry listener; never throws, never blocks.
    window.dispatchEvent(
      new CustomEvent('dreampulse:error', {
        detail: { label, message: error.message, stack: error.stack ?? null },
      }),
    );
  } catch {
    /* event dispatch must never throw */
  }
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, errorInfo: null };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    const label = this.props.label ?? 'ErrorBoundary';
    this.setState({ errorInfo });
    reportBoundaryError(label, error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (this.state.error === null) return;
    const prev = prevProps.resetKeys;
    const next = this.props.resetKeys;
    if (prev === undefined || next === undefined) return;
    if (prev.length !== next.length) {
      this.reset();
      return;
    }
    for (let i = 0; i < next.length; i += 1) {
      if (!Object.is(prev[i], next[i])) {
        this.reset();
        return;
      }
    }
  }

  reset = (): void => {
    this.setState({ error: null, errorInfo: null });
    this.props.onReset?.();
  };

  render(): React.ReactNode {
    const { error, errorInfo } = this.state;
    if (error !== null) {
      return this.props.fallback({ error, errorInfo, reset: this.reset });
    }
    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// Shared fallback chrome (keeps glass-card / heroicon visual language)
// ---------------------------------------------------------------------------

function ErrorDetails({ error, errorInfo }: { error: Error; errorInfo: React.ErrorInfo | null }): JSX.Element {
  return (
    <details
      style={{
        width: '100%',
        maxWidth: '560px',
        fontSize: '11px',
        color: 'var(--muted-foreground, #a1a1aa)',
        fontFamily: 'var(--font-mono, monospace)',
      }}
    >
      <summary style={{ cursor: 'pointer', opacity: 0.8 }}>Technical details</summary>
      <pre
        style={{
          marginTop: '8px',
          padding: '10px 12px',
          borderRadius: '10px',
          background: 'rgba(0,0,0,0.45)',
          border: '1px solid rgba(255,255,255,0.08)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          maxHeight: '160px',
          overflow: 'auto',
        }}
      >
        {error.message}
        {errorInfo?.componentStack ? `\n${errorInfo.componentStack}` : ''}
      </pre>
    </details>
  );
}

function ActionButton({
  onClick,
  icon,
  label,
  primary,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  primary?: boolean;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={primary ? 'liquid-glass' : ''}
      style={
        primary
          ? {
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '9px 18px',
              borderRadius: '999px',
              fontSize: '13px',
              fontWeight: 600,
              color: '#fff',
              cursor: 'pointer',
            }
          : {
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '9px 18px',
              borderRadius: '999px',
              fontSize: '13px',
              fontWeight: 500,
              color: 'var(--muted-foreground, #a1a1aa)',
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.12)',
              cursor: 'pointer',
            }
      }
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function errorCopy(error: Error): { title: string; body: string; chunk: boolean } {
  const chunk = isChunkLoadError(error);
  if (chunk) {
    return {
      title: 'Connection interrupted while loading',
      body: 'A network hiccup stopped this module from downloading. Your session, wallet connection, and funds are unaffected — retry the load to continue.',
      chunk,
    };
  }
  return {
    title: 'Something went wrong here',
    body: 'This panel hit an unexpected error and was isolated so the rest of the console keeps running. Retry it, or head back to Overview.',
    chunk,
  };
}

// ---------------------------------------------------------------------------
// RootErrorBoundary — last-resort full-viewport fallback for main.tsx
// ---------------------------------------------------------------------------

export const RootErrorBoundary: React.FC<{
  children: React.ReactNode;
  onNavigateHome?: () => void;
}> = ({ children, onNavigateHome }) => (
  <ErrorBoundary
    label="RootErrorBoundary"
    fallback={({ error, errorInfo, reset }) => {
      const copy = errorCopy(error);
      return (
        <div
          role="alert"
          style={{
            minHeight: '100vh',
            minWidth: '100vw',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            background:
              'radial-gradient(1200px 600px at 50% -10%, rgba(0,255,204,0.08), transparent 60%), #090c13',
            color: '#e7ecf3',
          }}
        >
          <div
            className="glass-card"
            style={{
              maxWidth: '620px',
              width: '100%',
              padding: '40px 36px',
              borderRadius: '20px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              gap: '14px',
            }}
          >
            {copy.chunk ? (
              <WifiIcon width={40} height={40} style={{ color: 'var(--trade-anomaly, #ffb700)' }} />
            ) : (
              <ExclamationTriangleIcon
                width={40}
                height={40}
                style={{ color: 'var(--trade-no, #ff3366)' }}
              />
            )}
            <p
              style={{
                fontSize: '11px',
                letterSpacing: '0.22em',
                textTransform: 'uppercase',
                color: 'var(--muted-foreground, #a1a1aa)',
                fontFamily: 'var(--font-mono, monospace)',
              }}
            >
              DreamPulse Console
            </p>
            <h1 style={{ fontSize: '22px', fontWeight: 700, margin: 0 }}>{copy.title}</h1>
            <p
              style={{
                fontSize: '13px',
                lineHeight: 1.6,
                color: 'var(--muted-foreground, #a1a1aa)',
                margin: 0,
                maxWidth: '480px',
              }}
            >
              {copy.body}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'center', marginTop: '6px' }}>
              <ActionButton
                primary
                onClick={reset}
                icon={<ArrowPathIcon width={15} height={15} />}
                label="Try again"
              />
              <ActionButton
                onClick={() => window.location.reload()}
                icon={<ArrowPathIcon width={15} height={15} />}
                label="Reload app"
              />
              {onNavigateHome ? (
                <ActionButton
                  onClick={() => {
                    reset();
                    onNavigateHome();
                  }}
                  icon={<HomeIcon width={15} height={15} />}
                  label="Back to Overview"
                />
              ) : null}
            </div>
            <ErrorDetails error={error} errorInfo={errorInfo} />
          </div>
        </div>
      );
    }}
  >
    {children}
  </ErrorBoundary>
);

// ---------------------------------------------------------------------------
// ViewErrorBoundary — scoped fallback for one lazy dashboard view / dialog
// ---------------------------------------------------------------------------

export const ViewErrorBoundary: React.FC<{
  children: React.ReactNode;
  /** Human label shown in the fallback, e.g. "Analytics". */
  viewName: string;
  /** Auto-reset when these change (pass the active view so nav recovers). */
  resetKeys?: unknown[];
  /** Compact chrome for modal Suspense blocks; defaults to the card layout. */
  variant?: 'card' | 'minimal';
  onNavigateHome?: () => void;
}> = ({ children, viewName, resetKeys, variant = 'card', onNavigateHome }) => (
  <ErrorBoundary
    label={`ViewErrorBoundary:${viewName}`}
    resetKeys={resetKeys ?? [viewName]}
    fallback={({ error, errorInfo, reset }) => {
      const copy = errorCopy(error);
      if (variant === 'minimal') {
        return (
          <div
            role="alert"
            className="glass-card"
            style={{
              padding: '14px 16px',
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              fontSize: '12px',
              color: 'var(--muted-foreground, #a1a1aa)',
            }}
          >
            <ExclamationTriangleIcon
              width={18}
              height={18}
              style={{ flexShrink: 0, color: 'var(--trade-anomaly, #ffb700)' }}
            />
            <span style={{ flex: 1 }}>
              {viewName} failed to load{copy.chunk ? ' (network hiccup)' : ''}.
            </span>
            <button
              type="button"
              onClick={reset}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '999px',
                fontSize: '12px',
                fontWeight: 600,
                color: '#fff',
                background: 'rgba(0,255,204,0.12)',
                border: '1px solid rgba(0,255,204,0.35)',
                cursor: 'pointer',
              }}
            >
              <ArrowPathIcon width={13} height={13} />
              <span>Retry</span>
            </button>
          </div>
        );
      }
      return (
        <div
          role="alert"
          className="glass-card"
          style={{
            minHeight: '340px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            gap: '12px',
            padding: '40px 24px',
            borderRadius: '16px',
          }}
        >
          {copy.chunk ? (
            <WifiIcon width={32} height={32} style={{ color: 'var(--trade-anomaly, #ffb700)' }} />
          ) : (
            <ExclamationTriangleIcon
              width={32}
              height={32}
              style={{ color: 'var(--trade-no, #ff3366)' }}
            />
          )}
          <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>
            {viewName} {copy.chunk ? 'was interrupted' : 'ran into a problem'}
          </h2>
          <p
            style={{
              fontSize: '12px',
              lineHeight: 1.6,
              color: 'var(--muted-foreground, #a1a1aa)',
              margin: 0,
              maxWidth: '420px',
            }}
          >
            {copy.body}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'center', marginTop: '4px' }}>
            <ActionButton
              primary
              onClick={reset}
              icon={<ArrowPathIcon width={15} height={15} />}
              label={`Reload ${viewName}`}
            />
            {onNavigateHome ? (
              <ActionButton
                onClick={() => {
                  reset();
                  onNavigateHome();
                }}
                icon={<HomeIcon width={15} height={15} />}
                label="Back to Overview"
              />
            ) : null}
          </div>
          <ErrorDetails error={error} errorInfo={errorInfo} />
        </div>
      );
    }}
  >
    {children}
  </ErrorBoundary>
);

// ---------------------------------------------------------------------------
// ViewLoadingFallback — single shared Suspense skeleton for lazy views
// ---------------------------------------------------------------------------

export const ViewLoadingFallback: React.FC<{ label: string }> = ({ label }) => (
  <div
    className="glass-card"
    style={{
      minHeight: '340px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '12px',
    }}
  >
    <Spinner size="lg" />
    <span style={{ fontSize: '13px', color: 'var(--muted-foreground)' }}>Loading {label}...</span>
  </div>
);
