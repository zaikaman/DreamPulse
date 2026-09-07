import React from 'react';
import {
  ArrowPathIcon,
  ExclamationTriangleIcon,
  WifiIcon,
  ClipboardDocumentIcon,
  ClipboardDocumentCheckIcon,
  TrashIcon,
  ShieldCheckIcon,
  CommandLineIcon,
} from '@heroicons/react/24/outline';
import { isChunkLoadError } from '../../lib/lazy-with-retry.js';

export interface GlobalErrorBoundaryProps {
  children: React.ReactNode;
  /** Optional custom fallback renderer */
  fallback?: (props: {
    error: Error;
    errorInfo: React.ErrorInfo | null;
    reset: () => void;
  }) => React.ReactNode;
  /** Label for diagnostics and event logs */
  label?: string;
  /** Lifecycle hook when an error is caught */
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  /** Lifecycle hook when state resets */
  onReset?: () => void;
}

interface GlobalErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  copied: boolean;
  showDetails: boolean;
}

function dispatchTelemetryError(label: string, error: Error, errorInfo: React.ErrorInfo): void {
  try {
    // eslint-disable-next-line no-console
    console.error(`[DreamPulse:${label}]`, error, errorInfo.componentStack);
  } catch {
    /* logging must never throw */
  }
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('dreampulse:error', {
          detail: {
            label,
            name: error.name,
            message: error.message,
            stack: error.stack ?? null,
            componentStack: errorInfo.componentStack ?? null,
            timestamp: new Date().toISOString(),
          },
        }),
      );
    }
  } catch {
    /* dispatch must never throw */
  }
}

export class GlobalErrorBoundary extends React.Component<
  GlobalErrorBoundaryProps,
  GlobalErrorBoundaryState
