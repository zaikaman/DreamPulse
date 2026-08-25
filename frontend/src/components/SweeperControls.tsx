import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  RefreshCw,
  ExternalLink,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  ShieldCheck,
  Wallet,
  Eye,
  Bot,
  User,
  Lock,
} from 'lucide-react';
import { apiClient } from '../services/api.js';
import { SOMNIA_ADDRESSES } from '../services/web3.js';
import type { SettlementSweep } from '../types/index.js';
import { ClaimCelebration } from './ClaimCelebration.js';

interface SweeperControlsProps {
  userAddress?: string;
  onRefreshPortfolio?: () => void;
  onConnectWallet?: () => Promise<void>;
}

export const SweeperControls: React.FC<SweeperControlsProps> = ({
  userAddress,
  onRefreshPortfolio,
  onConnectWallet,
}) => {
  const [scope, setScope] = useState<'USER' | 'PROTOCOL'>(userAddress ? 'USER' : 'PROTOCOL');

  useEffect(() => {
    if (userAddress) {
      setScope('USER');
    }
  }, [userAddress]);

  const activeAddress = scope === 'USER' && userAddress ? userAddress : SOMNIA_ADDRESSES.operatorAccount;
  const isViewingSelf = scope === 'USER' && !!userAddress;

  const [autoCompound, setAutoCompound] = useState<boolean>(true);
  const [isSweeping, setIsSweeping] = useState<boolean>(false);
  const [history, setHistory] = useState<SettlementSweep[]>([]);
  const [unclaimedAmount, setUnclaimedAmount] = useState<number>(0);
  const [totalClaimedAllTime, setTotalClaimedAllTime] = useState<number>(0);
  const [claimableMarketsCount, setClaimableMarketsCount] = useState<number>(0);

  const [compoundedStats, setCompoundedStats] = useState<{
    totalCompoundedAmount: number;
    reinvestedCycles: number;
    lastCompoundedAt?: string;
  }>({
    totalCompoundedAmount: 0,
    reinvestedCycles: 0,
  });

  // Celebration modal state
  const [celebrationState, setCelebrationState] = useState<{
    isOpen: boolean;
    amount: string;
    txHash?: string;
  }>({
    isOpen: false,
    amount: '',
  });

  const fetchSweeperData = async () => {
    try {
      const [summaryRes, historyRes] = await Promise.all([
        apiClient.getSweeperSummary(activeAddress).catch(() => null),
        apiClient.getSweepHistory(activeAddress).catch(() => null),
      ]);

      if (summaryRes?.success && summaryRes.data) {
        setUnclaimedAmount(summaryRes.data.unclaimedAmount || 0);
        setTotalClaimedAllTime(summaryRes.data.totalClaimedAllTime || 0);
        setClaimableMarketsCount(summaryRes.data.claimableMarketsCount || 0);
        if (summaryRes.data.compoundedStats) {
          setCompoundedStats({
            totalCompoundedAmount: summaryRes.data.compoundedStats.totalCompoundedAmount || 0,
            reinvestedCycles: summaryRes.data.compoundedStats.reinvestedCycles || 0,
            lastCompoundedAt: summaryRes.data.compoundedStats.lastCompoundedAt,
          });
        }
      }

      if (historyRes?.success && Array.isArray(historyRes.data)) {
        setHistory(historyRes.data);
      }
    } catch (err: any) {
      console.warn('[SweeperControls] Fetch data error:', err);
    }
  };

  useEffect(() => {
    fetchSweeperData();
    const interval = setInterval(() => {
      fetchSweeperData();
    }, 15000);
    return () => clearInterval(interval);
  }, [activeAddress, scope]);

  const handleManualSweep = async () => {
    if (!activeAddress) return;
    setIsSweeping(true);
    try {
      const res = await apiClient.triggerSweep(activeAddress, autoCompound);
      if (res.success) {
        setCelebrationState({
          isOpen: true,
          amount: res.totalClaimedAmount,
          txHash: res.txHash,
        });

        const claimedNum = parseFloat(res.totalClaimedAmount.replace(/[^0-9.]/g, '')) || 0;
        setTotalClaimedAllTime((prev) => Number((prev + claimedNum).toFixed(2)));
        setUnclaimedAmount(0);

        await fetchSweeperData();
        if (onRefreshPortfolio) onRefreshPortfolio();
      }
    } catch (err: any) {
      console.warn('[SweeperControls] Sweep trigger error:', err);
    } finally {
      setIsSweeping(false);
    }
  };

  return (
    <div className="sweeper-controls-container" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Watch-Only / Identity Banner */}
      {!userAddress && (
        <div
          style={{
            background: 'rgba(0, 240, 255, 0.04)',
            border: '1px solid rgba(0, 240, 255, 0.2)',
            borderRadius: '8px',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Eye size={16} style={{ color: 'var(--brand-cyan)' }} />
            <div style={{ fontSize: '12px', color: 'var(--muted-foreground)' }}>
              <span style={{ color: 'var(--foreground)', fontWeight: 600 }}>Watch-Only Mode: </span>
              Displaying the public Somnia Protocol Sweeper daemon. Connect your wallet to scan and claim your personal winning event contracts.
            </div>
          </div>
          {onConnectWallet && (
            <button
              type="button"
              onClick={onConnectWallet}
              className="btn-header-wallet"
              style={{ fontSize: '11px', padding: '4px 10px' }}
            >
              <Wallet size={12} />
              <span>Connect Wallet</span>
            </button>
          )}
        </div>
      )}

      {/* 1. Header Protocol & Stats Summary */}
      <div className="terminal-panel" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '6px',
                  background: 'rgba(0, 240, 255, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--brand-cyan)',
                }}
              >
                <Sparkles size={18} />
              </div>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>
                  Autonomous Settlement Sweeper & Compounder
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--muted-foreground)', marginTop: '2px' }}>
                  <span style={{ color: 'var(--trade-buy)', fontWeight: 600 }}>DAEMON STATUS: ACTIVE (30S SCAN LOOP)</span>
                  <span>•</span>
                  <span>100% Collateral Auto-Compounding Enabled</span>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Scope Badge */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                borderRadius: '6px',
                background: isViewingSelf ? 'rgba(0, 255, 102, 0.08)' : 'rgba(0, 240, 255, 0.08)',
                border: `1px solid ${isViewingSelf ? 'rgba(0, 255, 102, 0.25)' : 'rgba(0, 240, 255, 0.25)'}`,
                fontSize: '11px',
                color: isViewingSelf ? 'var(--trade-buy)' : 'var(--brand-cyan)',
                fontWeight: 600,
              }}
            >
              {isViewingSelf ? <User size={12} /> : <Bot size={12} />}
              <span>{isViewingSelf ? 'Viewing Your Wallet' : 'Viewing Protocol Operator'}</span>
              <code style={{ fontSize: '10px', opacity: 0.8 }}>
                ({activeAddress ? `${activeAddress.slice(0, 6)}...${activeAddress.slice(-4)}` : '0x...'})
              </code>
            </div>

            {/* Auto-Compound State Toggle Button */}
            {userAddress ? (
              <button
                type="button"
                onClick={() => setAutoCompound((prev) => !prev)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  background: autoCompound ? 'rgba(0, 255, 102, 0.08)' : 'rgba(255, 77, 77, 0.08)',
                  border: `1px solid ${autoCompound ? 'rgba(0, 255, 102, 0.25)' : 'rgba(255, 77, 77, 0.25)'}`,
                  fontSize: '11px',
                  color: autoCompound ? 'var(--trade-buy)' : 'var(--trade-sell)',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <ShieldCheck size={13} />
                <span>{autoCompound ? '100% Auto-Compound ON' : 'Compounding OFF'}</span>
              </button>
            ) : (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  background: 'rgba(0, 255, 102, 0.06)',
                  border: '1px solid rgba(0, 255, 102, 0.2)',
                  fontSize: '11px',
                  color: 'var(--trade-buy)',
                  fontWeight: 600,
                }}
              >
                <Lock size={12} style={{ opacity: 0.7 }} />
                <span>100% Auto-Compound ON (Protocol)</span>
              </div>
            )}

            {/* Sweep Action Button */}
            {userAddress ? (
              <button
                type="button"
                onClick={handleManualSweep}
                disabled={isSweeping || unclaimedAmount <= 0}
                className="btn-primary"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 14px',
                  fontSize: '12px',
                  opacity: unclaimedAmount <= 0 ? 0.6 : 1,
                }}
              >
                <RefreshCw size={13} className={isSweeping ? 'animate-spin' : ''} />
                <span>{isSweeping ? 'Sweeping Payouts...' : unclaimedAmount > 0 ? `Sweep ${unclaimedAmount.toFixed(2)} tUSDC` : 'Sweep Now'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onConnectWallet}
                className="btn-header-wallet"
                style={{ fontSize: '11px', padding: '6px 12px' }}
              >
                <Wallet size={12} />
                <span>Connect to Sweep</span>
              </button>
            )}
          </div>
        </div>

        {/* 3 Compounding Stats Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginTop: '16px' }}>
          {/* Card 1: Pending Unclaimed */}
          <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '14px 18px', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>
                {isViewingSelf ? 'Pending Personal Unclaimed' : 'Pending Protocol Unclaimed'}
              </span>
              {unclaimedAmount > 0 && (
                <span style={{ fontSize: '9px', background: 'rgba(0, 240, 255, 0.15)', color: 'var(--brand-cyan)', padding: '1px 5px', borderRadius: '4px', fontWeight: 700 }}>
                  {claimableMarketsCount} MARKETS READY
                </span>
              )}
            </div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: unclaimedAmount > 0 ? 'var(--brand-cyan)' : 'var(--foreground)', fontFamily: 'var(--font-mono)' }}>
              {unclaimedAmount.toFixed(2)} tUSDC
            </div>
          </div>

          {/* Card 2: Total Claimed All-Time (100%) */}
          <div style={{ background: 'rgba(0, 255, 102, 0.04)', padding: '14px 18px', borderRadius: '8px', border: '1px solid rgba(0, 255, 102, 0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontSize: '11px', color: 'var(--trade-buy)' }}>Total Compounded (100%)</span>
              <span style={{ fontSize: '9px', background: 'rgba(0, 255, 102, 0.15)', color: 'var(--trade-buy)', padding: '1px 5px', borderRadius: '4px', fontWeight: 700 }}>
                TRADING
              </span>
            </div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--trade-buy)', fontFamily: 'var(--font-mono)' }}>
              +{totalClaimedAllTime.toFixed(2)} tUSDC
            </div>
          </div>

          {/* Card 3: Reinvested Trading Capital */}
          <div style={{ background: 'rgba(0, 240, 255, 0.04)', padding: '14px 18px', borderRadius: '8px', border: '1px solid rgba(0, 240, 255, 0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontSize: '11px', color: 'var(--brand-cyan)' }}>Reinvested Capital</span>
              <span style={{ fontSize: '9px', background: 'rgba(0, 240, 255, 0.15)', color: 'var(--brand-cyan)', padding: '1px 5px', borderRadius: '4px', fontWeight: 700 }}>
                {compoundedStats.reinvestedCycles} CYCLES
              </span>
            </div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--brand-cyan)', fontFamily: 'var(--font-mono)' }}>
              +{(compoundedStats.totalCompoundedAmount || totalClaimedAllTime).toFixed(2)} tUSDC
            </div>
          </div>
        </div>
      </div>

      {/* 2. Redemption History Table */}
      <div className="terminal-panel" style={{ padding: '0', overflow: 'hidden' }}>
        <div
          className="terminal-panel-header"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 20px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Layers size={16} style={{ color: 'var(--trade-buy)' }} />
            <h3 style={{ fontSize: '14px', fontWeight: 700, margin: 0, color: 'var(--foreground)' }}>
              {isViewingSelf ? 'My Settlement Redemption History' : 'Protocol Settlement Redemption History'}
            </h3>
          </div>
          <span style={{ fontSize: '11px', color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>
            {history.length} confirmed redemptions
          </span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="terminal-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(255, 255, 255, 0.02)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '10px', color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
                  Timestamp
                </th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '10px', color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
                  Market Contract
                </th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '10px', color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
                  Winning Leg
                </th>
                <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: '10px', color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
                  Claimed Payout
                </th>
                <th style={{ padding: '10px 16px', textAlign: 'center', fontSize: '10px', color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
                  Compounded
                </th>
                <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: '10px', color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
                  Somnia Shannon Tx
                </th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '36px', color: 'var(--muted-foreground)', fontSize: '12px' }}>
                    {isViewingSelf
                      ? 'No personal settlement claims recorded yet for this wallet.'
                      : 'No protocol settlement claims recorded yet.'}
                  </td>
                </tr>
              ) : (
                history.map((sweep) => {
                  const timeStr = new Date(sweep.claimedAt).toLocaleString();
                  const shortTx = sweep.txHash ? `${sweep.txHash.slice(0, 6)}...${sweep.txHash.slice(-4)}` : 'N/A';
                  const explorerUrl = sweep.txHash ? `https://shannon-explorer.somnia.network/tx/${sweep.txHash}` : '#';

                  return (
                    <tr key={sweep.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                      <td style={{ padding: '12px 16px', fontSize: '11px', color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>
                        {timeStr}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 600, color: 'var(--foreground)' }}>
                        {sweep.marketId.slice(0, 10)}...
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: sweep.winningOutcome === 'YES' ? 'rgba(0, 255, 102, 0.12)' : 'rgba(255, 51, 102, 0.12)',
                            border: `1px solid ${sweep.winningOutcome === 'YES' ? 'rgba(0, 255, 102, 0.3)' : 'rgba(255, 51, 102, 0.3)'}`,
                            color: sweep.winningOutcome === 'YES' ? 'var(--trade-buy)' : 'var(--trade-sell)',
                            fontSize: '11px',
                            fontWeight: 700,
                            fontFamily: 'var(--font-mono)',
                          }}
                        >
                          {sweep.winningOutcome === 'YES' ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
                          <span>{sweep.winningOutcome}</span>
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: '13px', fontWeight: 700, color: 'var(--trade-buy)', fontFamily: 'var(--font-mono)' }}>
                        +{sweep.claimableAmount.toFixed(2)} tUSDC
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: sweep.isCompounded ? 'rgba(0, 240, 255, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                            color: sweep.isCompounded ? 'var(--brand-cyan)' : 'var(--muted-foreground)',
                            fontSize: '10px',
                            fontWeight: 600,
                          }}
                        >
                          {sweep.isCompounded ? <ShieldCheck size={11} /> : null}
                          <span>{sweep.isCompounded ? 'YES' : 'NO'}</span>
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        {sweep.txHash ? (
                          <a
                            href={explorerUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              color: 'var(--brand-cyan)',
                              fontSize: '11px',
                              fontFamily: 'var(--font-mono)',
                              textDecoration: 'none',
                            }}
                          >
                            <span>{shortTx}</span>
                            <ExternalLink size={11} />
                          </a>
                        ) : (
                          <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>-</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confetti Celebration Modal */}
      <ClaimCelebration
        isOpen={celebrationState.isOpen}
        onClose={() => setCelebrationState((prev) => ({ ...prev, isOpen: false }))}
        claimedAmount={celebrationState.amount}
        txHash={celebrationState.txHash}
        isCompounded={autoCompound}
      />
    </div>
  );
};
