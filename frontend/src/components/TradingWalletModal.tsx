import React, { useState, useEffect } from 'react';
import {
  XMarkIcon,
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  WalletIcon,
  ShieldCheckIcon,
  CurrencyDollarIcon,
  ExclamationCircleIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';
import { Spinner } from './ui/Spinner.js';
import { Button } from './ui/button.js';
import type { WalletState } from '../hooks/useSessionKey.js';

interface TradingWalletModalProps {
  isOpen: boolean;
  initialTab?: 'deposit' | 'withdraw';
  onClose: () => void;
  wallet: WalletState;
  cloneAddress: string | null;
  cloneBalance: string;
  onDeposit: (amount: number) => Promise<void>;
  onWithdraw: (amount?: number) => Promise<void>;
  onClaimFaucet?: (amount?: number) => Promise<void>;
  isFauceting?: boolean;
}

export const TradingWalletModal: React.FC<TradingWalletModalProps> = ({
  isOpen,
  initialTab = 'deposit',
  onClose,
  wallet,
  cloneAddress,
  cloneBalance,
  onDeposit,
  onWithdraw,
  onClaimFaucet,
  isFauceting = false,
}) => {
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw'>(initialTab);
  const [amountStr, setAmountStr] = useState<string>('50');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setError(null);
      setSuccessMessage(null);
      if (initialTab === 'deposit') {
        const walletBal = parseFloat(wallet.balanceCollateral || '0');
        setAmountStr(walletBal >= 50 ? '50' : walletBal > 0 ? walletBal.toFixed(2) : '10');
      } else {
        const cBal = parseFloat(cloneBalance || '0');
        setAmountStr(cBal > 0 ? cBal.toFixed(2) : '0');
      }
    }
  }, [isOpen, initialTab, cloneBalance, wallet.balanceCollateral]);

  if (!isOpen) return null;

  const walletBalanceNum = parseFloat(wallet.balanceCollateral || '0');
  const cloneBalanceNum = parseFloat(cloneBalance || '0');

  const WITHDRAWAL_FEE = 1.0;
  const MIN_WITHDRAWAL = 1.0;

  const handleQuickPercent = (pct: number) => {
    const base = activeTab === 'deposit' ? walletBalanceNum : cloneBalanceNum;
    const computed = (base * pct) / 100;
    setAmountStr(computed > 0 ? computed.toFixed(2) : '0');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseFloat(amountStr);
    if (isNaN(parsed) || parsed <= 0) {
      setError('Please enter a valid amount greater than 0.');
      return;
    }

    if (activeTab === 'deposit' && parsed > walletBalanceNum) {
      setError(`Amount exceeds your wallet balance of $${walletBalanceNum.toFixed(2)} tUSDC.`);
      return;
    }

    if (activeTab === 'withdraw') {
      if (parsed < MIN_WITHDRAWAL) {
        setError(`Minimum withdrawal is $${MIN_WITHDRAWAL.toFixed(2)} tUSDC.`);
        return;
      }
      if (parsed > cloneBalanceNum) {
        setError(`Amount exceeds your trading account balance of $${cloneBalanceNum.toFixed(2)} tUSDC.`);
        return;
      }
    }

    setError(null);
    setSuccessMessage(null);
    setIsSubmitting(true);

    try {
      if (activeTab === 'deposit') {
        await onDeposit(parsed);
        setSuccessMessage(`Successfully deposited $${parsed.toFixed(2)} tUSDC into your Trading Wallet.`);
      } else {
        await onWithdraw(parsed);
        const netReceived = Math.max(0, parsed - WITHDRAWAL_FEE);
        setSuccessMessage(
          `Successfully withdrawn $${parsed.toFixed(2)} tUSDC ($${netReceived.toFixed(2)} net after $${WITHDRAWAL_FEE.toFixed(2)} fee) to your connected wallet.`
        );
      }
    } catch (err: any) {
      setError(err?.message || 'Transaction failed. Please check wallet approval.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-2xl border border-border/80 bg-card/95 p-6 shadow-2xl backdrop-blur-xl">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-border/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20">
              <WalletIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground tracking-tight">
                Trading Account Vault
              </h2>
              <p className="text-xs text-muted-foreground font-mono">
                {cloneAddress
                  ? `${cloneAddress.slice(0, 6)}...${cloneAddress.slice(-4)}`
                  : 'Isolated Smart Account'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors cursor-pointer"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="grid grid-cols-2 gap-1.5 p-1 my-4 bg-secondary/50 rounded-xl border border-border/40 font-mono text-xs">
          <button
            type="button"
            onClick={() => {
              setActiveTab('deposit');
              setError(null);
              setSuccessMessage(null);
            }}
            className={`flex items-center justify-center gap-2 py-2 rounded-lg font-semibold transition-all cursor-pointer ${
              activeTab === 'deposit'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <ArrowDownTrayIcon className="w-4 h-4" />
            <span>Deposit</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('withdraw');
              setError(null);
              setSuccessMessage(null);
            }}
            className={`flex items-center justify-center gap-2 py-2 rounded-lg font-semibold transition-all cursor-pointer ${
              activeTab === 'withdraw'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <ArrowUpTrayIcon className="w-4 h-4" />
            <span>Withdraw</span>
          </button>
        </div>

        {/* Balance Overview Cards */}
        <div className="grid grid-cols-2 gap-2.5 mb-4">
          <div className="p-3 rounded-xl bg-muted/30 border border-border/40">
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block mb-1">
              Trading Wallet
            </span>
            <span className="text-sm font-mono font-semibold text-[#00ffcc]">
              ${cloneBalanceNum.toFixed(2)}{' '}
              <span className="text-[10px] font-normal text-muted-foreground">tUSDC</span>
            </span>
          </div>
          <div className="p-3 rounded-xl bg-muted/30 border border-border/40">
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block mb-1">
              Main Wallet
            </span>
            <span className="text-sm font-mono font-semibold text-foreground">
              ${walletBalanceNum.toFixed(2)}{' '}
              <span className="text-[10px] font-normal text-muted-foreground">tUSDC</span>
            </span>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-foreground">
                {activeTab === 'deposit' ? 'Deposit Amount' : 'Withdraw Amount'}
              </label>
              <span className="text-[11px] font-mono text-muted-foreground">
                Available:{' '}
                <span className="text-foreground font-medium">
                  ${(activeTab === 'deposit' ? walletBalanceNum : cloneBalanceNum).toFixed(2)} tUSDC
                </span>
              </span>
            </div>

            <div className="relative">
              <input
                type="number"
                step="any"
                min="0"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                placeholder="0.00"
                disabled={isSubmitting}
                className="w-full h-11 px-3.5 pr-20 rounded-xl bg-background/80 border border-border/70 font-mono text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-mono font-medium text-muted-foreground pointer-events-none">
                tUSDC
              </span>
            </div>

            {/* Quick Percentage Pills */}
            <div className="flex items-center gap-1.5 mt-2">
              {[25, 50, 75, 100].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => handleQuickPercent(pct)}
                  disabled={isSubmitting}
                  className="flex-1 py-1 rounded-md bg-secondary/40 hover:bg-secondary/80 border border-border/30 text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  {pct === 100 ? 'Max' : `${pct}%`}
                </button>
              ))}
            </div>

            {/* Withdrawal Fee Breakdown */}
            {activeTab === 'withdraw' && (
              <div className="p-3 rounded-xl bg-secondary/30 border border-border/40 space-y-2 text-xs mt-3">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Gross Withdrawal</span>
                  <span className="font-mono text-foreground">
                    ${!isNaN(parseFloat(amountStr)) && parseFloat(amountStr) > 0 ? parseFloat(amountStr).toFixed(2) : '0.00'} tUSDC
                  </span>
                </div>
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span>Protocol Fee</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 font-mono">
                      Fixed
                    </span>
                  </span>
                  <span className="font-mono text-amber-300">
                    -${WITHDRAWAL_FEE.toFixed(2)} tUSDC
                  </span>
                </div>
                <div className="pt-2 border-t border-border/30 flex items-center justify-between font-semibold">
                  <span className="text-foreground">Net to Wallet</span>
                  <span className="font-mono text-[#00ffcc]">
                    ${!isNaN(parseFloat(amountStr)) && parseFloat(amountStr) >= WITHDRAWAL_FEE
                      ? (parseFloat(amountStr) - WITHDRAWAL_FEE).toFixed(2)
                      : '0.00'}{' '}
                    tUSDC
                  </span>
                </div>
                <div className="text-[10px] text-muted-foreground/80 font-mono flex items-center justify-between pt-1">
                  <span>Minimum per withdrawal:</span>
                  <span className="text-foreground font-medium">${MIN_WITHDRAWAL.toFixed(2)} tUSDC</span>
                </div>
              </div>
            )}
          </div>

          {/* Insufficient Clone Balance Warning on Withdraw */}
          {activeTab === 'withdraw' && cloneBalanceNum < MIN_WITHDRAWAL && (
            <div className="flex items-start gap-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
              <ExclamationCircleIcon className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-400" />
              <span>
                Trading balance (${cloneBalanceNum.toFixed(2)} tUSDC) is below the minimum withdrawal threshold of $1.00 tUSDC.
              </span>
            </div>
          )}

          {/* Faucet Callout if Main Wallet is Empty on Deposit */}
          {activeTab === 'deposit' && walletBalanceNum === 0 && onClaimFaucet && (
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs">
              <span className="text-amber-300">Wallet balance is 0.00 tUSDC.</span>
              <button
                type="button"
                onClick={() => onClaimFaucet(1000)}
                disabled={isFauceting}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-200 font-mono text-[11px] hover:bg-amber-500/30 transition-colors cursor-pointer"
              >
                {isFauceting ? <Spinner size="xs" variant="amber" /> : <CurrencyDollarIcon className="w-3 h-3" />}
                <span>Claim 1,000 Faucet</span>
              </button>
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300">
              <ExclamationCircleIcon className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Success Banner */}
          {successMessage && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300">
              <CheckCircleIcon className="w-4 h-4 flex-shrink-0 mt-0.5 text-emerald-400" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Non-Custodial Vault Guarantee */}
          <div className="flex items-start gap-2 p-2.5 rounded-xl bg-muted/20 border border-border/30 text-[11px] text-muted-foreground leading-relaxed">
            <ShieldCheckIcon className="w-4 h-4 text-[#00ffcc] flex-shrink-0 mt-0.5" />
            <span>
              Isolated Vault: Orders only spend from your Trading Account. Your main wallet is 100% isolated and cannot be touched by bots or smart contracts.
            </span>
          </div>

          {/* Action Button */}
          <Button
            type="submit"
            disabled={
              isSubmitting ||
              (activeTab === 'deposit' && walletBalanceNum === 0) ||
              (activeTab === 'withdraw' && cloneBalanceNum < MIN_WITHDRAWAL)
            }
            className="w-full h-11 text-xs font-semibold gap-2 cursor-pointer shadow-sm"
          >
            {isSubmitting ? (
              <>
                <Spinner size="sm" />
                <span>Confirming in Wallet...</span>
              </>
            ) : activeTab === 'deposit' ? (
              <>
                <ArrowDownTrayIcon className="w-4 h-4" />
                <span>Deposit to Trading Account</span>
              </>
            ) : (
              <>
                <ArrowUpTrayIcon className="w-4 h-4" />
                <span>Withdraw to Wallet</span>
              </>
            )}
          </Button>
        </form>
      </div>
    </div>
  );
};
