import React, { useState, useEffect } from 'react';
import {
  ShieldCheckIcon,
  KeyIcon,
  LockClosedIcon,
  BoltIcon,
  ClockIcon,
  AdjustmentsHorizontalIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  XMarkIcon,
  CheckCircleIcon,
  ArrowTopRightOnSquareIcon,
  ArrowPathIcon,
  CheckIcon,
  Square3Stack3DIcon,
  DocumentCheckIcon,
  ArrowLeftEndOnRectangleIcon,
  XCircleIcon,
  WalletIcon,
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
} from '@heroicons/react/24/outline';
import type { SessionGrant } from '../types/index.js';
import type { WalletState, AllowanceStatus } from '../hooks/useSessionKey.js';
import { SOMNIA_ADDRESSES } from '../services/web3.js';
import { Spinner } from './ui/Spinner.js';
import { parseWeb3Error } from '../lib/errorUtils.js';
import {
  MAX_ALLOWED_TRADE_SIZE,
  MAX_ALLOWED_DAILY_CAP,
  MAX_SESSION_DURATION_HOURS,
  formatCapAmount,
  formatSessionTimeRemaining,
} from '../lib/sessionUtils.js';

interface SessionDelegationModalProps {
  isOpen: boolean;
  initialRevokeMode?: boolean;
  onClose: () => void;
  wallet: WalletState;
  activeSession: SessionGrant | null;
  cloneAddress?: `0x${string}` | null;
  cloneBalance?: string;
  isSigning: boolean;
  isLoading: boolean;
  isFauceting?: boolean;
  isFixingAllowance?: boolean;
  stepState?: 'idle' | 'deploying_clone' | 'approving_clone' | 'authorizing_onchain' | 'depositing_vault' | 'signing_eip712' | 'registering_backend';
  error: string | null;
  allowanceStatus?: AllowanceStatus | null;
  onConnectWallet: () => Promise<void>;
  onDisconnectWallet?: () => void;
  onSwitchNetwork: () => Promise<void>;
  onClaimFaucet?: (amount?: number) => Promise<void>;
  onCreateSession: (params: {
    maxTradeSize: number;
    dailyVolumeCap: number;
    durationHours: number;
    depositAmount?: number;
    targetPool?: `0x${string}`;
    copyTradeEnabled?: boolean;
  }) => Promise<SessionGrant>;
  onRevokeSession: (options?: { onChain?: boolean }) => Promise<void>;
  onEnsureAllowances?: () => Promise<void>;
  onRefreshAllowance?: () => Promise<void>;
  onClearError: () => void;
  onOpenTradingWallet?: (tab: 'deposit' | 'withdraw') => void;
  onOpenRiskModal?: () => void;
}

