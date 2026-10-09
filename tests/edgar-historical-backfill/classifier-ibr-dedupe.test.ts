import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  agreementIdentityKey,
  classifyExhibit,
  filingDebtSignalScore,
} from "../../lib/edgar-historical-backfill/exhibit-classifier";
import {
  looksLikeIncorporatedByReference,
  parseIncorporatedByReference,
  completeIbrFromOriginalIndex,
  extractIbrFormAndDate,
  resolveIbrAccessionFromFilings,
} from "../../lib/edgar-historical-backfill/ibr-resolver";
import { exhibitsFromIndexHtml, parseIndexExhibitRows } from "../../lib/edgar-historical-backfill/index-parser";
import { dedupeExhibits } from "../../lib/edgar-historical-backfill/dedupe";
import { buildAcquisitionQueue } from "../../lib/edgar-historical-backfill/ranking";
import { buildCoverageReport } from "../../lib/edgar-historical-backfill/coverage";
import type { ExhibitRef, IssuerManifest } from "../../lib/edgar-historical-backfill/types";

const fixtureHtml = readFileSync(join(__dirname, "fixtures/sample-index.htm"), "utf8");

describe("exhibit classifier", () => {
  it("classifies credit agreements, amendments, indentures distinctly", () => {
    expect(classifyExhibit({ filename: "ex10-1.htm", description: "CREDIT AGREEMENT", exhibitType: "EX-10.1" }).documentKind).toBe(
      "CREDIT_AGREEMENT",
    );
    expect(
      classifyExhibit({
        filename: "ex10-2.htm",
        description: "FIRST AMENDMENT TO CREDIT AGREEMENT",
        exhibitType: "EX-10.2",
      }).documentKind,
    ).toBe("AMENDMENT");
    expect(classifyExhibit({ filename: "ex4-1.htm", description: "INDENTURE", exhibitType: "EX-4.1" }).documentKind).toBe("INDENTURE");
    expect(
      classifyExhibit({
        filename: "ex4-2.htm",
        description: "Second Supplemental Indenture",
        exhibitType: "EX-4.2",
      }).documentKind,
    ).toBe("SUPPLEMENTAL_INDENTURE");
  });

  it("does not treat equity award forms as high-relevance debt docs", () => {
    const r = classifyExhibit({
      filename: "ex10-99.htm",
      description: "Form of Restricted Stock Unit Award",
      exhibitType: "EX-10.99",
    });
    expect(r.relevanceScore).toBeLessThan(55);
  });

  it("scores 8-K Item 1.01 filings highly before opening indexes", () => {
    expect(filingDebtSignalScore("8-K", "1.01,2.03,9.01")).toBeGreaterThan(filingDebtSignalScore("10-Q", ""));
  });

  it("keeps distinct amendment identity keys", () => {
    const base = agreementIdentityKey({
      cik: "0000816956",
      documentKind: "CREDIT_AGREEMENT",
      description: "Credit Agreement",
      filename: "ex10-1.htm",
      filingDate: "2025-06-16",
      accessionNumber: "0001174947-25-000941",
    });
    const amd1 = agreementIdentityKey({
      cik: "0000816956",
      documentKind: "AMENDMENT",
      description: "First Amendment to Credit Agreement",
      filename: "ex10-2.htm",
      filingDate: "2025-09-01",
      accessionNumber: "0001174947-25-001000",
    });
    const amd2 = agreementIdentityKey({
      cik: "0000816956",
      documentKind: "AMENDMENT",
      description: "Second Amendment to Credit Agreement",
      filename: "ex10-3.htm",
      filingDate: "2026-01-15",
      accessionNumber: "0001174947-26-000010",
    });
    expect(base).not.toBe(amd1);
    expect(amd1).not.toBe(amd2);
  });
});

