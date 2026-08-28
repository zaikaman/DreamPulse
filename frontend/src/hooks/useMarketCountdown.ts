import { useState, useEffect, useRef } from 'react';

export interface MarketCountdownResult {
  formattedCountdown: string; // e.g. "03:12" or "00:00"
  formattedExpiry: string;    // e.g. "18:40"
  secondsLeft: number;
  isExpired: boolean;
  isLocked: boolean;          // Trading lockout phase in final 30s before resolution
}

export function useMarketCountdown(
  closeTimestamp?: string,
  windowDuration: '1m' | '5m' | '15m' | '1h' | string = '15m',
  onExpire?: () => void
): MarketCountdownResult {
  const [now, setNow] = useState<number>(Date.now());
  const hasTriggeredExpireRef = useRef<boolean>(false);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Reset expiry callback state when market closeTimestamp changes
  useEffect(() => {
    hasTriggeredExpireRef.current = false;
  }, [closeTimestamp]);

  const closeTime = closeTimestamp ? new Date(closeTimestamp).getTime() : 0;
  const hasValidCloseTime = closeTime > 0 && !isNaN(closeTime);

  let diff: number;
  let isExpired: boolean;
  let isLocked: boolean;
  let expiryDate: Date;

  if (hasValidCloseTime) {
    const rawDiff = Math.floor((closeTime - now) / 1000);
    if (rawDiff <= 0) {
      diff = 0;
      isExpired = true;
      isLocked = true;
      if (!hasTriggeredExpireRef.current) {
        hasTriggeredExpireRef.current = true;
        onExpire?.();
      }
    } else {
      diff = rawDiff;
      isExpired = false;
      isLocked = rawDiff <= 30; // Lockout during final 30 seconds before contract resolution
    }
    expiryDate = new Date(closeTime);
  } else {
    // Deterministic fallback cycle only when no valid closeTimestamp is provided
    const cycleSeconds = windowDuration === '1m' ? 60 : windowDuration === '1h' ? 3600 : windowDuration === '5m' ? 300 : 900;
    diff = cycleSeconds - (Math.floor(now / 1000) % cycleSeconds);
    isExpired = false;
    isLocked = diff <= 30;
    expiryDate = new Date(now + diff * 1000);
  }

  const m = Math.floor(diff / 60);
  const s = diff % 60;
  const formattedCountdown = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

  const hours = String(expiryDate.getHours()).padStart(2, '0');
  const minutes = String(expiryDate.getMinutes()).padStart(2, '0');
  const formattedExpiry = `${hours}:${minutes}`;

  return {
    formattedCountdown,
    formattedExpiry,
    secondsLeft: diff,
    isExpired,
    isLocked,
  };
}
