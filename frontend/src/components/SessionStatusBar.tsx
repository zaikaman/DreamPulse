import React, { useState, useEffect } from 'react';
import {
  KeyIcon,
  ShieldCheckIcon,
  ShieldExclamationIcon,
  AdjustmentsHorizontalIcon,
  XCircleIcon,
  DocumentDuplicateIcon,
  CheckIcon,
  BoltIcon,
  WalletIcon,
  ClockIcon,
  ChevronRightIcon,
  CurrencyDollarIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import type { SessionGrant } from '../types/index.js';
import type { WalletState } from '../hooks/useSessionKey.js';
import { SOMNIA_ADDRESSES } from '../services/web3.js';
import { Spinner } from './ui/Spinner.js';

interface SessionStatusBarProps {
  wallet: WalletState;
  activeSession: SessionGrant | null;
  isFauceting?: boolean;
  onClaimFaucet?: (amount?: number) => Promise<void>;
  onOpenModal: () => void;
  onRevokeSession: () => Promise<void>;
  onConnectWallet: () => Promise<void>;
  onSwitchNetwork: () => Promise<void>;
}

export const SessionStatusBar: React.FC<SessionStatusBarProps> = ({
  wallet,
  activeSession,
  isFauceting = false,
  onClaimFaucet,
  onOpenModal,
  onRevokeSession,
  onConnectWallet,
  onSwitchNetwork,
}) => {
  const isConnected = wallet.isConnected;
  const isCorrectNetwork = wallet.isCorrectNetwork;
  const isSessionActive = isConnected && isCorrectNetwork && activeSession?.isActive;
  const [copied, setCopied] = useState<boolean>(false);
  const [timeRemaining, setTimeRemaining] = useState<string>('');

  const collateralNum = parseFloat(wallet.balanceCollateral || '0');
  const isCollateralZero = isConnected && isCorrectNetwork && collateralNum === 0;

  // Compute Time Remaining
  useEffect(() => {
    if (!activeSession?.expiresAt) {
      setTimeRemaining('');
      return;
    }

    const updateTimer = () => {
      const expiry = new Date(activeSession.expiresAt).getTime();
      const now = Date.now();
      const diffMs = expiry - now;

      if (diffMs <= 0) {
        setTimeRemaining('Expired');
        return;
      }

      const totalSec = Math.floor(diffMs / 1000);
      const hours = Math.floor(totalSec / 3600);
      const mins = Math.floor((totalSec % 3600) / 60);
      const secs = totalSec % 60;

      if (hours > 0) {
        setTimeRemaining(`${hours}h ${mins}m`);
      } else {
        setTimeRemaining(`${mins}m ${secs}s`);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [activeSession?.expiresAt]);

  const handleCopy = () => {
    navigator.clipboard.writeText(SOMNIA_ADDRESSES.operatorAccount);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Not Connected State
  if (!isConnected) {
    return (
      <div className="session-status-banner unlinked">
        <div className="session-banner-left">
          <div className="status-badge-dot neutral">
            <ShieldExclamationIcon className="w-3.5 h-3.5" />
          </div>
          <div className="session-banner-text">
            <span className="session-banner-title">Non-Custodial Session Inactive</span>
            <span className="session-banner-desc">
              Connect Web3 wallet to authorize autonomous trading bots with deterministic risk caps.
            </span>
          </div>
        </div>
        <button
          type="button"
          className="btn-banner-action primary"
          onClick={onConnectWallet}
        >
          <WalletIcon className="w-3 h-3" />
          <span>Connect Wallet</span>
        </button>
      </div>
    );
  }

  // Wrong Network State
  if (!isCorrectNetwork) {
    return (
      <div className="session-status-banner warning">
        <div className="session-banner-left">
          <div className="status-badge-dot warning">
            <BoltIcon className="w-3.5 h-3.5" />
          </div>
          <div className="session-banner-text">
            <span className="session-banner-title">Wrong Network Detected</span>
            <span className="session-banner-desc">
              Somnia Shannon Testnet (Chain ID 50312) required for high-throughput CLOB operations.
            </span>
          </div>
        </div>
        <button
          type="button"
          className="btn-banner-action warning"
          onClick={onSwitchNetwork}
        >
          <BoltIcon className="w-3 h-3" />
          <span>Switch to Somnia (50312)</span>
        </button>
      </div>
    );
  }

  // Active Session Display
  if (isSessionActive && activeSession) {
    const spent = Number(activeSession.spentToday || 0);
    const cap = Number(activeSession.dailyVolumeCap || 1);
    const spentPercent = Math.min(100, Math.max(0, (spent / cap) * 100));

    return (
      <div className="session-status-banner active">
        <div className="session-banner-left">
          <div className="status-badge-dot active" title="Active Non-Custodial Session">
            <span className="live-dot-green"></span>
            <ShieldCheckIcon className="w-3.5 h-3.5" />
          </div>

          <div className="session-banner-metrics">
            <div className="session-metric-item">
              <span className="metric-label">OPERATOR</span>
              <div
                className="operator-chip"
                onClick={handleCopy}
                title="Click to copy Somnia Delegated Operator address"
              >
                <code>{SOMNIA_ADDRESSES.operatorAccount.slice(0, 6)}...{SOMNIA_ADDRESSES.operatorAccount.slice(-4)}</code>
                {copied ? <CheckIcon className="w-3 h-3 copy-success-icon" /> : <DocumentDuplicateIcon className="w-3 h-3" />}
              </div>
            </div>

            <div className="session-metric-divider"></div>

            <div className="session-metric-item">
              <span className="metric-label">SINGLE CAP</span>
              <span className="metric-value tabular-num">{activeSession.maxTradeSize} tUSDC</span>
            </div>

            <div className="session-metric-divider"></div>

            <div className="session-metric-item budget-meter-item">
              <div className="budget-label-row">
                <span className="metric-label">24H VOLUME BUDGET</span>
                <span className="budget-numbers tabular-num">
                  {spent.toFixed(1)} / {cap} tUSDC ({spentPercent.toFixed(0)}%)
                </span>
              </div>
              <div className="budget-progress-track">
                <div
                  className="budget-progress-fill"
                  style={{
                    width: `${spentPercent}%`,
                    backgroundColor:
                      spentPercent > 85
                        ? 'hsl(var(--destructive))'
                        : spentPercent > 60
                        ? '#f59e0b'
                        : 'hsl(var(--primary))',
                  }}
                ></div>
              </div>
            </div>

            <div className="session-metric-divider"></div>

            <div className="session-metric-item">
              <span className="metric-label">EXPIRES</span>
              <div className="expiry-chip">
                <ClockIcon className="w-3 h-3" />
                <span className="tabular-num">{timeRemaining}</span>
              </div>
            </div>

            {isCollateralZero && onClaimFaucet && (
              <>
                <div className="session-metric-divider"></div>
                <div className="session-metric-item" style={{ color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <ExclamationTriangleIcon className="w-3 h-3 text-amber-400" />
                  <span style={{ fontSize: '11px', fontWeight: 500 }} className="font-mono text-muted-foreground">0.00 tUSDC Collateral</span>
                  <button
                    type="button"
                    onClick={() => onClaimFaucet(1000)}
                    disabled={isFauceting}
                    className="px-2 py-0.5 text-[10px] font-mono rounded bg-secondary/80 text-foreground border border-border/60 hover:bg-secondary cursor-pointer inline-flex items-center gap-1 transition-colors ml-1"
                  >
                    {isFauceting ? <Spinner size="xs" variant="amber" /> : <CurrencyDollarIcon className="w-2.5 h-2.5" />}
                    <span>Claim 1k tUSDC</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="session-banner-actions">
          <button
            type="button"
            className="btn-subtle-config"
            onClick={onOpenModal}
            title="Configure Session Limits"
          >
            <AdjustmentsHorizontalIcon className="w-3 h-3" />
            <span>Limits</span>
          </button>
          <button
            type="button"
            className="btn-revoke-compact"
            onClick={onRevokeSession}
            title="Instantly Revoke Session Authorization"
          >
            <XCircleIcon className="w-3 h-3" />
            <span>Revoke</span>
          </button>
        </div>
      </div>
    );
  }

  // Connected but No Active Session
  return (
    <div className="session-status-banner inactive">
      <div className="session-banner-left">
        <div className="status-badge-dot neutral">
          <KeyIcon className="w-3.5 h-3.5" />
        </div>
        <div className="session-banner-text">
          <span className="session-banner-title">
            No Active Session Delegation {isCollateralZero && <span style={{ color: 'var(--color-anomaly)', fontSize: '11px', marginLeft: '6px' }}>(0.00 tUSDC Collateral)</span>}
          </span>
          <span className="session-banner-desc">
            Authorize autonomous agents with 1-click EIP-712 signing & zero-withdrawal risk ceilings.
          </span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {isCollateralZero && onClaimFaucet && (
          <button
            type="button"
            className="btn-banner-action"
            onClick={() => onClaimFaucet(1000)}
            disabled={isFauceting}
            style={{ background: 'rgba(245, 158, 11, 0.15)', borderColor: 'rgba(245, 158, 11, 0.4)', color: 'var(--color-anomaly)' }}
          >
            {isFauceting ? <Spinner size="xs" variant="amber" /> : <CurrencyDollarIcon className="w-3.5 h-3.5" />}
            <span>Claim 1,000 tUSDC Faucet</span>
          </button>
        )}
        <button
          type="button"
          className="btn-banner-action primary"
          onClick={onOpenModal}
        >
          <KeyIcon className="w-3 h-3" />
          <span>Authorize Session</span>
          <ChevronRightIcon className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
};