> {
  private copyTimeout: number | null = null;

  constructor(props: GlobalErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      copied: false,
      showDetails: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<GlobalErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    const label = this.props.label ?? 'GlobalErrorBoundary';
    this.setState({ errorInfo });
    dispatchTelemetryError(label, error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  componentWillUnmount(): void {
    if (this.copyTimeout !== null && typeof window !== 'undefined') {
      window.clearTimeout(this.copyTimeout);
    }
  }

  reset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      copied: false,
      showDetails: false,
    });
    this.props.onReset?.();
  };

  handleReload = (): void => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  handleHardReset = (): void => {
    try {
      if (typeof window !== 'undefined') {
        localStorage.clear();
        sessionStorage.clear();
        window.location.hash = '';
        window.location.reload();
      }
    } catch {
      this.handleReload();
    }
  };

  handleCopyDiagnostics = async (): Promise<void> => {
    const { error, errorInfo } = this.state;
    if (!error) return;

    const report = [
      '==============================================',
      '   DREAMPULSE CORE DIAGNOSTIC REPORT',
      '==============================================',
      `Timestamp:     ${new Date().toISOString()}`,
      `Error Name:    ${error.name}`,
      `Error Message: ${error.message}`,
      `Current URL:   ${typeof window !== 'undefined' ? window.location.href : 'SSR'}`,
      `User Agent:    ${typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown'}`,
      '',
      '--- Error Call Stack ---',
      error.stack || 'No JS stack available',
      '',
      '--- React Component Hierarchy ---',
      errorInfo?.componentStack || 'No component stack available',
      '==============================================',
    ].join('\n');

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(report);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = report;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      this.setState({ copied: true });
      if (this.copyTimeout !== null && typeof window !== 'undefined') {
        window.clearTimeout(this.copyTimeout);
      }
      this.copyTimeout = window.setTimeout(() => {
        this.setState({ copied: false });
      }, 2500);
    } catch {
      /* clipboard write failed */
    }
  };

  render(): React.ReactNode {
    const { hasError, error, errorInfo, copied } = this.state;
    const { children, fallback } = this.props;

    if (!hasError || !error) {
      return children;
    }

    if (fallback) {
      return fallback({ error, errorInfo, reset: this.reset });
    }

    const isChunk = isChunkLoadError(error);

    return (
      <div
        role="alert"
        aria-live="assertive"
        style={{
          minHeight: '100vh',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          background: 'radial-gradient(1400px 700px at 50% -5%, rgba(0, 255, 204, 0.09), transparent 65%), #080b11',
          color: '#e2e8f0',
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            maxWidth: '680px',
            width: '100%',
            background: 'rgba(13, 19, 32, 0.88)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(0, 255, 204, 0.2)',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.75), 0 0 40px rgba(0, 255, 204, 0.08)',
            borderRadius: '20px',
            padding: '40px 32px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: '16px',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Subtle Top Glowing Line */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: '15%',
              right: '15%',
              height: '1px',
              background: isChunk
                ? 'linear-gradient(90deg, transparent, #ffb700, transparent)'
                : 'linear-gradient(90deg, transparent, #ff3366, transparent)',
            }}
          />

          {/* Status Badge */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '5px 14px',
              borderRadius: '999px',
              background: isChunk ? 'rgba(255, 183, 0, 0.12)' : 'rgba(255, 51, 102, 0.12)',
              border: `1px solid ${isChunk ? 'rgba(255, 183, 0, 0.35)' : 'rgba(255, 51, 102, 0.35)'}`,
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: isChunk ? '#ffb700' : '#ff3366',
              fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: isChunk ? '#ffb700' : '#ff3366',
                boxShadow: `0 0 8px ${isChunk ? '#ffb700' : '#ff3366'}`,
              }}
            />
            <span>{isChunk ? 'Network Transfer Disrupted' : 'Interface Exception Intercepted'}</span>
          </div>

          {/* Hero Icon */}
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '16px',
              background: isChunk ? 'rgba(255, 183, 0, 0.1)' : 'rgba(255, 51, 102, 0.1)',
              border: `1px solid ${isChunk ? 'rgba(255, 183, 0, 0.25)' : 'rgba(255, 51, 102, 0.25)'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: '4px',
            }}
          >
            {isChunk ? (
              <WifiIcon width={28} height={28} style={{ color: '#ffb700' }} />
            ) : (
              <ExclamationTriangleIcon width={28} height={28} style={{ color: '#ff3366' }} />
            )}
          </div>

          {/* Title & Subtitle */}
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: '22px',
                fontWeight: 700,
                letterSpacing: '-0.02em',
                color: '#ffffff',
              }}
            >
              {isChunk ? 'Resource Connection Interrupted' : 'DreamPulse Console Halted'}
            </h1>
            <p
              style={{
                margin: '10px 0 0',
                fontSize: '13px',
                lineHeight: 1.6,
                color: '#94a3b8',
                maxWidth: '500px',
              }}
            >
              {isChunk
                ? 'A dynamic script asset could not be downloaded over the network. Your wallet credentials, non-custodial session key, and collateral are completely secure.'
                : 'An unhandled render exception occurred. The error boundary caught it to prevent browser lockup. Non-custodial session contracts and on-chain funds remain safe.'}
            </p>
          </div>

          {/* Action Button Row */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '12px',
              justifyContent: 'center',
              marginTop: '8px',
              width: '100%',
            }}
          >
            <button
              type="button"
              onClick={this.handleReload}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 20px',
                borderRadius: '999px',
                fontSize: '13px',
                fontWeight: 600,
                color: '#090c13',
                background: '#00ffcc',
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 0 20px rgba(0, 255, 204, 0.4)',
                transition: 'transform 0.15s ease, box-shadow 0.15s ease',
              }}
            >
              <ArrowPathIcon width={16} height={16} />
              <span>Reload Application</span>
            </button>

            <button
              type="button"
              onClick={this.reset}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 18px',
                borderRadius: '999px',
                fontSize: '13px',
                fontWeight: 500,
                color: '#e2e8f0',
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.16)',
                cursor: 'pointer',
              }}
            >
              <ShieldCheckIcon width={16} height={16} style={{ color: '#00ffcc' }} />
              <span>Try Resetting View</span>
            </button>

            <button
              type="button"
              onClick={this.handleHardReset}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 18px',
                borderRadius: '999px',
                fontSize: '13px',
                fontWeight: 500,
                color: '#94a3b8',
                background: 'transparent',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                cursor: 'pointer',
              }}
              title="Clears local cache and reloads page"
            >
              <TrashIcon width={15} height={15} />
              <span>Hard Refresh & Clear Cache</span>
            </button>
          </div>

          {/* Diagnostic Accordion */}
          <details
            style={{
              width: '100%',
              marginTop: '12px',
              textAlign: 'left',
              background: 'rgba(0, 0, 0, 0.35)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '12px',
              overflow: 'hidden',
            }}
          >
            <summary
              style={{
                padding: '12px 16px',
                fontSize: '12px',
                fontWeight: 600,
                color: '#cbd5e1',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
                userSelect: 'none',
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <CommandLineIcon width={15} height={15} style={{ color: '#00ffcc' }} />
                <span>Diagnostic Telemetry & Stack Trace</span>
              </span>
              <span
                style={{
                  fontSize: '10px',
                  color: '#64748b',
                  background: 'rgba(255, 255, 255, 0.05)',
                  padding: '2px 8px',
                  borderRadius: '6px',
                }}
              >
                {error.name || 'Error'}
              </span>
            </summary>

            <div style={{ padding: '0 16px 16px', fontSize: '11px' }}>
              {/* Copy Diagnostics Button */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
                <button
                  type="button"
                  onClick={this.handleCopyDiagnostics}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '5px 12px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: copied ? '#00ffcc' : '#94a3b8',
                    background: copied ? 'rgba(0, 255, 204, 0.1)' : 'rgba(255, 255, 255, 0.06)',
                    border: copied ? '1px solid rgba(0, 255, 204, 0.3)' : '1px solid rgba(255, 255, 255, 0.1)',
                    cursor: 'pointer',
                  }}
                >
                  {copied ? (
                    <>
                      <ClipboardDocumentCheckIcon width={14} height={14} style={{ color: '#00ffcc' }} />
                      <span>Diagnostics Copied!</span>
                    </>
                  ) : (
                    <>
                      <ClipboardDocumentIcon width={14} height={14} />
                      <span>Copy Full Diagnostics</span>
                    </>
                  )}
                </button>
              </div>

              {/* Error Message Box */}
              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: '8px',
                  background: 'rgba(255, 51, 102, 0.08)',
                  border: '1px solid rgba(255, 51, 102, 0.2)',
                  color: '#ff8099',
                  fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
                  marginBottom: '10px',
                  wordBreak: 'break-word',
                }}
              >
                <strong>{error.name}:</strong> {error.message}
              </div>

              {/* Stack Trace Pre */}
              <pre
                style={{
                  margin: 0,
                  padding: '12px',
                  borderRadius: '8px',
                  background: '#04070c',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  color: '#94a3b8',
                  fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
                  fontSize: '10.5px',
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  maxHeight: '200px',
                  overflowY: 'auto',
                }}
              >
                {error.stack || 'No JavaScript call stack available.'}
                {errorInfo?.componentStack ? `\n\nComponent Hierarchy:\n${errorInfo.componentStack}` : ''}
              </pre>
            </div>
          </details>
        </div>
      </div>
    );
  }
}

export default GlobalErrorBoundary;
