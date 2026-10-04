/** A number beside EPS is not a forward estimate until its period is explicit. */
export function parsePublicBrokerEps(text: string) {
  const value = text.normalize('NFKC').replace(/[−－]/gu, '-');
  const dated = value.match(/(?:(20\d{2})\s*年(?:度)?\s*(?:預估|預期)?\s*(?:EPS|每股盈餘)|(?:EPS|每股盈餘)\s*\(\s*(20\d{2})\s*\))\s*(?:預估|估計|為|約|[:：])?\s*(-?\d+(?:\.\d+)?)/iu);
  if (dated) return { eps: Number(dated[3]), estimateYear: Number(dated[1] || dated[2]), period: 'annual' as const };
  const unscoped = value.match(/(?:EPS|每股盈餘)\s*(?:預估|估計|為|約|[:：])?\s*(-?\d+(?:\.\d+)?)/iu);
  const eps = unscoped ? Number(unscoped[1]) : null;
  return { eps: eps !== null && Number.isFinite(eps) && !(eps >= 2000 && eps <= 2099 && Number.isInteger(eps)) ? eps : null,
    estimateYear: null, period: 'unknown' as const };
}
