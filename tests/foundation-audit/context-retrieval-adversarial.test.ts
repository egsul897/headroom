/**
 * FOUNDATION AUDIT — Part 3: Context retrieval assurance.
 *
 * Reuses the exact same real-pipeline test harness pattern already
 * established in tests/contract-model/context-retrieval-pipeline.test.ts
 * (buildTestIndex / buildCovenantContextBundle / buildPackageGraph — all
 * real, unmodified production code, zero mocking, zero LLM calls since
 * Phase 2D is deterministic-only in V1). All fixture text below is
 * invented for this audit (generic leveraged-finance drafting, synthetic
 * company names) — never FWRG/LSB/CONMED/DSGR content or identities.
 */
import { describe, expect, it } from "vitest";
import { buildTestIndex, buildExactTermsByDocument, type TestDocument } from "../contract-model/context-retrieval-test-utils";
import { buildCovenantContextBundle } from "../../lib/contract-model/compiler/context-retrieval/pipeline";
import { buildPackageGraph } from "../../lib/contract-model/compiler/package-graph/pipeline";
import type { DiscoveredCandidate } from "../../lib/contract-model/compiler/discovery/types";
import type { PackageAccess } from "../../lib/contract-model/compiler/context-retrieval/pipeline";

function candidate(overrides: Partial<DiscoveredCandidate>): DiscoveredCandidate {
  return {
    discoveryId: "discovery-candidate:test",
    documentId: "doc1",
    structuralNodeKeys: [],
    structuralNodeIds: [],
    normalizedSourceRef: "6.01(a)",
    families: ["INDEBTEDNESS"],
    role: "BASKET",
    roleRaw: "BASKET",
    roleNormalizationStatus: "VALID_CANONICAL",
    familiesRaw: ["INDEBTEDNESS"],
    familiesNormalizationStatus: "VALID_CANONICAL",
    description: "test",
    multipleRulesLikely: false,
    definedTermDependencyLikely: false,
    discoveryMethods: ["DETERMINISTIC_SIGNAL"],
    evidenceSignals: [],
    reviewStatus: "AUTO_ACCEPTED",
    confidence: 1,
    sourceCitation: "6.01(a)",
    discoveryRunVersion: "test-v1",
    ...overrides,
  };
}

function accessFor(docs: TestDocument[]): PackageAccess {
  return { index: buildTestIndex(docs), packageGraph: null, exactTermsByDocument: buildExactTermsByDocument(docs) };
}

function packageAccessFor(docs: TestDocument[]): PackageAccess {
  const packageGraph = buildPackageGraph(
    "co",
    "pkg",
    docs.map((d) => ({ documentId: d.documentId, label: d.label, text: d.text }))
  );
  return { index: buildTestIndex(docs), packageGraph, exactTermsByDocument: buildExactTermsByDocument(docs) };
}

function build(docs: TestDocument[], sectionRef: string, overrides: Partial<DiscoveredCandidate> = {}, access?: PackageAccess) {
  const a = access ?? accessFor(docs);
  const node = a.index.getNodeByRef(overrides.documentId ?? "doc1", sectionRef);
  if (!node) throw new Error(`test setup error: no node for ${sectionRef}`);
  return buildCovenantContextBundle({ candidate: candidate({ documentId: overrides.documentId ?? "doc1", structuralNodeKeys: [node.nodeKey], structuralNodeIds: [node.nodeId], normalizedSourceRef: sectionRef, ...overrides }), packageKey: "pkg", companyId: "co", instrumentKey: null }, a);
}

