import React from 'react';

export const App: React.FC = () => {
  return (
    <div className="terminal-root">
      <header className="terminal-header">
        <div className="terminal-brand">
          <span className="pulse-indicator"></span>
          <h1>DREAMPULSE // AI</h1>
          <span className="badge-somnia">SOMNIA SHANNON (50312)</span>
        </div>
      </header>
      <main className="terminal-container">
        <p className="terminal-status">QUANTITATIVE SWARM ENGINE INITIALIZED</p>
      </main>
    </div>
  );
};

export default App;