describe("IBR resolver", () => {
  it("detects and parses accession + exhibit from IBR prose", () => {
    const description =
      "Credit Agreement dated as of June 16, 2025 (incorporated by reference to Exhibit 10.1 to the Company’s Current Report on Form 8-K filed June 16, 2025, accession 0001193125-25-123456)";
    expect(looksLikeIncorporatedByReference(description, "Incorporated by Reference")).toBe(true);
    const ibr = parseIncorporatedByReference({
      description,
      documentCellText: "Incorporated by Reference",
      cik: "0000816956",
    });
    expect(ibr.resolvedAccessionNumber).toBe("0001193125-25-123456");
    expect(ibr.resolvedExhibitType).toBe("EX-10.1");
    expect(ibr.resolutionStatus).toBe("PARTIAL");
  });

  it("resolves Form+date IBR citations against submissions filings", () => {
    const raw =
      "Incorporated by reference to Exhibit 10.1 of the Company's Current Report on Form 8-K filed with the Securities and Exchange Commission on June 16, 2025";
    expect(extractIbrFormAndDate(raw)).toEqual({ form: "8-K", date: "2025-06-16" });
    const ibr = parseIncorporatedByReference({
      description: "Eighth Amended and Restated Credit Agreement",
      documentCellText: raw,
      cik: "0000816956",
    });
    const resolved = resolveIbrAccessionFromFilings(ibr, [
      { form: "8-K", filingDate: "2025-06-16", accessionNumber: "0001174947-25-000941" },
    ]);
    expect(resolved.resolvedAccessionNumber).toBe("0001174947-25-000941");
    expect(resolved.resolvedExhibitType).toBe("EX-10.1");
  });

  it("completes IBR against the original index rows", () => {
    const ibr = parseIncorporatedByReference({
      description: "incorporated by reference to Exhibit 10.1 accession 0001193125-25-123456",
      documentCellText: "",
      cik: "0000816956",
    });
    const completed = completeIbrFromOriginalIndex(
      ibr,
      [
        {
          type: "EX-10.1",
          filename: "d123dex101.htm",
          href: "/Archives/edgar/data/816956/000119312525123456/d123dex101.htm",
          description: "Credit Agreement",
        },
      ],
      "0000816956",
    );
    expect(completed.resolutionStatus).toBe("RESOLVED");
    expect(completed.resolvedFilename).toBe("d123dex101.htm");
    expect(completed.resolvedSourceUri).toContain("d123dex101.htm");
  });
});

