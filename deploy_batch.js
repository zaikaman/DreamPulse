import { createPublicClient, createWalletClient, http, defineChain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config({ path: 'backend/.env' });
const somniaShannonTestnet = defineChain({
  id: 50312,
  name: 'Somnia Shannon Testnet',
  nativeCurrency: { name: 'Somnia Test Token', symbol: 'STT', decimals: 18 },
  rpcUrls: { default: { http: [process.env.SOMNIA_RPC_URL] } },
});
const pk = (process.env.OPERATOR_PRIVATE_KEY.startsWith('0x') ? process.env.OPERATOR_PRIVATE_KEY : '0x'+process.env.OPERATOR_PRIVATE_KEY);
const account = privateKeyToAccount(pk);
const publicClient = createPublicClient({ chain: somniaShannonTestnet, transport: http(process.env.SOMNIA_RPC_URL) });
const walletClient = createWalletClient({ account, chain: somniaShannonTestnet, transport: http(process.env.SOMNIA_RPC_URL) });
const source = JSON.parse(fs.readFileSync('compile_output.json', 'utf8'));
const contract = source.contracts['BatchApprove.sol']['BatchApprove'];
const abi = contract.abi;
const bytecode = '0x' + contract.evm.bytecode.object;
console.log('Deploying BatchApprove...');
const hash = await walletClient.deployContract({ abi, bytecode, account });
console.log('hash', hash);
const receipt = await publicClient.waitForTransactionReceipt({ hash });
console.log('deployed at', receipt.contractAddress);
fs.writeFileSync('batch_address.txt', receipt.contractAddress);