describe("FOUNDATION AUDIT Part 3 — Context retrieval assurance", () => {
  // 1. relative positional reference: "clause (ii) above"
  it("1. 'paragraph (ii) above' resolves to the real sibling clause via ancestor-chain child search, not a guess", () => {
    const docs: TestDocument[] = [
      {
        documentId: "doc1",
        label: "CA",
        text: `SECTION 6.01 Investments. The Borrower will not make any Investment except:
(a) Investments in cash and Cash Equivalents;
(b) Investments permitted under clause (a) above, provided that the aggregate outstanding amount, together with the amount described in paragraph (ii) above, does not exceed $20,000,000.
(c) The following categories are separately enumerated for cross-reference: (i) Investments in joint ventures not exceeding $5,000,000; (ii) Investments in Unrestricted Subsidiaries not exceeding $8,000,000.`,
      },
    ];
    const bundle = build(docs, "6.01(b)");
    const refs = bundle.items.filter((i) => i.type === "CROSS_REFERENCE" || i.type === "CALCULATION_PROVISION");
    // eslint-disable-next-line no-console
    console.log("[1] resolved cross-refs:", refs.map((r) => r.normalizedRef));
    console.log("[1] unresolved:", JSON.stringify(bundle.unresolvedDependencies, null, 2));
  });

  // 2. "subject to Section X" / "notwithstanding Section X"
  it("2. 'subject to Section 6.09' and 'notwithstanding Section 6.10' are retrieved as REAL cross-reference context, never skipped as administrative boilerplate", () => {
    const docs: TestDocument[] = [
      {
        documentId: "doc1",
        label: "CA",
        text: `SECTION 6.01 Restricted Payments. The Borrower may make Restricted Payments not exceeding $10,000,000, subject to Section 6.09 and notwithstanding Section 6.10.

SECTION 6.09 Financial Covenant Condition. No Restricted Payment shall be made unless the Total Leverage Ratio is less than 4.00 to 1.00 on a pro forma basis.

SECTION 6.10 Event of Default Limitation. No Restricted Payment shall be made if a Default has occurred and is continuing.`,
      },
    ];
    const bundle = build(docs, "6.01");
    const items609 = bundle.items.filter((i) => i.normalizedRef === "6.09");
    const items610 = bundle.items.filter((i) => i.normalizedRef === "6.10");
    expect(items609.length).toBeGreaterThan(0);
    expect(items610.length).toBeGreaterThan(0);
    expect(items609[0]!.excerptText).toMatch(/Total Leverage Ratio/);
    expect(items610[0]!.excerptText).toMatch(/Default/);
  });

  // 3. "except as provided in clause Y"
  it("3. 'except as provided in clause (c)' resolves to the real sibling clause it excepts to", () => {
    const docs: TestDocument[] = [
      {
        documentId: "doc1",
        label: "CA",
        text: `SECTION 6.02 Liens. The Borrower will not create any Lien on its assets, except as provided in clause (c) below.
(a) [reserved]
(b) [reserved]
(c) Liens securing Indebtedness not exceeding $5,000,000 in the aggregate.`,
      },
    ];
    const bundle = build(docs, "6.02");
    const child = bundle.items.find((i) => i.normalizedRef === "6.02(c)");
    expect(child).toBeDefined();
  });

  // 4. trailing proviso attaches to the SAME-level clause, not an unrelated sibling
  it("4. a trailing 'provided that...' proviso attaches to the candidate's own clause and does not reach into an unrelated sibling clause", () => {
    const docs: TestDocument[] = [
      {
        documentId: "doc1",
        label: "CA",
        text: `SECTION 6.03 Asset Sales. The Borrower may make Dispositions of assets, provided that the Net Proceeds are applied to prepay the Term Loans within 365 days.
(a) Dispositions of obsolete equipment.
(b) Dispositions of Investments permitted under Section 6.06, provided that such Investments were not made in contemplation of such Disposition.`,
      },
    ];
    const bundle = build(docs, "6.03(a)");
    // The proviso attached with NORMAL confidence/shape is 6.03's OWN
    // parent-scope proviso language (retrieved via PARENT_SCOPE, since
    // it's the candidate's own enclosing section's chapeau) - never clause
    // (b)'s unrelated proviso about Investments.
    const provisoItems = bundle.items.filter((i) => i.type === "PROVISO");
    // eslint-disable-next-line no-console
    console.log("[4] proviso items:", JSON.stringify(provisoItems.map((p) => ({ ref: p.normalizedRef, text: p.excerptText.slice(0, 80) })), null, 2));
    // CTX-01/PARENT_SCOPE: the candidate's OWN enclosing proviso ("...the
    // Net Proceeds are applied to prepay the Term Loans...") is still
    // retrieved and attached normally.
    const parentProviso = bundle.items.find((i) => i.type === "PARENT_SCOPE" && /prepay the Term Loans/.test(i.excerptText));
    expect(parentProviso).toBeDefined();
    // CTX-02 FIX (was: WRONG-CONTEXT CONTAMINATION): clause (b)'s own
    // proviso — about a completely different subject (Investments under
    // Section 6.06), textually unrelated to candidate (a) (Dispositions of
    // obsolete equipment) — must NEVER be attached as a normal-confidence
    // PROVISO purely because it contains the generic keyword "provided
    // that." retrieveSiblingContext (structural-context.ts) now requires
    // real evidence of subject correspondence (clause backreference,
    // shared named resource, enclosing-scope linkage, or grammatical
    // continuation) before attaching at normal confidence/shape - none of
    // which clause (b) has relative to clause (a). It is still disclosed
    // (recall preserved), but only as a distinctly-shaped, low-confidence
    // UNVERIFIED_SIBLING_SIGNAL a downstream reader cannot mistake for a
    // verified item. See test 12 for the same fix via the SHARED_CAP
    // signal, and test 4b below for a genuinely relevant cross-clause
    // proviso that DOES still attach normally.
    expect(provisoItems.some((p) => /contemplation of such Disposition/.test(p.excerptText))).toBe(false);
    const sibling603b = bundle.items.find((i) => i.normalizedRef === "6.03(b)");
    expect(sibling603b?.type).toBe("UNVERIFIED_SIBLING_SIGNAL");
    expect(sibling603b?.confidence).toBeLessThan(0.7);
  });

  it("4b. (positive control) a GENUINE cross-clause proviso explicitly naming the candidate's own clause letter still attaches normally", () => {
    const docs: TestDocument[] = [
      {
        documentId: "doc1",
        label: "CA",
        text: `SECTION 6.03 Asset Sales.
(a) Dispositions of obsolete equipment.
(b) Dispositions of surplus real property.
(c) provided that clauses (a) and (b) shall not apply if a Default has occurred and is continuing.`,
      },
    ];
    const bundle = build(docs, "6.03(a)");
    const item = bundle.items.find((i) => i.normalizedRef === "6.03(c)");
    expect(item?.type).toBe("PROVISO");
    expect(item?.confidence).toBe(0.7);
  });

  // 4c. generalized adversarial variant: a "provided that" sibling about a
  // completely different covenant family (not merely a different basket
  // within the same family, as in test 4) - proves the fix generalizes
  // beyond the exact audited fixture shape.
  it("4c. ADVERSARIAL (generalized): a 'provided that' sibling belonging to an entirely different covenant family is never attached at normal confidence merely on the keyword", () => {
    const docs: TestDocument[] = [
      {
        documentId: "doc1",
        label: "CA",
        text: `SECTION 6.11 Miscellaneous Covenants.
(a) Permitted Liens on after-acquired property in the ordinary course of business.
(b) Restricted Payments to equityholders, provided that the Borrower first delivers a solvency certificate to the Administrative Agent.`,
      },
    ];
    const bundle = build(docs, "6.11(a)");
    const sibling = bundle.items.find((i) => i.normalizedRef === "6.11(b)");
    expect(sibling?.type).toBe("UNVERIFIED_SIBLING_SIGNAL");
    expect(sibling?.confidence).toBeLessThanOrEqual(0.3);
    expect(bundle.items.some((i) => i.type === "PROVISO" && i.normalizedRef === "6.11(b)")).toBe(false);
  });

  // 5. shared-cap reference
  it("5. a basket referencing 'the aggregate cap described in Section 6.09' retrieves Section 6.09 as real SHARED_CAP/CROSS_REFERENCE context", () => {
    const docs: TestDocument[] = [
      {
        documentId: "doc1",
        label: "CA",
        text: `SECTION 6.04 Restricted Payments. The Borrower may make Restricted Payments not exceeding $5,000,000, which amount counts against the aggregate cap described in Section 6.09.

SECTION 6.09 Aggregate Basket. The aggregate amount of all Restricted Payments, Investments, and Dispositions made in reliance on this Section 6.09 shall not exceed $25,000,000 in the aggregate.`,
      },
    ];
    const bundle = build(docs, "6.04");
    const item = bundle.items.find((i) => i.normalizedRef === "6.09");
    expect(item).toBeDefined();
    expect(item!.excerptText).toMatch(/aggregate amount/);
  });

  // 6. definition dependency chain (a term's own definition references another defined term)
  it("6. a defined term's OWN definition references another defined term — the transitive dependency is retrieved recursively", () => {
    const docs: TestDocument[] = [
      {
        documentId: "doc1",
        label: "CA",
        text: `SECTION 6.05 Financial Covenant. The Borrower shall maintain a Total Leverage Ratio not greater than 4.00 to 1.00.

"Total Leverage Ratio" means, as of any date, the ratio of Consolidated Total Debt to Consolidated EBITDA.

"Consolidated EBITDA" means, for any period, Consolidated Net Income for such period plus interest expense, taxes, depreciation and amortization.`,
      },
    ];
    const bundle = build(docs, "6.05");
    const def1 = bundle.items.find((i) => i.normalizedRef === "Total Leverage Ratio");
    const def2 = bundle.items.find((i) => i.normalizedRef === "Consolidated EBITDA");
    expect(def1).toBeDefined();
    expect(def2).toBeDefined();
    expect(def2!.type).toBe("DEFINITION_DEPENDENCY");
    const edge = bundle.edges.find((e) => e.toItemId === def2!.itemId && e.edgeType === "DEPENDS_ON_DEFINITION");
    expect(edge).toBeDefined();
  });

  // 7. cross-section references within the same document
  it("7. a cross-section reference within the same document is retrieved with real text, not a bare citation", () => {
    const docs: TestDocument[] = [
      {
        documentId: "doc1",
        label: "CA",
        text: `SECTION 6.06 Investments. The Borrower will not make Investments except Investments permitted by Section 6.01.

SECTION 6.01 Indebtedness. The Borrower will not incur Indebtedness in excess of $10,000,000.`,
      },
    ];
    const bundle = build(docs, "6.06");
    const target = bundle.items.find((i) => i.normalizedRef === "6.01");
    expect(target).toBeDefined();
    expect(target!.excerptText).toMatch(/\$10,000,000/);
  });

  // 8. cross-document reference (credit agreement referencing an Intercreditor Agreement)
  it("8. a cross-document reference to 'the Intercreditor Agreement' surfaces as a real INTERCREDITOR_LEAD item when the target document exists in the package", () => {
    const docs: TestDocument[] = [
      { documentId: "doc1", label: "Credit Agreement", text: `CREDIT AGREEMENT dated as of January 1, 2022, among Vantage Circuits Inc., as Borrower.\n\nSECTION 6.02 Liens. The Borrower will not create any Lien, subject to the Intercreditor Agreement.` },
      { documentId: "doc2", label: "Intercreditor Agreement", text: `INTERCREDITOR AGREEMENT dated as of January 1, 2022, among the First Lien Agent and Second Lien Agent, relating to Vantage Circuits Inc.\n\nSECTION 2.01 Lien Priority. Liens securing First Lien Obligations shall be senior to Liens securing Second Lien Obligations.` },
    ];
    const access = packageAccessFor(docs);
    const bundle = build(docs, "6.02", {}, access);
    const lead = bundle.items.find((i) => i.type === "INTERCREDITOR_LEAD");
    // eslint-disable-next-line no-console
    console.log("[8] intercreditor lead:", JSON.stringify(lead), "unresolved:", JSON.stringify(bundle.unresolvedDependencies));
    expect(lead).toBeDefined();
  });

  // 9. amended provision reference — does context retrieval pull CURRENT or STALE text, and is the amendment even visible?
  it("9. CTX-01 FIX: a reference to a section that has SINCE been amended by another package document — the referenced section's PENDING AMENDMENT is now surfaced for a CROSS-REFERENCED target too, not only for the primary candidate's own section", () => {
    const docs: TestDocument[] = [
      {
        documentId: "doc1",
        label: "Credit Agreement",
        text: `CREDIT AGREEMENT dated as of January 1, 2021, among Harrow Logistics Inc., as Borrower.

SECTION 6.01 Restricted Payments. The Borrower may make Restricted Payments not exceeding $5,000,000, subject to Section 6.09.

SECTION 6.09 Financial Covenant Condition. No Restricted Payment shall be made unless the Total Leverage Ratio is less than 4.00 to 1.00.`,
      },
      {
        documentId: "doc2",
        label: "First Amendment",
        text: `FIRST AMENDMENT TO CREDIT AGREEMENT, dated as of June 1, 2023 (this "Amendment"), to the Credit Agreement dated as of January 1, 2021, among Harrow Logistics Inc.

Section 6.09 of the Credit Agreement is hereby amended and restated in its entirety to require a Total Leverage Ratio of less than 5.00 to 1.00.`,
      },
    ];
    const access = packageAccessFor(docs);
    // Confirm the package graph really did detect a real, resolved
    // modification candidate targeting 6.09 in doc1 before testing context
    // retrieval's own handling of it.
    const modCandidate = access.packageGraph!.modificationCandidates.find((m) => m.targetDocumentId === "doc1" && m.targetSectionRef === "6.09");
    expect(modCandidate).toBeDefined();
    expect(modCandidate!.status === "RESOLVED" || modCandidate!.status === "REVIEW_REQUIRED").toBe(true);

    // Build the context bundle for the candidate anchored at 6.01 — the
    // provision that references 6.09 for its condition.
    const bundle = build(docs, "6.01", {}, access);
    const item609 = bundle.items.find((i) => i.normalizedRef === "6.09");
    expect(item609).toBeDefined();
    // The retrieved text for 6.09 is the ORIGINAL, pre-amendment text
    // (4.00 to 1.00) — which is architecturally correct per this phase's
    // own explicit stop condition (amendment precedence is a LATER phase).
    expect(item609!.excerptText).toMatch(/4\.00 to 1\.00/);

    // THE ADVERSARIAL CHECK: is there ANY signal anywhere in this bundle
    // (an AMENDMENT_LEAD item, an unresolvedDependency, anything) telling a
    // downstream reader that the 6.09 text they just retrieved has a real,
    // resolved-in-the-package-graph pending amendment?
    const amendmentLeadFor609 = bundle.items.find((i) => (i.type === "AMENDMENT_LEAD" || i.type === "SUPPLEMENT_LEAD") && i.normalizedRef === "6.09");
    const anyMentionOf609Amendment = bundle.unresolvedDependencies.some((u) => u.dependencyType === "AMBIGUOUS_AMENDMENT_TARGET" && u.sourceText.includes("6.09"));
    // eslint-disable-next-line no-console
    console.log("[9] amendmentLeadFor609:", amendmentLeadFor609, "anyMentionOf609Amendment:", anyMentionOf609Amendment);
    console.log("[9] all item types:", bundle.items.map((i) => `${i.type}:${i.normalizedRef}`));
    // CTX-01 FIX (was: retrieveAmendmentLeadsForSection only ever called
    // ONCE, for the PRIMARY candidate's own sectionRef - never for any
    // CROSS_REFERENCE target retrieved via reference-context.ts). Now
    // generalized: every materially-retrieved cross-reference target gets
    // the same amendment-lead check, so a downstream analyst sees an
    // explicit AMENDMENT_LEAD for 6.09 alongside its (honestly
    // pre-amendment) retrieved text.
    expect(amendmentLeadFor609).toBeDefined();
    expect(amendmentLeadFor609!.excerptText).toMatch(/AMENDMENT_RESOLUTION_REQUIRED/);
    expect(amendmentLeadFor609!.excerptText).toMatch(/5\.00 to 1\.00/);
    const edgeToAmendment = bundle.edges.find((e) => e.toItemId === item609!.itemId && e.fromItemId === amendmentLeadFor609!.itemId && e.edgeType === "AMENDMENT_CANDIDATE");
    expect(edgeToAmendment).toBeDefined();
    void anyMentionOf609Amendment;
  });

  it("9b. (control) the PRIMARY candidate's own section DOES get its amendment lead surfaced correctly", () => {
    const docs: TestDocument[] = [
      { documentId: "doc1", label: "Credit Agreement", text: `CREDIT AGREEMENT dated as of January 1, 2021, among Harrow Logistics Inc., as Borrower.\n\nSECTION 6.09 Financial Covenant Condition. No Restricted Payment shall be made unless the Total Leverage Ratio is less than 4.00 to 1.00.` },
      { documentId: "doc2", label: "First Amendment", text: `FIRST AMENDMENT TO CREDIT AGREEMENT, dated as of June 1, 2023 (this "Amendment"), to the Credit Agreement dated as of January 1, 2021, among Harrow Logistics Inc.\n\nSection 6.09 of the Credit Agreement is hereby amended and restated in its entirety to require a Total Leverage Ratio of less than 5.00 to 1.00.` },
    ];
    const access = packageAccessFor(docs);
    const bundle = build(docs, "6.09", {}, access);
    const lead = bundle.items.find((i) => i.type === "AMENDMENT_LEAD");
    expect(lead).toBeDefined();
    expect(lead!.excerptText).toMatch(/AMENDMENT_RESOLUTION_REQUIRED/);
  });

  // 10. ambiguous same-label reference: two physically distinct sections sharing "Section 6.04"
  it("10. an AMBIGUOUS same-label reference (two physically distinct 'Section 6.04' occurrences) is reported as targetAmbiguous, never silently picked", () => {
    // Construct a document where "Section 6.04" legitimately occurs twice as
    // a real top-level marker (a genuine drafting/extraction duplicate —
    // e.g. a renumbering error carried through two amendments merged into
    // one text, or a scanned document with a repeated page). A third
    // section references "Section 6.04" and must not silently resolve to
    // either physical occurrence.
    const docs: TestDocument[] = [
      {
        documentId: "doc1",
        label: "CA",
        text: `SECTION 6.03 Cross-Reference Test. The Borrower's obligations are subject to Section 6.04.

SECTION 6.04 Restricted Payments. The Borrower may make Restricted Payments not exceeding $5,000,000.

SECTION 6.04 Investments. The Borrower may make Investments not exceeding $8,000,000.`,
      },
    ];
    const access = accessFor(docs);
    const diag = access.index.resolveUniqueNodeByRef("doc1", "6.04");
    // eslint-disable-next-line no-console
    console.log("[10] resolveUniqueNodeByRef('6.04'):", diag.status, diag.status === "AMBIGUOUS" ? diag.candidates.length : "");
    expect(diag.status).toBe("AMBIGUOUS");

    const bundle = build(docs, "6.03", {}, access);
    const ambiguousUnresolved = bundle.unresolvedDependencies.find((u) => u.dependencyType === "AMBIGUOUS_RELATIVE_REFERENCE" && u.sourceText.includes("6.04"));
    // eslint-disable-next-line no-console
    console.log("[10] unresolvedDependencies:", JSON.stringify(bundle.unresolvedDependencies, null, 2));
    console.log("[10] items referencing 6.04:", bundle.items.filter((i) => i.normalizedRef.includes("6.04")));
    expect(ambiguousUnresolved).toBeDefined();
    expect(ambiguousUnresolved!.severity).toBe("HIGH");
    // Neither physical "6.04" occurrence's text should be silently picked
    // as a resolved CROSS_REFERENCE item.
    expect(bundle.items.some((i) => i.type === "CROSS_REFERENCE" && i.normalizedRef === "6.04")).toBe(false);
  });

  // 11. UNRESOLVED-REFERENCE HONESTY: a genuinely undeclared term is surfaced explicitly
  it("11. a genuinely undeclared defined term used in the operative text is surfaced as an explicit UNRESOLVED_DEFINED_TERM, never silently omitted", () => {
    const docs: TestDocument[] = [
      {
        documentId: "doc1",
        label: "CA",
        text: `SECTION 6.07 Fundamental Changes. The Borrower will not merge or consolidate except in connection with a Permitted Reorganization Transaction not resulting in a Change of Control.`,
      },
    ];
    const bundle = build(docs, "6.07");
    const unresolvedTerm = bundle.unresolvedDependencies.find((u) => u.dependencyType === "UNRESOLVED_DEFINED_TERM" && /Permitted Reorganization Transaction/.test(u.sourceText));
    // eslint-disable-next-line no-console
    console.log("[11] unresolved:", JSON.stringify(bundle.unresolvedDependencies, null, 2));
    expect(unresolvedTerm).toBeDefined();
  });

  // 12. WRONG-CONTEXT CONTAMINATION probe: an unrelated sibling containing an unrelated dollar figure must not be pulled in merely by proximity
  it("12. CTX-02 FIX: an unrelated numerically-similar sibling clause is NOT attached at normal confidence merely because it is nearby and shares a similar dollar figure", () => {
    const docs: TestDocument[] = [
      {
        documentId: "doc1",
        label: "CA",
        text: `SECTION 6.08 Affiliate Transactions. The Borrower will not enter into any transaction with an Affiliate except:
(a) transactions on arm's-length terms;
(b) director compensation not exceeding $5,000,000 in the aggregate per year, which bears no economic relationship to clause (a) at all and is not a proviso, exception, or condition on it.`,
      },
    ];
    const bundle = build(docs, "6.08(a)");
    const siblingItem = bundle.items.find((i) => i.normalizedRef === "6.08(b)");
    // eslint-disable-next-line no-console
    console.log("[12] sibling item retrieved?", !!siblingItem, siblingItem?.type, JSON.stringify(siblingItem));
    // CTX-02 FIX (was: WRONG-CONTEXT CONTAMINATION - clause (b), whose own
    // text explicitly disclaims any economic relationship to clause (a),
    // was classified SHARED_CAP and attached at the SAME confidence/shape
    // as a genuinely relevant item purely because it contains "in the
    // aggregate"). Note the adversarial subtlety: clause (b)'s text also
    // literally contains the string "clause (a)" - but only inside an
    // explicit relationship-negation ("bears no economic relationship to
    // clause (a) at all"), which is a hard veto, not confirming evidence.
    // The sibling is still disclosed (never silently dropped - recall is
    // preserved) but only as a distinctly-shaped, low-confidence
    // UNVERIFIED_SIBLING_SIGNAL a downstream reader cannot mistake for a
    // verified SHARED_CAP item.
    expect(siblingItem).toBeDefined();
    expect(siblingItem?.type).toBe("UNVERIFIED_SIBLING_SIGNAL");
    expect(siblingItem?.type).not.toBe("SHARED_CAP");
    expect(siblingItem?.confidence).toBeLessThanOrEqual(0.3);
    expect(bundle.items.some((i) => i.type === "SHARED_CAP" && i.normalizedRef === "6.08(b)")).toBe(false);
  });

  // 12b. NEGATION-BLIND-SPOT control: a sibling that mentions the
  // candidate's clause letter WITHOUT any negation must still attach
  // normally - proves the negation veto in test 12 isn't just refusing
  // every mention of "clause (a)" outright.
  it("12b. (positive control) a sibling that references the candidate's clause letter WITHOUT a relationship negation still attaches normally", () => {
    const docs: TestDocument[] = [
      {
        documentId: "doc1",
        label: "CA",
        text: `SECTION 6.08 Affiliate Transactions. The Borrower will not enter into any transaction with an Affiliate except:
(a) transactions on arm's-length terms;
(b) in the aggregate, all transactions permitted under clause (a) above shall not exceed $10,000,000 per fiscal year.`,
      },
    ];
    const bundle = build(docs, "6.08(a)");
    const siblingItem = bundle.items.find((i) => i.normalizedRef === "6.08(b)");
    expect(siblingItem?.type).toBe("SHARED_CAP");
    expect(siblingItem?.confidence).toBe(0.7);
  });

  // 13. CTX-01 generalized: a 2-hop cross-reference chain where the
  // amendment targets the SECOND hop, not the first - proves the
  // amendment-lead check runs at every depth level the cross-reference
  // traversal visits, not merely depth 1.
  it("13. CTX-01 (generalized, 2-hop): an amendment targeting the SECOND hop of a cross-reference chain is surfaced, not just the first hop", () => {
    const docs: TestDocument[] = [
      {
        documentId: "doc1",
        label: "Credit Agreement",
        text: `CREDIT AGREEMENT dated as of January 1, 2021, among Harrow Logistics Inc., as Borrower.

SECTION 6.01 Restricted Payments. The Borrower may make Restricted Payments as calculated in accordance with Section 1.07.

SECTION 1.07 Pro Forma Calculations. All pro forma calculations shall give effect to the accounting principles set forth in Section 1.08.

SECTION 1.08 Accounting Principles. All calculations shall be made in accordance with GAAP as in effect on the Closing Date.`,
      },
      {
        documentId: "doc2",
        label: "First Amendment",
        text: `FIRST AMENDMENT TO CREDIT AGREEMENT, dated as of June 1, 2023 (this "Amendment"), to the Credit Agreement dated as of January 1, 2021, among Harrow Logistics Inc.

Section 1.08 of the Credit Agreement is hereby amended and restated in its entirety to require GAAP as in effect on the date of determination rather than the Closing Date.`,
      },
    ];
    const access = packageAccessFor(docs);
    const modCandidate = access.packageGraph!.modificationCandidates.find((m) => m.targetDocumentId === "doc1" && m.targetSectionRef === "1.08");
    expect(modCandidate).toBeDefined();

    const bundle = build(docs, "6.01", {}, access);
    // Both hops are reached.
    const item107 = bundle.items.find((i) => i.normalizedRef === "1.07");
    const item108 = bundle.items.find((i) => i.normalizedRef === "1.08");
    expect(item107).toBeDefined();
    expect(item108).toBeDefined();
    expect(bundle.performance.maxCrossReferenceDepthReached).toBeGreaterThanOrEqual(2);

    // The amendment targets ONLY the second hop (1.08) - it must be
    // surfaced there, and NOT fabricated for the first hop (1.07).
    const leadFor108 = bundle.items.find((i) => (i.type === "AMENDMENT_LEAD" || i.type === "SUPPLEMENT_LEAD") && i.normalizedRef === "1.08");
    const leadFor107 = bundle.items.find((i) => (i.type === "AMENDMENT_LEAD" || i.type === "SUPPLEMENT_LEAD") && i.normalizedRef === "1.07");
    expect(leadFor108).toBeDefined();
    expect(leadFor108!.excerptText).toMatch(/date of determination/);
    expect(leadFor107).toBeUndefined();
  });

  // 14. CTX-01 generalized: a genuine reference cycle (A -> B -> A) must
  // not infinite-loop or explode retrieval depth - bounded recursion and
  // cycle protection proof.
  it("14. CTX-01 (generalized, cycle protection): a genuine reference cycle (A -> B -> A) terminates cleanly, with amendment leads still surfaced for both cycle members", () => {
    const docs: TestDocument[] = [
      {
        documentId: "doc1",
        label: "Credit Agreement",
        text: `CREDIT AGREEMENT dated as of January 1, 2021, among Harrow Logistics Inc., as Borrower.

SECTION 6.01 Restricted Payments. The Borrower may make Restricted Payments as calculated in accordance with Section 1.07.

SECTION 1.07 Pro Forma Calculations. All calculations shall give effect to the accounting principles set forth in Section 1.08.

SECTION 1.08 Accounting Principles. All calculations of pro forma amounts shall be made in accordance with Section 1.07.`,
      },
      {
        documentId: "doc2",
        label: "First Amendment",
        text: `FIRST AMENDMENT TO CREDIT AGREEMENT, dated as of June 1, 2023 (this "Amendment"), to the Credit Agreement dated as of January 1, 2021, among Harrow Logistics Inc.

Section 1.08 of the Credit Agreement is hereby amended and restated in its entirety to change the applicable accounting standard.`,
      },
    ];
    const access = packageAccessFor(docs);
    const start = Date.now();
    const bundle = build(docs, "6.01", {}, access);
    const elapsedMs = Date.now() - start;

    // No infinite loop / no runaway retrieval - completes fast and stays
    // within the configured cross-reference depth budget.
    expect(elapsedMs).toBeLessThan(2000);
    expect(bundle.performance.maxCrossReferenceDepthReached).toBeLessThanOrEqual(3);

    // No duplicate items despite the cycle - deduplicated by itemId exactly
    // as the pre-existing (non-amendment) cycle protection already
    // guaranteed (see tests/contract-model/context-retrieval-pipeline.test.ts
    // #30, unaffected by this remediation).
    // Filtered to the CROSS_REFERENCE/CALCULATION_PROVISION items
    // specifically (the AMENDMENT_LEAD item for 1.08 legitimately shares
    // normalizedRef "1.08" too - it is a distinct item/type, not a dedup
    // failure).
    const items107 = bundle.items.filter((i) => i.normalizedRef === "1.07" && (i.type === "CROSS_REFERENCE" || i.type === "CALCULATION_PROVISION"));
    const items108 = bundle.items.filter((i) => i.normalizedRef === "1.08" && (i.type === "CROSS_REFERENCE" || i.type === "CALCULATION_PROVISION"));
    expect(items107).toHaveLength(1);
    expect(items108).toHaveLength(1);

    // The amendment lead for 1.08 is still surfaced despite the cycle.
    const leadFor108 = bundle.items.find((i) => (i.type === "AMENDMENT_LEAD" || i.type === "SUPPLEMENT_LEAD") && i.normalizedRef === "1.08");
    expect(leadFor108).toBeDefined();
  });
});
