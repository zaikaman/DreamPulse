import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SessionStatusBar } from './SessionStatusBar.js';
import type { SessionGrant } from '../types/index.js';
import type { WalletState } from '../hooks/useSessionKey.js';

vi.mock('../services/web3.js', () => ({
  SOMNIA_ADDRESSES: {
    operatorAccount: '0x928f000000000000000000000000000000007879',
    sessionAccount: '0x0000000000000000000000000000000000000000',
  },
}));

vi.mock('../services/api.js', () => ({
  apiClient: {
    toggleCopyTrade: vi.fn().mockResolvedValue({ success: true }),
  },
}));

const DISCONNECTED: WalletState = {
  isConnected: false,
  address: null,
  balanceSTT: '0',
  balanceCollateral: '0',
  chainId: null,
  isCorrectNetwork: false,
};

const CONNECTED_WRONG_NETWORK: WalletState = {
  ...DISCONNECTED,
  isConnected: true,
  address: '0x1234567890abcdef1234567890abcdef12345678',
  chainId: 1,
  isCorrectNetwork: false,
};

const CONNECTED: WalletState = {
  ...DISCONNECTED,
  isConnected: true,
  address: '0x1234567890abcdef1234567890abcdef12345678',
  chainId: 50312,
  isCorrectNetwork: true,
  balanceCollateral: '1000',
};

function activeSessionFixture(overrides: Partial<SessionGrant> = {}): SessionGrant {
  return {
    id: 'sess-active-1',
    userAddress: '0x1234567890abcdef1234567890abcdef12345678',
    operatorAddress: '0x928f000000000000000000000000000000007879',
    sessionKeyAddress: '0x928f000000000000000000000000000000007879',
    accountAddress: '0x1111111111111111111111111111111111111111',
    permissions: ['placeOrderFor', 'cancelOrderFor'],
    maxTradeSize: 50000,
    dailyVolumeCap: 500000,
    spentToday: 0,
    expiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
    isActive: true,
    copyTradeEnabled: true,
    ...overrides,
  };
}

describe('SessionStatusBar Component', () => {
  it('renders disconnected state with connect prompt', () => {
    const onConnect = vi.fn();
    render(
      <SessionStatusBar
        wallet={DISCONNECTED}
        activeSession={null}
        onOpenModal={vi.fn()}
        onConnectWallet={onConnect}
        onSwitchNetwork={vi.fn()}
      />
    );

    expect(screen.getByText(/Direct Wallet Execution/i)).toBeInTheDocument();
    const btn = screen.getByRole('button', { name: /Connect Wallet/i });
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onConnect).toHaveBeenCalled();
  });

  it('renders wrong network banner when on wrong network', () => {
    const onSwitch = vi.fn();
    render(
      <SessionStatusBar
        wallet={CONNECTED_WRONG_NETWORK}
        activeSession={null}
        onOpenModal={vi.fn()}
        onConnectWallet={vi.fn()}
        onSwitchNetwork={onSwitch}
      />
    );

    expect(screen.getByText(/Wrong Network Detected/i)).toBeInTheDocument();
    const btn = screen.getByRole('button', { name: /Switch to Somnia/i });
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onSwitch).toHaveBeenCalled();
  });

  it('renders inactive session delegation prompt when connected with no active session', () => {
    const onOpenModal = vi.fn();
    render(
      <SessionStatusBar
        wallet={CONNECTED}
        activeSession={null}
        onOpenModal={onOpenModal}
        onConnectWallet={vi.fn()}
        onSwitchNetwork={vi.fn()}
      />
    );

    expect(screen.getByText(/No Active Session Delegation/i)).toBeInTheDocument();
    const btn = screen.getByRole('button', { name: /Authorize Session/i });
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onOpenModal).toHaveBeenCalled();
  });

  it('renders active session bar with redesigned HUD telemetry', () => {
    const onOpenModal = vi.fn();
    const onOpenFleetRisk = vi.fn();
    const onOpenTradingWallet = vi.fn();
    const session = activeSessionFixture();

    render(
      <SessionStatusBar
        wallet={CONNECTED}
        activeSession={session}
        onOpenModal={onOpenModal}
        onOpenFleetRisk={onOpenFleetRisk}
        onConnectWallet={vi.fn()}
        onSwitchNetwork={vi.fn()}
        cloneAddress="0x1111111111111111111111111111111111111111"
        cloneBalance="1000.00"
        onOpenTradingWallet={onOpenTradingWallet}
      />
    );

    // Session active badge
    expect(screen.getByText(/Session Active/i)).toBeInTheDocument();
    expect(screen.getByText(/0x928f...7879/i)).toBeInTheDocument();

    // Trading wallet
    expect(screen.getByText(/TRADING WALLET/i)).toBeInTheDocument();
    expect(screen.getByText('$1000.00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Deposit/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Withdraw/i })).toBeInTheDocument();

    // Telemetry items
    expect(screen.getByText(/EXECUTION MODE/i)).toBeInTheDocument();
    expect(screen.getByText(/SWARM MIRROR/i)).toBeInTheDocument();
    expect(screen.getByText(/SINGLE CAP/i)).toBeInTheDocument();
    expect(screen.getByText(/50,000 tUSDC/i)).toBeInTheDocument();
    expect(screen.getByText(/24H BUDGET/i)).toBeInTheDocument();
    // Compact formatted numbers without collision
    expect(screen.getByText(/0 \/ 500k tUSDC/i)).toBeInTheDocument();
    expect(screen.getByText(/\(0%\)/i)).toBeInTheDocument();
    expect(screen.getByText(/EXPIRES/i)).toBeInTheDocument();

    // Action buttons
    expect(screen.getByRole('button', { name: /Fleet Risk/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Risk Limits/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Revoke/i })).toBeInTheDocument();

    // Click revoke triggers modal with revoke: true
    fireEvent.click(screen.getByRole('button', { name: /Revoke/i }));
    expect(onOpenModal).toHaveBeenCalledWith({ revoke: true });

    // Click Fleet Risk
    fireEvent.click(screen.getByRole('button', { name: /Fleet Risk/i }));
    expect(onOpenFleetRisk).toHaveBeenCalled();

    // Click Deposit
    fireEvent.click(screen.getByRole('button', { name: /Deposit/i }));
    expect(onOpenTradingWallet).toHaveBeenCalledWith('deposit');
  });
});
