import React, { useState } from 'react';
import {
  Zap,
  Cpu,
  Sliders,
  TrendingUp,
  Sparkles,
  Layers,
  Power,
  CheckCircle2,
} from 'lucide-react';
import type { AgentType } from '../types/index.js';
import type { AgentDetail } from '../hooks/useAgentSwarm.js';

interface AgentSwarmCockpitProps {
  detailedAgents: Record<string, AgentDetail>;
  onToggleAgent: (agentType: AgentType, enabled: boolean) => Promise<boolean>;
  onUpdateConfig: (agentType: AgentType, config: Record<string, any>) => Promise<boolean>;
}

export const AgentSwarmCockpit: React.FC<AgentSwarmCockpitProps> = ({
  detailedAgents,
  onToggleAgent,
  onUpdateConfig,
}) => {
  const [activeTab, setActiveTab] = useState<'ALL' | 'VOLT' | 'ORACLE' | 'TITAN'>('ALL');
  const [isSaving, setIsSaving] = useState<Record<string, boolean>>({});
  const [saveSuccess, setSaveSuccess] = useState<Record<string, boolean>>({});

  // Local state for interactive sliders
  const [voltSliders, setVoltSliders] = useState({
    driftThreshold: 0.2, // in percent e.g. 0.20%
    minEdge: 3.0, // in percent e.g. 3.0%
    lotSize: 5.0,
  });

  const [oracleSliders, setOracleSliders] = useState({
    minEdge: 3.5, // in percent e.g. 3.5%
    lotSize: 5.0,
    maxTradeSize: 20.0,
  });

  const [titanSliders, setTitanSliders] = useState({
    targetSpread: 4.0, // in percent e.g. 4.0%
    inventoryAversion: 0.015,
    lotSize: 2.0,
  });

  const handleSaveVolt = async () => {
    setIsSaving((prev) => ({ ...prev, Volt: true }));
    const success = await onUpdateConfig('Volt', {
      driftThreshold: voltSliders.driftThreshold / 100.0,
      minEdge: voltSliders.minEdge / 100.0,
      lotSize: voltSliders.lotSize,
    });
    setIsSaving((prev) => ({ ...prev, Volt: false }));
    if (success) {
      setSaveSuccess((prev) => ({ ...prev, Volt: true }));
      setTimeout(() => setSaveSuccess((prev) => ({ ...prev, Volt: false })), 2000);
    }
  };

  const handleSaveOracle = async () => {
    setIsSaving((prev) => ({ ...prev, Oracle: true }));
    const success = await onUpdateConfig('Oracle', {
      minEdge: oracleSliders.minEdge / 100.0,
      lotSize: oracleSliders.lotSize,
      maxTradeSize: oracleSliders.maxTradeSize,
    });
    setIsSaving((prev) => ({ ...prev, Oracle: false }));
    if (success) {
      setSaveSuccess((prev) => ({ ...prev, Oracle: true }));
      setTimeout(() => setSaveSuccess((prev) => ({ ...prev, Oracle: false })), 2000);
    }
  };

  const handleSaveTitan = async () => {
    setIsSaving((prev) => ({ ...prev, Titan: true }));
    const success = await onUpdateConfig('Titan', {
      targetSpread: titanSliders.targetSpread / 100.0,
      inventoryAversion: titanSliders.inventoryAversion,
      lotSize: titanSliders.lotSize,
    });
    setIsSaving((prev) => ({ ...prev, Titan: false }));
    if (success) {
      setSaveSuccess((prev) => ({ ...prev, Titan: true }));
      setTimeout(() => setSaveSuccess((prev) => ({ ...prev, Titan: false })), 2000);
    }
  };

  const voltData = detailedAgents.volt || {
    agentType: 'Volt',
    isEnabled: true,
    status: 'ACTIVE',
    evalLatencyMs: 38,
    tradesToday: 18,
    pnlAmount: 24.5,
    lastAction: 'TAKER_SNIPE_YES',
    lastActionTimestamp: Date.now() - 15000,
  };

  const oracleData = detailedAgents.oracle || {
    agentType: 'Oracle',
    isEnabled: true,
    status: 'ACTIVE',
    evalLatencyMs: 64,
    tradesToday: 12,
    pnlAmount: 19.8,
    lastAction: 'TAKER_BUY_NO',
    lastActionTimestamp: Date.now() - 32000,
  };

  const titanData = detailedAgents.titan || {
    agentType: 'Titan',
    isEnabled: true,
    status: 'ACTIVE',
    evalLatencyMs: 42,
    tradesToday: 34,
    pnlAmount: 8.2,
    lastAction: 'LIMIT_QUOTE_YES',
    lastActionTimestamp: Date.now() - 5000,
  };

  const sweeperData = detailedAgents.sweeper || {
    agentType: 'Sweeper',
    isEnabled: true,
    status: 'ACTIVE',
    evalLatencyMs: 15,
    tradesToday: 6,
    pnlAmount: 145.0,
    lastAction: 'BATCH_CLAIM_PAYOUTS',
    lastActionTimestamp: Date.now() - 120000,
  };

  const totalPnl = (voltData.pnlAmount + oracleData.pnlAmount + titanData.pnlAmount + sweeperData.pnlAmount).toFixed(2);
  const activeCount = [voltData, oracleData, titanData, sweeperData].filter((a) => a.isEnabled).length;

  return (
    <div className="agent-swarm-cockpit" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Cockpit Header Card */}
      <div className="terminal-panel" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: 'rgba(0, 240, 255, 0.12)',
                  border: '1px solid rgba(0, 240, 255, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--brand-cyan)',
                }}
              >
                <Cpu size={18} />
              </div>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: 'var(--foreground)' }}>
                  Autonomous Swarm Strategy Cockpit
                </h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                  <span className="live-dot" />
                  <span style={{ fontSize: '11px', color: 'var(--brand-cyan)', fontFamily: 'var(--font-mono)' }}>
                    SOMNIA SHANNON TESTNET (CHAIN 50312)
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>•</span>
                  <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>100ms Evaluation Cycle</span>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '8px 14px',
                textAlign: 'right',
              }}
            >
              <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Active Swarm Agents
              </div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--brand-cyan)', fontFamily: 'var(--font-mono)' }}>
                {activeCount} / 4 Operational
              </div>
            </div>

            <div
              style={{
                background: 'rgba(0, 255, 102, 0.06)',
                border: '1px solid rgba(0, 255, 102, 0.25)',
                borderRadius: '8px',
                padding: '8px 14px',
                textAlign: 'right',
              }}
            >
              <div style={{ fontSize: '10px', color: 'var(--trade-buy)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Cumulative Swarm PnL
              </div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--trade-buy)', fontFamily: 'var(--font-mono)' }}>
                +{totalPnl} STT
              </div>
            </div>
          </div>
        </div>

        {/* Filter Tabs */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '16px', borderTop: '1px solid var(--border)', paddingTop: '14px' }}>
          {(['ALL', 'VOLT', 'ORACLE', 'TITAN'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              className={`filter-btn ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
              style={{ fontSize: '11px', padding: '5px 12px' }}
            >
              {tab === 'ALL' ? 'All Swarm Strategies (4)' : `${tab} Agent`}
            </button>
          ))}
        </div>
      </div>

      {/* 4 Multi-Agent Cards Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
          gap: '16px',
        }}
      >
        {/* -------------------------------------------------------------------- */}
        {/* 1. Volt Spot Staleness Sniper Card */}
        {/* -------------------------------------------------------------------- */}
        {(activeTab === 'ALL' || activeTab === 'VOLT') && (
          <div className="terminal-panel" style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: 'rgba(255, 170, 0, 0.15)',
                    border: '1px solid rgba(255, 170, 0, 0.35)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#ffaa00',
                  }}
                >
                  <Zap size={18} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--foreground)' }}>Volt Sniper</span>
                    <span
                      style={{
                        fontSize: '9px',
                        fontWeight: 700,
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: voltData.isEnabled ? 'rgba(0, 255, 102, 0.15)' : 'rgba(255, 51, 102, 0.15)',
                        color: voltData.isEnabled ? 'var(--trade-buy)' : 'var(--trade-sell)',
                        border: `1px solid ${voltData.isEnabled ? 'rgba(0, 255, 102, 0.3)' : 'rgba(255, 51, 102, 0.3)'}`,
                      }}
                    >
                      {voltData.status}
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>
                    Spot Staleness & Latency Arbitrage
                  </div>
                </div>
              </div>

              {/* Toggle Switch */}
              <button
                type="button"
                onClick={() => onToggleAgent('Volt', !voltData.isEnabled)}
                style={{
                  background: voltData.isEnabled ? 'var(--brand-cyan)' : 'rgba(255, 255, 255, 0.1)',
                  color: voltData.isEnabled ? '#000' : 'var(--muted-foreground)',
                  border: 'none',
                  borderRadius: '20px',
                  padding: '4px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                <Power size={12} />
                <span>{voltData.isEnabled ? 'ON' : 'OFF'}</span>
              </button>
            </div>

            {/* Metrics Row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
              <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>Eval Latency</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--brand-cyan)', fontFamily: 'var(--font-mono)' }}>
                  {voltData.evalLatencyMs}ms
                </div>
              </div>
              <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>Trades Today</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--foreground)', fontFamily: 'var(--font-mono)' }}>
                  {voltData.tradesToday} fills
                </div>
              </div>
              <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>Captured PnL</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--trade-buy)', fontFamily: 'var(--font-mono)' }}>
                  +{voltData.pnlAmount.toFixed(2)} STT
                </div>
              </div>
            </div>

            {/* Target Markets */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>Targets:</span>
              <span style={{ fontSize: '10px', background: 'rgba(0, 240, 255, 0.08)', color: 'var(--brand-cyan)', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(0, 240, 255, 0.2)' }}>
                BTC/USD 5m
              </span>
              <span style={{ fontSize: '10px', background: 'rgba(0, 240, 255, 0.08)', color: 'var(--brand-cyan)', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(0, 240, 255, 0.2)' }}>
                ETH/USD 5m
              </span>
              <span style={{ fontSize: '10px', background: 'rgba(0, 240, 255, 0.08)', color: 'var(--brand-cyan)', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(0, 240, 255, 0.2)' }}>
                BTC/USD 15m
              </span>
            </div>

            {/* Strategy Sliders */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: 'rgba(0, 0, 0, 0.25)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
                  <span style={{ color: 'var(--muted-foreground)' }}>Spot Drift Trigger</span>
                  <span style={{ color: 'var(--brand-cyan)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                    {voltSliders.driftThreshold.toFixed(2)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.05"
                  max="1.0"
                  step="0.05"
                  value={voltSliders.driftThreshold}
                  onChange={(e) => setVoltSliders({ ...voltSliders, driftThreshold: parseFloat(e.target.value) })}
                  style={{ width: '100%', accentColor: 'var(--brand-cyan)', cursor: 'pointer' }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
                  <span style={{ color: 'var(--muted-foreground)' }}>Minimum Mispricing Edge</span>
                  <span style={{ color: 'var(--brand-cyan)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                    {voltSliders.minEdge.toFixed(1)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="1.0"
                  max="10.0"
                  step="0.5"
                  value={voltSliders.minEdge}
                  onChange={(e) => setVoltSliders({ ...voltSliders, minEdge: parseFloat(e.target.value) })}
                  style={{ width: '100%', accentColor: 'var(--brand-cyan)', cursor: 'pointer' }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
                  <span style={{ color: 'var(--muted-foreground)' }}>Order Lot Size</span>
                  <span style={{ color: 'var(--brand-cyan)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                    {voltSliders.lotSize.toFixed(0)} lots
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="20"
                  step="1"
                  value={voltSliders.lotSize}
                  onChange={(e) => setVoltSliders({ ...voltSliders, lotSize: parseFloat(e.target.value) })}
                  style={{ width: '100%', accentColor: 'var(--brand-cyan)', cursor: 'pointer' }}
                />
              </div>

              <button
                type="button"
                className="btn-glow"
                onClick={handleSaveVolt}
                disabled={isSaving.Volt}
                style={{ width: '100%', justifyContent: 'center', marginTop: '4px', fontSize: '11px', padding: '6px' }}
              >
                {saveSuccess.Volt ? (
                  <>
                    <CheckCircle2 size={12} style={{ color: 'var(--trade-buy)' }} />
                    <span>Parameters Synced</span>
                  </>
                ) : (
                  <>
                    <Sliders size={12} />
                    <span>{isSaving.Volt ? 'Saving...' : 'Apply Strategy Parameters'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* -------------------------------------------------------------------- */}
        {/* 2. Oracle Volatility Surface Arbitrage Card */}
        {/* -------------------------------------------------------------------- */}
        {(activeTab === 'ALL' || activeTab === 'ORACLE') && (
          <div className="terminal-panel" style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: 'rgba(0, 240, 255, 0.15)',
                    border: '1px solid rgba(0, 240, 255, 0.35)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--brand-cyan)',
                  }}
                >
                  <TrendingUp size={18} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--foreground)' }}>Oracle Vol Arb</span>
                    <span
                      style={{
                        fontSize: '9px',
                        fontWeight: 700,
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: oracleData.isEnabled ? 'rgba(0, 255, 102, 0.15)' : 'rgba(255, 51, 102, 0.15)',
                        color: oracleData.isEnabled ? 'var(--trade-buy)' : 'var(--trade-sell)',
                        border: `1px solid ${oracleData.isEnabled ? 'rgba(0, 255, 102, 0.3)' : 'rgba(255, 51, 102, 0.3)'}`,
                      }}
                    >
                      {oracleData.status}
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>
                    Black-Scholes Φ(z) Theoretical Edge
                  </div>
                </div>
              </div>

              {/* Toggle Switch */}
              <button
                type="button"
                onClick={() => onToggleAgent('Oracle', !oracleData.isEnabled)}
                style={{
                  background: oracleData.isEnabled ? 'var(--brand-cyan)' : 'rgba(255, 255, 255, 0.1)',
                  color: oracleData.isEnabled ? '#000' : 'var(--muted-foreground)',
                  border: 'none',
                  borderRadius: '20px',
                  padding: '4px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                <Power size={12} />
                <span>{oracleData.isEnabled ? 'ON' : 'OFF'}</span>
              </button>
            </div>

            {/* Metrics Row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
              <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>Eval Latency</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--brand-cyan)', fontFamily: 'var(--font-mono)' }}>
                  {oracleData.evalLatencyMs}ms
                </div>
              </div>
              <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>Trades Today</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--foreground)', fontFamily: 'var(--font-mono)' }}>
                  {oracleData.tradesToday} fills
                </div>
              </div>
              <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>Captured PnL</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--trade-buy)', fontFamily: 'var(--font-mono)' }}>
                  +{oracleData.pnlAmount.toFixed(2)} STT
                </div>
              </div>
            </div>

            {/* Target Markets */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>Targets:</span>
              <span style={{ fontSize: '10px', background: 'rgba(0, 240, 255, 0.08)', color: 'var(--brand-cyan)', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(0, 240, 255, 0.2)' }}>
                BTC/USD 15m
              </span>
              <span style={{ fontSize: '10px', background: 'rgba(0, 240, 255, 0.08)', color: 'var(--brand-cyan)', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(0, 240, 255, 0.2)' }}>
                ETH/USD 15m
              </span>
              <span style={{ fontSize: '10px', background: 'rgba(0, 240, 255, 0.08)', color: 'var(--brand-cyan)', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(0, 240, 255, 0.2)' }}>
                BTC/USD 1h
              </span>
            </div>

            {/* Strategy Sliders */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: 'rgba(0, 0, 0, 0.25)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
                  <span style={{ color: 'var(--muted-foreground)' }}>Min Mathematical Edge Φ(z)</span>
                  <span style={{ color: 'var(--brand-cyan)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                    {oracleSliders.minEdge.toFixed(1)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="1.5"
                  max="12.0"
                  step="0.5"
                  value={oracleSliders.minEdge}
                  onChange={(e) => setOracleSliders({ ...oracleSliders, minEdge: parseFloat(e.target.value) })}
                  style={{ width: '100%', accentColor: 'var(--brand-cyan)', cursor: 'pointer' }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
                  <span style={{ color: 'var(--muted-foreground)' }}>Order Lot Size</span>
                  <span style={{ color: 'var(--brand-cyan)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                    {oracleSliders.lotSize.toFixed(0)} lots
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="25"
                  step="1"
                  value={oracleSliders.lotSize}
                  onChange={(e) => setOracleSliders({ ...oracleSliders, lotSize: parseFloat(e.target.value) })}
                  style={{ width: '100%', accentColor: 'var(--brand-cyan)', cursor: 'pointer' }}
                />
              </div>

              <button
                type="button"
                className="btn-glow"
                onClick={handleSaveOracle}
                disabled={isSaving.Oracle}
                style={{ width: '100%', justifyContent: 'center', marginTop: '4px', fontSize: '11px', padding: '6px' }}
              >
                {saveSuccess.Oracle ? (
                  <>
                    <CheckCircle2 size={12} style={{ color: 'var(--trade-buy)' }} />
                    <span>Parameters Synced</span>
                  </>
                ) : (
                  <>
                    <Sliders size={12} />
                    <span>{isSaving.Oracle ? 'Saving...' : 'Apply Strategy Parameters'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* -------------------------------------------------------------------- */}
        {/* 3. Titan Adaptive Market Maker Card */}
        {/* -------------------------------------------------------------------- */}
        {(activeTab === 'ALL' || activeTab === 'TITAN') && (
          <div className="terminal-panel" style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: 'rgba(168, 85, 247, 0.15)',
                    border: '1px solid rgba(168, 85, 247, 0.35)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#a855f7',
                  }}
                >
                  <Layers size={18} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--foreground)' }}>Titan MM</span>
                    <span
                      style={{
                        fontSize: '9px',
                        fontWeight: 700,
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: titanData.isEnabled ? 'rgba(0, 255, 102, 0.15)' : 'rgba(255, 51, 102, 0.15)',
                        color: titanData.isEnabled ? 'var(--trade-buy)' : 'var(--trade-sell)',
                        border: `1px solid ${titanData.isEnabled ? 'rgba(0, 255, 102, 0.3)' : 'rgba(255, 51, 102, 0.3)'}`,
                      }}
                    >
                      {titanData.status}
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>
                    Two-Sided Inventory Skewed Quoting
                  </div>
                </div>
              </div>

              {/* Toggle Switch */}
              <button
                type="button"
                onClick={() => onToggleAgent('Titan', !titanData.isEnabled)}
                style={{
                  background: titanData.isEnabled ? 'var(--brand-cyan)' : 'rgba(255, 255, 255, 0.1)',
                  color: titanData.isEnabled ? '#000' : 'var(--muted-foreground)',
                  border: 'none',
                  borderRadius: '20px',
                  padding: '4px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                <Power size={12} />
                <span>{titanData.isEnabled ? 'ON' : 'OFF'}</span>
              </button>
            </div>

            {/* Metrics Row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
              <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>Eval Latency</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--brand-cyan)', fontFamily: 'var(--font-mono)' }}>
                  {titanData.evalLatencyMs}ms
                </div>
              </div>
              <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>Active Quotes</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--foreground)', fontFamily: 'var(--font-mono)' }}>
                  6 levels
                </div>
              </div>
              <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>Spread PnL</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--trade-buy)', fontFamily: 'var(--font-mono)' }}>
                  +{titanData.pnlAmount.toFixed(2)} STT
                </div>
              </div>
            </div>

            {/* Target Markets */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>Targets:</span>
              <span style={{ fontSize: '10px', background: 'rgba(0, 240, 255, 0.08)', color: 'var(--brand-cyan)', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(0, 240, 255, 0.2)' }}>
                BTC/USD 5m
              </span>
              <span style={{ fontSize: '10px', background: 'rgba(0, 240, 255, 0.08)', color: 'var(--brand-cyan)', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(0, 240, 255, 0.2)' }}>
                ETH/USD 5m
              </span>
            </div>

            {/* Strategy Sliders */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: 'rgba(0, 0, 0, 0.25)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
                  <span style={{ color: 'var(--muted-foreground)' }}>Target Bid-Ask Spread</span>
                  <span style={{ color: 'var(--brand-cyan)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                    {titanSliders.targetSpread.toFixed(1)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="2.0"
                  max="8.0"
                  step="0.5"
                  value={titanSliders.targetSpread}
                  onChange={(e) => setTitanSliders({ ...titanSliders, targetSpread: parseFloat(e.target.value) })}
                  style={{ width: '100%', accentColor: 'var(--brand-cyan)', cursor: 'pointer' }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
                  <span style={{ color: 'var(--muted-foreground)' }}>Inventory Skew Damping (γ)</span>
                  <span style={{ color: 'var(--brand-cyan)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                    {titanSliders.inventoryAversion.toFixed(3)}
                  </span>
                </div>
                <input
                  type="range"
                  min="0.005"
                  max="0.040"
                  step="0.005"
                  value={titanSliders.inventoryAversion}
                  onChange={(e) => setTitanSliders({ ...titanSliders, inventoryAversion: parseFloat(e.target.value) })}
                  style={{ width: '100%', accentColor: 'var(--brand-cyan)', cursor: 'pointer' }}
                />
              </div>

              <button
                type="button"
                className="btn-glow"
                onClick={handleSaveTitan}
                disabled={isSaving.Titan}
                style={{ width: '100%', justifyContent: 'center', marginTop: '4px', fontSize: '11px', padding: '6px' }}
              >
                {saveSuccess.Titan ? (
                  <>
                    <CheckCircle2 size={12} style={{ color: 'var(--trade-buy)' }} />
                    <span>Parameters Synced</span>
                  </>
                ) : (
                  <>
                    <Sliders size={12} />
                    <span>{isSaving.Titan ? 'Saving...' : 'Apply Strategy Parameters'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* -------------------------------------------------------------------- */}
        {/* 4. Sweeper Settlement & Auto-Compounding Card */}
        {/* -------------------------------------------------------------------- */}
        {activeTab === 'ALL' && (
          <div className="terminal-panel" style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--foreground)' }}>Sweeper Daemon</span>
                    <span
                      style={{
                        fontSize: '9px',
                        fontWeight: 700,
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: 'rgba(0, 255, 102, 0.15)',
                        color: 'var(--trade-buy)',
                        border: '1px solid rgba(0, 255, 102, 0.3)',
                      }}
                    >
                      ACTIVE (30s)
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>
                    Batch Settlement & Capital Compounder
                  </div>
                </div>
              </div>
            </div>

            {/* Metrics Row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
              <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>Total Claimed</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--trade-buy)', fontFamily: 'var(--font-mono)' }}>
                  +{sweeperData.pnlAmount.toFixed(2)} STT
                </div>
              </div>
              <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>Markets Swept</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--foreground)', fontFamily: 'var(--font-mono)' }}>
                  {sweeperData.tradesToday} contracts
                </div>
              </div>
              <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>Auto-Compound</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--brand-cyan)', fontFamily: 'var(--font-mono)' }}>
                  ENABLED (100%)
                </div>
              </div>
            </div>

            <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', background: 'rgba(0, 255, 102, 0.04)', border: '1px solid rgba(0, 255, 102, 0.15)', padding: '10px', borderRadius: '6px' }}>
              Background daemon continuously scans Somnia testnet contracts for finalized markets with positive payouts, automatically claiming and recycling capital back into active trading balances.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
