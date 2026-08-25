import { useEffect } from 'react';
import { soundEngine } from '../services/audio.js';

interface KeyboardShortcutOptions {
  onNavigateTab: (tab: string) => void;
  onTriggerSweep?: () => void;
  onToggleSwarmPause?: () => void;
}

export const useKeyboardShortcuts = ({
  onNavigateTab,
  onTriggerSweep,
  onToggleSwarmPause,
}: KeyboardShortcutOptions) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing inside input, textarea, or select
      const activeEl = document.activeElement;
      const isInput =
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.tagName === 'SELECT' ||
          (activeEl as HTMLElement).isContentEditable);

      if (isInput) return;

      // Handle Key Navigation
      if (e.key === '1') {
        e.preventDefault();
        onNavigateTab('Overview');
      } else if (e.key === '2') {
        e.preventDefault();
        onNavigateTab('Edge Radar');
      } else if (e.key === '3') {
        e.preventDefault();
        onNavigateTab('Markets & Depth');
      } else if (e.key === '4') {
        e.preventDefault();
        onNavigateTab('AI Swarm Feed');
      } else if (e.key === '5') {
        e.preventDefault();
        onNavigateTab('Swarm Cockpit');
      } else if (e.key === '6' || e.key.toLowerCase() === 'b') {
        e.preventDefault();
        onNavigateTab('Strategy Studio');
      } else if (e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (onTriggerSweep) {
          onTriggerSweep();
          soundEngine.playWinChime();
        }
      } else if (e.key.toLowerCase() === 'm') {
        e.preventDefault();
        soundEngine.toggleMute();
      } else if (e.code === 'Space') {
        e.preventDefault();
        if (onToggleSwarmPause) {
          onToggleSwarmPause();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onNavigateTab, onTriggerSweep, onToggleSwarmPause]);
};
