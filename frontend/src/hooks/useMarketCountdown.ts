import { useState, useEffect } from 'react';

export interface MarketCountdownResult {
  formattedCountdown: string; // e.g. "03:12"
  formattedExpiry: string;    // e.g. "18:40"
  secondsLeft: number;
  isExpired: boolean;
  isLocked: boolean;          // Trading lockout phase in final 30s before resolution
}

export function useMarketCountdown(
  closeTimestamp?: string,
  windowDuration: '5m' | '15m' | '1h' = '15m'
): MarketCountdownResult {
  const [now, setNow] = useState<number>(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const closeTime = closeTimestamp ? new Date(closeTimestamp).getTime() : 0;
  let diff = Math.floor((closeTime - now) / 1000);

  // If invalid or in the past, provide a deterministic rolling cycle based on current time
  const cycleSeconds = windowDuration === '1h' ? 3600 : windowDuration === '5m' ? 300 : 900;
  if (isNaN(diff) || diff <= 0 || diff > 3600 * 24) {
    diff = cycleSeconds - (Math.floor(now / 1000) % cycleSeconds);
  }

  const m = Math.floor(diff / 60);
  const s = diff % 60;
  const formattedCountdown = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

  // Formatted expiry time in user's local timezone (24-hour format: "HH:mm")
  let expiryDate = closeTime > 0 && !isNaN(closeTime) ? new Date(closeTime) : null;
  if (!expiryDate || isNaN(expiryDate.getTime())) {
    expiryDate = new Date(now + diff * 1000);
  }

  const hours = String(expiryDate.getHours()).padStart(2, '0');
  const minutes = String(expiryDate.getMinutes()).padStart(2, '0');
  const formattedExpiry = `${hours}:${minutes}`;

  return {
    formattedCountdown,
    formattedExpiry,
    secondsLeft: diff,
    isExpired: diff <= 0,
    isLocked: diff <= 0,
  };
}
