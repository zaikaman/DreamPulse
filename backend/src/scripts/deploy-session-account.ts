import fs from 'fs';
import path from 'path';
// @ts-expect-error solc module does not have TypeScript declarations bundled
import solc from 'solc';
import { fileURLToPath } from 'url';
import { type Hex } from 'viem';
import { walletClient, publicClient, operatorAccount, executeOperatorTx, somniaShannonTestnet } from '../config/somnia.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log('--- Compiling DreamPulseSessionAccount.sol ---');
  const contractPath = path.resolve(__dirname, '../../../contracts/DreamPulseSessionAccount.sol');
  const source = fs.readFileSync(contractPath, 'utf8');

  const input = {
    language: 'Solidity',
    sources: {
      'DreamPulseSessionAccount.sol': {
        content: source,
      },
    },
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      outputSelection: {
        '*': {
          '*': ['abi', 'evm.bytecode'],
        },
      },
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

  const contract = output.contracts['DreamPulseSessionAccount.sol']['DreamPulseSessionAccount'];
  const abi = contract.abi;
  const bytecode = `0x${contract.evm.bytecode.object}` as Hex;

  console.log(`Compiled successfully. Deploying from ${operatorAccount.address}...`);

  const deployHash = await executeOperatorTx(async () => {
    return await walletClient.deployContract({
      abi,
      bytecode,
      account: operatorAccount,
      chain: somniaShannonTestnet,
      args: [],
    });
  });

  console.log(`Transaction submitted: ${deployHash}`);
  console.log('Waiting for transaction receipt on Somnia Shannon Testnet...');

  const receipt = await publicClient.waitForTransactionReceipt({
    hash: deployHash,
    timeout: 60_000,
  });

  if (receipt.status !== 'success' || !receipt.contractAddress) {
    throw new Error(`Deployment failed on-chain: status ${receipt.status}`);
  }

  const contractAddress = receipt.contractAddress;
  console.log(`\n======================================================`);
  console.log(`>>> DreamPulseSessionAccount successfully deployed! <<<`);
  console.log(`>>> Address: ${contractAddress}`);
  console.log(`>>> Block:   ${receipt.blockNumber}`);
  console.log(`======================================================\n`);

  const artifact = {
    contractName: 'DreamPulseSessionAccount',
    address: contractAddress,
    chainId: 50312,
    blockNumber: receipt.blockNumber.toString(),
    transactionHash: deployHash,
    deployedAt: new Date().toISOString(),
    abi,
  };

  const artifactPath = path.resolve(__dirname, '../config/session-account-artifact.json');
  fs.writeFileSync(artifactPath, JSON.stringify(artifact, null, 2), 'utf8');
  console.log(`Saved deployment artifact to ${artifactPath}`);

  // Also write to frontend if directory exists
  const frontendArtifactPath = path.resolve(__dirname, '../../../frontend/src/config/session-account-artifact.json');
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
