import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  RefreshCw,
  ExternalLink,
  Power,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  ShieldCheck,
} from 'lucide-react';
import { apiClient } from '../services/api.js';
import type { SettlementSweep } from '../types/index.js';
import { ClaimCelebration } from './ClaimCelebration.js';

interface SweeperControlsProps {
  userAddress?: string;
  onRefreshPortfolio?: () => void;
}

export const SweeperControls: React.FC<SweeperControlsProps> = ({
  userAddress = '0x15C7e8CE38F021c5b45d098AaD788f63090bF20A',
  onRefreshPortfolio,
}) => {
  const [autoCompound, setAutoCompound] = useState<boolean>(true);
  const [autoSweepEnabled, setAutoSweepEnabled] = useState<boolean>(true);
  const [isSweeping, setIsSweeping] = useState<boolean>(false);
  const [history, setHistory] = useState<SettlementSweep[]>([]);
  const [unclaimedAmount, setUnclaimedAmount] = useState<number>(43.5);
  const [totalClaimedAllTime, setTotalClaimedAllTime] = useState<number>(145.0);

  // Celebration modal state
  const [celebrationState, setCelebrationState] = useState<{
    isOpen: boolean;
    amount: string;
    txHash?: string;
  }>({
    isOpen: false,
    amount: '',
  });

  const fetchHistory = async () => {
    try {
      const res = await (apiClient as any).getSweepHistory?.(userAddress) || { data: [] };
      if (res?.data && res.data.length > 0) {
        setHistory(res.data);
      } else {
        // Fetch via fetch directly
        const raw = await fetch('/api/v1/sweeper/history').then((r) => r.json());
        if (raw?.data) {
          setHistory(raw.data);
        }
      }
    } catch {
      // ignore fallback
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [userAddress]);

  const handleManualSweep = async () => {
    setIsSweeping(true);
    try {
      const res = await apiClient.triggerSweep(userAddress);
      if (res.success) {
        setCelebrationState({
          isOpen: true,
          amount: res.totalClaimedAmount,
          txHash: res.txHash,
        });

        const claimedNum = parseFloat(res.totalClaimedAmount.replace(/[^0-9.]/g, '')) || 40.0;
        setTotalClaimedAllTime((prev) => Number((prev + claimedNum).toFixed(2)));
        setUnclaimedAmount(0);

        await fetchHistory();
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
      {/* 1. Header & Overview Grid */}
      <div className="terminal-panel" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: 'rgba(0, 255, 102, 0.15)',
                  border: '1px solid rgba(0, 255, 102, 0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--trade-buy)',
                }}
              >
                <Sparkles size={18} />
              </div>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: 'var(--foreground)' }}>
                  Autonomous Settlement Sweeper & Compounder
                </h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                  <span className="live-dot" />
                  <span style={{ fontSize: '11px', color: 'var(--trade-buy)', fontFamily: 'var(--font-mono)' }}>
                    DAEMON STATUS: {autoSweepEnabled ? 'ACTIVE (30s SCAN LOOP)' : 'PAUSED'}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>•</span>
                  <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>Zero Capital Stagnation</span>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            {/* Auto-Sweep Toggle */}
            <button
              type="button"
              onClick={() => setAutoSweepEnabled(!autoSweepEnabled)}
              style={{
                background: autoSweepEnabled ? 'rgba(0, 255, 102, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                color: autoSweepEnabled ? 'var(--trade-buy)' : 'var(--muted-foreground)',
                border: `1px solid ${autoSweepEnabled ? 'rgba(0, 255, 102, 0.3)' : 'var(--border)'}`,
                borderRadius: '8px',
                padding: '8px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Power size={13} />
              <span>Auto-Sweep {autoSweepEnabled ? 'ON' : 'OFF'}</span>
            </button>

            {/* Trigger Manual Sweep */}
            <button
              type="button"
              className="btn-glow"
              onClick={handleManualSweep}
              disabled={isSweeping}
              style={{
                padding: '8px 16px',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <RefreshCw size={13} className={isSweeping ? 'anim-spin' : ''} />
              <span>{isSweeping ? 'Sweeping Contracts...' : 'Sweep & Claim Now'}</span>
            </button>
          </div>
        </div>

        {/* 3 Metrics Cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '12px',
            marginTop: '18px',
            borderTop: '1px solid var(--border)',
            paddingTop: '16px',
          }}
        >
          <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginBottom: '4px' }}>
              Pending Unclaimed Payouts
            </div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: unclaimedAmount > 0 ? 'var(--trade-anomaly)' : 'var(--foreground)', fontFamily: 'var(--font-mono)' }}>
              {unclaimedAmount.toFixed(2)} STT
            </div>
          </div>

          <div style={{ background: 'rgba(0, 255, 102, 0.04)', padding: '12px 16px', borderRadius: '8px', border: '1px solid rgba(0, 255, 102, 0.2)' }}>
            <div style={{ fontSize: '11px', color: 'var(--trade-buy)', marginBottom: '4px' }}>
              Total Claimed Proceeds
            </div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--trade-buy)', fontFamily: 'var(--font-mono)' }}>
              +{totalClaimedAllTime.toFixed(2)} STT
            </div>
          </div>

          <div style={{ background: 'rgba(0, 240, 255, 0.04)', padding: '12px 16px', borderRadius: '8px', border: '1px solid rgba(0, 240, 255, 0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontSize: '11px', color: 'var(--brand-cyan)' }}>Auto-Compounding</span>
              <button
                type="button"
                onClick={() => setAutoCompound(!autoCompound)}
                style={{
                  background: autoCompound ? 'var(--brand-cyan)' : 'rgba(255, 255, 255, 0.1)',
                  color: autoCompound ? '#000' : 'var(--muted-foreground)',
                  border: 'none',
                  borderRadius: '12px',
                  padding: '2px 8px',
                  fontSize: '10px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {autoCompound ? 'ENABLED' : 'DISABLED'}
              </button>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', lineHeight: 1.3 }}>
              {autoCompound ? '100% of proceeds recycled into active agent liquidity pool' : 'Proceeds sent directly to wallet'}
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
              Settlement Redemption & Payout History
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
                    No settlement claims recorded yet.
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
                        +{sweep.claimableAmount.toFixed(2)} STT
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
