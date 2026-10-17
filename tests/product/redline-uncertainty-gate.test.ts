/**
 * P1 (PR #428) — redline uncertainty, downstream gates.
 *
 * End-to-end over the real customer path (processAcquiredDocument →
 * CorpusStore → buildDocumentCovenantSummary, exactly the calls
 * analyze-upload makes) for a synthetic agreement whose ONLY
 * purchase-money basket cap sits inside an unmatched-<strike> span:
 *
 *   - the span is recorded at extraction and carried on the summary;
 *   - the intersecting item is flagged redlineAmbiguous and names
 *     the reason in unresolvedQuestions;
 *   - the item NEVER auto-accepts as routine;
 *   - the formula compiler mints NOTHING from it (KNOWN_NOT_MODELED
 *     with the redlineAmbiguous missing field) — so no compiled
 *     Permission, and therefore no capacity figure, can rest on
 *     possibly-deleted text;
 *   - clean items in the same document are unaffected.
 *
 * Controls: the same agreement with the strike properly closed
 * (cap genuinely deleted — no item, no flag, no formula) and with
 * no strike at all (cap fully operative — item compiles MODELED).
 * The EDITED exemption mirrors Rule 192: counsel-supplied text is
 * not the ambiguous extraction, so the gate lifts.
 *
 * All fixtures are synthetic — invented issuer, invented figures.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CorpusStore } from "../../lib/knowledge-factory/store/corpus-store";
import { processAcquiredDocument } from "../../lib/knowledge-factory/pipeline/run";
import { hashBytes } from "../../lib/knowledge-factory/pipeline/text";
import type { DiscoveredFilingDocument } from "../../lib/knowledge-factory/types";
import { buildDocumentCovenantSummary, type CovenantSummaryItem } from "../../lib/product/covenant-intelligence/summarize";
import { parseFormulaFromItem } from "../../lib/product/customer-intelligence/formula-parse";
import { parseMaintenanceRatio } from "../../lib/product/customer-intelligence/maintenance-ratio";
import { isRoutineItem } from "../../lib/product/customer-intelligence/routine-review";

const SECTION_701 = `<p>Section 7.01 Limitation on Indebtedness. The Borrower shall not incur any Indebtedness other than Indebtedness under the Credit Facilities in an aggregate principal amount not to exceed $25,000,000 at any time outstanding.</p>`;
const SECTION_703 = `<p>Section 7.03 Limitation on Indebtedness. The Borrower shall not incur any Indebtedness other than intercompany Indebtedness among Loan Parties in the ordinary course of business.</p>`;
const CAP40_CLAUSE = `Indebtedness in respect of purchase money obligations in an aggregate principal amount not to exceed $40,000,000 at any time outstanding.`;

function agreementHtml(section702Inner: string): string {
  return [
    `<html><body>`,
    `<p>ARTICLE VII NEGATIVE COVENANTS</p>`,
    SECTION_701,
    `<p>Section 7.02 Limitation on Indebtedness. The Borrower shall not incur any Indebtedness other than ${section702Inner}</p>`,
    SECTION_703,
    `</body></html>`,
  ].join("\n");
}

const AMBIGUOUS_HTML = agreementHtml(`<strike>${CAP40_CLAUSE}`);
const CLOSED_HTML = agreementHtml(`<strike>${CAP40_CLAUSE}</strike>`);
const CLEAN_HTML = agreementHtml(CAP40_CLAUSE);

function discovered(sourceId: string): DiscoveredFilingDocument {
  return {
    sourceId,
    filing: {
      accessionNumber: "0000000000-00-000001",
      formType: "8-K",
      filingDate: "2024-01-01",
      issuer: { cik: "0000123456", ticker: "TEST" },
    },
    exhibit: {
      filename: "ex101.htm",
      description: "Credit Agreement",
      exhibitType: "EX-10.1",
      sourceUrl: "https://www.sec.gov/Archives/edgar/data/123456/000/ex101.htm",
    },
    discoverySignals: ["test"],
  };
}

async function runPath(sourceId: string, html: string) {
  const root = mkdtempSync(path.join(tmpdir(), "kf-redline-"));
  const store = new CorpusStore({
    root,
    bytes: path.join(root, "bytes"),
    manifests: path.join(root, "manifests"),
    checkpoints: path.join(root, "checkpoints"),
    cache: path.join(root, "cache"),
  });
  const bytes = Buffer.from(html, "utf8");
  const result = await processAcquiredDocument(store, {
    discovered: discovered(sourceId),
    bytes,
    contentHash: hashBytes(bytes),
    provenance: "customer-upload",
    usageRightsReviewStatus: "UNREVIEWED",
  });
  // Exactly the summary build analyze-upload performs.
  const summary = buildDocumentCovenantSummary({
    sourceId,
    documentTitle: "Acme Meridian Credit Agreement (synthetic)",
    issuerCik: "0000123456",
    documentClass: "CREDIT_AGREEMENT",
    candidates: store.loadCandidates(sourceId),
    definitions: store.loadDefinitions(sourceId),
    structuralNodes: store.loadStructuralNodes(sourceId),
    crossReferences: store.loadCrossReferences(sourceId),
    redlineAmbiguities: store.loadRedlineAmbiguities(sourceId),
  });
  return { result, store, summary };
}

function itemByRef(summary: { items: CovenantSummaryItem[] }, ref: string): CovenantSummaryItem {
  const item = summary.items.find((i) => i.sectionRef === ref);
  if (!item) throw new Error(`no summary item for section ${ref}; got ${summary.items.map((i) => i.sectionRef).join(", ")}`);
  return item;
}

describe("redline-ambiguous basket — authoritative conclusions blocked", () => {
  it("records the span, flags the item, and mints no formula from it", async () => {
    const { result, store, summary } = await runPath("test:redline-ambiguous", AMBIGUOUS_HTML);

    // Extraction recorded exactly one ambiguous span, persisted.
    expect(result.redlineAmbiguousSpanCount).toBe(1);
    const records = store.loadRedlineAmbiguities("test:redline-ambiguous");
    expect(records).toHaveLength(1);
    expect(records[0]!.reason).toBe("UNMATCHED_REDLINE_ELEMENT");
    expect(records[0]!.text).toContain("$40,000,000");

    // The record rides on the summary (document-level evidence).
    expect(summary.redlineAmbiguities).toHaveLength(1);

    // The intersecting item inherits the uncertainty, visibly.
    const item702 = itemByRef(summary, "7.02");
    expect(item702.redlineAmbiguous).toBe(true);
    expect(item702.unresolvedQuestions.some((q) => q.includes("Redline ambiguity"))).toBe(true);
    // The evidence text is still in the item's excerpt — preserved,
    // flagged, not erased.
    expect(item702.operativeLanguageExcerpt + item702.plainEnglish).toContain("40,000,000");

    // Gate 1: never routine (no SYSTEM auto-accept).
    expect(isRoutineItem(item702)).toBe(false);

    // Gate 2: the formula compiler mints nothing from it.
    const parsed = parseFormulaFromItem(item702);
    expect(parsed.modelingStatus).toBe("KNOWN_NOT_MODELED");
    expect(parsed.missingFields).toContain("redlineAmbiguous");

    // Clean items in the same document are unaffected and compile.
    const item701 = itemByRef(summary, "7.01");
    expect(item701.redlineAmbiguous).toBeUndefined();
    const parsed701 = parseFormulaFromItem(item701);
    expect(parsed701.modelingStatus).toBe("MODELED");
    expect(parsed701.thresholdValue).toBe(25);

    const item703 = itemByRef(summary, "7.03");
    expect(item703.redlineAmbiguous).toBeUndefined();
  });

  it("EDITED exemption: counsel-supplied text lifts the formula gate (Rule 192 pattern)", async () => {
    const { summary } = await runPath("test:redline-edited", AMBIGUOUS_HTML);
    const item702 = itemByRef(summary, "7.02");
    expect(item702.redlineAmbiguous).toBe(true);
    const edited: CovenantSummaryItem = { ...item702, reviewerDecision: "EDITED" };
    const parsed = parseFormulaFromItem(edited);
    expect(parsed.missingFields).not.toContain("redlineAmbiguous");
    expect(parsed.modelingStatus).toBe("MODELED");
    expect(parsed.thresholdValue).toBe(40);
  });
});

describe("controls — well-formed documents behave exactly as before", () => {
  it("properly closed strike: the deleted cap produces no item, no flag, no formula", async () => {
    const { result, summary } = await runPath("test:redline-closed", CLOSED_HTML);
    expect(result.redlineAmbiguousSpanCount).toBe(0);
    expect(summary.redlineAmbiguities).toBeUndefined();
    for (const item of summary.items) {
      expect(item.redlineAmbiguous).toBeUndefined();
      const parsed = parseFormulaFromItem(item);
      expect(parsed.thresholdValue).not.toBe(40);
    }
    // The clean $25M basket still compiles.
    const item701 = itemByRef(summary, "7.01");
    expect(parseFormulaFromItem(item701).modelingStatus).toBe("MODELED");
  });

  it("no strike: the same cap is fully operative and compiles MODELED $40M", async () => {
    const { result, summary } = await runPath("test:redline-clean", CLEAN_HTML);
    expect(result.redlineAmbiguousSpanCount).toBe(0);
    const item702 = itemByRef(summary, "7.02");
    expect(item702.redlineAmbiguous).toBeUndefined();
    const parsed = parseFormulaFromItem(item702);
    expect(parsed.modelingStatus).toBe("MODELED");
    expect(parsed.thresholdValue).toBe(40);
  });
});

describe("gate units — maintenance ratio", () => {
  function ratioItem(overrides: Partial<CovenantSummaryItem>): CovenantSummaryItem {
    return {
      heading: "Section",
      sectionRef: "7.09",
      category: "FINANCIAL_MAINTENANCE",
      categoryLabel: "Financial maintenance covenants",
      posture: "MAINTENANCE_TEST",
      plainEnglish: "The Borrower shall not permit the Total Net Leverage Ratio to exceed 3.50 to 1.00 at any time.",
      restriction: null,
      permissions: [],
      coveredEntities: ["Borrower"],
      exceptions: [],
      conditions: [],
      materialBasketsThresholds: ["Ratio threshold: 3.50 to 1"],
      draftingPatterns: [],
      operativeLanguageExcerpt: "",
      sourceCitation: "test",
      governingAgreement: "test",
      families: [],
      relatedDefinedTerms: [],
      applicableDefinitions: [],
      entityScope: { borrower: true, guarantor: false, restrictedSubsidiary: false, unrestrictedSubsidiary: false, notes: [] },
      crossReferences: [],
      dependencies: [],
      epistemicStatus: "DISCOVERED_CANDIDATE",
      interpretationNote: "",
      unresolvedQuestions: [],
      ...overrides,
    } as unknown as CovenantSummaryItem;
  }

  it("a redline-ambiguous ratio item yields no maintenance ratio; the clean twin does", () => {
    expect(parseMaintenanceRatio(ratioItem({ redlineAmbiguous: true }))).toBeNull();
    expect(parseMaintenanceRatio(ratioItem({}))).not.toBeNull();
    expect(parseMaintenanceRatio(ratioItem({ redlineAmbiguous: true, reviewerDecision: "EDITED" }))).not.toBeNull();
  });
});
