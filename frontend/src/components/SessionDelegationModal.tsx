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
  DocumentDuplicateIcon,
  CheckIcon,
  CurrencyDollarIcon,
  Square3Stack3DIcon,
  DocumentCheckIcon,
  ArrowLeftEndOnRectangleIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';
import type { SessionGrant } from '../types/index.js';
import type { WalletState } from '../hooks/useSessionKey.js';
import { SOMNIA_ADDRESSES } from '../services/web3.js';
import { Spinner } from './ui/Spinner.js';
import { parseWeb3Error } from '../lib/errorUtils.js';

interface SessionDelegationModalProps {
  isOpen: boolean;
  initialRevokeMode?: boolean;
  onClose: () => void;
  wallet: WalletState;
  activeSession: SessionGrant | null;
  isSigning: boolean;
  isLoading: boolean;
  isFauceting?: boolean;
  isFixingAllowance?: boolean;
  stepState?: 'idle' | 'authorizing_onchain' | 'depositing_vault' | 'signing_eip712' | 'registering_backend';
  error: string | null;
  allowanceStatus?: { allReady: boolean; checks: Array<{ pool: string; allowanceHuman: number; balanceHuman: number; vaultHuman: number; ready: boolean }>; guidance: string } | null;
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
}

export const SessionDelegationModal: React.FC<SessionDelegationModalProps> = ({
  isOpen,
  initialRevokeMode = false,
  onClose,
  wallet,
  activeSession,
  isSigning,
  isLoading,
  isFauceting = false,
  isFixingAllowance = false,
  stepState = 'idle',
  error,
  allowanceStatus,
  onConnectWallet,
  onDisconnectWallet,
  onSwitchNetwork,
  onClaimFaucet,
  onCreateSession,
  onRevokeSession,
  onEnsureAllowances,
  onRefreshAllowance,
  onClearError,
}) => {
  const [maxTradeSize, setMaxTradeSize] = useState<number>(10);
  const [dailyVolumeCap, setDailyVolumeCap] = useState<number>(100);
  const [durationHours, setDurationHours] = useState<number>(24);
  const [depositAmount, setDepositAmount] = useState<number>(10);
  const [enableCopyTrading, setEnableCopyTrading] = useState<boolean>(false);
  const [copiedOperator, setCopiedOperator] = useState<boolean>(false);
  const [confirmRevoke, setConfirmRevoke] = useState<boolean>(initialRevokeMode);
  const [revokeOnChainOption, setRevokeOnChainOption] = useState<boolean>(true);

  useEffect(() => {
    if (isOpen) {
      setConfirmRevoke(Boolean(initialRevokeMode));
      setRevokeOnChainOption(true);
      if (activeSession) {
        setEnableCopyTrading(Boolean(activeSession.copyTradeEnabled));
      }
    }
  }, [isOpen, initialRevokeMode, activeSession]);

  if (!isOpen) return null;

  const handleCopyOperator = () => {
    navigator.clipboard.writeText(SOMNIA_ADDRESSES.operatorAccount);
    setCopiedOperator(true);
    setTimeout(() => setCopiedOperator(false), 2000);
  };

  const handleCreate = async () => {
    onClearError();
    try {
      await onCreateSession({
        maxTradeSize,
        dailyVolumeCap,
        durationHours,
        depositAmount: depositAmount > 0 ? depositAmount : undefined,
        copyTradeEnabled: enableCopyTrading,
      });
      onClose();
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

  const durationOptions = [
    { label: '1 Hour', hours: 1 },
    { label: '6 Hours', hours: 6 },
    { label: '24 Hours', hours: 24 },
    { label: '7 Days', hours: 168 },
  ];

  const parsedError = error ? parseWeb3Error(error) : null;

  const getStepStatusText = () => {
    switch (stepState) {
      case 'authorizing_onchain':
        return 'Step 1/2: Confirming On-Chain Operator Approval in Wallet...';
      case 'depositing_vault':
        return 'Step 1/2: Approving Collateral Deposit...';
      case 'signing_eip712':
        return 'Step 2/2: Signing EIP-712 Risk Ceilings in Wallet...';
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
                  ? 'Confirm revocation of autonomous agent execution and operator permissions'
                  : 'EIP-712 cryptographic authorization for autonomous swarm execution'}
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

              {/* Collateral balance check inside active session */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: parseFloat(wallet.balanceCollateral || '0') === 0 ? 'hsl(var(--secondary) / 0.5)' : 'hsl(var(--secondary) / 0.35)',
                  border: `1px solid ${parseFloat(wallet.balanceCollateral || '0') === 0 ? 'rgba(245, 158, 11, 0.28)' : 'hsl(var(--border) / 0.5)'}`,
                  borderRadius: '6px',
                  padding: '8px 12px',
                  margin: '10px 0',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {parseFloat(wallet.balanceCollateral || '0') === 0 ? (
                    <ExclamationTriangleIcon className="w-4 h-4" style={{ color: '#f59e0b' }} />
                  ) : (
                    <CheckCircleIcon className="w-4 h-4" style={{ color: 'var(--trade-yes)' }} />
                  )}
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'hsl(var(--foreground))' }}>
                      Trading Collateral: <span className="tabular-num">{wallet.balanceCollateral || '0.00'} tUSDC</span>
                    </div>
                    <div style={{ fontSize: '10px', color: 'hsl(var(--muted-foreground))' }}>
                      {parseFloat(wallet.balanceCollateral || '0') === 0
                        ? 'Zero collateral will cause autonomous transactions to revert. Claim faucet below.'
                        : 'Collateral is ready for automated multi-agent order book execution.'}
                    </div>
                  </div>
                </div>
                {onClaimFaucet && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (!onClaimFaucet) return;
                      await onClaimFaucet(1000);
                    }}
                    disabled={isFauceting}
                    style={{
                      background: 'hsl(var(--secondary) / 0.8)',
                      border: '1px solid hsl(var(--border) / 0.6)',
                      color: 'hsl(var(--foreground))',
                      borderRadius: '5px',
                      padding: '4px 10px',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: isFauceting ? 'not-allowed' : 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    {isFauceting ? <ArrowPathIcon className="w-3 h-3 spin" /> : <CurrencyDollarIcon className="w-3 h-3" />}
                    <span>+1,000 tUSDC Faucet</span>
                  </button>
                )}
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

                {activeSession.vaultDepositAmount !== undefined && activeSession.vaultDepositAmount > 0 && (
                  <div className="stat-pill">
                    <span className="stat-pill-label">Vault Capital:</span>
                    <span className="stat-pill-value">{activeSession.vaultDepositAmount} tUSDC</span>
                  </div>
                )}

                <div className="stat-pill" style={{ border: `1px solid ${activeSession.copyTradeEnabled ? 'rgba(56, 189, 248, 0.25)' : 'hsl(var(--border) / 0.5)'}` }}>
                  <span className="stat-pill-label">Execution Mode:</span>
                  <span className="stat-pill-value" style={{ color: activeSession.copyTradeEnabled ? '#38bdf8' : 'hsl(var(--muted-foreground))' }}>
                    {activeSession.copyTradeEnabled ? 'Swarm Copy-Trading ON' : 'Terminal Copilot Only'}
                  </span>
                </div>

              {confirmRevoke ? (
                <div className="revoke-confirm-card">
                  <div className="revoke-confirm-header">
                    <div className="revoke-confirm-icon-wrap">
                      <ExclamationTriangleIcon className="w-4 h-4 text-rose-400" />
                    </div>
                    <div className="revoke-confirm-headings">
                      <span className="revoke-confirm-title">Confirm Instant Revocation</span>
                      <span className="revoke-confirm-subtitle">
                        Halts all autonomous agent execution and resets delegation permissions immediately.
                      </span>
                    </div>
                  </div>

                  {/* Custom Styled Interactive Checkbox Option Tile */}
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
                      {revokeOnChainOption && <CheckIcon className="w-3 h-3 text-rose-400 stroke-[3]" />}
                    </div>
                    <div className="revoke-option-text">
                      <span className="revoke-option-label">
                        Submit On-Chain Revocation to Operator Permissions Registry
                      </span>
                      <span className="revoke-option-hint">
                        Broadcasts an EVM gas transaction to permanently disable on-chain operator permissions on Somnia Testnet.
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
                    Action Required: Operator TestUSDC Authorization
                  </div>
                  <div style={{ fontSize: '11px', color: 'hsl(var(--muted-foreground))', lineHeight: 1.4, marginBottom: '8px' }}>
                    {allowanceStatus.guidance || 'Your wallet needs to grant TestUSDC allowance to the operator for seamless copy-trading. Click Authorize Operator below to complete 1-time setup.'}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
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
                      Authorize Operator
                    </button>
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
                    <span>Step 1: On-Chain Auth</span>
                  </strong>
                  <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', padding: '1px 5px', borderRadius: '3px', background: 'hsl(var(--secondary))', color: 'hsl(var(--muted-foreground))' }}>1 TX</span>
                </div>
                <p style={{ margin: 0, color: 'hsl(var(--muted-foreground))', lineHeight: 1.35 }}>
                  Authorizes operator key on <code>OperatorPermissionsRegistry</code> & enables token routing.
                </p>
              </div>
              <div style={{ background: 'hsl(var(--card) / 0.5)', padding: '10px', borderRadius: '6px', border: '1px solid hsl(var(--border) / 0.5)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <strong style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'hsl(var(--foreground))', fontSize: '11.5px' }}>
                    <DocumentCheckIcon className="w-3.5 h-3.5" style={{ color: 'var(--brand-cyan)' }} />
                    <span>Step 2: EIP-712 Policy</span>
                  </strong>
                  <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', padding: '1px 5px', borderRadius: '3px', background: 'rgba(16, 185, 129, 0.15)', color: 'var(--trade-yes)' }}>GASLESS</span>
                </div>
                <p style={{ margin: 0, color: 'hsl(var(--muted-foreground))', lineHeight: 1.35 }}>
                  Cryptographically enforces maximum trade size & 24h spend ceilings without custodial access.
                </p>
              </div>
            </div>
          </div>

          {/* Operator Contract Information */}
          <div className="operator-info-row">
            <span className="operator-label">Delegated Operator:</span>
            <div className="operator-address-chip" onClick={handleCopyOperator} title="Click to copy operator address">
              <code>{SOMNIA_ADDRESSES.operatorAccount}</code>
              {copiedOperator ? (
                <CheckIcon className="w-3 h-3" style={{ color: 'var(--trade-yes)' }} />
              ) : (
                <DocumentDuplicateIcon className="w-3 h-3" />
              )}
            </div>
            <a
              href={`https://shannon-explorer.somnia.network/address/${SOMNIA_ADDRESSES.operatorAccount}`}
              target="_blank"
              rel="noreferrer"
              className="operator-explorer-link"
              title="View Delegated Operator on Somnia Explorer"
            >
              <ArrowTopRightOnSquareIcon className="w-3 h-3" />
            </a>
          </div>

          {/* Risk Limits Configuration Form */}
          <div className="risk-config-section">
            <h3 className="section-title">Configure Risk Ceilings & Working Capital</h3>

            {/* Working Capital Vault Deposit */}
            <div className="config-group">
              <div className="config-header-row">
                <label htmlFor="deposit-amount-slider" className="config-label" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <CurrencyDollarIcon className="w-3.5 h-3.5" style={{ color: 'hsl(var(--muted-foreground))' }} />
                  <span>Working Capital Vault Deposit</span>
                </label>
                <span className="config-value-badge">{depositAmount} tUSDC</span>
              </div>
              <input
                id="deposit-amount-slider"
                type="range"
                min={0}
                max={100}
                step={5}
                value={depositAmount}
                onChange={(e) => setDepositAmount(Number(e.target.value))}
                className="custom-range-slider"
              />
              <div className="preset-pill-row">
                {[0, 10, 25, 50, 100].map((val) => (
                  <button
                    key={val}
                    type="button"
                    className={`preset-pill ${depositAmount === val ? 'active' : ''}`}
                    onClick={() => setDepositAmount(val)}
                  >
                    {val === 0 ? '0 (Skip)' : `${val} tUSDC`}
                  </button>
                ))}
              </div>
            </div>

            {/* Max Trade Size Slider */}
            <div className="config-group">
              <div className="config-header-row">
                <label htmlFor="max-trade-slider" className="config-label">
                  Max Trade Size Limit
                </label>
                <span className="config-value-badge">{maxTradeSize} tUSDC</span>
              </div>
              <input
                id="max-trade-slider"
                type="range"
                min={1}
                max={50}
                step={1}
                value={maxTradeSize}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setMaxTradeSize(val);
                  if (dailyVolumeCap < val) setDailyVolumeCap(val * 2);
                }}
                className="custom-range-slider"
              />
              <div className="preset-pill-row">
                {[5, 10, 25, 50].map((val) => (
                  <button
                    key={val}
                    type="button"
                    className={`preset-pill ${maxTradeSize === val ? 'active' : ''}`}
                    onClick={() => {
                      setMaxTradeSize(val);
                      if (dailyVolumeCap < val) setDailyVolumeCap(val * 2);
                    }}
                  >
                    {val} tUSDC
                  </button>
                ))}
              </div>
            </div>

            {/* Daily Volume Cap Slider */}
            <div className="config-group">
              <div className="config-header-row">
                <label htmlFor="daily-cap-slider" className="config-label">
                  24-Hour Daily Volume Cap
                </label>
                <span className="config-value-badge">{dailyVolumeCap} tUSDC</span>
              </div>
              <input
                id="daily-cap-slider"
                type="range"
                min={maxTradeSize}
                max={500}
                step={5}
                value={dailyVolumeCap}
                onChange={(e) => setDailyVolumeCap(Number(e.target.value))}
                className="custom-range-slider"
              />
              <div className="preset-pill-row">
                {[25, 50, 100, 250, 500].map((val) => (
                  <button
                    key={val}
                    type="button"
                    className={`preset-pill ${dailyVolumeCap === val ? 'active' : ''}`}
                    onClick={() => setDailyVolumeCap(Math.max(val, maxTradeSize))}
                  >
                    {val} tUSDC
                  </button>
                ))}
              </div>
            </div>

            {/* Autonomous Swarm Copy-Trading Mode Switch */}
            <div className="config-group" style={{ background: 'hsl(var(--secondary) / 0.35)', padding: '12px 14px', borderRadius: '8px', border: `1px solid ${enableCopyTrading ? 'rgba(56, 189, 248, 0.4)' : 'hsl(var(--border) / 0.7)'}` }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: enableCopyTrading ? 'rgba(56, 189, 248, 0.15)' : 'hsl(var(--secondary))', border: `1px solid ${enableCopyTrading ? 'rgba(56, 189, 248, 0.3)' : 'hsl(var(--border) / 0.6)'}`, display: 'grid', placeItems: 'center', color: enableCopyTrading ? '#38bdf8' : 'hsl(var(--muted-foreground))', flexShrink: 0, marginTop: '2px' }}>
                    <BoltIcon className="w-4 h-4" />
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'hsl(var(--foreground))', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <span>Enable Autonomous Swarm Copy-Trading</span>
                      <span style={{ fontSize: '9px', padding: '1px 6px', borderRadius: '4px', background: enableCopyTrading ? 'rgba(56, 189, 248, 0.15)' : 'hsl(var(--secondary))', color: enableCopyTrading ? '#38bdf8' : 'hsl(var(--muted-foreground))', border: `1px solid ${enableCopyTrading ? 'rgba(56, 189, 248, 0.3)' : 'hsl(var(--border))'}`, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                        {enableCopyTrading ? 'SWARM MIRROR ON' : 'TERMINAL COPILOT ONLY'}
                      </span>
                    </div>
                    <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'hsl(var(--muted-foreground))', lineHeight: 1.4 }}>
                      {enableCopyTrading
                        ? 'Volt, Oracle, and Titan will automatically mirror high-conviction trades from your wallet within your single & daily caps.'
                        : 'Leave OFF to use session delegation exclusively for fast 1-click execution when YOU trade with the AI Copilot in the Trade Terminal.'}
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
                    background: enableCopyTrading ? '#38bdf8' : 'hsl(var(--muted))',
                    border: 'none',
                    position: 'relative',
                    transition: 'background 0.2s ease',
                    padding: '2px',
                  }}
                  aria-label="Toggle autonomous swarm copy trading"
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

            {/* Duration Selector */}
            <div className="config-group">
              <div className="config-header-row">
                <label className="config-label">Session Duration</label>
                <span className="config-value-badge">{durationHours} Hours</span>
              </div>
              <div className="duration-grid">
                {durationOptions.map((opt) => (
                  <button
                    key={opt.hours}
                    type="button"
                    className={`duration-card ${durationHours === opt.hours ? 'active' : ''}`}
                    onClick={() => setDurationHours(opt.hours)}
                  >
                    <ClockIcon className="w-3.5 h-3.5" />
                    <span>{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

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
                  <strong>Hard Time Expiry</strong>
                  <p>Session automatically dissolves when duration expires.</p>
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
                    <InformationCircleIcon className="w-4 h-4 text-amber-400 shrink-0" />
                  ) : (
                    <ExclamationTriangleIcon className="w-4 h-4 text-rose-400 shrink-0" />
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
              onClick={handleCreate}
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
                      ? 'Update Session & On-Chain Permissions'
                      : 'Authorize On-Chain Session & Delegation'}
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

