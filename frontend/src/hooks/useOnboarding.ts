import { useState, useEffect, useCallback, useMemo } from 'react';
import type { WalletState } from './useSessionKey.js';
import type { SessionGrant } from '../types/index.js';

const LOCAL_ONBOARDING_KEY = 'dreampulse_onboarded_v1';
const LOCAL_QUEST_DISMISSED_KEY = 'dreampulse_quest_dismissed_v1';

export interface OnboardingQuestItem {
  id: string;
  label: string;
  description: string;
  isCompleted: boolean;
  actionText?: string;
  onAction?: () => void;
}

export interface UseOnboardingProps {
  wallet?: WalletState;
  activeSession?: SessionGrant | null;
  ordersCount?: number;
}

export interface UseOnboardingReturn {
  isOnboardingOpen: boolean;
  currentStep: number;
  hasCompletedOnboarding: boolean;
  isQuestBarDismissed: boolean;
  quests: OnboardingQuestItem[];
  completedQuestsCount: number;
  totalQuestsCount: number;
  progressPercent: number;
  allQuestsCompleted: boolean;
  openOnboarding: (step?: number) => void;
  closeOnboarding: () => void;
  completeOnboarding: () => void;
  resetOnboarding: () => void;
  setStep: (step: number) => void;
  dismissQuestBar: () => void;
  restoreQuestBar: () => void;
}

export function useOnboarding({
  wallet,
  activeSession,
  ordersCount = 0,
}: UseOnboardingProps = {}): UseOnboardingReturn {
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState<boolean>(() => {
    try {
      return localStorage.getItem(LOCAL_ONBOARDING_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const [isQuestBarDismissed, setIsQuestBarDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(LOCAL_QUEST_DISMISSED_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const [isOnboardingOpen, setIsOnboardingOpen] = useState<boolean>(false);
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [hasTriggeredAutoOpen, setHasTriggeredAutoOpen] = useState<boolean>(false);

  // Auto-open onboarding on FIRST wallet connection if user hasn't completed it
  useEffect(() => {
    if (wallet?.isConnected && !hasCompletedOnboarding && !hasTriggeredAutoOpen) {
      setIsOnboardingOpen(true);
      setHasTriggeredAutoOpen(true);
    }
  }, [wallet?.isConnected, hasCompletedOnboarding, hasTriggeredAutoOpen]);

  const openOnboarding = useCallback((step = 0) => {
    setCurrentStep(step);
    setIsOnboardingOpen(true);
  }, []);

  const closeOnboarding = useCallback(() => {
    setIsOnboardingOpen(false);
  }, []);

  const completeOnboarding = useCallback(() => {
    try {
      localStorage.setItem(LOCAL_ONBOARDING_KEY, 'true');
    } catch {
      // ignore
    }
    setHasCompletedOnboarding(true);
    setIsOnboardingOpen(false);
  }, []);

  const resetOnboarding = useCallback(() => {
    try {
      localStorage.removeItem(LOCAL_ONBOARDING_KEY);
      localStorage.removeItem(LOCAL_QUEST_DISMISSED_KEY);
    } catch {
      // ignore
    }
    setHasCompletedOnboarding(false);
    setIsQuestBarDismissed(false);
    setCurrentStep(0);
    setIsOnboardingOpen(true);
  }, []);

  const dismissQuestBar = useCallback(() => {
    try {
      localStorage.setItem(LOCAL_QUEST_DISMISSED_KEY, 'true');
    } catch {
      // ignore
    }
    setIsQuestBarDismissed(true);
  }, []);

  const restoreQuestBar = useCallback(() => {
    try {
      localStorage.removeItem(LOCAL_QUEST_DISMISSED_KEY);
    } catch {
      // ignore
    }
    setIsQuestBarDismissed(false);
  }, []);

  // Track Strategy Studio engagement
  const [hasBuiltStrategy, setHasBuiltStrategy] = useState<boolean>(() => {
    try {
      return (
        localStorage.getItem('dreampulse_studio_visited_v1') === 'true' ||
        localStorage.getItem('dreampulse_studio_created_v1') === 'true'
      );
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const checkStudio = () => {
      try {
        if (
          window.location.hash === '#studio' ||
          localStorage.getItem('dreampulse_studio_visited_v1') === 'true'
        ) {
          localStorage.setItem('dreampulse_studio_visited_v1', 'true');
          setHasBuiltStrategy(true);
        }
      } catch {
        // ignore
      }
    };
    checkStudio();
    window.addEventListener('hashchange', checkStudio);
    return () => window.removeEventListener('hashchange', checkStudio);
  }, []);

  // Compute 5 interactive onboarding quests
  const isWalletConnected = Boolean(wallet?.isConnected);
  const isNetworkCorrect = Boolean(wallet?.isCorrectNetwork);
  const isFaucetClaimed = Boolean(parseFloat(wallet?.balanceCollateral || '0') > 0);
  const isSessionActive = Boolean(activeSession?.isActive);
  const isFirstActionDone = Boolean(ordersCount > 0);

  const quests = useMemo<OnboardingQuestItem[]>(() => {
    return [
      {
        id: 'connect_wallet',
        label: 'Connect Web3 Wallet',
        description: 'Connect EVM wallet to Somnia Shannon Testnet',
        isCompleted: isWalletConnected && isNetworkCorrect,
      },
      {
        id: 'claim_faucet',
        label: 'Claim 1,000 tUSDC Faucet',
        description: 'Fuel your account with test collateral & gas',
        isCompleted: isFaucetClaimed,
      },
      {
        id: 'delegate_session',
        label: 'Authorize Session Key',
        description: 'Auto-copytrade AI swarms with zero manual deposits',
        isCompleted: isSessionActive,
      },
      {
        id: 'execute_trade',
        label: 'Copytrade or Place Trade',
        description: 'Copytrade the live AI swarm or execute an Event Contract',
        isCompleted: isFirstActionDone,
      },
      {
        id: 'build_strategy',
        label: 'Build Custom AI Agent',
        description: 'Design a trading strategy with Gemini prompts or visual capsules',
        isCompleted: hasBuiltStrategy,
      },
    ];
  }, [isWalletConnected, isNetworkCorrect, isFaucetClaimed, isSessionActive, isFirstActionDone, hasBuiltStrategy]);

  const completedQuestsCount = quests.filter((q) => q.isCompleted).length;
  const totalQuestsCount = quests.length;
  const progressPercent = Math.round((completedQuestsCount / totalQuestsCount) * 100);
  const allQuestsCompleted = completedQuestsCount === totalQuestsCount;

  return {
    isOnboardingOpen,
    currentStep,
    hasCompletedOnboarding,
    isQuestBarDismissed,
    quests,
    completedQuestsCount,
    totalQuestsCount,
    progressPercent,
    allQuestsCompleted,
    openOnboarding,
    closeOnboarding,
    completeOnboarding,
    resetOnboarding,
    setStep: setCurrentStep,
    dismissQuestBar,
    restoreQuestBar,
  };
}
