import React, { useState, useEffect } from 'react';
import {
  KeyIcon,
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
  SparklesIcon,
  CpuChipIcon,
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
} from '@heroicons/react/24/outline';
import type { SessionGrant } from '../types/index.js';
import type { WalletState } from '../hooks/useSessionKey.js';
import { SOMNIA_ADDRESSES } from '../services/web3.js';
import { apiClient } from '../services/api.js';
import { Spinner } from './ui/Spinner.js';
import { Button } from './ui/button.js';
import {
  formatCapAmount,
  formatSessionTimeRemaining,
  isUnlimitedAmount,
} from '../lib/sessionUtils.js';

interface SessionStatusBarProps {
  wallet: WalletState;
  activeSession: SessionGrant | null;
  isFauceting?: boolean;
  onClaimFaucet?: (amount?: number) => Promise<void>;
  onOpenModal: (options?: { revoke?: boolean }) => void;
  onOpenFleetRisk?: () => void;
  onConnectWallet: () => Promise<void>;
  onSwitchNetwork: () => Promise<void>;
  isCopyTradeEnabled?: boolean;
  onToggleCopyTrade?: (enabled: boolean) => Promise<boolean>;
  deployedCustomCount?: number;
  cloneAddress?: string | null;
  cloneBalance?: string;
  onWithdrawClone?: (amount?: number) => Promise<void>;
  onOpenTradingWallet?: (tab: 'deposit' | 'withdraw') => void;
  onOpenRiskModal?: () => void;
}

