import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SessionDelegationModal } from './SessionDelegationModal.js';
import type { SessionGrant } from '../types/index.js';
import type { WalletState } from '../hooks/useSessionKey.js';
import {
  MAX_ALLOWED_TRADE_SIZE,
  MAX_ALLOWED_DAILY_CAP,
  MAX_SESSION_DURATION_HOURS,
} from '../lib/sessionUtils.js';

vi.mock('../services/web3.js', () => ({
  SOMNIA_ADDRESSES: {
    sessionAccount: '0x0000000000000000000000000000000000000000',
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
};

const CONNECTED: WalletState = {
  ...DISCONNECTED,
  isConnected: true,
  address: '0x1234567890abcdef1234567890abcdef12345678',
  chainId: 50312,
  isCorrectNetwork: true,
};

function activeSessionFixture(): SessionGrant {
  return {
    id: 'sess-modal-1',
    userAddress: '0x1234567890abcdef1234567890abcdef12345678',
    operatorAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
    permissions: ['placeOrderFor', 'cancelOrderFor'],
    maxTradeSize: 100,
    dailyVolumeCap: 1000,
    spentToday: 12.5,
    expiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    isActive: true,
    copyTradeEnabled: false,
  };
}

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    isOpen: true,
    onClose: vi.fn(),
    wallet: CONNECTED,
    activeSession: null,
    isSigning: false,
    isLoading: false,
    error: null,
    onConnectWallet: vi.fn(async () => {}),
    onSwitchNetwork: vi.fn(async () => {}),
    onCreateSession: vi.fn(async () => activeSessionFixture()),
    onRevokeSession: vi.fn(async () => {}),
    onClearError: vi.fn(),
    ...overrides,
  };
}

describe('SessionDelegationModal (spend-approval surface)', () => {
  it('renders nothing when closed', () => {
    render(<SessionDelegationModal {...baseProps({ isOpen: false })} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('asks disconnected wallets to connect before anything else', () => {
    const props = baseProps({ wallet: DISCONNECTED });
    render(<SessionDelegationModal {...props} />);

    const connect = screen.getByRole('button', { name: /connect web3 wallet/i });
    fireEvent.click(connect);
    expect(props.onConnectWallet).toHaveBeenCalledTimes(1);
    expect(props.onCreateSession).not.toHaveBeenCalled();
  });

  it('forces a network switch on the wrong chain', () => {
    const props = baseProps({ wallet: CONNECTED_WRONG_NETWORK });
    render(<SessionDelegationModal {...props} />);

    const switchBtn = screen.getByRole('button', { name: /switch to somnia shannon/i });
    fireEvent.click(switchBtn);
    expect(props.onSwitchNetwork).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /activate smart trading account/i })).toBeNull();
  });

  it('submits on-chain capped delegation defaults on 1-click activation', async () => {
    const props = baseProps();
    render(<SessionDelegationModal {...props} />);

    fireEvent.click(screen.getByRole('button', { name: /activate smart trading account/i }));

    await waitFor(() => expect(props.onCreateSession).toHaveBeenCalledTimes(1));
    expect(props.onCreateSession).toHaveBeenCalledWith({
      maxTradeSize: MAX_ALLOWED_TRADE_SIZE,
      dailyVolumeCap: MAX_ALLOWED_DAILY_CAP,
      durationHours: MAX_SESSION_DURATION_HOURS,
      depositAmount: undefined,
      copyTradeEnabled: false,
    });
    await waitFor(() => expect(props.onClose).toHaveBeenCalled());
  });

  it('passes copy-trade consent through when the mirror switch is on', async () => {
    const props = baseProps();
    render(<SessionDelegationModal {...props} />);

    fireEvent.click(screen.getByRole('button', { name: /toggle autonomous protocol swarm mirroring/i }));
    expect(screen.getByText('PROTOCOL MIRROR ON')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /activate smart trading account/i }));
    await waitFor(() => expect(props.onCreateSession).toHaveBeenCalled());
    expect(props.onCreateSession).toHaveBeenCalledWith(
      expect.objectContaining({ copyTradeEnabled: true }),
    );
  });

  it('shows active delegation state with clone balance', () => {
    render(
      <SessionDelegationModal
        {...baseProps({ activeSession: activeSessionFixture(), cloneBalance: '250.00' })}
      />,
    );

    expect(screen.getByText('ACTIVE SESSION DELEGATED')).toBeTruthy();
    expect(screen.getByText(/250\.00/)).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /revoke session authorization/i }),
    ).toBeTruthy();
  });

  it('revokes on-chain by default after explicit confirmation', async () => {
    const props = baseProps({ activeSession: activeSessionFixture() });
    render(<SessionDelegationModal {...props} />);

    // Destructive action requires a second explicit click
    fireEvent.click(screen.getByRole('button', { name: /^revoke session authorization$/i }));
    const confirm = screen.getByRole('button', { name: /yes, revoke session now/i });
    fireEvent.click(confirm);

    await waitFor(() => expect(props.onRevokeSession).toHaveBeenCalledTimes(1));
    expect(props.onRevokeSession).toHaveBeenCalledWith({ onChain: true });
    await waitFor(() => expect(props.onClose).toHaveBeenCalled());
  });

  it('supports backend-only revocation when the on-chain checkbox is cleared', async () => {
    const props = baseProps({ activeSession: activeSessionFixture() });
    render(<SessionDelegationModal {...props} />);

    fireEvent.click(screen.getByRole('button', { name: /^revoke session authorization$/i }));
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(checkbox);
    expect(checkbox.getAttribute('aria-checked')).toBe('false');

    fireEvent.click(screen.getByRole('button', { name: /yes, revoke session now/i }));
    await waitFor(() => expect(props.onRevokeSession).toHaveBeenCalledWith({ onChain: false }));
  });

  it('opens directly on the revoke screen in revoke mode', () => {
    render(
      <SessionDelegationModal
        {...baseProps({ activeSession: activeSessionFixture(), initialRevokeMode: true })}
      />,
    );
    expect(screen.getByText('Revoke Session Authorization')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /yes, revoke session now/i }),
    ).toBeTruthy();
  });

  it('renders parsed wallet errors with a working dismiss', () => {
    const props = baseProps({ error: 'User rejected the request' });
    render(<SessionDelegationModal {...props} />);

    expect(screen.getByText('Request Cancelled')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /dismiss error notice/i }));
    expect(props.onClearError).toHaveBeenCalledTimes(1);
  });

  it('locks actions and narrates progress while signing', () => {
    const props = baseProps({ isSigning: true, stepState: 'signing_eip712' });
    render(<SessionDelegationModal {...props} />);

    expect(screen.getByText(/signing eip-712 risk ceilings in wallet/i)).toBeTruthy();
    const create = screen.getByRole('button', { name: /signing eip-712/i });
    expect(create.hasAttribute('disabled')).toBe(true);
  });

  it('closes on backdrop click but not on dialog click', () => {
    const props = baseProps();
    render(<SessionDelegationModal {...props} />);

    const dialog = screen.getByRole('dialog');
    fireEvent.click(screen.getByText('Non-Custodial Session Delegation'));
    expect(props.onClose).not.toHaveBeenCalled();

    const backdrop = dialog.parentElement;
    if (backdrop) fireEvent.click(backdrop);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});
