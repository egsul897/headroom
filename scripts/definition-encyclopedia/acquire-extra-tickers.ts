#!/usr/bin/env tsx
import { resolve } from "node:path";
import { writeFileSync } from "node:fs";
import { acquireViaEdgarConnector } from "../../lib/definition-encyclopedia/sec-acquire";
import { loadAcquiredSourceSpecs } from "../../lib/definition-encyclopedia/acquired-sources";

async function main() {
  const repoRoot = resolve(__dirname, "../..");
  const prior = loadAcquiredSourceSpecs(repoRoot);
  const have = new Set(prior.metas.map((m) => (m.issuerTicker || "").toUpperCase()));
  const candidates = [
    "GTN", "SSP", "NXST", "SBGI", "TGNA", "FOXA", "LYV", "MSGS",
    "CHDN", "PENN", "CZR", "MGM", "WYNN", "LVS",
    "HCA", "UHS", "THC", "CYH", "SEM", "ACHC", "ENSG",
    "CNC", "MOH", "ELV", "CI", "HUM", "CVS", "WBA",
    "DGX", "LH", "TMO", "DHR", "BDX", "BAX", "BSX", "ISRG", "EW", "ZBH", "SYK",
    "ITW", "IR", "DOV", "PH", "AME", "XYL", "PNR", "IEX", "GGG", "NDSN",
    "FAST", "GWW", "MSM", "AIT",
    "URI", "HEES", "GATX",
    "CSL", "OC", "MLM", "VMC", "EXP",
    "MAS", "TREX", "AZEK",
    "SWK", "SNA", "TTC", "LECO", "SSD",
    "POOL", "WSO", "AOS", "LII", "WTS",
    "TEX", "OSK", "AGCO",
    "SHW", "PPG", "RPM", "AXTA",
    "BERY", "GPK",
    "KMB", "CL", "CLX", "CHD", "PG",
    "POST", "LANC", "FLO", "JJSF", "CALM",
    "SAM", "TAP", "STZ", "MGPI",
    "CROX", "DECK", "SKX", "WWW", "SHOO",
    "GIII", "COLM", "TPR", "CPRI",
    "BURL", "FIVE", "OLLI",
    "BBWI", "VSCO", "EXPR",
    "DKS", "FL",
    "ETSY", "PETS",
    "CAR", "HTZ", "SNCY", "ALGT", "SKYW",
    "ODFL", "SAIA", "XPO", "ARCB", "WERN", "KNX",
    "LSTR", "CHRW", "EXPD", "HUBG",
    "MATX", "STNG",
    "CHH", "APLE", "RLJ", "DRH",
    "MAC", "SKT", "REG", "KIM", "BRX",
    "EQR", "AVB", "ESS", "UDR", "MAA", "CPT",
    "ARE", "DEA", "PGRE",
    "INVH", "AMH", "SUI", "ELS",
    "ADT", "ARMK", "CTAS", "ROL",
    "JBL", "FLEX", "SANM", "PLXS",
    "CRUS", "SWKS", "QRVO", "ON", "MPWR",
    "ENTG", "AMAT", "LRCX", "KLAC", "TER",
    "CDNS", "SNPS", "ANSS", "PTC",
    "NOW", "CRM", "WDAY", "ADBE", "INTU",
    "PANW", "CRWD", "ZS", "OKTA", "FTNT",
  ];
  const fresh = [...new Set(candidates.map((t) => t.toUpperCase()))].filter((t) => !have.has(t));
  console.log(JSON.stringify({ candidates: fresh.length, priorIssuers: have.size }, null, 2));
  const more = await acquireViaEdgarConnector({
    repoRoot,
    tickers: fresh,
    maxIssuers: 25,
    maxDocsPerIssuer: 1,
    filingLimit: 28,
  });
  const all = loadAcquiredSourceSpecs(repoRoot).metas;
  const summary = {
    addedThisWave: more.length,
    addedTickers: more.map((m) => m.issuerTicker),
    acquiredDocuments: all.length,
    distinctIssuers: new Set(all.map((m) => m.issuerCik)).size,
  };
  writeFileSync(resolve(repoRoot, "docs/definition-encyclopedia/acquisition-summary.json"), JSON.stringify(summary, null, 2) + "\n");
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