describe("index parser + dedupe + queue", () => {
  it("extracts relevant exhibits from a real-shaped index table", () => {
    const rows = parseIndexExhibitRows(fixtureHtml);
    expect(rows.length).toBeGreaterThanOrEqual(5);
    const exhibits = exhibitsFromIndexHtml(
      {
        cik: "0000816956",
        accessionNumber: "0001174947-25-000941",
        form: "8-K",
        filingDate: "2025-06-16",
      },
      fixtureHtml,
    );
    const kinds = new Set(exhibits.map((e) => e.documentKind));
    expect(kinds.has("CREDIT_AGREEMENT")).toBe(true);
    expect(kinds.has("AMENDMENT")).toBe(true);
    expect(kinds.has("INDENTURE")).toBe(true);
    expect(exhibits.some((e) => e.isIncorporatedByReference)).toBe(true);
    // RSU award should not be high-relevance
    expect(exhibits.every((e) => !/restricted stock unit/i.test(e.description) || e.relevanceScore < 55)).toBe(true);
  });

  it("collapses same accession+filename duplicates but keeps amendment distinct", () => {
    const base = exhibitsFromIndexHtml(
      { cik: "0000816956", accessionNumber: "0001174947-25-000941", form: "8-K", filingDate: "2025-06-16" },
      fixtureHtml,
    );
    const duplicated = [...base, ...base.map((e) => ({ ...e }))];
    const result = dedupeExhibits(duplicated);
    expect(result.collapsedCount).toBeGreaterThan(0);
    expect(result.kept.some((e) => e.documentKind === "AMENDMENT")).toBe(true);
    expect(result.kept.some((e) => e.documentKind === "CREDIT_AGREEMENT")).toBe(true);
  });

  it("collapses repeated IBR citations of the same target", () => {
    const mk = (acc: string, date: string): ExhibitRef => ({
      cik: "0000816956",
      accessionNumber: acc,
      filingDate: date,
      form: "10-K",
      exhibitType: "EX-10.1",
      filename: "unknown",
      description: "Credit Agreement (IBR)",
      documentKind: "CREDIT_AGREEMENT",
      relevanceScore: 95,
      isIncorporatedByReference: true,
      ibr: {
        rawText: "IBR",
        resolvedAccessionNumber: "0001193125-25-123456",
        resolvedExhibitType: "EX-10.1",
        resolutionStatus: "RESOLVED",
        resolvedSourceUri: "https://www.sec.gov/Archives/edgar/data/816956/000119312525123456/ex10-1.htm",
      },
      sourceUri: "https://www.sec.gov/Archives/edgar/data/816956/000119312525123456/ex10-1.htm",
      agreementIdentityKey: "0000816956|CREDIT_AGREEMENT|credit agreement",
      discoveryStatus: "DISCOVERED",
    });
    const result = dedupeExhibits([mk("0000816956-24-000001", "2024-02-01"), mk("0000816956-25-000001", "2025-02-01")]);
    expect(result.kept).toHaveLength(1);
    expect(result.groups.some((g) => g.reason === "SAME_IBR_TARGET")).toBe(true);
  });

  it("ranks acquisition queue with credit agreements above low-signal unknowns", () => {
    const exhibits = exhibitsFromIndexHtml(
      { cik: "0000816956", accessionNumber: "0001174947-25-000941", form: "8-K", filingDate: "2025-06-16" },
      fixtureHtml,
    );
    // Attach fetchable URIs
    for (const e of exhibits) {
      if (!e.sourceUri && !e.isIncorporatedByReference) {
        e.sourceUri = `https://www.sec.gov/${e.filename}`;
      }
      if (e.ibr?.resolvedAccessionNumber && !e.sourceUri) {
        e.sourceUri = `https://www.sec.gov/Archives/edgar/data/816956/000119312525123456/ex10-1.htm`;
        e.ibr.resolvedSourceUri = e.sourceUri;
        e.ibr.resolutionStatus = "RESOLVED";
      }
    }
    const queue = buildAcquisitionQueue({
      exhibits,
      issuersByCik: new Map([["0000816956", { cik: "0000816956", ticker: "CNMD" }]]),
    });
    expect(queue.length).toBeGreaterThan(0);
    expect(queue[0]!.documentKind === "CREDIT_AGREEMENT" || queue[0]!.documentKind === "INDENTURE" || queue[0]!.documentKind === "AMENDMENT").toBe(
      true,
    );
    expect(queue[0]!.status).toBe("QUEUED");
  });

  it("builds coverage statistics by year and document kind", () => {
    const exhibits = exhibitsFromIndexHtml(
      { cik: "0000816956", accessionNumber: "0001174947-25-000941", form: "8-K", filingDate: "2025-06-16" },
      fixtureHtml,
    );
    const manifest: IssuerManifest = {
      issuer: { cik: "0000816956", ticker: "CNMD" },
      discoveredAt: new Date().toISOString(),
      filingsScanned: 10,
      filingsWithDebtSignals: 1,
      exhibitsDiscovered: exhibits.length,
      distinctAgreementKeys: new Set(exhibits.map((e) => e.agreementIdentityKey)).size,
      filings: [
        {
          cik: "0000816956",
          accessionNumber: "0001174947-25-000941",
          form: "8-K",
          filingDate: "2025-06-16",
          debtSignalScore: 60,
          indexFetched: true,
          exhibitCount: exhibits.length,
          relevantExhibitCount: exhibits.filter((e) => e.relevanceScore >= 55).length,
        },
      ],
      exhibits,
    };
    const coverage = buildCoverageReport([manifest]);
    expect(coverage.issuerCount).toBe(1);
    expect(coverage.exhibitsDiscovered).toBeGreaterThan(0);
    expect(coverage.byDocumentKind.some((k) => k.documentKind === "CREDIT_AGREEMENT")).toBe(true);
    expect(coverage.byYear.some((c) => c.year === 2025)).toBe(true);
  });
});
