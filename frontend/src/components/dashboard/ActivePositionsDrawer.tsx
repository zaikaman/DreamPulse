import React, { useState, useEffect } from 'react';
import {
  ChevronUpIcon,
  ChevronDownIcon,
  ArrowTopRightOnSquareIcon,
  ArrowPathIcon,
  BriefcaseIcon,
} from '@heroicons/react/24/outline';
import type { OrderExecution, Market } from '../../types/index.js';
import type { WalletState } from '../../hooks/useSessionKey.js';
import { apiClient } from '../../services/api.js';
import { Badge } from '../ui/badge.js';
import { cn } from '../../lib/utils.js';

interface ActivePositionsDrawerProps {
  wallet: WalletState;
  currentMarket?: Market | null;
  onSelectMarket?: (marketId: string) => void;
  onRefresh?: () => void;
}

export const ActivePositionsDrawer: React.FC<ActivePositionsDrawerProps> = ({
  wallet,
  currentMarket: _currentMarket,
  onSelectMarket,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'positions' | 'orders' | 'history'>('positions');
  const [userOrders, setUserOrders] = useState<OrderExecution[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const fetchOrders = async () => {
    if (!wallet.isConnected || !wallet.address) {
      setUserOrders([]);
      return;
    }
    setIsLoading(true);
    try {
      const res = await apiClient.getOrders({
        userAddress: wallet.address,
        limit: 50,
      });
      if (res.success && res.data) {
        setUserOrders(res.data);
      }
    } catch {
      // non-fatal
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 6000);
    return () => clearInterval(interval);
  }, [wallet.address, wallet.isConnected]);

  // Derive categories
  const openPositions = userOrders.filter(
    (o) => o.status === 'FILLED' && !o.isSettled,
  );
  const restingOrders = userOrders.filter((o) => o.status === 'PENDING');
  const settledHistory = userOrders.filter((o) => o.isSettled);

  return (
    <div className="border-t border-border/40 bg-background/90 backdrop-blur-md flex flex-col flex-shrink-0 transition-all duration-200">
      {/* Header Bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/30 text-xs font-mono">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-foreground font-bold">
            <BriefcaseIcon className="w-4 h-4 text-brand-cyan" />
            <span className="hidden sm:inline">Portfolio & Activity</span>
          </div>

          {/* Sub-Tabs */}
          <div className="flex items-center gap-1 bg-secondary/30 p-0.5 rounded-lg border border-border/40">
            <button
              type="button"
              onClick={() => {
                setActiveTab('positions');
                setIsExpanded(true);
              }}
              className={cn(
                "px-2.5 py-0.5 text-[11px] rounded transition-colors cursor-pointer flex items-center gap-1.5",
                activeTab === 'positions'
                  ? "bg-secondary text-foreground font-bold shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <span>Active Positions</span>
              <span className="px-1 py-0 rounded-full text-[9px] bg-brand-cyan/20 text-brand-cyan">
                {openPositions.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('orders');
                setIsExpanded(true);
              }}
              className={cn(
                "px-2.5 py-0.5 text-[11px] rounded transition-colors cursor-pointer flex items-center gap-1.5",
                activeTab === 'orders'
                  ? "bg-secondary text-foreground font-bold shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <span>Resting Orders</span>
              {restingOrders.length > 0 && (
                <span className="px-1 py-0 rounded-full text-[9px] bg-amber-500/20 text-amber-400">
                  {restingOrders.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('history');
                setIsExpanded(true);
              }}
              className={cn(
                "px-2.5 py-0.5 text-[11px] rounded transition-colors cursor-pointer flex items-center gap-1.5",
                activeTab === 'history'
                  ? "bg-secondary text-foreground font-bold shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <span>Trade History</span>
              <span className="text-[10px] text-muted-foreground">({settledHistory.length})</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchOrders}
            disabled={isLoading}
            className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors cursor-pointer"
            title="Refresh Orders"
          >
            <ArrowPathIcon className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
          </button>
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors cursor-pointer flex items-center gap-1 text-[11px]"
            title={isExpanded ? 'Collapse Drawer' : 'Expand Drawer'}
          >
            <span>{isExpanded ? 'Hide' : 'Show'}</span>
            {isExpanded ? <ChevronDownIcon className="w-3.5 h-3.5" /> : <ChevronUpIcon className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Expanded Content Area */}
      {isExpanded && (
        <div className="h-44 overflow-y-auto p-2 font-mono text-xs">
          {!wallet.isConnected ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-6">
              <span>Connect your wallet to monitor open positions and resting limit orders.</span>
            </div>
          ) : activeTab === 'positions' ? (
            openPositions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-6">
                <span>No open positions currently active. Execute an order in the Trader Cockpit to open a position.</span>
              </div>
            ) : (
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] text-muted-foreground uppercase border-b border-border/20">
                    <th className="pb-1.5 pl-2">Market</th>
                    <th className="pb-1.5">Outcome</th>
                    <th className="pb-1.5">Size (Lots)</th>
                    <th className="pb-1.5">Entry Price</th>
                    <th className="pb-1.5">Total Cost</th>
                    <th className="pb-1.5">Potential Payout</th>
                    <th className="pb-1.5 pr-2 text-right">Tx Explorer</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/10">
                  {openPositions.map((pos) => {
                    const payout = pos.lotSize * 1.0;
                    const isYes = pos.outcome === 'YES';

                    return (
                      <tr key={pos.id} className="hover:bg-secondary/20 transition-colors">
                        <td className="py-2 pl-2 font-bold text-foreground">
                          {onSelectMarket ? (
                            <button
                              type="button"
                              onClick={() => onSelectMarket(pos.marketId)}
                              className="hover:text-brand-cyan hover:underline cursor-pointer text-left"
                            >
                              {pos.marketId.slice(0, 16)}...
                            </button>
                          ) : (
                            <span>{pos.marketId.slice(0, 16)}...</span>
                          )}
                        </td>
                        <td className="py-2">
                          <span
                            className={cn(
                              "px-1.5 py-0.5 rounded text-[10px] font-bold border",
                              isYes
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                                : "bg-rose-500/10 text-rose-400 border-rose-500/30"
                            )}
                          >
                            BUY {pos.outcome}
                          </span>
                        </td>
                        <td className="py-2 text-foreground font-semibold">
                          {pos.lotSize.toLocaleString()}
                        </td>
                        <td className="py-2 text-muted-foreground">
                          ${pos.price.toFixed(2)}
                        </td>
                        <td className="py-2 text-muted-foreground">
                          ${pos.totalCost.toFixed(2)}
                        </td>
                        <td className="py-2 text-emerald-400 font-bold">
                          ${payout.toFixed(2)} USDC
                        </td>
                        <td className="py-2 pr-2 text-right">
                          {pos.txHash ? (
                            <a
                              href={`https://shannon-explorer.somnia.network/tx/${pos.txHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-brand-cyan hover:underline inline-flex items-center gap-1 text-[10px]"
                            >
                              <span>{pos.txHash.slice(0, 6)}...</span>
                              <ArrowTopRightOnSquareIcon className="w-2.5 h-2.5" />
                            </a>
                          ) : (
                            <span className="text-muted-foreground text-[10px]">CLOB Fill</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )
          ) : activeTab === 'orders' ? (
            restingOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-6">
                <span>No resting limit orders on the CLOB. Market IOC orders fill immediately upon placement.</span>
              </div>
            ) : (
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] text-muted-foreground uppercase border-b border-border/20">
                    <th className="pb-1.5 pl-2">Market</th>
                    <th className="pb-1.5">Type</th>
                    <th className="pb-1.5">Side</th>
                    <th className="pb-1.5">Limit Price</th>
                    <th className="pb-1.5">Lots</th>
                    <th className="pb-1.5 pr-2 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/10">
                  {restingOrders.map((ord) => (
                    <tr key={ord.id} className="hover:bg-secondary/20 transition-colors">
                      <td className="py-2 pl-2 font-bold text-foreground">
                        {ord.marketId.slice(0, 16)}...
                      </td>
                      <td className="py-2 text-muted-foreground">{ord.orderType}</td>
                      <td className="py-2">
                        <span className="text-emerald-400 font-bold">{ord.direction} {ord.outcome}</span>
                      </td>
                      <td className="py-2 font-mono">${ord.price.toFixed(2)}</td>
                      <td className="py-2">{ord.lotSize}</td>
                      <td className="py-2 pr-2 text-right">
                        <Badge variant="outline" className="text-[9px] border-amber-500/40 text-amber-400 bg-amber-500/10">
                          RESTING ON CLOB
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : (
            settledHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-6">
                <span>No settled trades in history yet.</span>
              </div>
            ) : (
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] text-muted-foreground uppercase border-b border-border/20">
                    <th className="pb-1.5 pl-2">Market</th>
                    <th className="pb-1.5">Outcome</th>
                    <th className="pb-1.5">Lots</th>
                    <th className="pb-1.5">Entry</th>
                    <th className="pb-1.5">Realized PnL</th>
                    <th className="pb-1.5 pr-2 text-right">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/10">
                  {settledHistory.map((hist) => {
                    const isProfitable = (hist.pnl ?? 0) >= 0;
                    return (
                      <tr key={hist.id} className="hover:bg-secondary/20 transition-colors">
                        <td className="py-2 pl-2 text-foreground">{hist.marketId.slice(0, 16)}...</td>
                        <td className="py-2">{hist.outcome}</td>
                        <td className="py-2">{hist.lotSize}</td>
                        <td className="py-2 text-muted-foreground">${hist.price.toFixed(2)}</td>
                        <td className="py-2">
                          <span
                            className={cn(
                              "font-bold text-[11px]",
                              isProfitable ? "text-emerald-400" : "text-rose-400"
                            )}
                          >
                            {isProfitable ? '+' : ''}${(hist.pnl ?? 0).toFixed(2)} USDC
                          </span>
                        </td>
                        <td className="py-2 pr-2 text-right text-[10px] text-muted-foreground">
                          {new Date(hist.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )
          )}
        </div>
      )}
    </div>
  );
};
