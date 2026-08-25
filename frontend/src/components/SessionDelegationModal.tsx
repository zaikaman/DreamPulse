import React, { useState } from 'react';
import {
  ShieldCheck,
  KeyRound,
  Lock,
  Zap,
  Clock,
  Sliders,
  AlertTriangle,
  X,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Copy,
  Check,
  Coins,
  Layers,
  FileCheck2,
  LogOut,
} from 'lucide-react';
import type { SessionGrant } from '../types/index.js';
import type { WalletState } from '../hooks/useSessionKey.js';
import { SOMNIA_ADDRESSES } from '../services/web3.js';

interface SessionDelegationModalProps {
  isOpen: boolean;
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
  }) => Promise<SessionGrant>;
  onRevokeSession: (options?: { onChain?: boolean }) => Promise<void>;
  onEnsureAllowances?: () => Promise<void>;
  onRefreshAllowance?: () => Promise<void>;
  onClearError: () => void;
}

export const SessionDelegationModal: React.FC<SessionDelegationModalProps> = ({
  isOpen,
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
  const [copiedOperator, setCopiedOperator] = useState<boolean>(false);
  const [confirmRevoke, setConfirmRevoke] = useState<boolean>(false);
  const [revokeOnChainOption, setRevokeOnChainOption] = useState<boolean>(true);

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

  const getStepStatusText = () => {
    switch (stepState) {
      case 'authorizing_onchain':
        return 'Step 1/3: Confirming On-Chain Operator Approval on Somnia...';
      case 'depositing_vault':
        return 'Step 2/3: Approving Working Capital Collateral...';
      case 'signing_eip712':
        return 'Step 3/3: Signing EIP-712 Risk Ceilings in Wallet...';
      case 'registering_backend':
        return 'Registering Session with DreamPulse Swarm...';
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
          <div className="modal-title-group">
            <div className="modal-icon-badge">
              <KeyRound size={18} className="modal-badge-icon" />
            </div>
            <div>
              <h2 id="session-modal-title" className="modal-title">
                Non-Custodial Session Delegation
              </h2>
              <p className="modal-subtitle">
                Somnia OperatorPermissionsRegistry • On-Chain Approval & EIP-712 Guardrails
              </p>
            </div>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body">
          {/* Collateral & Gas Clarity Banner */}
          <div
            className="collateral-clarity-banner"
            style={{
              padding: '12px 14px',
              marginBottom: '14px',
              borderRadius: '8px',
              background:
                parseFloat(wallet.balanceCollateral || '0') === 0
                  ? 'rgba(245, 158, 11, 0.08)'
                  : 'rgba(16, 185, 129, 0.06)',
              border: `1px solid ${
                parseFloat(wallet.balanceCollateral || '0') === 0
                  ? 'rgba(245, 158, 11, 0.3)'
                  : 'rgba(16, 185, 129, 0.2)'
              }`,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '10px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {parseFloat(wallet.balanceCollateral || '0') === 0 ? (
                  <AlertTriangle size={16} style={{ color: 'var(--color-anomaly)' }} />
                ) : (
                  <CheckCircle2 size={16} style={{ color: 'var(--color-yes)' }} />
                )}
                <div>
                  <div style={{ fontWeight: 600, fontSize: '12px', color: 'var(--foreground)' }}>
                    {parseFloat(wallet.balanceCollateral || '0') === 0
                      ? 'Collateral Required: 0.00 tUSDC Detected'
                      : `Trading Collateral: ${wallet.balanceCollateral} tUSDC Available`}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>
                    <strong>STT</strong> is native gas ({wallet.balanceSTT || '0.00'} STT). DreamDEX CLOB trades require <strong>tUSDC</strong> collateral.
                  </div>
                </div>
              </div>

              {onClaimFaucet && parseFloat(wallet.balanceCollateral || '0') === 0 && (
                <button
                  type="button"
                  className="btn-faucet-action"
                  onClick={() => onClaimFaucet(1000)}
                  disabled={isFauceting}
                  style={{
                    background: 'var(--trade-anomaly)',
                    color: '#000',
                    fontWeight: 700,
                    fontSize: '11px',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  {isFauceting ? <Loader2 size={12} className="spin" /> : <Coins size={12} />}
                  <span>Claim 1,000 tUSDC Faucet</span>
                </button>
              )}
            </div>
          </div>

          {/* Active Session Notice if already authorized */}
          {activeSession && activeSession.isActive && (
            <div className="active-session-banner">
              <div className="active-session-header">
                <div className="status-indicator-live">
                  <span className="live-dot-green"></span>
                  <span className="active-session-text">Session Active & On-Chain Authorized</span>
                </div>
                <span className="active-session-expiry">
                  Expires: {new Date(activeSession.expiresAt).toLocaleTimeString()} (
                  {new Date(activeSession.expiresAt).toLocaleDateString()})
                </span>
              </div>

              {/* On-Chain Permissions Badge */}
              <div className="onchain-status-row" style={{ marginTop: '8px', fontSize: '11px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span style={{ color: 'var(--brand-cyan)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <ShieldCheck size={13} />
                  <span>On-Chain Permitted: <code>0x80054449</code> (placeOrderFor) + <code>0xe37b444b</code> (cancelOrderFor)</span>
                </span>
                {activeSession.onChainTxHash && (
                  <a
                    href={`https://shannon-explorer.somnia.network/tx/${activeSession.onChainTxHash}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: 'var(--brand-cyan)', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: '2px', marginLeft: 'auto' }}
                  >
                    <span>Tx Hash</span>
                    <ExternalLink size={10} />
                  </a>
                )}
              </div>

              <div className="active-session-stats-row" style={{ marginTop: '10px' }}>
                <div className="stat-pill">
                  <span className="stat-pill-label">Max / Trade:</span>
                  <span className="stat-pill-value">{activeSession.maxTradeSize} tUSDC</span>
                </div>
                <div className="stat-pill">
                  <span className="stat-pill-label">24h Daily Cap:</span>
                  <span className="stat-pill-value">{activeSession.dailyVolumeCap} tUSDC</span>
                </div>
                <div className="stat-pill">
                  <span className="stat-pill-label">Spent Today:</span>
                  <span className="stat-pill-value">{activeSession.spentToday.toFixed(2)} tUSDC</span>
                </div>
                {activeSession.vaultDepositAmount !== undefined && activeSession.vaultDepositAmount > 0 && (
                  <div className="stat-pill">
                    <span className="stat-pill-label">Vault Capital:</span>
                    <span className="stat-pill-value">{activeSession.vaultDepositAmount} tUSDC</span>
                  </div>
                )}
              </div>

              {confirmRevoke ? (
                <div className="revoke-confirm-box" style={{ marginTop: '12px' }}>
                  <span className="revoke-confirm-text">
                    Are you sure? This immediately halts autonomous trading and revokes permissions.
                  </span>
                  <div style={{ margin: '8px 0', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input
                      type="checkbox"
                      id="revoke-onchain-checkbox"
                      checked={revokeOnChainOption}
                      onChange={(e) => setRevokeOnChainOption(e.target.checked)}
                    />
                    <label htmlFor="revoke-onchain-checkbox" style={{ color: 'var(--foreground)', cursor: 'pointer' }}>
                      Submit On-Chain Revocation to OperatorPermissionsRegistry
                    </label>
                  </div>
                  <div className="revoke-btn-group">
                    <button
                      type="button"
                      className="btn-danger-solid"
                      onClick={handleRevoke}
                      disabled={isLoading}
                    >
                      {isLoading ? <Loader2 size={13} className="spin" /> : 'Yes, Revoke Now'}
                    </button>
                    <button
                      type="button"
                      className="btn-outline-subtle"
                      onClick={() => setConfirmRevoke(false)}
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
                        color: 'var(--muted-foreground)',
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
                      <LogOut size={12} />
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

          {/* Allowance Diagnostic Banner — surfaces 0x3fb0ba2e root cause */}
          {activeSession?.isActive && allowanceStatus && !allowanceStatus.allReady && (
            <div
              className="collateral-clarity-banner"
              style={{
                padding: '12px 14px',
                marginBottom: '14px',
                borderRadius: '8px',
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.35)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                <AlertTriangle size={16} style={{ color: '#ef4444', flexShrink: 0, marginTop: '2px' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: '12px', color: '#ef4444', marginBottom: '4px' }}>
                    Copy-Trading Paused: Insufficient Pool Allowance
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', lineHeight: 1.4, marginBottom: '8px' }}>
                    Your wallet approved the operator globally, but {allowanceStatus.checks.filter((c) => !c.ready).length} active pool(s) have
                    TestUSDC allowance &lt; 1000 USDC (vault &lt; 10). On-chain <code>placeBinaryOrderFor</code> reverts with <code>0x3fb0ba2e</code>.
                    Approve MAX for those pools to resume copy-trades. No withdrawal permission is granted.
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                    {allowanceStatus.checks.slice(0, 4).map((c) => (
                      <code
                        key={c.pool}
                        title={`${c.pool} — allowance ${c.allowanceHuman.toFixed(2)} / vault ${c.vaultHuman.toFixed(2)}`}
                        style={{
                          fontSize: '10px',
                          padding: '3px 6px',
                          background: c.ready ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
                          border: `1px solid ${c.ready ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
                          borderRadius: '4px',
                          color: c.ready ? 'var(--color-yes)' : '#ef4444',
                        }}
                      >
                        {c.pool.slice(0, 6)}…{c.pool.slice(-4)} {c.ready ? '✓' : `${c.allowanceHuman.toFixed(0)} USDC`}
                      </code>
                    ))}
                    {allowanceStatus.checks.length > 4 && (
                      <span style={{ fontSize: '10px', color: 'var(--muted-foreground)', alignSelf: 'center' }}>
                        +{allowanceStatus.checks.length - 4} more pools
                      </span>
                    )}
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
                        background: '#ef4444',
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
                      {isFixingAllowance ? <Loader2 size={12} className="spin" /> : <ShieldCheck size={12} />}
                      <span>Approve All Active Pools (MAX)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onRefreshAllowance?.()}
                      disabled={isFixingAllowance}
                      style={{
                        background: 'transparent',
                        color: 'var(--muted-foreground)',
                        fontWeight: 600,
                        fontSize: '11px',
                        padding: '7px 10px',
                        borderRadius: '6px',
                        border: '1px solid rgba(255,255,255,0.1)',
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

          {/* 3-Step Onboarding Architecture Banner */}
          <div className="safety-guarantees-card" style={{ padding: '12px 14px', marginBottom: '14px' }}>
            <div className="safety-card-title" style={{ marginBottom: '10px' }}>
              <Layers size={15} className="safety-icon-cyan" />
              <span>3-Step Autonomous Copy-Trading Setup</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', fontSize: '11px' }}>
              <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '8px', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                <strong style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--brand-cyan)' }}>
                  <Coins size={12} />
                  <span>1. Mint Collateral</span>
                </strong>
                <p style={{ margin: '4px 0 0 0', color: 'var(--muted-foreground)', lineHeight: 1.3 }}>
                  Hold TestUSDC collateral (or deposit working capital) to fund DreamDEX order fills.
                </p>
              </div>
              <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '8px', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                <strong style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--brand-cyan)' }}>
                  <ShieldCheck size={12} />
                  <span>2. On-Chain Auth</span>
                </strong>
                <p style={{ margin: '4px 0 0 0', color: 'var(--muted-foreground)', lineHeight: 1.3 }}>
                  Authorizes operator key on <code>OperatorPermissionsRegistry</code> for <code>placeOrderFor</code>.
                </p>
              </div>
              <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '8px', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                <strong style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--brand-cyan)' }}>
                  <FileCheck2 size={12} />
                  <span>3. EIP-712 Caps</span>
                </strong>
                <p style={{ margin: '4px 0 0 0', color: 'var(--muted-foreground)', lineHeight: 1.3 }}>
                  Binds maximum trade size and 24h daily spend ceilings without custody of your wallet.
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
                <Check size={12} style={{ color: 'var(--color-yes)' }} />
              ) : (
                <Copy size={12} />
              )}
            </div>
            <a
              href={`https://shannon-explorer.somnia.network/address/${SOMNIA_ADDRESSES.operatorAccount}`}
              target="_blank"
              rel="noreferrer"
              className="operator-explorer-link"
              title="View Delegated Operator on Somnia Explorer"
            >
              <ExternalLink size={12} />
            </a>
          </div>

          {/* Risk Limits Configuration Form */}
          <div className="risk-config-section">
            <h3 className="section-title">Configure Risk Ceilings & Working Capital</h3>

            {/* Working Capital Vault Deposit */}
            <div className="config-group">
              <div className="config-header-row">
                <label htmlFor="deposit-amount-slider" className="config-label" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Coins size={13} style={{ color: 'var(--brand-cyan)' }} />
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
                    <Clock size={13} />
                    <span>{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Zero-Custody Safety Guarantees */}
          <div className="safety-guarantees-card">
            <div className="safety-card-title">
              <ShieldCheck size={16} className="safety-icon-cyan" />
              <span>Mathematical Zero-Withdrawal Invariant</span>
            </div>
            <div className="safety-grid">
              <div className="safety-item">
                <Lock size={14} className="safety-mini-icon" />
                <div>
                  <strong>Zero Fund Access</strong>
                  <p>The operator key cannot transfer, withdraw, or approve ERC20 balances.</p>
                </div>
              </div>
              <div className="safety-item">
                <Zap size={14} className="safety-mini-icon" />
                <div>
                  <strong>Direct Settlement</strong>
                  <p>All position payouts settle directly to your connected wallet.</p>
                </div>
              </div>
              <div className="safety-item">
                <Clock size={14} className="safety-mini-icon" />
                <div>
                  <strong>Hard Time Expiry</strong>
                  <p>Session automatically dissolves when duration expires.</p>
                </div>
              </div>
              <div className="safety-item">
                <Sliders size={14} className="safety-mini-icon" />
                <div>
                  <strong>Enforced Caps</strong>
                  <p>Trades exceeding your single or daily limits are rejected on-chain.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="error-alert-box">
              <AlertTriangle size={15} className="error-icon" />
              <span>{error}</span>
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
                  <Loader2 size={15} className="spin" />
                  <span>Connecting Wallet...</span>
                </>
              ) : (
                <>
                  <KeyRound size={15} />
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
                  <Loader2 size={15} className="spin" />
                  <span>Switching Network...</span>
                </>
              ) : (
                <>
                  <Zap size={15} />
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
                  <Loader2 size={15} className="spin" />
                  <span>{getStepStatusText()}</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={15} />
                  <span>
                    {activeSession?.isActive
                      ? 'Update Session & On-Chain Permissions'
                      : 'Authorize On-Chain Session & Deposit'}
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

