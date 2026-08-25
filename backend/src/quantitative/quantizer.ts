/**
 * DreamDEX Protocol Tick-Size, Lot-Step Quantizer, and Precision Formatting.
 */

export const PROTOCOL_CONSTRAINTS = {
  MIN_PRICE: 0.01,
  MAX_PRICE: 0.99,
  DEFAULT_TICK_SIZE: 0.01,
  DEFAULT_LOT_STEP: 1.0,
  MIN_LOT_SIZE: 1.0,
  DEFAULT_COLLATERAL_DECIMALS: 6, // Somnia TestUSDC
};

/**
 * Snaps a price to the nearest tick increment and clamps within [minPrice, maxPrice].
 *
 * @param rawPrice Floating point probability (e.g. 0.4831)
 * @param tickSize Minimum price increment (default: 0.01)
 * @param minPrice Absolute floor price (default: 0.01)
 * @param maxPrice Absolute ceiling price (default: 0.99)
 */
export function quantizePrice(
  rawPrice: number,
  tickSize: number = PROTOCOL_CONSTRAINTS.DEFAULT_TICK_SIZE,
  minPrice: number = PROTOCOL_CONSTRAINTS.MIN_PRICE,
  maxPrice: number = PROTOCOL_CONSTRAINTS.MAX_PRICE,
): number {
  if (isNaN(rawPrice) || !isFinite(rawPrice)) {
    return minPrice;
  }

  // Snap to tick increment
  const steps = Math.round(rawPrice / tickSize);
  const snapped = steps * tickSize;

  // Clamp within bounds
  const clamped = Math.min(maxPrice, Math.max(minPrice, snapped));

  // Determine decimal places from tickSize to eliminate IEEE 754 precision artifacts
  const decimals = (tickSize.toString().split('.')[1] || '').length;
  return Number(clamped.toFixed(decimals));
}

/**
 * Snaps a lot size to the nearest valid lot step and enforces minimum order bounds.
 *
 * @param rawLot Floating point lots (e.g. 5.73)
 * @param lotStep Lot size increment (default: 1.0)
 * @param minLot Minimum allowed lot order (default: 1.0)
 * @param maxLot Optional maximum risk ceiling
 */
export function quantizeLotSize(
  rawLot: number,
  lotStep: number = PROTOCOL_CONSTRAINTS.DEFAULT_LOT_STEP,
  minLot: number = PROTOCOL_CONSTRAINTS.MIN_LOT_SIZE,
  maxLot?: number,
): number {
  if (isNaN(rawLot) || rawLot <= 0) {
    return minLot;
  }

  const steps = Math.floor(rawLot / lotStep);
  let snapped = steps * lotStep;

  if (snapped < minLot) {
    snapped = minLot;
  }
  if (maxLot !== undefined && snapped > maxLot) {
    snapped = maxLot;
  }

  const decimals = (lotStep.toString().split('.')[1] || '').length;
  return Number(snapped.toFixed(decimals));
}

/**
 * Converts decimal token units to integer BigInt according to token decimals (e.g. 6 decimals for TestUSDC).
 */
export function toContractUnits(
  amount: number,
  decimals: number = PROTOCOL_CONSTRAINTS.DEFAULT_COLLATERAL_DECIMALS,
): bigint {
  if (isNaN(amount) || amount <= 0) return 0n;
  const factor = 10 ** decimals;
  const rawInt = Math.round(amount * factor);
  return BigInt(rawInt);
}

/**
 * Converts on-chain BigInt contract units back to a human-readable float.
 */
export function fromContractUnits(
  amount: bigint,
  decimals: number = PROTOCOL_CONSTRAINTS.DEFAULT_COLLATERAL_DECIMALS,
): number {
  const factor = 10 ** decimals;
  return Number(amount) / factor;
}
