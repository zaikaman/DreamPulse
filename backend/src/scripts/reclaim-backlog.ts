import dotenv from 'dotenv';
dotenv.config();

import { supabase } from '../config/supabase.js';
import { operatorAccount, somniaExchange, publicClient, SOMNIA_ADDRESSES } from '../config/somnia.js';
import { settlementService } from '../services/settlement-service.js';
import { formatUnits } from 'viem';

const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

async function getOperatorUsdcBalance(): Promise<string> {
  try {
    const raw = await publicClient.readContract({
      address: SOMNIA_ADDRESSES.testUsdc,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [operatorAccount.address],
    });
    return formatUnits(raw, 6);
  } catch {
    return 'unknown';
  }
}

async function main() {
  const op = operatorAccount.address;
  console.log(`\n======================================================`);
  console.log(`[ReclaimBacklog] Starting Swarm Settlement Backlog Reclamation`);
  console.log(`Operator Address: ${op}`);
  const initialBal = await getOperatorUsdcBalance();
  console.log(`Initial Operator tUSDC Balance: ${initialBal} tUSDC`);
  console.log(`======================================================\n`);

  // 1. Fetch winning orders from Supabase (newest first)
  let allWinningOrders: any[] = [];
  let page = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .ilike('user_address', op.toLowerCase())
      .gt('pnl', 0)
      .order('created_at', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error || !data || data.length === 0) break;
    allWinningOrders = allWinningOrders.concat(data);
    if (data.length < pageSize) break;
    page++;
  }

  console.log(`Found ${allWinningOrders.length} winning orders in database.`);

  // Group by market_id
  const marketMap = new Map<string, any[]>();
  for (const o of allWinningOrders) {
    if (!o.market_id) continue;
    const list = marketMap.get(o.market_id) || [];
    list.push(o);
    marketMap.set(o.market_id, list);
  }

  console.log(`Grouped into ${marketMap.size} unique winning markets.`);

  // 2. Scan markets in batches to find markets with non-zero operator balances
  console.log(`\nScanning for unredeemed outcome token balances...`);
  const marketsToRedeem: Array<{ marketId: string; winIdx: 0 | 1; bal: bigint; outcomeToken: `0x${string}` }> = [];

  const marketEntries = Array.from(marketMap.entries());
  const BATCH_SIZE = 15;
  for (let i = 0; i < marketEntries.length; i += BATCH_SIZE) {
    const batch = marketEntries.slice(i, i + BATCH_SIZE);
    process.stdout.write(`Scanning markets ${i + 1}-${Math.min(i + BATCH_SIZE, marketEntries.length)} of ${marketEntries.length}...\r`);

    await Promise.all(
      batch.map(async ([marketId, orders]) => {
        try {
          const onchain = await somniaExchange.client.getMarketOnchain(marketId as `0x${string}`).catch(() => null);
          if (!onchain || (!onchain.isResolved && !onchain.finalized && !onchain.isVoided)) return;

          const actualWinIdx: 0 | 1 = typeof onchain.winningOutcome === 'number'
            ? (onchain.winningOutcome === 0 ? 0 : 1)
            : (orders[0].outcome === 'NO' ? 1 : 0);

          const winId = actualWinIdx === 0 ? onchain.yesId : onchain.noId;
          if (winId === undefined) return;

          const bal = await somniaExchange.client.getOutcomeBalance({
            outcomeToken: onchain.outcomeToken,
            account: op,
            id: BigInt(winId),
          }).catch(() => 0n);

          if (bal > 0n) {
            marketsToRedeem.push({
              marketId,
              winIdx: actualWinIdx,
              bal,
              outcomeToken: onchain.outcomeToken,
            });
            console.log(`\n  -> Found unredeemed: Market ${marketId.slice(0, 14)}... | Winner: ${actualWinIdx === 0 ? 'YES' : 'NO'} | Tokens: ${formatUnits(bal, 6)}`);
          }
        } catch {}
      })
    );
  }

  console.log(`\nScan complete! Found ${marketsToRedeem.length} markets with unredeemed balances.\n`);

  if (marketsToRedeem.length === 0) {
    console.log(`No unredeemed markets found. Everything is up to date.`);
    return;
  }

  // 3. Sequentially execute redeem() for each market
  console.log(`Executing on-chain redemptions...`);
  let totalReclaimedUsdc = 0;
  let redeemedCount = 0;

  for (const item of marketsToRedeem) {
    const balHuman = Number(formatUnits(item.bal, 6));
    console.log(`Redeeming Market ${item.marketId.slice(0, 14)}... (${balHuman} tokens)...`);
    try {
      const res = await somniaExchange.trader.redeem({
        marketId: item.marketId as `0x${string}`,
        outcomeIdx: item.winIdx,
        amount: item.bal,
        outcomeToken: item.outcomeToken,
      }).catch((err: any) => {
        console.warn(`  Redeem tx failed:`, err.message);
        return null;
      });

      if (res?.hash) {
        const txHash = res.hash.startsWith('0x') ? (res.hash as `0x${string}`) : (`0x${res.hash}` as `0x${string}`);
        redeemedCount++;
        totalReclaimedUsdc += balHuman;
        console.log(`  SUCCESS! Tx: ${txHash} | +${balHuman} tUSDC (Running Total: +${totalReclaimedUsdc.toFixed(2)} tUSDC)`);

        settlementService.recordSweep({
          id: crypto.randomUUID(),
          userAddress: op as `0x${string}`,
          marketId: item.marketId,
          winningOutcome: item.winIdx === 0 ? 'YES' : 'NO',
          claimableAmount: balHuman,
          payoutToken: 'tUSDC',
          isCompounded: false,
          txHash,
          status: 'CONFIRMED',
          claimedAt: new Date().toISOString(),
        }, true);
      }
    } catch (e: any) {
      console.warn(`  Error redeeming ${item.marketId}:`, e.message);
    }
  }

  const finalBal = await getOperatorUsdcBalance();
  console.log(`\n======================================================`);
  console.log(`[ReclaimBacklog] Reclamation Finished!`);
  console.log(`Total Markets Redeemed: ${redeemedCount} / ${marketsToRedeem.length}`);
  console.log(`Total tUSDC Reclaimed: +${totalReclaimedUsdc.toFixed(2)} tUSDC`);
  console.log(`Initial Balance: ${initialBal} tUSDC`);
  console.log(`Final Balance:   ${finalBal} tUSDC`);
  console.log(`======================================================\n`);
}

main().catch(console.error);
