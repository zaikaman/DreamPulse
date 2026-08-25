/**
 * High-precision standard normal Cumulative Distribution Function Φ(z),
 * Error Function erf(x), and Black-Scholes binary option probability calculator.
 */

const SQRT_2 = Math.SQRT2;
const SQRT_2PI = Math.sqrt(2 * Math.PI);

/**
 * Standard Normal Probability Density Function φ(z).
 */
export function normalPdf(z: number): number {
  return Math.exp(-0.5 * z * z) / SQRT_2PI;
}

/**
 * High-precision Error Function erf(x) using Abramowitz & Stegun rational approximation (formula 7.1.26).
 * Maximum absolute error < 1.5e-7.
 */
export function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);

  // Constants
  const p = 0.3275911;
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;

  const t = 1.0 / (1.0 + p * absX);
  const poly = ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t;
  const y = 1.0 - poly * Math.exp(-absX * absX);

  return sign * y;
}

/**
 * Standard Normal Cumulative Distribution Function Φ(z).
 * Φ(z) = 0.5 * (1 + erf(z / sqrt(2)))
 *
 * @param z Standardized score
 * @returns Cumulative probability in (0, 1)
 */
export function normalCdf(z: number): number {
  if (z <= -8) return 0.00000001;
  if (z >= 8) return 0.99999999;
  return 0.5 * (1.0 + erf(z / SQRT_2));
}

/**
 * Calculates standardized z-score for a binary prediction contract.
 *
 * $$z = \frac{\ln(S / K) + (r - \sigma^2 / 2) \cdot T}{\sigma \sqrt{T}}$$
 *
 * @param spot Current spot price of underlying asset (e.g. BTC or ETH)
 * @param strike Settlement strike target price
 * @param annualVolatility Implied or realized annualized volatility (e.g. 0.55 for 55%)
 * @param timeToExpiryYears Time remaining until resolution in fractional years (e.g. 300 / 31536000 for 5m)
 * @param riskFreeRate Annualized risk-free interest rate (default 0.0)
 */
export function calculateZScore(
  spot: number,
  strike: number,
  annualVolatility: number,
  timeToExpiryYears: number,
  riskFreeRate: number = 0.0,
): number {
  if (spot <= 0 || strike <= 0) {
    throw new Error(`Spot (${spot}) and Strike (${strike}) must be strictly positive.`);
  }
  if (annualVolatility <= 0) {
    throw new Error(`Volatility (${annualVolatility}) must be strictly positive.`);
  }
  if (timeToExpiryYears <= 0) {
    // If expired: binary step function
    return spot >= strike ? 10.0 : -10.0;
  }

  const volSqrtT = annualVolatility * Math.sqrt(timeToExpiryYears);
  const drift = (riskFreeRate - 0.5 * annualVolatility * annualVolatility) * timeToExpiryYears;
  const z = (Math.log(spot / strike) + drift) / volSqrtT;

  return z;
}

/**
 * Computes fair theoretical Black-Scholes probability for binary YES contract outcome.
 *
 * P(Spot_T >= Strike) = Φ(d2)
 *
 * @returns Probability between 0.0001 and 0.9999
 */
export function calculateBinaryYesProbability(
  spot: number,
  strike: number,
  annualVolatility: number,
  timeToExpiryYears: number,
  riskFreeRate: number = 0.0,
): number {
  const z = calculateZScore(spot, strike, annualVolatility, timeToExpiryYears, riskFreeRate);
  const prob = normalCdf(z);
  // Clamp between (0.001, 0.999) to respect DreamDEX probability interval invariants
  return Math.min(0.999, Math.max(0.001, prob));
}
