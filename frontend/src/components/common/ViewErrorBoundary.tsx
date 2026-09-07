import React from 'react';
import {
  ArrowPathIcon,
  ExclamationTriangleIcon,
  HomeIcon,
  WifiIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';
import { Spinner } from '../ui/Spinner.js';
import { isChunkLoadError } from '../../lib/lazy-with-retry.js';

export interface ViewErrorBoundaryProps {
  children: React.ReactNode;
  /** Human label shown in the fallback, e.g. "Trade Terminal". */
  viewName: string;
  /** Auto-reset when these change (pass the active view so navigation recovers). */
  resetKeys?: unknown[];
  /** Compact chrome for modal Suspense blocks; defaults to the card layout. */
  variant?: 'card' | 'minimal';
  /** Optional callback to return to the overview page */
  onNavigateHome?: () => void;
  /** Optional custom fallback override */
  fallback?: (props: {
    error: Error;
    errorInfo: React.ErrorInfo | null;
    reset: () => void;
  }) => React.ReactNode;
}

interface ViewErrorBoundaryState {
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

function reportViewError(viewName: string, error: Error, errorInfo: React.ErrorInfo): void {
  try {
    // eslint-disable-next-line no-console
    console.error(`[DreamPulse:ViewErrorBoundary:${viewName}]`, error, errorInfo.componentStack);
  } catch {
    /* logging must never throw */
  }
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('dreampulse:error', {
          detail: {
            label: `ViewErrorBoundary:${viewName}`,
            message: error.message,
            stack: error.stack ?? null,
            componentStack: errorInfo.componentStack ?? null,
          },
        }),
      );
    }
  } catch {
    /* event dispatch must never throw */
  }
}

export class ViewErrorBoundary extends React.Component<
  ViewErrorBoundaryProps,
  ViewErrorBoundaryState
> {
  state: ViewErrorBoundaryState = { error: null, errorInfo: null };

  static getDerivedStateFromError(error: Error): Partial<ViewErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    this.setState({ errorInfo });
    reportViewError(this.props.viewName, error, errorInfo);
  }

  componentDidUpdate(prevProps: ViewErrorBoundaryProps): void {
    if (this.state.error === null) return;
    const prev = prevProps.resetKeys ?? [prevProps.viewName];
    const next = this.props.resetKeys ?? [this.props.viewName];
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
  };

  render(): React.ReactNode {
    const { error, errorInfo } = this.state;
    const { children, viewName, variant = 'card', onNavigateHome, fallback } = this.props;

    if (error === null) {
      return children;
    }

    if (fallback) {
      return fallback({ error, errorInfo, reset: this.reset });
    }

    const isChunk = isChunkLoadError(error);

    if (variant === 'minimal') {
      return (
        <div
          role="alert"
          className="glass-card"
          style={{
            padding: '12px 16px',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            fontSize: '12px',
            color: '#94a3b8',
            background: 'rgba(13, 19, 32, 0.85)',
            border: '1px solid rgba(255, 183, 0, 0.25)',
          }}
        >
          {isChunk ? (
            <WifiIcon width={18} height={18} style={{ flexShrink: 0, color: '#ffb700' }} />
          ) : (
            <ExclamationTriangleIcon
              width={18}
              height={18}
              style={{ flexShrink: 0, color: '#ff3366' }}
            />
          )}
          <span style={{ flex: 1, color: '#e2e8f0' }}>
            {viewName} failed to load{isChunk ? ' (network interruption)' : ''}.
          </span>
          <button
            type="button"
            onClick={this.reset}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '999px',
              fontSize: '12px',
              fontWeight: 600,
              color: '#090c13',
              background: '#00ffcc',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 0 10px rgba(0, 255, 204, 0.3)',
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
          minHeight: '360px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          gap: '14px',
          padding: '40px 24px',
          borderRadius: '16px',
          background: 'rgba(13, 19, 32, 0.85)',
          border: '1px solid rgba(0, 255, 204, 0.18)',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
        }}
      >
        <div
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '14px',
            background: isChunk ? 'rgba(255, 183, 0, 0.1)' : 'rgba(255, 51, 102, 0.1)',
            border: `1px solid ${isChunk ? 'rgba(255, 183, 0, 0.25)' : 'rgba(255, 51, 102, 0.25)'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {isChunk ? (
            <WifiIcon width={24} height={24} style={{ color: '#ffb700' }} />
          ) : (
            <ExclamationTriangleIcon width={24} height={24} style={{ color: '#ff3366' }} />
          )}
        </div>

        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: '#ffffff' }}>
            {viewName} {isChunk ? 'Transfer Interrupted' : 'Encountered a Fault'}
          </h2>
          <p
            style={{
              fontSize: '12.5px',
              lineHeight: 1.6,
              color: '#94a3b8',
              margin: '8px 0 0',
              maxWidth: '440px',
            }}
          >
            {isChunk
              ? 'A temporary network hiccup stopped this module from downloading. Your wallet connection and funds are untouched.'
              : 'This panel encountered an unexpected rendering error and was safely isolated so the rest of the console remains operational.'}
          </p>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'center', marginTop: '4px' }}>
          <button
            type="button"
            onClick={this.reset}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 18px',
              borderRadius: '999px',
              fontSize: '12.5px',
              fontWeight: 600,
              color: '#090c13',
              background: '#00ffcc',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 0 15px rgba(0, 255, 204, 0.3)',
            }}
          >
            <ArrowPathIcon width={14} height={14} />
            <span>Reload {viewName}</span>
          </button>

          {onNavigateHome && (
            <button
              type="button"
              onClick={() => {
                this.reset();
                onNavigateHome();
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                borderRadius: '999px',
                fontSize: '12.5px',
                fontWeight: 500,
                color: '#94a3b8',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                cursor: 'pointer',
              }}
            >
              <HomeIcon width={14} height={14} />
              <span>Back to Overview</span>
            </button>
          )}
        </div>

        {/* Technical Details Accordion */}
        <details
          style={{
            width: '100%',
            maxWidth: '520px',
            marginTop: '8px',
            fontSize: '11px',
            color: '#94a3b8',
            fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
          }}
        >
          <summary
            style={{
              cursor: 'pointer',
              opacity: 0.8,
              textAlign: 'center',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
            }}
          >
            <span>Technical details</span>
            <ChevronDownIcon width={12} height={12} />
          </summary>
          <pre
            style={{
              marginTop: '8px',
              padding: '10px 12px',
              borderRadius: '8px',
              background: 'rgba(0, 0, 0, 0.5)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: '140px',
              overflowY: 'auto',
              textAlign: 'left',
              color: '#cbd5e1',
            }}
          >
            {error.message}
            {errorInfo?.componentStack ? `\n\n${errorInfo.componentStack}` : ''}
          </pre>
        </details>
      </div>
    );
  }
}

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
    <span style={{ fontSize: '13px', color: 'var(--muted-foreground, #a1a1aa)' }}>
      Loading {label}...
    </span>
  </div>
);

export default ViewErrorBoundary;
