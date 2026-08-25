import React from 'react';
import { useAgentSwarm } from '../../hooks/useAgentSwarm.js';
import { AgentSwarmCockpit } from '../AgentSwarmCockpit.js';
import { OrderHistoryTable } from '../OrderHistoryTable.js';
import type { WalletState } from '../../hooks/useSessionKey.js';
import type { AgentType } from '../../types/index.js';
import { useUserRole } from '../../hooks/useUserRole.js';

interface SwarmCockpitViewProps {
  wallet: WalletState;
  onForkToStudio?: (agentType: AgentType, config: Record<string, any>) => void;
  onConnectWallet?: () => Promise<void>;
}

export const SwarmCockpitView: React.FC<SwarmCockpitViewProps> = ({
  wallet,
  onForkToStudio,
  onConnectWallet,
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
      {/* 1. Multi-Agent Swarm Strategy Cockpit & Controls */}
      <AgentSwarmCockpit
        detailedAgents={detailed}
        isOperator={isOperator}
        onToggleAgent={toggleAgent}
        onUpdateConfig={updateConfig}
        onForkToStudio={onForkToStudio}
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
