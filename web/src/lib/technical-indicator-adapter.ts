/**
 * Stable adapters for technical formulas whose semantics must not change with
 * a package upgrade. indicatorts remains the implementation for SMA/RSI/OBV;
 * ATR and crossover evidence live here because their seeding and prior-session
 * rules are part of the research contract.
 */
export type AtrInputBar = { high: number; low: number; close: number };

export const WILDER_ATR_PERIOD = 14;

export function wilderAtr(bars: AtrInputBar[], period = WILDER_ATR_PERIOD): number | null {
  if (!Number.isInteger(period) || period < 1 || bars.length < period || bars.some((bar) => !Number.isFinite(bar.high)
    || !Number.isFinite(bar.low) || !Number.isFinite(bar.close) || bar.close <= 0 || bar.high < bar.low)) return null;
  const trueRanges = bars.map((bar, index) => {
    const priorClose = index === 0 ? null : bars[index - 1].close;
    return priorClose == null ? bar.high - bar.low : Math.max(bar.high - bar.low, Math.abs(bar.high - priorClose), Math.abs(bar.low - priorClose));
  });
  let value = trueRanges.slice(0, period).reduce((sum, range) => sum + range, 0) / period;
  for (const range of trueRanges.slice(period)) value = (value * (period - 1) + range) / period;
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function trueLongMaCrossover(input: {
  close: number | null;
  movingAverage: number | null;
  priorClose: number | null;
  priorMovingAverage: number | null;
}): boolean {
  const values = [input.close, input.movingAverage, input.priorClose, input.priorMovingAverage];
  return values.every((value) => value != null && Number.isFinite(value))
    && input.close! > input.movingAverage!
    && input.priorClose! <= input.priorMovingAverage!;
}

/** The confirmation day is not a second crossover: it only has to hold above
 * the relevant long MA after an adjacent recorded crossover. */
export function holdsLongMaConfirmation(input: {
  priorBreakoutRecorded: boolean;
  close: number | null;
  movingAverage: number | null;
}): boolean {
  return input.priorBreakoutRecorded === true
    && input.close != null && input.movingAverage != null
    && Number.isFinite(input.close) && Number.isFinite(input.movingAverage)
    && input.close > input.movingAverage;
}
