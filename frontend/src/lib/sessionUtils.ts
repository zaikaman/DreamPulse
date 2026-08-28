export const UNLIMITED_AMOUNT = 1_000_000_000; // 1 Billion tUSDC (No Cap)
export const UNLIMITED_HOURS = 876_000; // 100 Years (876,000 Hours) - Perpetual

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