export const SessionDelegationModal: React.FC<SessionDelegationModalProps> = ({
  isOpen,
  initialRevokeMode = false,
  onClose,
  wallet,
  activeSession,
  cloneAddress,
  cloneBalance,
  isSigning,
  isLoading,
  isFixingAllowance = false,
  stepState = 'idle',
  error,
  allowanceStatus,
  onConnectWallet,
  onDisconnectWallet,
  onSwitchNetwork,
  onCreateSession,
  onRevokeSession,
  onEnsureAllowances,
  onRefreshAllowance,
  onClearError,
  onOpenTradingWallet,
  onOpenRiskModal,
}) => {
  // Miscellaneous modal state
  const [enableCopyTrading, setEnableCopyTrading] = useState<boolean>(false);
  const [confirmRevoke, setConfirmRevoke] = useState<boolean>(initialRevokeMode);
  const [revokeOnChainOption, setRevokeOnChainOption] = useState<boolean>(true);

  // Pre-populate values when modal opens or activeSession updates
  useEffect(() => {
    if (isOpen) {
      setConfirmRevoke(Boolean(initialRevokeMode));
      setRevokeOnChainOption(true);
      onRefreshAllowance?.();

      if (activeSession) {
        setEnableCopyTrading(Boolean(activeSession.copyTradeEnabled));
      }
    }
  }, [isOpen, initialRevokeMode, activeSession]);

  if (!isOpen) return null;

  const effectiveCloneAddress = cloneAddress || (activeSession?.accountAddress as `0x${string}` | undefined);

  const handleCreate = async () => {
    onClearError();
    try {
      await onCreateSession({
        maxTradeSize: MAX_ALLOWED_TRADE_SIZE,
        dailyVolumeCap: MAX_ALLOWED_DAILY_CAP,
        durationHours: MAX_SESSION_DURATION_HOURS,
        depositAmount: undefined,
        copyTradeEnabled: enableCopyTrading,
      });
      await onRefreshAllowance?.();
      onClose();
      if (onOpenTradingWallet) {
        setTimeout(() => onOpenTradingWallet('deposit'), 300);
      }
    } catch {
      // error handled in hook
    }
  };

  const handleRevoke = async () => {
    onClearError();
    try {
      await onRevokeSession({ onChain: revokeOnChainOption });
      setConfirmRevoke(false);
      onClose();
    } catch {
      // error handled in hook
    }
  };

  const parsedError = error ? parseWeb3Error(error) : null;

  const getStepStatusText = () => {
    switch (stepState) {
      case 'deploying_clone':
        return 'Step 1/2: Sponsoring & Deploying Smart Account Clone...';
      case 'authorizing_onchain':
        return 'Step 2/2: Authorizing Session Key on Smart Account Clone...';
      case 'depositing_vault':
        return 'Depositing to Trading Account Vault...';
      case 'signing_eip712':
        return 'Signing EIP-712 Risk Ceilings in Wallet...';
      case 'registering_backend':
        return 'Finalizing: Registering Session with DreamPulse Swarm...';
      default:
        return 'Sign EIP-712 & Submit On-Chain Delegation...';
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-container session-modal-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-modal-title"
      >
        {/* Modal Header */}
        <div className="modal-header">
          <div className="modal-title-row">
            <div className="modal-title-badge">
              <KeyIcon className="w-[18px] h-[18px] modal-badge-icon" />
            </div>
            <div>
              <h2 id="session-modal-title" className="modal-heading">
                {confirmRevoke
                  ? 'Revoke Session Authorization'
                  : activeSession?.isActive
                  ? 'Manage Session Delegation'
                  : 'Non-Custodial Session Delegation'}
              </h2>
              <span className="modal-subheading">
                {confirmRevoke
                  ? 'Confirm revocation of autonomous execution, the session key, and the session contract grant'
                  : 'EIP-712 cryptographic authorization for autonomous swarm & custom bot execution'}
              </span>
            </div>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close delegation modal"
          >
            <XMarkIcon className="w-[18px] h-[18px]" />
          </button>
        </div>

        <div className="modal-scroll-content">
          {/* Top Session State Card if active */}
          {activeSession && activeSession.isActive && (
            <div className="modal-status-card">
              <div className="modal-status-top">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div className="live-dot-green"></div>
                  <span className="modal-status-title">ACTIVE SESSION DELEGATED</span>
                </div>
                <span className="modal-status-badge">NON-CUSTODIAL</span>
              </div>

              {/* Isolated Trading Account Balance & Actions */}
              <div
                style={{
                  background: 'hsl(var(--secondary) / 0.4)',
                  border: '1px solid hsl(var(--border) / 0.7)',
                  borderRadius: '12px',
                  padding: '14px 16px',
                  margin: '12px 0',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ padding: '6px', borderRadius: '8px', background: 'rgba(0, 255, 204, 0.1)', color: '#00ffcc' }}>
                      <WalletIcon className="w-4 h-4" />
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Trading Account Balance (Clone)
                      </div>
                      <div style={{ fontSize: '18px', fontWeight: 700, color: '#00ffcc', fontFamily: 'var(--font-mono)' }}>
                        {cloneBalance || '0.00'} <span style={{ fontSize: '12px', fontWeight: 500, color: 'hsl(var(--muted-foreground))' }}>tUSDC</span>
                      </div>
                    </div>
                  </div>
                  {effectiveCloneAddress && (
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '10px', color: 'hsl(var(--muted-foreground))', fontFamily: 'var(--font-mono)' }}>
                        SMART CLONE
                      </div>
                      <a
                        href={`https://shannon-explorer.somnia.network/address/${effectiveCloneAddress}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ fontSize: '11px', color: 'hsl(var(--foreground))', fontFamily: 'var(--font-mono)', display: 'inline-flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}
                      >
                        <span>{effectiveCloneAddress.slice(0, 6)}...{effectiveCloneAddress.slice(-4)}</span>
                        <ArrowTopRightOnSquareIcon className="w-3 h-3 text-muted-foreground" />
                      </a>
                    </div>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginTop: '8px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenTradingWallet?.('deposit');
                    }}
                    style={{
                      background: 'hsl(var(--primary))',
                      color: 'hsl(var(--primary-foreground))',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '8px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '5px',
                    }}
                  >
                    <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                    <span>Deposit</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenTradingWallet?.('withdraw');
                    }}
                    style={{
                      background: 'hsl(var(--secondary))',
                      color: 'hsl(var(--foreground))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      padding: '8px',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '5px',
                    }}
                  >
                    <ArrowUpTrayIcon className="w-3.5 h-3.5" />
                    <span>Withdraw</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenRiskModal?.();
                    }}
                    style={{
                      background: 'hsl(var(--secondary))',
                      color: 'hsl(var(--foreground))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      padding: '8px',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '5px',
                    }}
                  >
                    <AdjustmentsHorizontalIcon className="w-3.5 h-3.5" />
                    <span>Risk Limits</span>
                  </button>
                </div>
              </div>

              {/* Direct Payout Guarantee Highlight */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'hsl(var(--secondary) / 0.3)',
                  border: '1px solid hsl(var(--border) / 0.5)',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  margin: '8px 0',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ShieldCheckIcon className="w-3.5 h-3.5" style={{ color: 'hsl(var(--muted-foreground))' }} />
                  <div style={{ fontSize: '11px', color: 'hsl(var(--foreground))' }}>
                    <span style={{ fontWeight: 700, color: 'hsl(var(--foreground))' }}>100% Direct Wallet Payout: </span>
                    <span>All winnings & settlements are sent directly to your connected wallet</span>
                  </div>
                </div>
                {activeSession.onChainTxHash && (
                  <a
                    href={`https://shannon-explorer.somnia.network/tx/${activeSession.onChainTxHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: '10.5px', color: 'hsl(var(--muted-foreground))', display: 'inline-flex', alignItems: 'center', gap: '3px', textDecoration: 'none' }}
                  >
                    <span>Explorer</span>
                    <ArrowTopRightOnSquareIcon className="w-2.5 h-2.5" />
                  </a>
                )}
              </div>

              {/* Active Session Stat Pills */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', margin: '8px 0' }}>
                <div className="stat-pill">
                  <span className="stat-pill-label">Single Cap:</span>
                  <span className="stat-pill-value font-mono">{formatCapAmount(activeSession.maxTradeSize)}</span>
                </div>

                <div className="stat-pill">
                  <span className="stat-pill-label">24h Budget:</span>
                  <span className="stat-pill-value font-mono">
                    {activeSession.spentToday || 0} / {formatCapAmount(activeSession.dailyVolumeCap)}
                  </span>
                </div>

                <div className="stat-pill">
                  <span className="stat-pill-label">Duration / Expiry:</span>
                  <span className="stat-pill-value font-mono">{formatSessionTimeRemaining(activeSession.expiresAt)}</span>
                </div>

                {activeSession.vaultDepositAmount !== undefined && activeSession.vaultDepositAmount > 0 && activeSession.targetPoolAddress && (
                  <div className="stat-pill">
                    <span className="stat-pill-label">Vault Capital:</span>
                    <span className="stat-pill-value font-mono">{activeSession.vaultDepositAmount} tUSDC</span>
                  </div>
                )}

                <div className="stat-pill" style={{ border: `1px solid ${activeSession.copyTradeEnabled ? 'rgba(56, 189, 248, 0.25)' : 'hsl(var(--border) / 0.5)'}` }}>
                  <span className="stat-pill-label">Protocol Mirror:</span>
                  <span className="stat-pill-value font-mono" style={{ color: activeSession.copyTradeEnabled ? '#00ffcc' : 'hsl(var(--muted-foreground))' }}>
                    {activeSession.copyTradeEnabled ? 'ON (Mirroring Active)' : 'OFF (Discretionary Only)'}
                  </span>
                </div>

                <div className="stat-pill" style={{ border: '1px solid rgba(168, 85, 247, 0.25)' }}>
                  <span className="stat-pill-label">Custom Agents:</span>
                  <span className="stat-pill-value font-mono" style={{ color: '#d8b4fe' }}>
                    Autonomous Ready
                  </span>
                </div>
              </div>

              {confirmRevoke ? (
                <div className="revoke-confirm-card">
                  <div className="revoke-confirm-header">
                    <div className="revoke-confirm-icon-wrap">
                      <ExclamationTriangleIcon className="w-4 h-4 text-[#ff3366]" />
                    </div>
                    <div className="revoke-confirm-headings">
                      <span className="revoke-confirm-title">Confirm Instant Revocation</span>
                      <span className="revoke-confirm-subtitle">
                        Halts all autonomous agent execution and resets delegation permissions immediately.
                      </span>
                    </div>
                  </div>

                  <div
                    className={`revoke-option-tile ${revokeOnChainOption ? 'active' : ''}`}
                    onClick={() => setRevokeOnChainOption(!revokeOnChainOption)}
                    role="checkbox"
                    aria-checked={revokeOnChainOption}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === ' ' || e.key === 'Enter') {
                        e.preventDefault();
                        setRevokeOnChainOption(!revokeOnChainOption);
                      }
                    }}
                  >
                    <div className={`custom-checkbox-box ${revokeOnChainOption ? 'checked' : ''}`}>
                      {revokeOnChainOption && <CheckIcon className="w-3 h-3 text-[#ff3366] stroke-[3]" />}
                    </div>
                    <div className="revoke-option-text">
                      <span className="revoke-option-label">
                        Submit 1-Tx On-Chain Revocation
                      </span>
                      <span className="revoke-option-hint">
                        Broadcasts 1 on-chain transaction to instantly deactivate the session key on Somnia Testnet.
                      </span>
                    </div>
                  </div>

                  <div className="revoke-btn-group">
                    <button
                      type="button"
                      className="btn-revoke-execute"
                      onClick={handleRevoke}
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <>
                          <ArrowPathIcon className="w-3.5 h-3.5 spin" />
                          <span>Revoking Permissions...</span>
                        </>
                      ) : (
                        <>
                          <XCircleIcon className="w-3.5 h-3.5" />
                          <span>Yes, Revoke Session Now</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      className="btn-revoke-dismiss"
                      onClick={() => setConfirmRevoke(false)}
                      disabled={isLoading}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  {onDisconnectWallet ? (
                    <button
                      type="button"
                      onClick={() => {
                        onDisconnectWallet();
                        onClose();
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'hsl(var(--muted-foreground))',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '4px 0',
                        transition: 'color 0.15s ease',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--trade-no)')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--muted-foreground)')}
                    >
                      <ArrowLeftEndOnRectangleIcon className="w-3 h-3" />
                      <span>Disconnect Wallet</span>
                    </button>
                  ) : <div />}
                  <button
                    type="button"
                    className="btn-revoke-trigger"
                    onClick={() => setConfirmRevoke(true)}
                  >
                    Revoke Session Authorization
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Allowance Diagnostic Banner */}
          {activeSession?.isActive && allowanceStatus && !allowanceStatus.allReady && (
            <div
              className="collateral-clarity-banner"
              style={{
                padding: '12px 14px',
                marginBottom: '14px',
                borderRadius: '8px',
                background: 'hsl(var(--destructive) / 0.08)',
                border: '1px solid hsl(var(--destructive) / 0.35)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                <ExclamationTriangleIcon className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: '12px', color: 'hsl(var(--destructive))', marginBottom: '4px' }}>
                    {parseFloat(cloneBalance || '0') <= 0 ? 'Action Recommended: Fund Trading Account' : 'Action Required: Delegation Setup'}
                  </div>
                  <div style={{ fontSize: '11px', color: 'hsl(var(--muted-foreground))', lineHeight: 1.4, marginBottom: '8px' }}>
                    {allowanceStatus.guidance || 'Deposit tUSDC into your Trading Account Vault to enable autonomous execution. Swarm agents trade strictly with your deposited funds.'}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {parseFloat(cloneBalance || '0') <= 0 && onOpenTradingWallet ? (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenTradingWallet('deposit');
                        }}
                        style={{
                          background: 'hsl(var(--primary))',
                          color: '#fff',
                          fontWeight: 700,
                          fontSize: '11px',
                          padding: '7px 14px',
                          borderRadius: '6px',
                          border: 'none',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <ArrowDownTrayIcon className="w-3 h-3" />
                        Deposit Collateral
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={async () => {
                          onClearError();
                          try {
                            await onEnsureAllowances?.();
                          } catch {}
                        }}
                        disabled={isFixingAllowance || isSigning}
                        style={{
                          background: 'hsl(var(--destructive))',
                          color: '#fff',
                          fontWeight: 700,
                          fontSize: '11px',
                          padding: '7px 14px',
                          borderRadius: '6px',
                          border: 'none',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        {isFixingAllowance ? <Spinner size="xs" variant="white" /> : <CheckCircleIcon className="w-3 h-3" />}
                        Check Account Status
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onRefreshAllowance?.()}
                      disabled={isFixingAllowance}
                      style={{
                        background: 'transparent',
                        color: 'hsl(var(--muted-foreground))',
                        fontWeight: 600,
                        fontSize: '11px',
                        padding: '7px 10px',
                        borderRadius: '6px',
                        border: '1px solid hsl(var(--border) / 0.6)',
                        cursor: 'pointer',
                      }}
                    >
                      Refresh
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {!activeSession?.isActive && (
            <>
              {/* 2-Step Onboarding Architecture Banner */}
              <div className="safety-guarantees-card" style={{ padding: '12px 14px', marginBottom: '14px' }}>
                <div className="safety-card-title" style={{ marginBottom: '10px' }}>
                  <Square3Stack3DIcon className="w-4 h-4 safety-icon-cyan" />
                  <span>2-Step Cryptographic Delegation Flow</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', fontSize: '11px' }}>
                  <div style={{ background: 'hsl(var(--card) / 0.5)', padding: '10px', borderRadius: '6px', border: '1px solid hsl(var(--border) / 0.5)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <strong style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'hsl(var(--foreground))', fontSize: '11.5px' }}>
                        <ShieldCheckIcon className="w-3.5 h-3.5" style={{ color: 'var(--brand-cyan)' }} />
                        <span>Step 1: Smart Account Clone</span>
                      </strong>
                      <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', padding: '1px 5px', borderRadius: '3px', background: 'hsl(var(--secondary))', color: 'hsl(var(--muted-foreground))' }}>1 TX</span>
                    </div>
                    <p style={{ margin: 0, color: 'hsl(var(--muted-foreground))', lineHeight: 1.35 }}>
                      Authorizes your isolated V2 Smart Account Clone ({effectiveCloneAddress ? `${effectiveCloneAddress.slice(0, 6)}...${effectiveCloneAddress.slice(-4)}` : 'V2 Clone'}). Enforces risk bounds on-chain. Revocable in 1 tx.
                    </p>
                  </div>
                  <div style={{ background: 'hsl(var(--card) / 0.5)', padding: '10px', borderRadius: '6px', border: '1px solid hsl(var(--border) / 0.5)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <strong style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'hsl(var(--foreground))', fontSize: '11.5px' }}>
                        <DocumentCheckIcon className="w-3.5 h-3.5" style={{ color: 'var(--brand-cyan)' }} />
                        <span>Step 2: Ephemeral Key</span>
                      </strong>
                      <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', padding: '1px 5px', borderRadius: '3px', background: 'rgba(0, 230, 118, 0.15)', color: 'var(--trade-yes)' }}>PER-USER</span>
                    </div>
                    <p style={{ margin: 0, color: 'hsl(var(--muted-foreground))', lineHeight: 1.35 }}>
                      Generates an isolated, weak session key for your EOA. Stealing it only grants bounded, expiring power.
                    </p>
                  </div>
                </div>
              </div>

              {/* Smart Account Clone Contract Information */}
              <div className="operator-info-row">
                <span className="operator-label">Smart Account Clone:</span>
                <div className="operator-address-chip" title="Isolated Non-Custodial Smart Account Clone Contract">
                  <code>{effectiveCloneAddress || SOMNIA_ADDRESSES.sessionAccount}</code>
                </div>
                <a
                  href={`https://shannon-explorer.somnia.network/address/${effectiveCloneAddress || SOMNIA_ADDRESSES.sessionAccount}`}
                  target="_blank"
                  rel="noreferrer"
                  className="operator-explorer-link"
                  title="View Smart Account Clone Contract on Somnia Explorer"
                >
                  <ArrowTopRightOnSquareIcon className="w-3 h-3" />
                </a>
              </div>

              {/* Isolated Smart Trading Account Architecture Card */}
              <div className="risk-config-section" style={{ padding: '16px', borderRadius: '12px', background: 'hsl(var(--secondary) / 0.25)', border: '1px solid hsl(var(--border) / 0.6)', marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ padding: '6px', borderRadius: '8px', background: 'rgba(0, 255, 204, 0.1)', color: '#00ffcc' }}>
                      <ShieldCheckIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="section-title" style={{ margin: 0, fontSize: '13px' }}>
                        Isolated Trading Account Model
                      </h3>
                      <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'hsl(var(--muted-foreground))' }}>
                        Deposit & withdraw model — identical to DreamDEX & Hyperliquid.
                      </p>
                    </div>
                  </div>
                  <span style={{ fontSize: '10px', color: '#00ffcc', fontFamily: 'var(--font-mono)', background: 'rgba(0, 255, 204, 0.1)', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(0, 255, 204, 0.25)' }}>
                    30-DAY LIFESPAN (MAX)
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '14px' }}>
                  <div style={{ padding: '10px 12px', borderRadius: '8px', background: 'hsl(var(--card) / 0.6)', border: '1px solid hsl(var(--border) / 0.4)' }}>
                    <div style={{ fontSize: '10px', fontWeight: 600, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', marginBottom: '4px' }}>
                      1. Physical Isolation
                    </div>
                    <p style={{ margin: 0, fontSize: '11px', color: 'hsl(var(--foreground))', lineHeight: 1.35 }}>
                      Only funds deposited into your Smart Clone are tradeable. Zero auto-pull from your EOA.
                    </p>
                  </div>

                  <div style={{ padding: '10px 12px', borderRadius: '8px', background: 'hsl(var(--card) / 0.6)', border: '1px solid hsl(var(--border) / 0.4)' }}>
                    <div style={{ fontSize: '10px', fontWeight: 600, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', marginBottom: '4px' }}>
                      2. On-Chain Ceilings
                    </div>
                    <p style={{ margin: 0, fontSize: '11px', color: 'hsl(var(--foreground))', lineHeight: 1.35 }}>
                      Max $500/trade, $5,000 rolling 24h cap, and 30-day max duration enforced by smart contracts.
                    </p>
                  </div>

                  <div style={{ padding: '10px 12px', borderRadius: '8px', background: 'hsl(var(--card) / 0.6)', border: '1px solid hsl(var(--border) / 0.4)' }}>
                    <div style={{ fontSize: '10px', fontWeight: 600, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', marginBottom: '4px' }}>
                      3. Customizable Risk
                    </div>
                    <p style={{ margin: 0, fontSize: '11px', color: 'hsl(var(--foreground))', lineHeight: 1.35 }}>
                      Configure tighter single-trade or daily stop limits anytime in the Risk Limits modal.
                    </p>
                  </div>
                </div>

                {/* Autonomous Protocol Swarm Mirror Switch */}
                <div style={{ background: 'hsl(var(--secondary) / 0.4)', padding: '12px 14px', borderRadius: '8px', border: `1px solid ${enableCopyTrading ? 'rgba(56, 189, 248, 0.4)' : 'hsl(var(--border) / 0.7)'}` }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: enableCopyTrading ? 'rgba(56, 189, 248, 0.15)' : 'hsl(var(--secondary))', border: `1px solid ${enableCopyTrading ? 'rgba(56, 189, 248, 0.3)' : 'hsl(var(--border) / 0.6)'}`, display: 'grid', placeItems: 'center', color: enableCopyTrading ? '#00ffcc' : 'hsl(var(--muted-foreground))', flexShrink: 0, marginTop: '2px' }}>
                        <BoltIcon className="w-4 h-4" />
                      </div>
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: 'hsl(var(--foreground))', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <span>Mirror Protocol Swarm (Volt, Oracle, Titan)</span>
                          <span style={{ fontSize: '9px', padding: '1px 6px', borderRadius: '4px', background: enableCopyTrading ? 'rgba(56, 189, 248, 0.15)' : 'hsl(var(--secondary))', color: enableCopyTrading ? '#00ffcc' : 'hsl(var(--muted-foreground))', border: `1px solid ${enableCopyTrading ? 'rgba(56, 189, 248, 0.3)' : 'hsl(var(--border))'}`, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                            {enableCopyTrading ? 'PROTOCOL MIRROR ON' : 'PROTOCOL MIRROR OFF'}
                          </span>
                        </div>
                        <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'hsl(var(--muted-foreground))', lineHeight: 1.4 }}>
                          {enableCopyTrading
                            ? 'Institutional Volt, Oracle, and Titan trades will be mirrored using your trading wallet balance.'
                            : 'Keep OFF if you only want to trade manually or let your own Custom Strategy Studio bots trade without copying platform bots.'}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEnableCopyTrading(!enableCopyTrading)}
                      className="cursor-pointer flex-shrink-0"
                      style={{
                        width: '42px',
                        height: '24px',
                        borderRadius: '12px',
                        background: enableCopyTrading ? '#00ffcc' : 'hsl(var(--muted))',
                        border: 'none',
                        position: 'relative',
                        transition: 'background 0.2s ease',
                        padding: '2px',
                      }}
                      aria-label="Toggle autonomous protocol swarm mirroring"
                    >
                      <span
                        style={{
                          display: 'block',
                          width: '20px',
                          height: '20px',
                          borderRadius: '50%',
                          background: '#09090b',
                          transform: enableCopyTrading ? 'translateX(18px)' : 'translateX(0)',
                          transition: 'transform 0.2s ease',
                        }}
                      />
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Zero-Custody Safety Guarantees */}
          <div className="safety-guarantees-card">
            <div className="safety-card-title">
              <ShieldCheckIcon className="w-4 h-4 safety-icon-cyan" />
              <span>Mathematical Zero-Withdrawal Invariant</span>
            </div>
            <div className="safety-grid">
              <div className="safety-item">
                <LockClosedIcon className="w-3.5 h-3.5 safety-mini-icon" />
                <div>
                  <strong>Zero Fund Access</strong>
                  <p>The operator key cannot transfer, withdraw, or approve ERC20 balances.</p>
                </div>
              </div>
              <div className="safety-item">
                <BoltIcon className="w-3.5 h-3.5 safety-mini-icon" />
                <div>
                  <strong>Direct Settlement</strong>
                  <p>All position payouts settle directly to your connected wallet.</p>
                </div>
              </div>
              <div className="safety-item">
                <ClockIcon className="w-3.5 h-3.5 safety-mini-icon" />
                <div>
                  <strong>Cryptographic Expiry</strong>
                  <p>Session automatically dissolves when configured duration expires.</p>
                </div>
              </div>
              <div className="safety-item">
                <AdjustmentsHorizontalIcon className="w-3.5 h-3.5 safety-mini-icon" />
                <div>
                  <strong>Enforced Caps</strong>
                  <p>Trades exceeding your single or daily limits are rejected on-chain.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Error / Rejection Alert */}
          {parsedError && (
            <div className={`session-error-card ${parsedError.isUserRejection ? 'session-error-notice' : 'session-error-critical'}`}>
              <div className="session-error-header">
                <div className="session-error-title-wrap">
                  {parsedError.isUserRejection ? (
                    <InformationCircleIcon className="w-4 h-4 text-[#ffb700] shrink-0" />
                  ) : (
                    <ExclamationTriangleIcon className="w-4 h-4 text-[#ff3366] shrink-0" />
                  )}
                  <span className="session-error-title">{parsedError.title}</span>
                </div>
                <button
                  type="button"
                  className="session-error-dismiss"
                  onClick={onClearError}
                  aria-label="Dismiss error notice"
                  title="Dismiss notice"
                >
                  <XMarkIcon className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="session-error-body">
                <p className="session-error-message">{parsedError.message}</p>
                {parsedError.technicalDetails && !parsedError.isUserRejection && (
                  <details className="session-error-details">
                    <summary>Technical Details</summary>
                    <code>{parsedError.technicalDetails}</code>
                  </details>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="modal-footer">
          {!wallet.isConnected ? (
            <button
              type="button"
              className="btn-primary-action"
              onClick={onConnectWallet}
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Spinner size="sm" variant="white" />
                  <span>Connecting Wallet...</span>
                </>
              ) : (
                <>
                  <KeyIcon className="w-4 h-4" />
                  <span>Connect Web3 Wallet</span>
                </>
              )}
            </button>
          ) : !wallet.isCorrectNetwork ? (
            <button
              type="button"
              className="btn-warning-action"
              onClick={onSwitchNetwork}
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Spinner size="sm" variant="amber" />
                  <span>Switching Network...</span>
                </>
              ) : (
                <>
                  <BoltIcon className="w-4 h-4" />
                  <span>Switch to Somnia Shannon (50312)</span>
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              className="btn-primary-action"
              onClick={
                activeSession?.isActive
                  ? () => {
                      onClose();
                      onOpenTradingWallet?.('deposit');
                    }
                  : handleCreate
              }
              disabled={isSigning || isLoading}
            >
              {isSigning ? (
                <>
                  <Spinner size="sm" variant="white" />
                  <span>{getStepStatusText()}</span>
                </>
              ) : (
                <>
                  <CheckCircleIcon className="w-4 h-4" />
                  <span>
                    {activeSession?.isActive
                      ? 'Deposit Funds to Trading Account'
                      : 'Activate Smart Trading Account (1-Click)'}
                  </span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