export const SessionStatusBar: React.FC<SessionStatusBarProps> = ({
  wallet,
  activeSession,
  isFauceting = false,
  onClaimFaucet,
  onOpenModal,
  onOpenFleetRisk,
  onConnectWallet,
  onSwitchNetwork,
  isCopyTradeEnabled,
  onToggleCopyTrade,
  deployedCustomCount = 0,
  cloneAddress,
  cloneBalance,
  onWithdrawClone,
  onOpenTradingWallet,
  onOpenRiskModal,
}) => {
  const isConnected = wallet.isConnected;
  const isCorrectNetwork = wallet.isCorrectNetwork;
  const isSessionActive = isConnected && isCorrectNetwork && activeSession?.isActive;
  const [copied, setCopied] = useState<boolean>(false);
  const [timeRemaining, setTimeRemaining] = useState<string>('');
  const [localCopyEnabled, setLocalCopyEnabled] = useState<boolean | null>(() => {
    if (typeof activeSession?.copyTradeEnabled === 'boolean') {
      return activeSession.copyTradeEnabled;
    }
    if (typeof isCopyTradeEnabled === 'boolean') {
      return isCopyTradeEnabled;
    }
    return null;
  });
  const [optimisticCopyEnabled, setOptimisticCopyEnabled] = useState<boolean | null>(null);
  const [isTogglingCopy, setIsTogglingCopy] = useState<boolean>(false);

  useEffect(() => {
    if (activeSession && typeof activeSession.copyTradeEnabled === 'boolean') {
      setLocalCopyEnabled(activeSession.copyTradeEnabled);
    }
  }, [activeSession?.copyTradeEnabled]);

  // Once the parent prop synchronizes to the optimistic target, clear optimistic override
  useEffect(() => {
    if (isCopyTradeEnabled !== undefined && optimisticCopyEnabled !== null) {
      if (isCopyTradeEnabled === optimisticCopyEnabled) {
        setOptimisticCopyEnabled(null);
      }
    }
  }, [isCopyTradeEnabled, optimisticCopyEnabled]);

  const activeCopyTrade = optimisticCopyEnabled !== null
    ? optimisticCopyEnabled
    : (typeof isCopyTradeEnabled === 'boolean'
        ? isCopyTradeEnabled
        : (localCopyEnabled ?? activeSession?.copyTradeEnabled ?? false));

  const collateralNum = parseFloat(wallet.balanceCollateral || '0');
  const isCollateralZero = isConnected && isCorrectNetwork && collateralNum === 0;

  // Compute Time Remaining
  useEffect(() => {
    if (!activeSession?.expiresAt) {
      setTimeRemaining('');
      return;
    }

    const updateTimer = () => {
      setTimeRemaining(formatSessionTimeRemaining(activeSession.expiresAt));
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [activeSession?.expiresAt]);

  const handleCopy = () => {
    const toCopy = activeSession?.sessionKeyAddress || SOMNIA_ADDRESSES.operatorAccount;
    navigator.clipboard.writeText(toCopy);
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
            <span className="session-banner-title">Direct Wallet Execution (Manual)</span>
            <span className="session-banner-subtitle">
              Connect Web3 wallet to authorize non-custodial session key for 1-click execution & autonomous agent swarm.
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
      <div className="session-status-banner wrong-network">
        <div className="session-banner-left">
          <div className="status-badge-dot warning">
            <BoltIcon className="w-3.5 h-3.5" />
          </div>
          <div className="session-banner-text">
            <span className="session-banner-title">Wrong Network Detected</span>
            <span className="session-banner-subtitle">
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

  // Execution Mode Pill Renderer
  const renderExecutionMode = () => {
    const hasCustom = deployedCustomCount > 0;
    const hasProtocol = activeCopyTrade;

    let modeLabel = 'COPILOT ONLY';
    let modeBg = 'rgba(245, 158, 11, 0.12)';
    let modeColor = '#fbbf24';
    let modeBorder = 'rgba(245, 158, 11, 0.25)';
    let modeIcon = <BoltIcon className="w-3 h-3" />;
    let tooltipText = 'Terminal Copilot Only — Click to toggle Swarm Mirroring or deploy custom agents in Strategy Studio.';

    if (hasCustom && hasProtocol) {
      modeLabel = `HYBRID (${deployedCustomCount}C + SWARM)`;
      modeBg = 'rgba(16, 185, 129, 0.14)';
      modeColor = '#34d399';
      modeBorder = 'rgba(16, 185, 129, 0.28)';
      modeIcon = <SparklesIcon className="w-3 h-3 text-emerald-400" />;
      tooltipText = `Hybrid Fleet: ${deployedCustomCount} custom agent(s) & Protocol Swarm Mirror active. Click to disable Protocol Mirror.`;
    } else if (hasCustom && !hasProtocol) {
      modeLabel = `CUSTOM FLEET (${deployedCustomCount})`;
      modeBg = 'rgba(168, 85, 247, 0.14)';
      modeColor = '#c084fc';
      modeBorder = 'rgba(168, 85, 247, 0.3)';
      modeIcon = <CpuChipIcon className="w-3 h-3 text-purple-400" />;
      tooltipText = `Custom Fleet: ${deployedCustomCount} custom agent(s) trading autonomously. Protocol Swarm Mirror is OFF. Click to enable Swarm Mirror.`;
    } else if (!hasCustom && hasProtocol) {
      modeLabel = 'SWARM MIRROR';
      modeBg = 'rgba(56, 189, 248, 0.14)';
      modeColor = '#38bdf8';
      modeBorder = 'rgba(56, 189, 248, 0.28)';
      modeIcon = <BoltIcon className="w-3 h-3 text-sky-400" />;
      tooltipText = 'Protocol Swarm Mirror is active — Click to disable (Terminal Copilot Only).';
    }

    const handleToggle = async () => {
      const next = !activeCopyTrade;
      setOptimisticCopyEnabled(next);
      setIsTogglingCopy(true);
      if (activeSession) {
        activeSession.copyTradeEnabled = next;
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('dreampulse:session-update', { detail: { copyTradeEnabled: next } }));
      }
      try {
        let success = true;
        if (onToggleCopyTrade) {
          success = await onToggleCopyTrade(next);
        } else if (wallet.address) {
          const res = await apiClient.toggleCopyTrade(wallet.address, next);
          success = res?.success ?? true;
        }
        if (success === false) {
          setOptimisticCopyEnabled(!next);
          if (activeSession) {
            activeSession.copyTradeEnabled = !next;
          }
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('dreampulse:session-update', { detail: { copyTradeEnabled: !next } }));
          }
        } else {
          setLocalCopyEnabled(next);
        }
      } catch (e) {
        console.error('Failed to toggle copy-trade:', e);
        setOptimisticCopyEnabled(!next);
        if (activeSession) {
          activeSession.copyTradeEnabled = !next;
        }
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('dreampulse:session-update', { detail: { copyTradeEnabled: !next } }));
        }
      } finally {
        setIsTogglingCopy(false);
      }
    };

    return (
      <button
        type="button"
        disabled={isTogglingCopy}
        onClick={handleToggle}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-mono font-bold border transition-all duration-150 cursor-pointer hover:opacity-90 disabled:opacity-85 select-none active:scale-95"
        style={{
          background: modeBg,
          color: modeColor,
          borderColor: modeBorder,
        }}
        title={tooltipText}
      >
        {modeIcon}
        <span>{modeLabel}</span>
        {isTogglingCopy && (
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-current animate-ping ml-0.5" title="Syncing..." />
        )}
      </button>
    );
  };

  // Compact number formatter for telemetry display (e.g. 50k, 1.2M)
  const formatCompactValue = (val: number): string => {
    if (val >= 1_000_000) {
      return `${(val / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 1 })}M`;
    }
    if (val >= 10_000) {
      return `${(val / 1_000).toLocaleString(undefined, { maximumFractionDigits: 0 })}k`;
    }
    if (val >= 1_000) {
      return `${(val / 1_000).toLocaleString(undefined, { maximumFractionDigits: 1 })}k`;
    }
    return val.toLocaleString(undefined, { maximumFractionDigits: 1 });
  };

  // Active Session Display
  if (isSessionActive && activeSession) {
    const spent = Number(activeSession.spentToday || 0);
    const isUnlimitedDaily = isUnlimitedAmount(activeSession.dailyVolumeCap);
    const cap = isUnlimitedDaily ? Infinity : Number(activeSession.dailyVolumeCap || 1);
    const spentPercent = isUnlimitedDaily ? 0 : Math.min(100, Math.max(0, (spent / cap) * 100));
    const sessionKeyAddr = activeSession.sessionKeyAddress || SOMNIA_ADDRESSES.operatorAccount;
    const sessionTooltip = `Non-Custodial Session Active (${timeRemaining ? `Expires in ${timeRemaining}` : 'Perpetual'})\nSession Key: ${sessionKeyAddr}\nClick to copy key address`;
    const riskTooltip = `Risk Controls & Limits\nSingle Cap: ${formatCapAmount(activeSession.maxTradeSize)}\nDaily Budget: ${isUnlimitedDaily ? 'Unlimited' : `${(cap ?? 0).toLocaleString()} tUSDC`}\nToday's Spent: ${spent.toFixed(1)} tUSDC`;

    return (
      <div className="session-status-banner active">
        <div className="session-bar-container">
          {/* Cluster 1: Session Identity & Trading Wallet */}
          <div className="session-bar-identity">
            {/* Integrated Status Badge with Copy */}
            <button
              type="button"
              onClick={handleCopy}
              className="session-badge-button group"
              title={sessionTooltip}
              aria-label="Copy session key address"
            >
              <div className="session-live-beacon">
                <span className="session-live-ping" />
                <span className="session-live-dot" />
              </div>
              <div className="session-badge-details">
                <span className="session-badge-title">Session Active</span>
                <span className="session-badge-key">
                  {copied ? (
                    <span className="session-copied-pill">
                      <CheckIcon className="w-2.5 h-2.5 text-emerald-300" />
                      <span>Copied!</span>
                    </span>
                  ) : (
                    <span className="session-address-pill">
                      <span>{sessionKeyAddr.slice(0, 6)}...{sessionKeyAddr.slice(-4)}</span>
                      <DocumentDuplicateIcon className="w-2.5 h-2.5 opacity-60 group-hover:opacity-100" />
                    </span>
                  )}
                </span>
              </div>
            </button>

            {/* Primary Trading Wallet Balance & Capital Actions */}
            {(cloneAddress || activeSession.accountAddress) && (
              <div className="session-wallet-card">
                <div className="session-wallet-meta">
                  <div className="flex items-center gap-1">
                    <WalletIcon className="w-2.5 h-2.5 text-muted-foreground" />
                    <span className="session-field-label">TRADING WALLET</span>
                  </div>
                  <div className="session-wallet-balance">
                    <span className="session-balance-value">${cloneBalance || '0.00'}</span>
                    <span className="session-balance-symbol">tUSDC</span>
                  </div>
                </div>
                <div className="session-wallet-actions">
                  {onOpenTradingWallet && (
                    <button
                      type="button"
                      onClick={() => onOpenTradingWallet('deposit')}
                      className="session-wallet-btn deposit"
                      title="Deposit funds into your isolated Trading Wallet"
                    >
                      <ArrowDownTrayIcon className="w-3 h-3" />
                      <span>Deposit</span>
                    </button>
                  )}
                  {parseFloat(cloneBalance || '0') > 0 && (onOpenTradingWallet || onWithdrawClone) && (
                    <button
                      type="button"
                      onClick={() => (onOpenTradingWallet ? onOpenTradingWallet('withdraw') : onWithdrawClone?.())}
                      className="session-wallet-btn withdraw"
                      title="Withdraw funds from Trading Wallet to connected wallet"
                    >
                      <ArrowUpTrayIcon className="w-3 h-3" />
                      <span>Withdraw</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Cluster 2: Risk Telemetry HUD & Execution Mode */}
          <div className="session-bar-telemetry">
            {/* Execution Mode */}
            <div className="session-telemetry-item execution-mode-item">
              <span className="session-field-label">EXECUTION MODE</span>
              <div className="flex items-center">
                {renderExecutionMode()}
              </div>
            </div>

            <div className="session-telemetry-divider" />

            {/* Single Cap */}
            <div className="session-telemetry-item single-cap-item">
              <span className="session-field-label">SINGLE CAP</span>
              <span
                className="session-telemetry-value"
                title={`Max single trade ceiling: ${formatCapAmount(activeSession.maxTradeSize)}`}
              >
                {formatCapAmount(activeSession.maxTradeSize)}
              </span>
            </div>

            <div className="session-telemetry-divider" />

            {/* 24H Budget Meter */}
            <div
              className="session-telemetry-item budget-meter"
              title={
                isUnlimitedDaily
                  ? "24H Rolling Budget: Unlimited"
                  : `24H Rolling Budget: ${spent.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })} / ${cap.toLocaleString()} tUSDC (${spentPercent.toFixed(1)}% used)\nRemaining today: ${(Math.max(0, cap - spent)).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })} tUSDC`
              }
            >
              <div className="session-budget-header">
                <span className="session-field-label">24H BUDGET</span>
                <span className="session-budget-numbers">
                  <span className="session-budget-val">
                    {isUnlimitedDaily
                      ? `${formatCompactValue(spent)} / ∞`
                      : `${formatCompactValue(spent)} / ${formatCompactValue(cap)} tUSDC`}
                  </span>
                  <span className="session-budget-pct">
                    ({spentPercent.toFixed(0)}%)
                  </span>
                </span>
              </div>
              <div className="session-budget-track">
                <div
                  className="session-budget-fill"
                  style={{
                    width: isUnlimitedDaily ? '100%' : `${spentPercent}%`,
                    background: isUnlimitedDaily
                      ? 'linear-gradient(90deg, #10b981, #00ffcc)'
                      : spentPercent > 85
                      ? 'linear-gradient(90deg, #f43f5e, #e11d48)'
                      : spentPercent > 60
                      ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
                      : 'linear-gradient(90deg, #10b981, #059669)',
                  }}
                />
              </div>
            </div>

            <div className="session-telemetry-divider" />

            {/* Session Expiry */}
            <div className="session-telemetry-item expiry-item">
              <span className="session-field-label">EXPIRES</span>
              <div
                className="session-expiry-badge"
                title={`Session Expiration: ${activeSession.expiresAt ? new Date(activeSession.expiresAt).toLocaleString() : 'Perpetual'}`}
              >
                <ClockIcon className="w-3 h-3 text-muted-foreground" />
                <span>{timeRemaining || 'Perpetual'}</span>
              </div>
            </div>
          </div>

          {/* Cluster 3: Session Actions */}
          <div className="session-bar-actions">
            {isCollateralZero && onClaimFaucet && (
              <Button
                variant="outline"
                size="xs"
                onClick={async () => {
                  try {
                    await onClaimFaucet(1000);
                  } catch {}
                }}
                disabled={isFauceting}
                className="h-7 text-xs px-2.5 gap-1.5 border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 cursor-pointer"
              >
                {isFauceting ? <Spinner size="xs" variant="amber" /> : <CurrencyDollarIcon className="w-3.5 h-3.5" />}
                <span>Faucet</span>
              </Button>
            )}

            {onOpenFleetRisk && (
              <button
                type="button"
                onClick={onOpenFleetRisk}
                title="Configure Swarm Fleet Risk & Position Sizing"
                className="session-action-btn neutral"
              >
                <AdjustmentsHorizontalIcon className="w-3.5 h-3.5 text-muted-foreground" />
                <span>Fleet Risk</span>
              </button>
            )}

            <button
              type="button"
              onClick={onOpenRiskModal || (() => onOpenModal())}
              title={riskTooltip}
              className="session-action-btn neutral"
            >
              <KeyIcon className="w-3.5 h-3.5 text-muted-foreground" />
              <span>Risk Limits</span>
            </button>

            <button
              type="button"
              onClick={() => onOpenModal({ revoke: true })}
              title="Revoke Session Authorization & On-Chain Permissions"
              className="session-action-btn revoke"
            >
              <XCircleIcon className="w-3.5 h-3.5 text-rose-400" />
              <span>Revoke</span>
            </button>
          </div>
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
            No Active Session Delegation {isCollateralZero && <span style={{ color: 'var(--trade-anomaly)', fontSize: '11px', marginLeft: '6px', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>(0.00 tUSDC Collateral)</span>}
          </span>
          <span className="session-banner-desc">
            Authorize autonomous agents with 1-click EIP-712 signing & zero-withdrawal risk ceilings.
          </span>
        </div>
      </div>
      <div className="session-banner-actions">
        {isCollateralZero && onClaimFaucet && (
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                await onClaimFaucet(1000);
              } catch {}
            }}
            disabled={isFauceting}
            className="h-7 text-xs px-2.5 gap-1.5 border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
          >
            {isFauceting ? <Spinner size="xs" variant="amber" /> : <CurrencyDollarIcon className="w-3 h-3" />}
            <span>Claim 1,000 tUSDC Faucet</span>
          </Button>
        )}
        <Button
          size="sm"
          onClick={() => onOpenModal()}
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
