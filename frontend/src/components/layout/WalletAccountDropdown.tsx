import React, { useState, useRef, useEffect } from 'react';
import {
  ShieldCheckIcon,
  KeyIcon,
  DocumentDuplicateIcon,
  CheckIcon,
  ArrowTopRightOnSquareIcon,
  ArrowLeftEndOnRectangleIcon,
  AdjustmentsHorizontalIcon,
  CurrencyDollarIcon,
  ChevronDownIcon,
  BoltIcon,
} from '@heroicons/react/24/outline';
import type { WalletState } from '../../hooks/useSessionKey.js';
import type { SessionGrant } from '../../types/index.js';
import { Spinner } from '../ui/Spinner.js';
import { formatCapAmount } from '../../lib/sessionUtils.js';

interface WalletAccountDropdownProps {
  wallet: WalletState;
  activeSession: SessionGrant | null;
  isFauceting?: boolean;
  onClaimFaucet?: (amount?: number) => Promise<void>;
  onOpenSessionModal: () => void;
  onDisconnectWallet: () => void;
  onSwitchNetwork?: () => Promise<void>;
  isOperator?: boolean;
}

export const WalletAccountDropdown: React.FC<WalletAccountDropdownProps> = ({
  wallet,
  activeSession,
  isFauceting = false,
  onClaimFaucet,
  onOpenSessionModal,
  onDisconnectWallet,
  onSwitchNetwork,
  isOperator = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleCopy = () => {
    if (wallet.address) {
      navigator.clipboard.writeText(wallet.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleOpenSettings = () => {
    setIsOpen(false);
    onOpenSessionModal();
  };

  const handleDisconnect = () => {
    setIsOpen(false);
    onDisconnectWallet();
  };

  const explorerUrl = wallet.address
    ? `https://shannon-explorer.somnia.network/address/${wallet.address}`
    : '#';

  const isSessionActive = Boolean(activeSession?.isActive);

  return (
    <div className="wallet-dropdown-container" ref={dropdownRef} style={{ position: 'relative' }}>
      {/* Trigger Button */}
      <button
        type="button"
        className={`btn-header-session ${isSessionActive ? 'active' : 'inactive'}`}
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '5px 9px',
          background: isSessionActive ? 'rgba(0, 255, 204, 0.08)' : '#18181b',
          borderColor: isSessionActive ? 'rgba(0, 255, 204, 0.35)' : 'var(--border)',
        }}
        title="View Wallet Details & Account Settings"
      >
        {isSessionActive ? (
          <>
            <ShieldCheckIcon className="w-3.5 h-3.5" style={{ color: 'var(--brand-cyan)' }} />
            <span className="tabular-num" style={{ fontWeight: 600 }}>
              {wallet.address?.slice(0, 5)}...{wallet.address?.slice(-3)}
            </span>
            <span className="header-session-badge active">ACTIVE</span>
          </>
        ) : (
          <>
            <KeyIcon className="w-3.5 h-3.5" style={{ color: 'var(--brand-cyan)' }} />
            <span className="tabular-num" style={{ fontWeight: 600 }}>
              {wallet.address?.slice(0, 5)}...{wallet.address?.slice(-3)}
            </span>
            <span className="header-session-badge delegate">DIRECT</span>
          </>
        )}
        <ChevronDownIcon
          className="w-3 h-3"
          style={{
            color: 'var(--muted-foreground)',
            transition: 'transform 0.2s ease',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        />
      </button>

      {/* Dropdown Popover */}
      {isOpen && (
        <div
          className="wallet-account-popover"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: '320px',
            background: '#0d1117',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '10px',
            boxShadow: '0 16px 40px rgba(0, 0, 0, 0.7), 0 0 20px rgba(0, 240, 255, 0.08)',
            padding: '16px',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            backdropFilter: 'blur(16px)',
          }}
        >
          {/* Header: Address & Network */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted-foreground)', letterSpacing: '0.05em' }}>
                CONNECTED WALLET
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span
                  style={{
                    fontSize: '9px',
                    fontWeight: 700,
                    padding: '1px 6px',
                    borderRadius: '4px',
                    background: isOperator ? 'rgba(255, 170, 0, 0.15)' : 'rgba(0, 240, 255, 0.15)',
                    color: isOperator ? 'var(--trade-anomaly)' : 'var(--brand-cyan)',
                  }}
                >
                  {isOperator ? 'OPERATOR' : 'TRADER'}
                </span>
                <span
                  style={{
                    fontSize: '9px',
                    fontWeight: 600,
                    padding: '1px 6px',
                    borderRadius: '4px',
                    background: 'rgba(0, 255, 136, 0.12)',
                    color: 'var(--trade-yes)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--trade-yes)' }}></span>
                  Shannon
                </span>
              </div>
            </div>

            {/* Address bar with Copy and Explorer */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '6px',
                padding: '7px 10px',
              }}
            >
              <span className="tabular-num" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--foreground)' }}>
                {wallet.address ? `${wallet.address.slice(0, 8)}...${wallet.address.slice(-6)}` : ''}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <button
                  type="button"
                  onClick={handleCopy}
                  title="Copy Full Address"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: copied ? 'var(--trade-yes)' : 'var(--muted-foreground)',
                    cursor: 'pointer',
                    padding: '3px',
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  {copied ? <CheckIcon className="w-3.5 h-3.5" /> : <DocumentDuplicateIcon className="w-3.5 h-3.5" />}
                </button>
                <a
                  href={explorerUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  title="View on Somnia Explorer"
                  style={{
                    color: 'var(--muted-foreground)',
                    padding: '3px',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>

            {!wallet.isCorrectNetwork && onSwitchNetwork && (
              <button
                type="button"
                onClick={onSwitchNetwork}
                style={{
                  background: 'rgba(255, 183, 0, 0.15)',
                  border: '1px solid rgba(255, 183, 0, 0.35)',
                  color: 'var(--trade-anomaly)',
                  borderRadius: '6px',
                  padding: '6px 10px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <BoltIcon className="w-3 h-3" />
                <span>Switch to Somnia Testnet (50312)</span>
              </button>
            )}
          </div>

          {/* Balances Card */}
          <div
            style={{
              background: 'rgba(0, 0, 0, 0.35)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              borderRadius: '8px',
              padding: '10px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '10px', color: 'var(--muted-foreground)', fontWeight: 600 }}>TRADING COLLATERAL</span>
                <span className="tabular-num" style={{ fontSize: '14px', fontWeight: 700, color: 'var(--foreground)' }}>
                  {wallet.balanceCollateral || '0.00'} <span style={{ fontSize: '11px', color: 'var(--brand-cyan)' }}>tUSDC</span>
                </span>
              </div>
              {onClaimFaucet && (
                <button
                  type="button"
                  onClick={() => onClaimFaucet(1000)}
                  disabled={isFauceting}
                  style={{
                    background: 'rgba(0, 240, 255, 0.12)',
                    border: '1px solid rgba(0, 240, 255, 0.3)',
                    color: 'var(--brand-cyan)',
                    padding: '4px 8px',
                    borderRadius: '5px',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: isFauceting ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                  title="Claim 1,000 TestUSDC for DreamDEX event trading"
                >
                  {isFauceting ? <Spinner size="xs" variant="cyan" /> : <CurrencyDollarIcon className="w-3 h-3" />}
                  <span>+1k Faucet</span>
                </button>
              )}
            </div>

            <div style={{ height: '1px', background: 'rgba(255, 255, 255, 0.06)' }} />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '10px', color: 'var(--muted-foreground)', fontWeight: 600 }}>NATIVE GAS</span>
                <span className="tabular-num" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--foreground)' }}>
                  {wallet.balanceSTT || '0.0000'} <span style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>STT</span>
                </span>
              </div>
            </div>
          </div>

          {/* Session Delegation Summary */}
          <div
            style={{
              background: isSessionActive ? 'rgba(0, 255, 204, 0.04)' : 'rgba(255, 255, 255, 0.02)',
              border: `1px solid ${isSessionActive ? 'rgba(0, 255, 204, 0.2)' : 'rgba(255, 255, 255, 0.06)'}`,
              borderRadius: '8px',
              padding: '10px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {isSessionActive ? (
                  <ShieldCheckIcon className="w-3.5 h-3.5" style={{ color: 'var(--trade-yes)' }} />
                ) : (
                  <KeyIcon className="w-3.5 h-3.5" style={{ color: 'var(--brand-cyan)' }} />
                )}
                <span style={{ fontSize: '11px', fontWeight: 600, color: isSessionActive ? 'var(--trade-yes)' : 'var(--foreground)' }}>
                  {isSessionActive ? 'Session Delegation Active' : 'Direct Wallet Mode'}
                </span>
              </div>
            </div>

            {isSessionActive && activeSession && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--muted-foreground)' }}>
                <span>Cap: {formatCapAmount(activeSession.maxTradeSize)}/trade</span>
                <span>24h: {activeSession.spentToday || 0} / {formatCapAmount(activeSession.dailyVolumeCap)}</span>
              </div>
            )}

            <button
              type="button"
              onClick={handleOpenSettings}
              style={{
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: 'var(--foreground)',
                borderRadius: '6px',
                padding: '6px 10px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                marginTop: '4px',
                transition: 'all 0.15s ease',
              }}
            >
              <AdjustmentsHorizontalIcon className="w-3 h-3" style={{ color: 'var(--brand-cyan)' }} />
              <span>{isSessionActive ? 'Update Session & Risk Limits' : 'Configure Non-Custodial Session'}</span>
            </button>
          </div>

          {/* Footer Action: Disconnect Button */}
          <div style={{ paddingTop: '2px' }}>
            <button
              type="button"
              onClick={handleDisconnect}
              style={{
                width: '100%',
                background: 'rgba(255, 59, 48, 0.08)',
                border: '1px solid rgba(255, 59, 48, 0.25)',
                color: 'var(--trade-no)',
                borderRadius: '6px',
                padding: '7px 12px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                transition: 'all 0.15s ease',
              }}
            >
              <ArrowLeftEndOnRectangleIcon className="w-3 h-3" />
              <span>Disconnect Wallet</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
