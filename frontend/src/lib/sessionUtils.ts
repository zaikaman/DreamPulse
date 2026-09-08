export const DEFAULT_MAX_TRADE_SIZE = 500; // $500 tUSDC default per trade
export const DEFAULT_DAILY_VOLUME_CAP = 5000; // $5,000 tUSDC default per rolling 24h
export const MAX_ALLOWED_TRADE_SIZE = 1_000_000; // $1,000,000 tUSDC (Matches open-ended contract ceiling)
export const MAX_ALLOWED_DAILY_CAP = 10_000_000; // $10,000,000 tUSDC per rolling 24h
export const MAX_SESSION_DURATION_DAYS = 365; // 365 Days default UI ceiling (contract supports up to 100 years)
export const MAX_SESSION_DURATION_HOURS = 365 * 24; // 8,760 Hours
export const MAX_SESSION_DURATION_SEC = 365 * 24 * 3600;
export const MAX_SESSION_DURATION_MS = MAX_SESSION_DURATION_SEC * 1000;

export const UNLIMITED_AMOUNT = 1_000_000_000; // Legacy fallback amount
export const UNLIMITED_HOURS = 876_000; // Legacy fallback hours

/**
 * Checks if an amount represents unlimited / no cap.
 */
export function isUnlimitedAmount(amount: number | undefined | null): boolean {
  if (amount === undefined || amount === null) return false;
  return amount >= UNLIMITED_AMOUNT;
}

/**
 * Checks if a duration in hours represents unlimited / perpetual.
 */
export function isUnlimitedDuration(hours: number | undefined | null): boolean {
  if (hours === undefined || hours === null) return false;
  return hours >= 87_600; // >= 10 years
}

/**
 * Checks if an ISO expiration timestamp represents unlimited / perpetual.
 */
export function isUnlimitedExpiry(expiresAt: string | undefined | null): boolean {
  if (!expiresAt) return false;
  const expiry = new Date(expiresAt).getTime();
  const now = Date.now();
  const diffDays = (expiry - now) / (1000 * 3600 * 24);
  return diffDays > 365 * 2; // > 2 years
}

/**
 * Formats a cap amount (e.g. max trade size or daily volume cap) cleanly.
 */
export function formatCapAmount(amount: number | undefined | null, suffix: string = 'tUSDC'): string {
  if (amount === undefined || amount === null) return `0 ${suffix}`.trim();
  if (isUnlimitedAmount(amount)) {
    return 'Unlimited';
  }
  const formatted = Number(amount).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
  return suffix ? `${formatted} ${suffix}` : formatted;
}

/**
 * Formats session time remaining into a clean human-readable string.
 */
export function formatSessionTimeRemaining(expiresAt: string | undefined | null): string {
  if (!expiresAt) return '';
  const expiry = new Date(expiresAt).getTime();
  const now = Date.now();
  const diffMs = expiry - now;

  if (diffMs <= 0) {
    return 'Expired';
  }

  const diffDays = diffMs / (1000 * 3600 * 24);
  if (diffDays > 365 * 2) {
    return 'Perpetual';
  }

  const totalSec = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m ${secs}s`;
}
