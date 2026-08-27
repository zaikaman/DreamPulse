import React from 'react';
import { OrderHistoryTable } from '../OrderHistoryTable.js';
import { PersonalSwarmCockpit } from '../PersonalSwarmCockpit.js';
import type { WalletState } from '../../hooks/useSessionKey.js';
import type { AgentType, SessionGrant } from '../../types/index.js';
import { useUserRole } from '../../hooks/useUserRole.js';

interface SwarmCockpitViewProps {
  wallet: WalletState;
  activeSession?: SessionGrant | null;
  onForkToStudio?: (agentType: AgentType, config: Record<string, any>) => void;
  onConnectWallet?: () => Promise<void>;
  onOpenSessionModal?: () => void;
}

export const SwarmCockpitView: React.FC<SwarmCockpitViewProps> = ({
  wallet,
  activeSession,
  onForkToStudio,
  onConnectWallet,
  onOpenSessionModal,
}) => {
  const { isOperator } = useUserRole(wallet);

  return (
    <div
      className="swarm-cockpit-view-container"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        paddingBottom: '32px',
      }}
    >
      {/* 1. Unified Autonomous Fleet Command (Core + Custom Deployed Agents & Protocol Benchmark) */}
      <PersonalSwarmCockpit
        userAddress={wallet.address || undefined}
        onForkToStudio={onForkToStudio}
        onOpenSessionModal={onOpenSessionModal}
        onConnectWallet={onConnectWallet}
        hasActiveSession={!!activeSession?.isActive}
        isOperator={isOperator}
      />

      {/* 2. Real-Time Order History & Fills — server-side paginated: only current page is fetched on demand */}
      <OrderHistoryTable
        userAddress={wallet.address || undefined}
        onConnectWallet={onConnectWallet}
      />
    </div>
  );
};

export default SwarmCockpitView;
