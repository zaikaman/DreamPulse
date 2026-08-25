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
  error: string | null;
  onConnectWallet: () => Promise<void>;
  onSwitchNetwork: () => Promise<void>;
  onCreateSession: (params: {
    maxTradeSize: number;
    dailyVolumeCap: number;
    durationHours: number;
  }) => Promise<SessionGrant>;
  onRevokeSession: () => Promise<void>;
  onClearError: () => void;
}

export const SessionDelegationModal: React.FC<SessionDelegationModalProps> = ({
  isOpen,
  onClose,
  wallet,
  activeSession,
  isSigning,
  isLoading,
  error,
  onConnectWallet,
  onSwitchNetwork,
  onCreateSession,
  onRevokeSession,
  onClearError,
}) => {
  const [maxTradeSize, setMaxTradeSize] = useState<number>(10);
  const [dailyVolumeCap, setDailyVolumeCap] = useState<number>(100);
  const [durationHours, setDurationHours] = useState<number>(24);
  const [copiedOperator, setCopiedOperator] = useState<boolean>(false);
  const [confirmRevoke, setConfirmRevoke] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleCopyOperator = () => {
    navigator.clipboard.writeText(SOMNIA_ADDRESSES.operatorPermissionsRegistry);
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
      });
      onClose();
    } catch {
      // error handled in hook
    }
  };

  const handleRevoke = async () => {
    onClearError();
    try {
      await onRevokeSession();
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
                Somnia OperatorPermissionsRegistry • EIP-712 Scoped Authorization
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
          {/* Active Session Notice if already authorized */}
          {activeSession && activeSession.isActive && (
            <div className="active-session-banner">
              <div className="active-session-header">
                <div className="status-indicator-live">
                  <span className="live-dot-green"></span>
                  <span className="active-session-text">Session Active & Authorized</span>
                </div>
                <span className="active-session-expiry">
                  Expires: {new Date(activeSession.expiresAt).toLocaleTimeString()} (
                  {new Date(activeSession.expiresAt).toLocaleDateString()})
                </span>
              </div>
              <div className="active-session-stats-row">
                <div className="stat-pill">
                  <span className="stat-pill-label">Max / Trade:</span>
                  <span className="stat-pill-value">{activeSession.maxTradeSize} STT</span>
                </div>
                <div className="stat-pill">
                  <span className="stat-pill-label">24h Daily Cap:</span>
                  <span className="stat-pill-value">{activeSession.dailyVolumeCap} STT</span>
                </div>
                <div className="stat-pill">
                  <span className="stat-pill-label">Spent Today:</span>
                  <span className="stat-pill-value">{activeSession.spentToday.toFixed(2)} STT</span>
                </div>
              </div>

              {confirmRevoke ? (
                <div className="revoke-confirm-box">
                  <span className="revoke-confirm-text">
                    Are you sure? This immediately halts all autonomous trading for your wallet.
                  </span>
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
                <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end' }}>
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

          {/* Operator Contract Information */}
          <div className="operator-info-row">
            <span className="operator-label">Delegated Operator:</span>
            <div className="operator-address-chip" onClick={handleCopyOperator} title="Click to copy address">
              <code>{SOMNIA_ADDRESSES.operatorPermissionsRegistry}</code>
              {copiedOperator ? (
                <Check size={12} style={{ color: 'var(--color-yes)' }} />
              ) : (
                <Copy size={12} />
              )}
            </div>
            <a
              href={`https://shannon-explorer.somnia.network/address/${SOMNIA_ADDRESSES.operatorPermissionsRegistry}`}
              target="_blank"
              rel="noreferrer"
              className="operator-explorer-link"
              title="View on Somnia Explorer"
            >
              <ExternalLink size={12} />
            </a>
          </div>

          {/* Risk Limits Configuration Form */}
          <div className="risk-config-section">
            <h3 className="section-title">Configure Risk Ceilings</h3>

            {/* Max Trade Size Slider */}
            <div className="config-group">
              <div className="config-header-row">
                <label htmlFor="max-trade-slider" className="config-label">
                  Max Trade Size Limit
                </label>
                <span className="config-value-badge">{maxTradeSize} STT</span>
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
                    {val} STT
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
                <span className="config-value-badge">{dailyVolumeCap} STT</span>
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
                    {val} STT
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
                  <span>Sign EIP-712 Grant in Wallet...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={15} />
                  <span>
                    {activeSession?.isActive
                      ? 'Update Session Guardrails'
                      : 'Sign & Authorize Non-Custodial Session'}
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
