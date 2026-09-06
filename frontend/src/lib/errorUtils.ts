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
 * Safely stringifies objects that may contain BigInt, circular references, or nested exceptions.
 */
export function safeStringify(obj: unknown): string {
  if (obj === null || obj === undefined) return '';
  if (typeof obj === 'string') return obj;
  if (typeof obj === 'number' || typeof obj === 'boolean') return String(obj);
  if (typeof obj === 'bigint') return obj.toString();

  try {
    const seen = new WeakSet();
    return JSON.stringify(obj, (_key, value) => {
      if (typeof value === 'bigint') {
        return value.toString();
      }
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular]';
        }
        seen.add(value);
      }
      return value;
    });
  } catch {
    try {
      return String(obj);
    } catch {
      return '';
    }
  }
}

/**
 * Parses any raw error, viem exception, or RPC error into a clean, human-readable structure.
 */
export function parseWeb3Error(
  err: unknown,
  actionContext?: 'withdraw' | 'deposit' | 'delegation' | 'signature' | 'transaction' | string
): ParsedWeb3Error {
  if (!err) {
    return {
      title: 'Unknown Error',
      message: 'An unexpected error occurred. Please try again.',
      isUserRejection: false,
    };
  }

  const errObj = err as any;
  const rawMessage = typeof err === 'string' 
    ? err 
    : errObj?.shortMessage || errObj?.message || String(err);

  const errorString = String(rawMessage || '');
  const causeMsg = errObj?.cause ? String(errObj.cause?.shortMessage || errObj.cause?.message || '') : '';
  const fullErrorString = typeof err === 'object' ? safeStringify(err) : errorString;
  const combinedSearch = `${errorString} ${causeMsg} ${errObj?.name || ''} ${errObj?.cause?.name || ''}`;

  // 1. User Rejections / Denied Signatures (MetaMask, Rabby, Coinbase, Phantom, WalletConnect, EIP-1193 code 4001)
  const isRejection = 
    errObj?.code === 4001 ||
    errObj?.cause?.code === 4001 ||
    errObj?.name === 'UserRejectedRequestError' ||
    errObj?.cause?.name === 'UserRejectedRequestError' ||
    /User rejected the request/i.test(combinedSearch) ||
    /User denied transaction signature/i.test(combinedSearch) ||
    /User denied message signature/i.test(combinedSearch) ||
    /user rejected/i.test(combinedSearch) ||
    /user denied/i.test(combinedSearch) ||
    /User disapproved/i.test(combinedSearch) ||
    /action was rejected/i.test(combinedSearch) ||
    /Signature request rejected/i.test(combinedSearch) ||
    /rejected by user/i.test(combinedSearch) ||
    /Transaction was rejected/i.test(combinedSearch) ||
    /rejected the transaction/i.test(combinedSearch) ||
    /code":\s*4001/i.test(fullErrorString) ||
    /code:\s*4001/i.test(combinedSearch) ||
    /4001/i.test(combinedSearch) ||
    /ACTION_REJECTED/i.test(combinedSearch) ||
    /UserRejectedRequestError/i.test(combinedSearch) ||
    /UserRejectedRequestError/i.test(fullErrorString);

  if (isRejection) {
    let title = 'Request Cancelled';
    let message = 'You cancelled or rejected the transaction in your wallet. No funds were transferred or modified.';

    if (actionContext === 'withdraw') {
      title = 'Withdrawal Cancelled';
      message = 'You cancelled or rejected the withdrawal in your wallet. No funds were transferred.';
    } else if (actionContext === 'deposit') {
      title = 'Deposit Cancelled';
      message = 'You cancelled or rejected the deposit in your wallet. No funds were transferred.';
    } else if (actionContext === 'revoke') {
      title = 'Revocation Cancelled';
      message = 'You cancelled or rejected the session revocation in your wallet. Active session was not changed.';
    } else if (actionContext === 'delegation' || actionContext === 'signature') {
      title = 'Signature Request Cancelled';
      message = 'You cancelled or rejected the signature request in your wallet. No on-chain changes or authorizations were made.';
    }

    return {
      title,
      message,
      isUserRejection: true,
    };
  }

  // 2. Insufficient ERC-20 Token Balance
  if (
    /0xe450d38c/i.test(combinedSearch) ||
    /ERC20InsufficientBalance/i.test(combinedSearch) ||
    /transfer amount exceeds balance/i.test(combinedSearch) ||
    /exceeds collateral balance/i.test(combinedSearch) ||
    /insufficient collateral/i.test(combinedSearch)
  ) {
    return {
      title: 'Insufficient Balance',
      message: actionContext === 'withdraw'
        ? 'Requested withdrawal amount exceeds your available trading account balance.'
        : 'Requested transfer amount exceeds your available token balance.',
      isUserRejection: false,
    };
  }

  // 3. Insufficient Funds / Gas (STT)
  if (
    /insufficient funds for gas/i.test(errorString) ||
    /insufficient funds/i.test(errorString) ||
    /gas required exceeds allowance/i.test(errorString) ||
    /out of gas/i.test(errorString) ||
    /exceeds balance/i.test(errorString)
  ) {
    return {
      title: 'Insufficient Gas (STT)',
      message: 'Your wallet does not have enough STT to cover Somnia network gas fees. Please claim testnet STT from the faucet.',
      isUserRejection: false,
    };
  }

  // 4. Network / Chain Mismatch
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

  // If BigInt serialization error was leaked by an external provider, sanitize it
  if (/Do not know how to serialize a BigInt/i.test(cleanMsg) || /cannot serialize.*bigint/i.test(cleanMsg)) {
    cleanMsg = 'Transaction was cancelled or rejected by wallet. No funds were transferred.';
  }

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
