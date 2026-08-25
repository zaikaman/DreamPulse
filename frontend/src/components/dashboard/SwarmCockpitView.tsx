import React from 'react';
import { useAgentSwarm } from '../../hooks/useAgentSwarm.js';
import { AgentSwarmCockpit } from '../AgentSwarmCockpit.js';
import { OrderHistoryTable } from '../OrderHistoryTable.js';

export const SwarmCockpitView: React.FC = () => {
  const {
    detailed,
    orders,
    isLoading,
    toggleAgent,
    updateConfig,
  } = useAgentSwarm();

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
        onToggleAgent={toggleAgent}
        onUpdateConfig={updateConfig}
      />

      {/* 2. Real-Time Order History & Fills */}
      <OrderHistoryTable
        orders={orders}
        isLoading={isLoading}
      />
    </div>
  );
};
