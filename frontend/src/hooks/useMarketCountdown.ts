import { useState, useEffect, useRef } from 'react';

export interface MarketCountdownResult {
  formattedCountdown: string; // e.g. "03:12" or "00:00"
  formattedExpiry: string;    // e.g. "18:40"
  secondsLeft: number;
  isExpired: boolean;
  isLocked: boolean;          // Deprecated: always false (30s lock removed — trading open until expiry)
}

export function useMarketCountdown(
  closeTimestamp?: string,
  _windowDuration: '1m' | '5m' | '15m' | '1h' | string = '15m',
  onExpire?: () => void
): MarketCountdownResult {
  const [now, setNow] = useState<number>(Date.now());
  const hasTriggeredExpireRef = useRef<boolean>(false);
  const onExpireRef = useRef<(() => void) | undefined>(onExpire);

  // Keep callback ref current synchronously without re-triggering expiry effect on identity change.
  // Prevents infinite loops when parent passes an unstable inline callback (e.g. fetchMarkets).
  // Synchronous assignment guarantees the freshest callback is invoked even on the same
  // tick that isExpired flips to true, avoiding stale-closure bugs of an effect-based sync.
  onExpireRef.current = onExpire;

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

  let diff = 0;
  let isExpired = false;
  let isLocked = false;

  if (hasValidCloseTime) {
    const rawDiff = Math.floor((closeTime - now) / 1000);
    if (rawDiff <= 0) {
      diff = 0;
      isExpired = true;
      isLocked = false;
    } else {
      diff = rawDiff;
      isExpired = false;
      isLocked = false;
    }
  }

  // Render-phase side-effect fix: expiry callback is now a passive effect, not a render mutation.
  // Guarded by hasTriggeredExpireRef so StrictMode double-invoke and isExpired-stable re-renders
  // fire at most once per closeTimestamp. onExpireRef avoids re-firing when parent recreates
  // the callback identity (e.g. inline fetchMarkets). closeTimestamp in deps ensures an
  // already-expired market switch (expired -> expired) re-evaluates after the reset effect.
  useEffect(() => {
    if (isExpired && hasValidCloseTime && !hasTriggeredExpireRef.current) {
      hasTriggeredExpireRef.current = true;
      onExpireRef.current?.();
    }
  }, [isExpired, hasValidCloseTime, closeTimestamp]);

  let formattedCountdown: string;
  let formattedExpiry: string;

  if (hasValidCloseTime) {
    if (diff <= 0) {
      formattedCountdown = '00:00';
    } else {
      const days = Math.floor(diff / 86400);
      const hours = Math.floor((diff % 86400) / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;

      if (days > 0) {
        formattedCountdown = `${days}d ${hours}h ${String(m).padStart(2, '0')}m`;
      } else if (hours > 0) {
        formattedCountdown = `${String(hours).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      } else {
        formattedCountdown = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      }
    }

    const expiryDate = new Date(closeTime);
    const hours = String(expiryDate.getHours()).padStart(2, '0');
    const minutes = String(expiryDate.getMinutes()).padStart(2, '0');
    const timeStr = `${hours}:${minutes}`;

    const nowDate = new Date(now);
    const isToday = expiryDate.toDateString() === nowDate.toDateString();
    const tomorrowDate = new Date(now);
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const isTomorrow = expiryDate.toDateString() === tomorrowDate.toDateString();

    if (isToday) {
      formattedExpiry = timeStr;
    } else if (isTomorrow) {
      formattedExpiry = `Tomorrow ${timeStr}`;
    } else {
      const month = expiryDate.toLocaleDateString([], { month: 'short' });
      const day = expiryDate.getDate();
      formattedExpiry = `${month} ${day} ${timeStr}`;
    }
  } else {
    formattedCountdown = '--:--';
    formattedExpiry = '—';
  }

  return {
    formattedCountdown,
    formattedExpiry,
    secondsLeft: diff,
    isExpired,
    isLocked,
  };
}

