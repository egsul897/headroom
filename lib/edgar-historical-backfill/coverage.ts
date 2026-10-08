import type { CoverageGap, CoverageReport, DebtDocumentKind, ExhibitRef, IssuerManifest } from "./types";

const KIND_ORDER: DebtDocumentKind[] = [
  "CREDIT_AGREEMENT",
  "INDENTURE",
  "AMENDMENT",
  "RESTATEMENT",
  "SUPPLEMENTAL_INDENTURE",
  "WAIVER",
  "CONSENT",
  "INTERCREDITOR",
  "GUARANTEE",
  "SECURITY_AGREEMENT",
  "OTHER_DEBT_AGREEMENT",
  "UNKNOWN",
];

export function buildCoverageReport(manifests: IssuerManifest[]): CoverageReport {
  const byYear = new Map<string, number>();
  const byKind = new Map<DebtDocumentKind, number>();
  let filingsScanned = 0;
  let exhibitsDiscovered = 0;
  const agreementKeys = new Set<string>();
  const gaps: CoverageGap[] = [];

  for (const m of manifests) {
    filingsScanned += m.filingsScanned;
    exhibitsDiscovered += m.exhibits.length;
    for (const e of m.exhibits) {
      if (e.discoveryStatus === "SKIPPED_DUPLICATE") continue;
      agreementKeys.add(e.agreementIdentityKey);
      const year = Number(e.filingDate.slice(0, 4));
      if (Number.isFinite(year)) {
        const yk = `${year}|${e.documentKind}`;
        byYear.set(yk, (byYear.get(yk) ?? 0) + 1);
        byYear.set(`${year}|ALL_RELEVANT`, (byYear.get(`${year}|ALL_RELEVANT`) ?? 0) + 1);
      }
      byKind.set(e.documentKind, (byKind.get(e.documentKind) ?? 0) + 1);
      if (e.discoveryStatus === "IBR_UNRESOLVED") {
        gaps.push({
          cik: m.issuer.cik,
          ticker: m.issuer.ticker,
          gapType: "IBR_UNRESOLVED",
          detail: `${e.accessionNumber} ${e.exhibitType} ${e.description.slice(0, 80)}`,
        });
      }
    }

    for (const f of m.filings) {
      const year = Number(f.filingDate.slice(0, 4));
      if (Number.isFinite(year)) {
        byYear.set(`${year}|FILING_SCANNED`, (byYear.get(`${year}|FILING_SCANNED`) ?? 0) + 1);
      }
    }

    if (m.exhibits.filter((e) => e.discoveryStatus !== "SKIPPED_DUPLICATE" && e.relevanceScore >= 55).length === 0) {
      gaps.push({
        cik: m.issuer.cik,
        ticker: m.issuer.ticker,
        gapType: m.filings.some((f) => f.indexFetched) ? "NO_DEBT_EXHIBITS" : "NO_INDEX_FETCH",
        detail: m.filings.some((f) => f.indexFetched)
          ? "Indexes fetched but no high-relevance debt exhibits classified"
          : "No filing indexes fetched within budget",
      });
    }

    // Year gaps: only for years where we actually opened an index (budgeted discovery),
    // not every year present in the full submissions catalog.
    const yearsIndexed = new Set(m.filings.filter((f) => f.indexFetched).map((f) => f.filingDate.slice(0, 4)));
    const yearsWithCore = new Set(
      m.exhibits
        .filter((e) => e.documentKind === "CREDIT_AGREEMENT" || e.documentKind === "INDENTURE" || e.documentKind === "RESTATEMENT")
        .map((e) => e.filingDate.slice(0, 4)),
    );
    for (const y of yearsIndexed) {
      if (!yearsWithCore.has(y)) {
        gaps.push({
          cik: m.issuer.cik,
          ticker: m.issuer.ticker,
          gapType: "YEAR_WITHOUT_CREDIT_OR_INDENTURE",
          year: Number(y),
          detail: `Year ${y}: indexes fetched, no CREDIT_AGREEMENT/INDENTURE/RESTATEMENT classified`,
        });
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    issuerCount: manifests.length,
    filingsScanned,
    exhibitsDiscovered,
    distinctAgreements: agreementKeys.size,
    byYear: [...byYear.entries()]
      .map(([k, count]) => {
        const [year, documentKind] = k.split("|");
        return { year: Number(year), documentKind: documentKind as CoverageReport["byYear"][number]["documentKind"], count };
      })
      .sort((a, b) => a.year - b.year || String(a.documentKind).localeCompare(String(b.documentKind))),
    byDocumentKind: KIND_ORDER.filter((k) => byKind.has(k)).map((documentKind) => ({
      documentKind,
      count: byKind.get(documentKind)!,
    })),
    gaps,
  };
}

export function countDistinctAgreements(exhibits: ExhibitRef[]): number {
  return new Set(exhibits.filter((e) => e.discoveryStatus !== "SKIPPED_DUPLICATE").map((e) => e.agreementIdentityKey)).size;
}
