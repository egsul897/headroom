/**
 * Issuer / instrument identity for balanced sampling.
 * Derived from packageId / documentId — not from company names in body text.
 */
import type { DocumentSource } from "./types";

export interface IssuerMeta {
  issuerId: string;
  instrumentId: string;
  packageId: string;
  documentId: string;
}

const PACKAGE_ISSUER: Record<string, string> = {
  "conmed-2025-credit-facility": "issuer:conmed",
  "fwrg-2021-credit-agreement": "issuer:fwrg",
  "lsb-2023-abl-credit-agreement": "issuer:lsb",
  "chwy-2026-credit-agreement": "issuer:chwy",
  "dsgr-2022-2025-credit-facility": "issuer:dsgr",
  "riot-2025-2026-credit-facility": "issuer:riot",
  "final-lightweight-unseen-sup": "issuer:sup",
  "gibraltar-2026-credit-agreement": "issuer:gibraltar",
};

export function issuerMetaFor(source: DocumentSource): IssuerMeta {
  const issuerId = PACKAGE_ISSUER[source.packageId] ?? `issuer:${source.packageId}`;
  return {
    issuerId,
    instrumentId: `${source.packageId}::${source.documentId}`,
    packageId: source.packageId,
    documentId: source.documentId,
  };
}

export function issuerIdForPackage(packageId: string): string {
  return PACKAGE_ISSUER[packageId] ?? `issuer:${packageId}`;
}

/** Diversified public issuers for EDGAR acquisition (tickers). */
export const ACQUISITION_TICKER_STRATA: Array<{ stratum: string; tickers: string[] }> = [
  {
    stratum: "large-cap-industrial",
    tickers: ["CAT", "DE", "HON", "EMR", "ETN", "ITW", "PH", "ROK", "CMI", "IR"],
  },
  {
    stratum: "retail-consumer",
    tickers: ["WMT", "TGT", "COST", "HD", "LOW", "NKE", "SBUX", "MCD", "YUM", "DRI"],
  },
  {
    stratum: "healthcare",
    tickers: ["JNJ", "UNH", "ABT", "MDT", "SYK", "BSX", "ISRG", "BAX", "ZBH", "HOLX"],
  },
  {
    stratum: "tech-communications",
    tickers: ["IBM", "CSCO", "ORCL", "ADP", "INTU", "CRM", "NOW", "PANW", "FTNT", "ANET"],
  },
  {
    stratum: "energy-materials",
    tickers: ["XOM", "CVX", "COP", "EOG", "SLB", "MPC", "VLO", "FCX", "NEM", "NUE"],
  },
  {
    stratum: "financials-reits",
    tickers: ["JPM", "BAC", "WFC", "C", "GS", "MS", "AXP", "BLK", "SPG", "PLD"],
  },
  {
    stratum: "mid-small-diversified",
    tickers: ["GPK", "SON", "ATR", "GGG", "LECO", "TTC", "ROL", "WSO", "AOS", "MIDD"],
  },
  {
    stratum: "transport-logistics",
    tickers: ["UPS", "FDX", "UNP", "CSX", "NSC", "DAL", "UAL", "LUV", "JBHT", "CHRW"],
  },
  {
    stratum: "media-services",
    tickers: ["DIS", "CMCSA", "NFLX", "PARA", "WBD", "LYV", "MTCH", "EA", "TTWO", "RBLX"],
  },
  {
    stratum: "additional-credit-active",
    tickers: ["AAL", "F", "GM", "CCL", "NCLH", "RCL", "MAR", "HLT", "WYNN", "MGM"],
  },
];

export function allAcquisitionTickers(): string[] {
  return ACQUISITION_TICKER_STRATA.flatMap((s) => s.tickers);
}
