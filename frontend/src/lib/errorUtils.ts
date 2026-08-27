/**
 * Web3 & Swarm Error Parsing Utilities
 * Cleans raw viem, MetaMask, RPC, and contract errors into user-friendly messages.
 */

export interface ParsedWeb3Error {
  title: string;
  message: string;
  isUserRejection: boolean;
  technicalDetails?: string;
}

/**
 * Parses any raw error, viem exception, or RPC error into a clean, human-readable structure.
 */
export function parseWeb3Error(err: unknown): ParsedWeb3Error {
  if (!err) {
    return {
      title: 'Unknown Error',
      message: 'An unexpected error occurred. Please try again.',
      isUserRejection: false,
    };
  }

  const rawMessage = typeof err === 'string' 
    ? err 
    : (err as any)?.shortMessage || (err as any)?.message || String(err);

  const errorString = String(rawMessage || '');
  const fullErrorString = typeof err === 'object' ? JSON.stringify(err) : errorString;

  // 1. User Rejections / Denied Signatures (MetaMask, Rabby, Coinbase, Phantom, WalletConnect, EIP-1193 code 4001)
  const isRejection = 
    /User rejected the request/i.test(errorString) ||
    /User denied transaction signature/i.test(errorString) ||
    /User denied message signature/i.test(errorString) ||
    /user rejected/i.test(errorString) ||
    /user denied/i.test(errorString) ||
    /User disapproved/i.test(errorString) ||
    /action was rejected/i.test(errorString) ||
    /Signature request rejected/i.test(errorString) ||
    /rejected by user/i.test(errorString) ||
    /code":\s*4001/i.test(fullErrorString) ||
    /code:\s*4001/i.test(errorString) ||
    /ACTION_REJECTED/i.test(errorString);

  if (isRejection) {
    return {
      title: 'Signature Request Cancelled',
      message: 'You cancelled or rejected the signature request in your wallet. No on-chain changes or authorizations were made.',
      isUserRejection: true,
    };
  }

  // 2. Insufficient Funds / Gas
  if (
    /insufficient funds/i.test(errorString) ||
    /exceeds balance/i.test(errorString) ||
    /gas required exceeds allowance/i.test(errorString) ||
    /out of gas/i.test(errorString)
  ) {
    return {
      title: 'Insufficient Gas (STT)',
      message: 'Your wallet does not have enough STT to cover Somnia network gas fees. Please claim testnet STT from the faucet.',
      isUserRejection: false,
    };
  }

  // 3. Network / Chain Mismatch
  if (
    /ChainIdMismatch/i.test(errorString) ||
    /wrong network/i.test(errorString) ||
    /unsupported chain/i.test(errorString) ||
    /Chain 50312/i.test(errorString)
  ) {
    return {
      title: 'Incorrect Network',
      message: 'Please switch your wallet network to Somnia Shannon Testnet (Chain ID 50312).',
      isUserRejection: false,
    };
  }

  // 4. Wallet Not Connected / Detected
  if (
    /No Ethereum wallet detected/i.test(errorString) ||
    /No accounts selected/i.test(errorString) ||
    /Wallet not available/i.test(errorString) ||
    /Wallet not connected/i.test(errorString)
  ) {
    return {
      title: 'Wallet Connection Required',
      message: 'Please connect your Web3 wallet (e.g. MetaMask, Rabby, Coinbase) to proceed.',
      isUserRejection: false,
    };
  }

  // 5. Clean viem technical error boilerplate
  // Strip out viem Request Arguments, Contract Call, URL docs, Version strings
  let cleanMsg = errorString;

  // Extract technical details if present before stripping
  let technicalDetails: string | undefined;
  if (errorString.includes('Request Arguments:') || errorString.includes('Contract Call:') || errorString.includes('https://viem.sh')) {
    technicalDetails = errorString;
  }

  // Strip viem URL
  cleanMsg = cleanMsg.replace(/https?:\/\/viem\.sh[^\s]*/gi, '');
  // Strip Version: viem@...
  cleanMsg = cleanMsg.replace(/Version:\s*viem@[^\s]+/gi, '');
  // Strip Request Arguments block
  cleanMsg = cleanMsg.replace(/Request Arguments:[\s\S]*?(?=(Contract Call:|Details:|$))/gi, '');
  // Strip Contract Call block
  cleanMsg = cleanMsg.replace(/Contract Call:[\s\S]*?(?=(Details:|$))/gi, '');
  // Strip Details prefix
  cleanMsg = cleanMsg.replace(/Details:\s*/gi, '');
  // Clean multiple whitespace / newlines
  cleanMsg = cleanMsg.replace(/\s+/g, ' ').trim();

  // If after stripping it's empty or too brief, provide a safe fallback
  if (!cleanMsg || cleanMsg.length < 5) {
    cleanMsg = 'Transaction failed during execution on Somnia network.';
  }

  return {
    title: 'Transaction Error',
    message: cleanMsg,
    isUserRejection: false,
    technicalDetails,
  };
}
