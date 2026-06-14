import type { TimeUnit } from '../hooks/useCalculator.js';

const UNIT_SECONDS: Record<TimeUnit, number> = { second: 1, minute: 60, hour: 3600 };
const UNIT_LABEL: Record<TimeUnit, string> = { second: '/s', minute: '/min', hour: '/hr' };

/** Format a number with adaptive precision (no trailing zeros). */
export function num(n: number): string {
  if (n === 0) return '0';
  const abs = Math.abs(n);
  if (abs >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (abs >= 100) return n.toFixed(1).replace(/\.0$/, '');
  if (abs >= 1) return n.toFixed(2).replace(/\.?0+$/, '');
  return n.toFixed(3).replace(/\.?0+$/, '');
}

/** Convert a per-second rate to the chosen unit and format it with a suffix. */
export function rate(perSecond: number, unit: TimeUnit): string {
  return `${num(perSecond * UNIT_SECONDS[unit])}${UNIT_LABEL[unit]}`;
}

/** Format a building count, rounding up to whole for display when near-integer. */
export function buildings(count: number): string {
  return num(count);
}

/** Format electric power in kW/MW/GW. */
export function power(kw: number): string {
  if (kw >= 1_000_000) return `${num(kw / 1_000_000)} GW`;
  if (kw >= 1000) return `${num(kw / 1000)} MW`;
  return `${num(kw)} kW`;
}
