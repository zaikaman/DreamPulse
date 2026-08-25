import React, { useState, useMemo } from 'react';
import {
  ExternalLink,
  Filter,
  Search,
  CheckCircle2,
  Zap,
  TrendingUp,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  ListOrdered,
} from 'lucide-react';
import type { OrderExecution, AgentType, OutcomeType } from '../types/index.js';

interface OrderHistoryTableProps {
  orders: OrderExecution[];
  isLoading?: boolean;
}

export const OrderHistoryTable: React.FC<OrderHistoryTableProps> = ({
  orders,
  isLoading = false,
}) => {
  const [selectedAgent, setSelectedAgent] = useState<string>('ALL');
  const [selectedOutcome, setSelectedOutcome] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      // Agent filter
      if (selectedAgent !== 'ALL' && order.agentType.toUpperCase() !== selectedAgent) {
        return false;
      }
      // Outcome filter
      if (selectedOutcome !== 'ALL' && order.outcome !== selectedOutcome) {
        return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesMarket = order.marketId.toLowerCase().includes(q);
        const matchesUser = order.userAddress.toLowerCase().includes(q);
        const matchesTx = order.txHash?.toLowerCase().includes(q) ?? false;
        if (!matchesMarket && !matchesUser && !matchesTx) {
          return false;
        }
      }
      return true;
    });
  }, [orders, selectedAgent, selectedOutcome, searchQuery]);

  const totalVolume = useMemo(() => {
    return filteredOrders.reduce((sum, o) => sum + (o.totalCost || 0), 0).toFixed(2);
  }, [filteredOrders]);

  const getAgentBadge = (agentType: AgentType) => {
    switch (agentType) {
      case 'Volt':
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px 6px',
              borderRadius: '4px',
              background: 'rgba(255, 170, 0, 0.12)',
              border: '1px solid rgba(255, 170, 0, 0.3)',
              color: '#ffaa00',
              fontSize: '11px',
              fontWeight: 700,
            }}
          >
            <Zap size={11} />
            <span>Volt</span>
          </span>
        );
      case 'Oracle':
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px 6px',
              borderRadius: '4px',
              background: 'rgba(0, 240, 255, 0.12)',
              border: '1px solid rgba(0, 240, 255, 0.3)',
              color: 'var(--brand-cyan)',
              fontSize: '11px',
              fontWeight: 700,
            }}
          >
            <TrendingUp size={11} />
            <span>Oracle</span>
          </span>
        );
      case 'Titan':
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px 6px',
              borderRadius: '4px',
              background: 'rgba(168, 85, 247, 0.12)',
              border: '1px solid rgba(168, 85, 247, 0.3)',
              color: '#a855f7',
              fontSize: '11px',
              fontWeight: 700,
            }}
          >
            <Layers size={11} />
            <span>Titan</span>
          </span>
        );
      default:
        return <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>{agentType}</span>;
    }
  };

  const getOutcomeBadge = (outcome: OutcomeType) => {
    if (outcome === 'YES') {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '3px',
            padding: '2px 6px',
            borderRadius: '4px',
            background: 'rgba(0, 255, 102, 0.12)',
            border: '1px solid rgba(0, 255, 102, 0.3)',
            color: 'var(--trade-buy)',
            fontSize: '11px',
            fontWeight: 700,
            fontFamily: 'var(--font-mono)',
          }}
        >
          <ArrowUpRight size={11} />
          <span>YES</span>
        </span>
      );
    }
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '3px',
          padding: '2px 6px',
          borderRadius: '4px',
          background: 'rgba(255, 51, 102, 0.12)',
          border: '1px solid rgba(255, 51, 102, 0.3)',
          color: 'var(--trade-sell)',
          fontSize: '11px',
          fontWeight: 700,
          fontFamily: 'var(--font-mono)',
        }}
      >
        <ArrowDownRight size={11} />
        <span>NO</span>
      </span>
    );
  };

  return (
    <div className="terminal-panel" style={{ padding: '0', overflow: 'hidden' }}>
      {/* Header Bar */}
      <div
        className="terminal-panel-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          padding: '14px 20px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <ListOrdered size={16} style={{ color: 'var(--brand-cyan)' }} />
          <div>
            <h3 style={{ fontSize: '14px', fontWeight: 700, margin: 0, color: 'var(--foreground)' }}>
              On-Chain Swarm Order Executions
            </h3>
            <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>
              Non-custodial Somnia CLOB fills authorized via Operator Permissions
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>
            Total Executed: <strong style={{ color: 'var(--brand-cyan)' }}>{totalVolume} STT</strong> ({filteredOrders.length} fills)
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          padding: '12px 20px',
          background: 'rgba(255, 255, 255, 0.01)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        {/* Agent Filter Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Filter size={13} style={{ color: 'var(--muted-foreground)', marginRight: '4px' }} />
          {(['ALL', 'VOLT', 'ORACLE', 'TITAN'] as const).map((agent) => (
            <button
              key={agent}
              type="button"
              className={`filter-btn ${selectedAgent === agent ? 'active' : ''}`}
              onClick={() => setSelectedAgent(agent)}
              style={{ fontSize: '11px', padding: '4px 10px' }}
            >
              {agent}
            </button>
          ))}

          <div style={{ width: '1px', height: '18px', background: 'var(--border)', margin: '0 4px' }} />

          {/* Outcome Filter */}
          {(['ALL', 'YES', 'NO'] as const).map((out) => (
            <button
              key={out}
              type="button"
              className={`filter-btn ${selectedOutcome === out ? 'active' : ''}`}
              onClick={() => setSelectedOutcome(out)}
              style={{ fontSize: '11px', padding: '4px 8px' }}
            >
              {out}
            </button>
          ))}
        </div>

        {/* Search Box */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'rgba(0, 0, 0, 0.3)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            padding: '4px 10px',
            minWidth: '220px',
          }}
        >
          <Search size={13} style={{ color: 'var(--muted-foreground)' }} />
          <input
            type="text"
            placeholder="Search address or tx hash..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--foreground)',
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              width: '100%',
            }}
          />
        </div>
      </div>

      {/* Orders Table Content */}
      <div style={{ overflowX: 'auto' }}>
        <table className="terminal-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'rgba(255, 255, 255, 0.02)', borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '10px', color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
                Time (UTC)
              </th>
              <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '10px', color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
                Agent
              </th>
              <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '10px', color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
                Market / Outcome
              </th>
              <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '10px', color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
                Type & Side
              </th>
              <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: '10px', color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
                Price
              </th>
              <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: '10px', color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
                Lots
              </th>
              <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: '10px', color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
                Total Cost
              </th>
              <th style={{ padding: '10px 16px', textAlign: 'center', fontSize: '10px', color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
                Status
              </th>
              <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: '10px', color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
                On-Chain Tx
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: '36px', color: 'var(--muted-foreground)', fontSize: '12px' }}>
                  Loading executed swarm trades...
                </td>
              </tr>
            ) : filteredOrders.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: '36px', color: 'var(--muted-foreground)', fontSize: '12px' }}>
                  No orders match the selected filters.
                </td>
              </tr>
            ) : (
              filteredOrders.map((order) => {
                const timeStr = new Date(order.createdAt).toLocaleTimeString();
                const shortTx = order.txHash
                  ? `${order.txHash.slice(0, 6)}...${order.txHash.slice(-4)}`
                  : 'N/A';
                const explorerUrl = order.txHash
                  ? `https://shannon-explorer.somnia.network/tx/${order.txHash}`
                  : '#';

                return (
                  <tr
                    key={order.id}
                    style={{
                      borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                      transition: 'background 0.15s ease',
                    }}
                  >
                    <td style={{ padding: '12px 16px', fontSize: '11px', color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>
                      {timeStr}
                    </td>
                    <td style={{ padding: '12px 16px' }}>{getAgentBadge(order.agentType)}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--foreground)' }}>
                          {order.marketId.slice(0, 8)}...
                        </span>
                        {getOutcomeBadge(order.outcome)}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
                      <span style={{ color: order.direction === 'BUY' ? 'var(--trade-buy)' : 'var(--trade-sell)', fontWeight: 600 }}>
                        {order.direction}
                      </span>{' '}
                      <span style={{ color: 'var(--muted-foreground)' }}>({order.orderType})</span>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: '12px', fontWeight: 600, color: 'var(--foreground)', fontFamily: 'var(--font-mono)' }}>
                      {order.price.toFixed(2)}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: '12px', color: 'var(--foreground)', fontFamily: 'var(--font-mono)' }}>
                      {order.lotSize.toFixed(1)} lots
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: '12px', fontWeight: 700, color: 'var(--brand-cyan)', fontFamily: 'var(--font-mono)' }}>
                      {order.totalCost.toFixed(2)} STT
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: 'rgba(0, 255, 102, 0.1)',
                          border: '1px solid rgba(0, 255, 102, 0.25)',
                          color: 'var(--trade-buy)',
                          fontSize: '10px',
                          fontWeight: 700,
                        }}
                      >
                        <CheckCircle2 size={10} />
                        <span>FILLED</span>
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      {order.txHash ? (
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
  );
};
