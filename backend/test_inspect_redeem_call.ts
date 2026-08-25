import { somniaExchange, operatorAccount, publicClient } from './src/config/somnia';

async function main() {
  console.log('Testing somniaExchange.client.getClaimable for operator...');
  const claimableOp = await somniaExchange.client.getClaimable(operatorAccount.address).catch((e) => {
    console.error('getClaimable operator error:', e.message);
    return [];
  });
  console.log('Operator claimable count:', claimableOp.length);
  for (const c of claimableOp) {
    console.log(`Claimable: market=${c.marketId} pool=${c.pool} outcome=${c.outcomeIdx} amount=${c.amount}`);
  }

  const userAddress = '0x46cC04De981E603958e4612f877D72427c5b6544';
  console.log('\nTesting somniaExchange.client.getClaimable for user...');
  const claimableUser = await somniaExchange.client.getClaimable(userAddress).catch((e) => {
    console.error('getClaimable user error:', e.message);
    return [];
  });
  console.log('User claimable count:', claimableUser.length);
  for (const c of claimableUser) {
    console.log(`Claimable: market=${c.marketId} pool=${c.pool} outcome=${c.outcomeIdx} amount=${c.amount}`);
  }
}

main().catch(console.error);
