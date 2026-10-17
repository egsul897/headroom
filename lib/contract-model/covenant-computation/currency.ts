/** Non-USD amount markers. A cap stated in another currency is never read as US dollars. */
const FX_CODE = String.raw`(?:AUS?\$|A\$|C\$|CDN\$|CA\$|NZ\$|HK\$|S\$|R\$|€|£|¥|₹|(?:EUR|GBP|JPY|CHF|CAD|AUD|NZD|SEK|NOK|DKK|HKD|SGD|CNY|INR|MXN|BRL)\b)`;
const FX_WORD = String.raw`(?:euros?|pounds?(?:\s+sterling)?|sterling|yen|swiss\s+francs?|(?:canadian|australian|new\s+zealand|hong\s+kong|singapore)\s+dollars?)`;
/** The non-USD currency a clause states an amount in ("AUS$75.0 million", "€40,000,000", "25 million euros"), or null. */
export function nonUsdCurrency(text: string): string | null {
  const t = text.replace(/\u00a0/g, " ");
  const m = new RegExp(String.raw`(?<![A-Za-z])(${FX_CODE})\s?\d`).exec(t) ?? new RegExp(String.raw`\d(?:[\d,.]*)\s*(?:million\s+|billion\s+)?(${FX_WORD})\b`, "i").exec(t);
  return m ? m[1]!.replace(/\s+/g, " ").trim() : null;
}
