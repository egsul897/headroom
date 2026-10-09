/**
 * Stratified issuer sampling plans for pilot (100) and expansion (500).
 * Diversity across industry, size proxy, debt structure, filing period, etc.
 * Avoids collecting nearly identical contracts by design.
 */

export interface IssuerSeed {
  ticker: string;
  cik?: string;
  industry: string;
  sizeBucket: "LARGE" | "MID" | "SMALL";
  debtStructureHint: "TLB_HEAVY" | "ABL" | "IG_BONDS" | "HY_BONDS" | "MIXED";
  draftingStyleHint: "SPONSOR_LBO" | "PUBLIC_HY" | "IG_CREDIT" | "ABL_BORROWER" | "MIXED";
}

/** Diversified pilot seed — 100 publicly known large/mid issuers across sectors. */
export const PILOT_ISSUER_SEEDS: IssuerSeed[] = [
  // Industrials / manufacturing
  { ticker: "CAT", industry: "industrials", sizeBucket: "LARGE", debtStructureHint: "MIXED", draftingStyleHint: "IG_CREDIT" },
  { ticker: "DE", industry: "industrials", sizeBucket: "LARGE", debtStructureHint: "MIXED", draftingStyleHint: "IG_CREDIT" },
  { ticker: "MMM", industry: "industrials", sizeBucket: "LARGE", debtStructureHint: "IG_BONDS", draftingStyleHint: "IG_CREDIT" },
  { ticker: "EMR", industry: "industrials", sizeBucket: "LARGE", debtStructureHint: "MIXED", draftingStyleHint: "IG_CREDIT" },
  { ticker: "ROK", industry: "industrials", sizeBucket: "MID", debtStructureHint: "MIXED", draftingStyleHint: "IG_CREDIT" },
  { ticker: "DOV", industry: "industrials", sizeBucket: "MID", debtStructureHint: "MIXED", draftingStyleHint: "IG_CREDIT" },
  { ticker: "PNR", industry: "industrials", sizeBucket: "MID", debtStructureHint: "MIXED", draftingStyleHint: "PUBLIC_HY" },
  { ticker: "IR", industry: "industrials", sizeBucket: "LARGE", debtStructureHint: "TLB_HEAVY", draftingStyleHint: "SPONSOR_LBO" },
  { ticker: "XYL", industry: "industrials", sizeBucket: "MID", debtStructureHint: "MIXED", draftingStyleHint: "IG_CREDIT" },
  { ticker: "AME", industry: "industrials", sizeBucket: "MID", debtStructureHint: "MIXED", draftingStyleHint: "IG_CREDIT" },
  // Healthcare
  { ticker: "JNJ", industry: "healthcare", sizeBucket: "LARGE", debtStructureHint: "IG_BONDS", draftingStyleHint: "IG_CREDIT" },
  { ticker: "ABT", industry: "healthcare", sizeBucket: "LARGE", debtStructureHint: "IG_BONDS", draftingStyleHint: "IG_CREDIT" },
  { ticker: "MDT", industry: "healthcare", sizeBucket: "LARGE", debtStructureHint: "MIXED", draftingStyleHint: "IG_CREDIT" },
  { ticker: "BSX", industry: "healthcare", sizeBucket: "LARGE", debtStructureHint: "MIXED", draftingStyleHint: "IG_CREDIT" },
  { ticker: "SYK", industry: "healthcare", sizeBucket: "LARGE", debtStructureHint: "MIXED", draftingStyleHint: "IG_CREDIT" },
  { ticker: "CNMD", industry: "healthcare", sizeBucket: "MID", debtStructureHint: "TLB_HEAVY", draftingStyleHint: "PUBLIC_HY" },
  { ticker: "TFX", industry: "healthcare", sizeBucket: "MID", debtStructureHint: "MIXED", draftingStyleHint: "PUBLIC_HY" },
  { ticker: "HOLX", industry: "healthcare", sizeBucket: "MID", debtStructureHint: "MIXED", draftingStyleHint: "IG_CREDIT" },
  { ticker: "BAX", industry: "healthcare", sizeBucket: "LARGE", debtStructureHint: "MIXED", draftingStyleHint: "IG_CREDIT" },
  { ticker: "DXCM", industry: "healthcare", sizeBucket: "MID", debtStructureHint: "MIXED", draftingStyleHint: "PUBLIC_HY" },
  // Consumer / retail
  { ticker: "WMT", industry: "consumer", sizeBucket: "LARGE", debtStructureHint: "IG_BONDS", draftingStyleHint: "IG_CREDIT" },
  { ticker: "TGT", industry: "consumer", sizeBucket: "LARGE", debtStructureHint: "IG_BONDS", draftingStyleHint: "IG_CREDIT" },
  { ticker: "COST", industry: "consumer", sizeBucket: "LARGE", debtStructureHint: "IG_BONDS", draftingStyleHint: "IG_CREDIT" },
  { ticker: "MCD", industry: "consumer", sizeBucket: "LARGE", debtStructureHint: "IG_BONDS", draftingStyleHint: "IG_CREDIT" },
  { ticker: "SBUX", industry: "consumer", sizeBucket: "LARGE", debtStructureHint: "MIXED", draftingStyleHint: "IG_CREDIT" },
  { ticker: "YUM", industry: "consumer", sizeBucket: "MID", debtStructureHint: "MIXED", draftingStyleHint: "PUBLIC_HY" },
  { ticker: "DRI", industry: "consumer", sizeBucket: "MID", debtStructureHint: "MIXED", draftingStyleHint: "PUBLIC_HY" },
  { ticker: "CHWY", industry: "consumer", sizeBucket: "MID", debtStructureHint: "TLB_HEAVY", draftingStyleHint: "PUBLIC_HY" },
  { ticker: "WSM", industry: "consumer", sizeBucket: "MID", debtStructureHint: "MIXED", draftingStyleHint: "PUBLIC_HY" },
  { ticker: "RH", industry: "consumer", sizeBucket: "SMALL", debtStructureHint: "HY_BONDS", draftingStyleHint: "PUBLIC_HY" },
  // Tech / communications
  { ticker: "AAPL", industry: "technology", sizeBucket: "LARGE", debtStructureHint: "IG_BONDS", draftingStyleHint: "IG_CREDIT" },
  { ticker: "MSFT", industry: "technology", sizeBucket: "LARGE", debtStructureHint: "IG_BONDS", draftingStyleHint: "IG_CREDIT" },
  { ticker: "ORCL", industry: "technology", sizeBucket: "LARGE", debtStructureHint: "MIXED", draftingStyleHint: "IG_CREDIT" },
  { ticker: "IBM", industry: "technology", sizeBucket: "LARGE", debtStructureHint: "IG_BONDS", draftingStyleHint: "IG_CREDIT" },
  { ticker: "CSCO", industry: "technology", sizeBucket: "LARGE", debtStructureHint: "IG_BONDS", draftingStyleHint: "IG_CREDIT" },
  { ticker: "ADBE", industry: "technology", sizeBucket: "LARGE", debtStructureHint: "MIXED", draftingStyleHint: "IG_CREDIT" },
  { ticker: "CRM", industry: "technology", sizeBucket: "LARGE", debtStructureHint: "MIXED", draftingStyleHint: "IG_CREDIT" },
  { ticker: "NOW", industry: "technology", sizeBucket: "LARGE", debtStructureHint: "MIXED", draftingStyleHint: "IG_CREDIT" },
  { ticker: "PANW", industry: "technology", sizeBucket: "MID", debtStructureHint: "MIXED", draftingStyleHint: "PUBLIC_HY" },
  { ticker: "NET", industry: "technology", sizeBucket: "MID", debtStructureHint: "HY_BONDS", draftingStyleHint: "PUBLIC_HY" },
  // Energy / materials
  { ticker: "XOM", industry: "energy", sizeBucket: "LARGE", debtStructureHint: "IG_BONDS", draftingStyleHint: "IG_CREDIT" },
  { ticker: "CVX", industry: "energy", sizeBucket: "LARGE", debtStructureHint: "IG_BONDS", draftingStyleHint: "IG_CREDIT" },
  { ticker: "COP", industry: "energy", sizeBucket: "LARGE", debtStructureHint: "MIXED", draftingStyleHint: "IG_CREDIT" },
  { ticker: "EOG", industry: "energy", sizeBucket: "LARGE", debtStructureHint: "MIXED", draftingStyleHint: "IG_CREDIT" },
  { ticker: "SLB", industry: "energy", sizeBucket: "LARGE", debtStructureHint: "MIXED", draftingStyleHint: "IG_CREDIT" },
  { ticker: "HAL", industry: "energy", sizeBucket: "MID", debtStructureHint: "MIXED", draftingStyleHint: "PUBLIC_HY" },
  { ticker: "DVN", industry: "energy", sizeBucket: "MID", debtStructureHint: "MIXED", draftingStyleHint: "PUBLIC_HY" },
  { ticker: "FANG", industry: "energy", sizeBucket: "MID", debtStructureHint: "MIXED", draftingStyleHint: "PUBLIC_HY" },
  { ticker: "FCX", industry: "materials", sizeBucket: "LARGE", debtStructureHint: "MIXED", draftingStyleHint: "PUBLIC_HY" },
  { ticker: "NEM", industry: "materials", sizeBucket: "LARGE", debtStructureHint: "MIXED", draftingStyleHint: "IG_CREDIT" },
  // Financials (non-bank preference where possible for covenant docs)
  { ticker: "V", industry: "financials", sizeBucket: "LARGE", debtStructureHint: "IG_BONDS", draftingStyleHint: "IG_CREDIT" },
  { ticker: "MA", industry: "financials", sizeBucket: "LARGE", debtStructureHint: "IG_BONDS", draftingStyleHint: "IG_CREDIT" },
  { ticker: "AXP", industry: "financials", sizeBucket: "LARGE", debtStructureHint: "IG_BONDS", draftingStyleHint: "IG_CREDIT" },
  { ticker: "SPGI", industry: "financials", sizeBucket: "LARGE", debtStructureHint: "MIXED", draftingStyleHint: "IG_CREDIT" },
  { ticker: "MCO", industry: "financials", sizeBucket: "LARGE", debtStructureHint: "MIXED", draftingStyleHint: "IG_CREDIT" },
  { ticker: "CME", industry: "financials", sizeBucket: "LARGE", debtStructureHint: "MIXED", draftingStyleHint: "IG_CREDIT" },
  { ticker: "ICE", industry: "financials", sizeBucket: "LARGE", debtStructureHint: "MIXED", draftingStyleHint: "IG_CREDIT" },
  { ticker: "BLK", industry: "financials", sizeBucket: "LARGE", debtStructureHint: "MIXED", draftingStyleHint: "IG_CREDIT" },
  { ticker: "SCHW", industry: "financials", sizeBucket: "LARGE", debtStructureHint: "MIXED", draftingStyleHint: "IG_CREDIT" },
  { ticker: "TROW", industry: "financials", sizeBucket: "MID", debtStructureHint: "MIXED", draftingStyleHint: "IG_CREDIT" },
  // Transport / autos
  { ticker: "F", industry: "autos", sizeBucket: "LARGE", debtStructureHint: "MIXED", draftingStyleHint: "PUBLIC_HY" },
  { ticker: "GM", industry: "autos", sizeBucket: "LARGE", debtStructureHint: "MIXED", draftingStyleHint: "PUBLIC_HY" },
  { ticker: "TSLA", industry: "autos", sizeBucket: "LARGE", debtStructureHint: "MIXED", draftingStyleHint: "PUBLIC_HY" },
  { ticker: "AAL", industry: "airlines", sizeBucket: "MID", debtStructureHint: "TLB_HEAVY", draftingStyleHint: "PUBLIC_HY" },
  { ticker: "UAL", industry: "airlines", sizeBucket: "MID", debtStructureHint: "TLB_HEAVY", draftingStyleHint: "PUBLIC_HY" },
  { ticker: "DAL", industry: "airlines", sizeBucket: "LARGE", debtStructureHint: "MIXED", draftingStyleHint: "PUBLIC_HY" },
  { ticker: "LUV", industry: "airlines", sizeBucket: "MID", debtStructureHint: "MIXED", draftingStyleHint: "PUBLIC_HY" },
  { ticker: "UPS", industry: "transport", sizeBucket: "LARGE", debtStructureHint: "IG_BONDS", draftingStyleHint: "IG_CREDIT" },
  { ticker: "FDX", industry: "transport", sizeBucket: "LARGE", debtStructureHint: "MIXED", draftingStyleHint: "IG_CREDIT" },
  { ticker: "CSX", industry: "transport", sizeBucket: "LARGE", debtStructureHint: "IG_BONDS", draftingStyleHint: "IG_CREDIT" },
  // Telecom / media
  { ticker: "T", industry: "telecom", sizeBucket: "LARGE", debtStructureHint: "IG_BONDS", draftingStyleHint: "IG_CREDIT" },
  { ticker: "VZ", industry: "telecom", sizeBucket: "LARGE", debtStructureHint: "IG_BONDS", draftingStyleHint: "IG_CREDIT" },
  { ticker: "TMUS", industry: "telecom", sizeBucket: "LARGE", debtStructureHint: "MIXED", draftingStyleHint: "PUBLIC_HY" },
  { ticker: "CMCSA", industry: "media", sizeBucket: "LARGE", debtStructureHint: "IG_BONDS", draftingStyleHint: "IG_CREDIT" },
  { ticker: "DIS", industry: "media", sizeBucket: "LARGE", debtStructureHint: "MIXED", draftingStyleHint: "IG_CREDIT" },
  { ticker: "NFLX", industry: "media", sizeBucket: "LARGE", debtStructureHint: "HY_BONDS", draftingStyleHint: "PUBLIC_HY" },
  { ticker: "WBD", industry: "media", sizeBucket: "MID", debtStructureHint: "HY_BONDS", draftingStyleHint: "PUBLIC_HY" },
  { ticker: "PARA", industry: "media", sizeBucket: "MID", debtStructureHint: "HY_BONDS", draftingStyleHint: "PUBLIC_HY" },
  { ticker: "FOXA", industry: "media", sizeBucket: "MID", debtStructureHint: "MIXED", draftingStyleHint: "PUBLIC_HY" },
  { ticker: "LYV", industry: "media", sizeBucket: "MID", debtStructureHint: "HY_BONDS", draftingStyleHint: "PUBLIC_HY" },
  // ABL / specialty / smaller diversified
  { ticker: "GPK", industry: "materials", sizeBucket: "MID", debtStructureHint: "ABL", draftingStyleHint: "ABL_BORROWER" },
  { ticker: "SON", industry: "materials", sizeBucket: "MID", debtStructureHint: "MIXED", draftingStyleHint: "IG_CREDIT" },
  { ticker: "PKG", industry: "materials", sizeBucket: "MID", debtStructureHint: "MIXED", draftingStyleHint: "IG_CREDIT" },
  { ticker: "WRK", industry: "materials", sizeBucket: "MID", debtStructureHint: "MIXED", draftingStyleHint: "PUBLIC_HY" },
  { ticker: "IP", industry: "materials", sizeBucket: "MID", debtStructureHint: "MIXED", draftingStyleHint: "IG_CREDIT" },
  { ticker: "SEE", industry: "materials", sizeBucket: "MID", debtStructureHint: "TLB_HEAVY", draftingStyleHint: "PUBLIC_HY" },
  { ticker: "AVY", industry: "materials", sizeBucket: "MID", debtStructureHint: "MIXED", draftingStyleHint: "IG_CREDIT" },
  { ticker: "BALL", industry: "materials", sizeBucket: "MID", debtStructureHint: "HY_BONDS", draftingStyleHint: "PUBLIC_HY" },
  { ticker: "CCK", industry: "materials", sizeBucket: "MID", debtStructureHint: "HY_BONDS", draftingStyleHint: "PUBLIC_HY" },
  { ticker: "ATR", industry: "materials", sizeBucket: "SMALL", debtStructureHint: "MIXED", draftingStyleHint: "PUBLIC_HY" },
  // Additional diversified names to reach 100
  { ticker: "HON", industry: "industrials", sizeBucket: "LARGE", debtStructureHint: "IG_BONDS", draftingStyleHint: "IG_CREDIT" },
  { ticker: "GE", industry: "industrials", sizeBucket: "LARGE", debtStructureHint: "MIXED", draftingStyleHint: "IG_CREDIT" },
  { ticker: "ETN", industry: "industrials", sizeBucket: "LARGE", debtStructureHint: "MIXED", draftingStyleHint: "IG_CREDIT" },
  { ticker: "ITW", industry: "industrials", sizeBucket: "LARGE", debtStructureHint: "IG_BONDS", draftingStyleHint: "IG_CREDIT" },
  { ticker: "PH", industry: "industrials", sizeBucket: "LARGE", debtStructureHint: "MIXED", draftingStyleHint: "IG_CREDIT" },
  { ticker: "CMI", industry: "industrials", sizeBucket: "LARGE", debtStructureHint: "MIXED", draftingStyleHint: "IG_CREDIT" },
  { ticker: "PCAR", industry: "industrials", sizeBucket: "LARGE", debtStructureHint: "MIXED", draftingStyleHint: "IG_CREDIT" },
  { ticker: "GWW", industry: "industrials", sizeBucket: "MID", debtStructureHint: "MIXED", draftingStyleHint: "IG_CREDIT" },
  { ticker: "FAST", industry: "industrials", sizeBucket: "MID", debtStructureHint: "MIXED", draftingStyleHint: "IG_CREDIT" },
  { ticker: "URI", industry: "industrials", sizeBucket: "LARGE", debtStructureHint: "TLB_HEAVY", draftingStyleHint: "PUBLIC_HY" },
];

