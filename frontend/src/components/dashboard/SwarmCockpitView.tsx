import React from 'react';
import { useAgentSwarm } from '../../hooks/useAgentSwarm.js';
import { AgentSwarmCockpit } from '../AgentSwarmCockpit.js';
import { OrderHistoryTable } from '../OrderHistoryTable.js';
import { PersonalSwarmCockpit } from '../PersonalSwarmCockpit.js';
import type { WalletState } from '../../hooks/useSessionKey.js';
import type { AgentType } from '../../types/index.js';
import type { SessionGrant } from '../../types/index.js';
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
  const {
    detailed,
    toggleAgent,
    updateConfig,
  } = useAgentSwarm(wallet.address || undefined);

  const { isOperator } = useUserRole(wallet);

  return (
    <div
      className="swarm-cockpit-view-container"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        paddingBottom: '32px',
      }}
    >
      {/* 1. Protocol Swarm — Read-only transparency (operator can edit, traders see live policy) */}
      <AgentSwarmCockpit
        detailedAgents={detailed}
        isOperator={isOperator}
        onToggleAgent={toggleAgent}
        onUpdateConfig={updateConfig}
        onForkToStudio={onForkToStudio}
      />

      {/* 2. Personal Swarm — Per-wallet isolated strategy (COPY by default, PERSONAL when customized) */}
      {!isOperator && (
        <PersonalSwarmCockpit
          userAddress={wallet.address || undefined}
          onForkToStudio={onForkToStudio}
          onOpenSessionModal={onOpenSessionModal}
          onConnectWallet={onConnectWallet}
          hasActiveSession={!!activeSession?.isActive}
        />
      )}

      {/* 3. Real-Time Order History & Fills — server-side paginated: only current page is fetched on demand */}
      <OrderHistoryTable
        userAddress={wallet.address || undefined}
        onConnectWallet={onConnectWallet}
      />
    </div>
  );
};

export default SwarmCockpitView;
