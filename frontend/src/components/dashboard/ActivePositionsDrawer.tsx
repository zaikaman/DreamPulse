import React, { useState, useEffect } from 'react';
import {
  ChevronUpIcon,
  ChevronDownIcon,
  ArrowTopRightOnSquareIcon,
  ArrowPathIcon,
  BriefcaseIcon,
  BoltIcon,
  CheckCircleIcon,
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

interface ParsedMarketInfo {
  symbol: string;
  assetName: string;
  windowDuration: string;
  strikePrice?: number;
  settlementPrice?: number;
  winningOutcome?: 'YES' | 'NO' | 'VOID';
}

function normalizeMarketSymbol(raw: string): string {
  if (!raw) return 'BTC/USD';
  const s = raw.trim().toUpperCase().replace(/\/USD\/USD$/i, '/USD');
  if (s.includes('BTC')) return 'BTC/USD';
  if (s.includes('ETH')) return 'ETH/USD';
  if (s.includes('SOL')) return 'SOL/USD';
  if (s.includes('BNB')) return 'BNB/USD';
  if (s.includes('DOGE')) return 'DOGE/USD';
  if (s.includes('STT')) return 'STT/USD';
  if (s.includes('/')) return s;
  if (s.endsWith('USD')) return `${s.slice(0, -3)}/USD`;
  if (s.endsWith('USDT')) return `${s.slice(0, -4)}/USD`;
  return `${s}/USD`;
}

function getAssetDisplayName(symbol: string): string {
  if (symbol.includes('BTC')) return 'Bitcoin';
  if (symbol.includes('ETH')) return 'Ethereum';
  if (symbol.includes('SOL')) return 'Solana';
  if (symbol.includes('BNB')) return 'BNB';
  if (symbol.includes('DOGE')) return 'Dogecoin';
  if (symbol.includes('STT')) return 'Somnia';
  return symbol.split('/')[0];
}

function parseOrderMarketDetails(order: OrderExecution): ParsedMarketInfo {
  let symbol = order.marketSnapshot?.symbol ? normalizeMarketSymbol(order.marketSnapshot.symbol) : '';
  let strikePrice = order.marketSnapshot?.strikePrice;
  let settlementPrice = order.marketSnapshot?.settlementPrice;
  let winningOutcome = order.marketSnapshot?.winningOutcome;
  let windowDuration = order.marketSnapshot?.windowDuration || '5m';

  if (order.marketId && order.marketId.includes('-')) {
    const parts = order.marketId.split('-');
    if (parts.length >= 2) {
      if (!symbol) {
        symbol = normalizeMarketSymbol(parts[1]);
      }
      if (parts.length >= 5) {
        if (parts[2]?.endsWith('m') || parts[2]?.endsWith('h') || parts[2]?.endsWith('d')) {
          windowDuration = parts[2];
        }
        const parsedStrike = Number(parts[3]);
        if (!isNaN(parsedStrike) && parsedStrike > 0 && !strikePrice) {
          strikePrice = parsedStrike;
        }
      } else {
        for (let i = 2; i < parts.length; i++) {
          if (parts[i].endsWith('m') || parts[i].endsWith('h') || parts[i].endsWith('d')) {
            windowDuration = parts[i];
          } else {
            const num = Number(parts[i]);
            // Strike price must be a valid positive price and not a millisecond timestamp (> 1e11)
            if (!isNaN(num) && num > 0 && num < 1_000_000_000 && !strikePrice) {
              strikePrice = num;
            }
          }
        }
      }
    }
  }

  if (!symbol) symbol = 'BTC/USD';
  symbol = normalizeMarketSymbol(symbol);
  const assetName = getAssetDisplayName(symbol);

  return {
    symbol,
    assetName,
    windowDuration,
    strikePrice,
    settlementPrice,
    winningOutcome,
  };
}

function formatCurrencyAmount(price?: number): string {
  if (price === undefined || isNaN(price)) return '—';
  if (price >= 1000) {
    return `$${price.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  }
  return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
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
        source: 'TERMINAL',
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
              <span className="hidden sm:inline">Terminal Activity</span>
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-brand-cyan/30 text-brand-cyan bg-brand-cyan/5">
                MANUAL
              </Badge>
              <div className="hidden md:flex items-center gap-1 px-2 py-0.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-[10px] font-semibold">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                </span>
                <BoltIcon className="w-3 h-3 text-emerald-400" />
                <span>Auto-Sweeper Active</span>
              </div>
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
        <div className="max-h-56 min-h-[11rem] overflow-y-auto overflow-x-auto p-2 font-mono text-xs">
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
              <table className="w-full min-w-[580px] text-left">
                <thead>
                  <tr className="text-[10px] text-muted-foreground uppercase border-b border-border/20">
                    <th className="pb-1.5 pl-2">Target Asset & Event</th>
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
                    const netPotentialProfit = payout - pos.totalCost;
                    const roiPct = pos.totalCost > 0 ? (netPotentialProfit / pos.totalCost) * 100 : 0;
                    const marketInfo = parseOrderMarketDetails(pos);

                    const tooltipText = `[Active Position Breakdown]
Asset: ${marketInfo.assetName} (${marketInfo.symbol}) ${marketInfo.windowDuration}
Target Condition: Price > ${formatCurrencyAmount(marketInfo.strikePrice)} at Expiry
Position: BUY ${pos.lotSize.toFixed(1)} Lots ${pos.outcome} @ $${pos.price.toFixed(2)}
Total Cost: $${pos.totalCost.toFixed(2)} USDC (Max Risk)
Max Payout: $${payout.toFixed(2)} USDC (Net: +$${netPotentialProfit.toFixed(2)} | ROI: +${roiPct.toFixed(1)}%)
Tx: ${pos.txHash || 'N/A'}`;

                    return (
                      <tr key={pos.id} title={tooltipText} className="hover:bg-secondary/20 transition-colors">
                        <td className="py-2 pl-2">
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5">
                              {onSelectMarket ? (
                                <button
                                  type="button"
                                  onClick={() => onSelectMarket(pos.marketId)}
                                  className="font-bold text-foreground hover:text-brand-cyan hover:underline cursor-pointer text-left text-xs"
                                >
                                  {marketInfo.symbol}
                                </button>
                              ) : (
                                <span className="font-bold text-foreground text-xs">{marketInfo.symbol}</span>
                              )}
                              {marketInfo.windowDuration && (
                                <span className="text-[9px] px-1 py-0 rounded bg-white/5 text-muted-foreground">
                                  {marketInfo.windowDuration}
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              {marketInfo.strikePrice ? (
                                <span>Target: <strong className="text-brand-cyan font-semibold">&gt; {formatCurrencyAmount(marketInfo.strikePrice)}</strong></span>
                              ) : (
                                <span>ID: {pos.marketId.slice(0, 8)}...</span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-2">
                          <span
                            className={cn(
                              "px-1.5 py-0.5 rounded text-[10px] font-bold border inline-flex items-center gap-1",
                              isYes
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                                : "bg-rose-500/10 text-rose-400 border-rose-500/30"
                            )}
                          >
                            BUY {pos.outcome}
                          </span>
                        </td>
                        <td className="py-2">
                          <div className="flex flex-col">
                            <span className="text-foreground font-semibold">{pos.lotSize.toLocaleString()} lots</span>
                            <span className="text-[9.5px] text-muted-foreground">{pos.lotSize.toFixed(0)} contracts</span>
                          </div>
                        </td>
                        <td className="py-2">
                          <div className="flex flex-col">
                            <span className="text-foreground font-medium">${pos.price.toFixed(2)}</span>
                            <span className="text-[9.5px] text-brand-cyan opacity-80">{(pos.price * 100).toFixed(0)}% prob</span>
                          </div>
                        </td>
                        <td className="py-2">
                          <div className="flex flex-col">
                            <span className="text-foreground font-medium">${pos.totalCost.toFixed(2)}</span>
                            <span className="text-[9.5px] text-muted-foreground">Max Risk</span>
                          </div>
                        </td>
                        <td className="py-2">
                          <div className="flex flex-col">
                            <span className="text-emerald-400 font-bold">${payout.toFixed(2)} USDC</span>
                            <span className="text-[9.5px] text-emerald-400/80">+{roiPct.toFixed(0)}% ROI</span>
                          </div>
                        </td>
                        <td className="py-2 pr-2 text-right">
                          <div className="flex flex-col items-end">
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
                            <span className="text-[9px] text-muted-foreground">Somnia 50312</span>
                          </div>
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
              <table className="w-full min-w-[540px] text-left">
                <thead>
                  <tr className="text-[10px] text-muted-foreground uppercase border-b border-border/20">
                    <th className="pb-1.5 pl-2">Target Asset & Event</th>
                    <th className="pb-1.5">Type & Side</th>
                    <th className="pb-1.5">Limit Price</th>
                    <th className="pb-1.5">Lots & Size</th>
                    <th className="pb-1.5 pr-2 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/10">
                  {restingOrders.map((ord) => {
                    const marketInfo = parseOrderMarketDetails(ord);
                    return (
                      <tr key={ord.id} className="hover:bg-secondary/20 transition-colors">
                        <td className="py-2 pl-2">
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-foreground text-xs">{marketInfo.symbol}</span>
                              {marketInfo.windowDuration && (
                                <span className="text-[9px] px-1 py-0 rounded bg-white/5 text-muted-foreground">
                                  {marketInfo.windowDuration}
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              {marketInfo.strikePrice ? (
                                <span>Target: <strong className="text-brand-cyan font-semibold">&gt; {formatCurrencyAmount(marketInfo.strikePrice)}</strong></span>
                              ) : (
                                <span>ID: {ord.marketId.slice(0, 8)}...</span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-2">
                          <div className="flex flex-col">
                            <span className={cn("font-bold text-xs", ord.direction === 'BUY' ? "text-emerald-400" : "text-rose-400")}>
                              {ord.direction} {ord.outcome}
                            </span>
                            <span className="text-[9.5px] text-muted-foreground">{ord.orderType}</span>
                          </div>
                        </td>
                        <td className="py-2">
                          <div className="flex flex-col">
                            <span className="font-mono text-foreground font-semibold">${ord.price.toFixed(2)}</span>
                            <span className="text-[9.5px] text-brand-cyan opacity-80">{(ord.price * 100).toFixed(0)}% prob</span>
                          </div>
                        </td>
                        <td className="py-2">
                          <div className="flex flex-col">
                            <span className="text-foreground">{ord.lotSize} lots</span>
                            <span className="text-[9.5px] text-muted-foreground">${(ord.lotSize * ord.price).toFixed(2)} total</span>
                          </div>
                        </td>
                        <td className="py-2 pr-2 text-right">
                          <Badge variant="outline" className="text-[9px] border-amber-500/40 text-amber-400 bg-amber-500/10">
                            RESTING ON CLOB
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )
          ) : (
            settledHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-6">
                <span>No settled trades in history yet.</span>
              </div>
            ) : (
              <table className="w-full min-w-[620px] text-left">
                <thead>
                  <tr className="text-[10px] text-muted-foreground uppercase border-b border-border/20">
                    <th className="pb-1.5 pl-2">Target Asset & Event</th>
                    <th className="pb-1.5">Outcome</th>
                    <th className="pb-1.5">Lots</th>
                    <th className="pb-1.5">Entry Price</th>
                    <th className="pb-1.5">Realized PnL & Settlement</th>
                    <th className="pb-1.5 pr-2 text-right">Date / Tx</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/10">
                  {settledHistory.map((hist) => {
                    const isProfitable = (hist.pnl ?? 0) >= 0;
                    const marketInfo = parseOrderMarketDetails(hist);
                    const pnlVal = hist.pnl ?? 0;

                    const settlementSubText = marketInfo.settlementPrice
                      ? `Settled @ ${formatCurrencyAmount(marketInfo.settlementPrice)}`
                      : (pnlVal > 0 ? 'Settled (Win)' : 'Settled (Loss)');

                    const tooltipText = `[Settled Trade Summary]
Asset: ${marketInfo.assetName} (${marketInfo.symbol}) ${marketInfo.windowDuration}
Condition: Price > ${formatCurrencyAmount(marketInfo.strikePrice)} at Expiry
Entry: ${hist.direction} ${hist.lotSize} Lots @ $${hist.price.toFixed(2)}
Settlement: ${marketInfo.settlementPrice ? `Settled @ ${formatCurrencyAmount(marketInfo.settlementPrice)}` : 'Resolved'}
PnL: ${isProfitable ? '+' : ''}$${pnlVal.toFixed(2)} USDC
Tx: ${hist.txHash || 'N/A'}`;

                    return (
                      <tr key={hist.id} title={tooltipText} className="hover:bg-secondary/20 transition-colors">
                        <td className="py-2 pl-2">
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-foreground text-xs">{marketInfo.symbol}</span>
                              {marketInfo.windowDuration && (
                                <span className="text-[9px] px-1 py-0 rounded bg-white/5 text-muted-foreground">
                                  {marketInfo.windowDuration}
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              {marketInfo.strikePrice ? (
                                <span>Target: <strong className="text-brand-cyan font-semibold">&gt; {formatCurrencyAmount(marketInfo.strikePrice)}</strong></span>
                              ) : (
                                <span>ID: {hist.marketId.slice(0, 8)}...</span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-2">
                          <span
                            className={cn(
                              "px-1.5 py-0.5 rounded text-[10px] font-bold border inline-flex items-center gap-1",
                              hist.outcome === 'YES'
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                                : "bg-rose-500/10 text-rose-400 border-rose-500/30"
                            )}
                          >
                            {hist.outcome}
                          </span>
                        </td>
                        <td className="py-2 text-foreground font-semibold">{hist.lotSize}</td>
                        <td className="py-2 text-muted-foreground">${hist.price.toFixed(2)}</td>
                        <td className="py-2">
                          <div className="flex flex-col">
                            <span
                              className={cn(
                                "font-bold text-[11px]",
                                isProfitable ? "text-emerald-400" : "text-rose-400"
                              )}
                            >
                              {isProfitable ? '+' : ''}${pnlVal.toFixed(2)} USDC
                            </span>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[9.5px] text-muted-foreground">
                                {settlementSubText}
                              </span>
                              {isProfitable && (
                                <span className="inline-flex items-center gap-0.5 px-1 py-0 rounded text-[8.5px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                  <CheckCircleIcon className="w-2.5 h-2.5 text-emerald-400" />
                                  <span>Auto-Swept</span>
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-2 pr-2 text-right">
                          <div className="flex flex-col items-end">
                            <span className="text-[10px] text-muted-foreground">
                              {new Date(hist.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {hist.txHash && (
                              <a
                                href={`https://shannon-explorer.somnia.network/tx/${hist.txHash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-brand-cyan hover:underline inline-flex items-center gap-1 text-[9px]"
                              >
                                <span>{hist.txHash.slice(0, 6)}...</span>
                                <ArrowTopRightOnSquareIcon className="w-2 h-2" />
                              </a>
                            )}
                          </div>
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
