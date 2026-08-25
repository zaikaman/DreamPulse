import { somniaExchange, SOMNIA_ADDRESSES, operatorAccount, publicClient } from './src/config/somnia';

async function main() {
  const pool = '0xFF52C100d53365365d655Af84b2Db121fE86f0a3';
  console.log('Testing depositVault on pool:', pool);
  const res = await somniaExchange.trader.depositVault({
    vault: pool,
    token: SOMNIA_ADDRESSES.collateral,
    amount: 100_000n, // 0.1 tUSDC
  }).catch((e) => {
    console.error('depositVault error:', e.message);
    return null;
  });
  console.log('depositVault result:', res);
}

main().catch(console.error);
