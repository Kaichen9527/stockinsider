import { roundHalfAwayFromZero } from './canonical.ts';

export function labelOutcome(input: {
  entryClose: number;
  closes: number[];
  highs: number[];
  lows: number[];
  sectorReturns: number[];
}) {
  if (
    input.entryClose <= 0 ||
    input.closes.length === 0 ||
    input.closes.length !== input.highs.length ||
    input.closes.length !== input.lows.length ||
    input.closes.length !== input.sectorReturns.length
  ) throw new TypeError('unevaluable_outcome');
  const returns = input.closes.map((close) => 100 * (close / input.entryClose - 1));
  const highReturns = input.highs.map((high) => 100 * (high / input.entryClose - 1));
  const lowReturns = input.lows.map((low) => 100 * (low / input.entryClose - 1));
  const final = returns.at(-1) ?? 0;
  const sectorRelative = final - (input.sectorReturns.at(-1) ?? 0);
  const sectorRelativeMfe = Math.max(...highReturns.map((value, index) => value - input.sectorReturns[index]));
  const mfe = Math.max(...highReturns);
  const mae = Math.min(0, ...lowReturns);
  const relevant = mfe >= 10 && sectorRelative >= 5 && mae >= -8;
  let grade = sectorRelativeMfe >= 15 ? 3 : sectorRelativeMfe >= 10 ? 2 : sectorRelativeMfe >= 5 ? 1 : 0;
  if (mae < -12) grade = Math.min(grade, 1);
  return {
    returnPct: roundHalfAwayFromZero(final, 2),
    sectorRelativeReturnPct: roundHalfAwayFromZero(sectorRelative, 2),
    mfePct: roundHalfAwayFromZero(mfe, 2),
    maePct: roundHalfAwayFromZero(mae, 2),
    sectorRelativeMfePct: roundHalfAwayFromZero(sectorRelativeMfe, 2),
    relevant,
    grade,
  };
}