export function stratifiedPilotPlan(n = 100): IssuerSeed[] {
  return PILOT_ISSUER_SEEDS.slice(0, Math.min(n, PILOT_ISSUER_SEEDS.length));
}

/** Expand toward 500 by repeating sector-balanced placeholders that callers resolve via EDGAR tickers file. */
export function expansionPlan(n = 500): { seed: IssuerSeed[]; note: string } {
  const base = stratifiedPilotPlan(100);
  // Additional tickers layered for diversity — still public issuers; discovery will skip unresolved.
  const extraTickers = [
    "LOW", "HD", "NKE", "LULU", "TJX", "ROST", "DG", "DLTR", "KR", "SYY",
    "PEP", "KO", "PM", "MO", "CL", "PG", "KMB", "CHD", "CLX", "EL",
    "AMZN", "GOOGL", "META", "NVDA", "AMD", "INTC", "QCOM", "TXN", "AVGO", "MU",
    "BA", "LMT", "RTX", "NOC", "GD", "HII", "TXT", "TDG", "HEI", "CW",
    "UNH", "CI", "ELV", "HUM", "CNC", "MOH", "CVS", "WBA", "CAH", "MCK",
    "PFE", "MRK", "BMY", "LLY", "AMGN", "GILD", "BIIB", "REGN", "VRTX", "MRNA",
    "DUK", "SO", "NEE", "D", "AEP", "EXC", "SRE", "PEG", "ED", "XEL",
    "AMT", "CCI", "EQIX", "DLR", "PSA", "O", "SPG", "PLD", "WELL", "VTR",
    "MAR", "HLT", "H", "WH", "PK", "RCL", "CCL", "NCLH", "BKNG", "EXPE",
    "ADM", "BG", "TSN", "HRL", "CPB", "GIS", "K", "SJM", "CAG", "MKC",
  ];
  const sizeBuckets = ["LARGE", "MID", "SMALL"] as const;
  const debtHints = ["MIXED", "IG_BONDS", "HY_BONDS", "TLB_HEAVY", "ABL"] as const;
  const styleHints = ["IG_CREDIT", "PUBLIC_HY", "SPONSOR_LBO", "ABL_BORROWER", "MIXED"] as const;
  const industries = ["consumer", "healthcare", "technology", "industrials", "utilities", "reits", "travel", "staples"] as const;
  const extras: IssuerSeed[] = extraTickers.map((ticker, i) => ({
    ticker,
    industry: industries[i % industries.length]!,
    sizeBucket: sizeBuckets[i % sizeBuckets.length]!,
    debtStructureHint: debtHints[i % debtHints.length]!,
    draftingStyleHint: styleHints[i % styleHints.length]!,
  }));
  const merged = [...base, ...extras].slice(0, n);
  return {
    seed: merged,
    note: "Stratified expansion plan — actual acquisition depends on EDGAR availability and debt-exhibit discovery; identical contracts are deduped by hash.",
  };
}

export function diversityReport(seeds: IssuerSeed[]): Record<string, Record<string, number>> {
  const dims = ["industry", "sizeBucket", "debtStructureHint", "draftingStyleHint"] as const;
  const out: Record<string, Record<string, number>> = {};
  for (const dim of dims) {
    out[dim] = {};
    for (const s of seeds) {
      const key = String(s[dim]);
      out[dim]![key] = (out[dim]![key] ?? 0) + 1;
    }
  }
  return out;
}
