import fs from 'fs';
import path from 'path';
// @ts-expect-error solc module does not have TypeScript declarations bundled
import solc from 'solc';
import { fileURLToPath } from 'url';
import { type Hex } from 'viem';
import { walletClient, publicClient, operatorAccount, executeOperatorTx, somniaShannonTestnet } from '../config/somnia.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function deployContract(abi: any, bytecode: Hex, args: unknown[], label: string): Promise<{ address: Hex; txHash: Hex; blockNumber: bigint }> {
  console.log(`Deploying ${label} from ${operatorAccount.address}...`);
  const deployHash = await executeOperatorTx(async () => {
    return await walletClient.deployContract({
      abi,
      bytecode,
      account: operatorAccount,
      chain: somniaShannonTestnet,
      args: args as never,
    });
  });
  console.log(`  tx: ${deployHash} — waiting for receipt...`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash: deployHash, timeout: 120_000 });
  if (receipt.status !== 'success' || !receipt.contractAddress) {
    throw new Error(`${label} deployment failed on-chain: status ${receipt.status}`);
  }
  console.log(`  deployed at ${receipt.contractAddress} (block ${receipt.blockNumber})`);
  return { address: receipt.contractAddress, txHash: deployHash, blockNumber: receipt.blockNumber };
}

async function main() {
  console.log('--- Compiling DreamPulseSessionAccountV2.sol ---');
  const contractPath = path.resolve(__dirname, '../../../contracts/DreamPulseSessionAccountV2.sol');
  const source = fs.readFileSync(contractPath, 'utf8');

  const input = {
    language: 'Solidity',
    sources: { 'DreamPulseSessionAccountV2.sol': { content: source } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode'] } },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  if (output.errors) {
    const errs = output.errors.filter((e: any) => e.severity === 'error');
    if (errs.length > 0) {
      console.error('Compilation errors:', errs);
      process.exit(1);
    }
  }

  const contracts = output.contracts['DreamPulseSessionAccountV2.sol'];
  const impl = contracts['DreamPulseSessionAccount'];
  const factory = contracts['DreamPulseSessionAccountFactory'];

  const implRes = await deployContract(impl.abi, `0x${impl.evm.bytecode.object}` as Hex, [], 'DreamPulseSessionAccount (implementation)');
  const factoryRes = await deployContract(
    factory.abi,
    `0x${factory.evm.bytecode.object}` as Hex,
    [implRes.address, operatorAccount.address],
    'DreamPulseSessionAccountFactory',
  );

  console.log(`\n======================================================`);
  console.log(`>>> V2 clone accounts successfully deployed! <<<`);
  console.log(`>>> Implementation: ${implRes.address}`);
  console.log(`>>> Factory:        ${factoryRes.address}`);
  console.log(`======================================================\n`);

  const artifact = {
    contractName: 'DreamPulseSessionAccountFactory',
    implementation: implRes.address,
    address: factoryRes.address,
    chainId: 50312,
    blockNumber: factoryRes.blockNumber.toString(),
    transactionHash: factoryRes.txHash,
    implementationTransactionHash: implRes.txHash,
    deployedAt: new Date().toISOString(),
    implementationAbi: impl.abi,
    factoryAbi: factory.abi,
  };

  const artifactPath = path.resolve(__dirname, '../config/session-account-v2-artifact.json');
  fs.writeFileSync(artifactPath, JSON.stringify(artifact, null, 2), 'utf8');
  console.log(`Saved deployment artifact to ${artifactPath}`);

  const frontendArtifactPath = path.resolve(__dirname, '../../../frontend/src/config/session-account-v2-artifact.json');
  try {
    fs.mkdirSync(path.dirname(frontendArtifactPath), { recursive: true });
    fs.writeFileSync(frontendArtifactPath, JSON.stringify(artifact, null, 2), 'utf8');
    console.log(`Saved frontend artifact to ${frontendArtifactPath}`);
  } catch (err: any) {
    console.warn('Could not copy to frontend config:', err.message);
  }
}

main().catch((err) => {
  console.error('Fatal error during deployment:', err);
  process.exit(1);
});
