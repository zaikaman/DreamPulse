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
import { Button } from './ui/button.js';

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
        <Button
          size="sm"
          onClick={onConnectWallet}
          className="h-7 text-xs font-semibold px-3 gap-1.5"
        >
          <WalletIcon className="w-3.5 h-3.5" />
          <span>Connect Wallet</span>
        </Button>
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
        <Button
          size="sm"
          onClick={onSwitchNetwork}
          className="h-7 text-xs font-semibold px-3 gap-1.5 bg-amber-500 text-black hover:bg-amber-400"
        >
          <BoltIcon className="w-3.5 h-3.5" />
          <span>Switch to Somnia (50312)</span>
        </Button>
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
              <Button
                variant="ghost"
                size="sm"
                className="operator-chip h-auto p-0 font-normal hover:bg-transparent"
                onClick={handleCopy}
                title="Click to copy Somnia Delegated Operator address"
              >
                <code>{SOMNIA_ADDRESSES.operatorAccount.slice(0, 6)}...{SOMNIA_ADDRESSES.operatorAccount.slice(-4)}</code>
                {copied ? <CheckIcon className="w-3 h-3 copy-success-icon" /> : <DocumentDuplicateIcon className="w-3 h-3" />}
              </Button>
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
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => onClaimFaucet(1000)}
                    disabled={isFauceting}
                    className="h-6 text-[10px] px-2 gap-1 border-border/60 bg-secondary/80 text-foreground hover:bg-secondary ml-1"
                  >
                    {isFauceting ? <Spinner size="xs" variant="amber" /> : <CurrencyDollarIcon className="w-3 h-3" />}
                    <span>Claim 1k tUSDC</span>
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="session-banner-actions">
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenModal}
            title="Configure Session Limits"
            className="h-7 text-xs px-2.5 gap-1.5 border-border/60 bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground"
          >
            <AdjustmentsHorizontalIcon className="w-3.5 h-3.5" />
            <span>Limits</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onRevokeSession}
            title="Instantly Revoke Session Authorization"
            className="h-7 text-xs px-2.5 gap-1.5 border-rose-500/30 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 hover:text-rose-300"
          >
            <XCircleIcon className="w-3.5 h-3.5" />
            <span>Revoke</span>
          </Button>
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => onClaimFaucet(1000)}
            disabled={isFauceting}
            className="h-7 text-xs px-2.5 gap-1.5 border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
          >
            {isFauceting ? <Spinner size="xs" variant="amber" /> : <CurrencyDollarIcon className="w-3 h-3" />}
            <span>Claim 1,000 tUSDC Faucet</span>
          </Button>
        )}
        <Button
          size="sm"
          onClick={onOpenModal}
          className="h-7 text-xs font-semibold px-3 gap-1.5"
        >
          <KeyIcon className="w-3.5 h-3.5" />
          <span>Authorize Session</span>
          <ChevronRightIcon className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
};
