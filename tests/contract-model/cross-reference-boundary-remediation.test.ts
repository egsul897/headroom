/**
 * Phase 2E.1 - cross-reference/structural-region boundary remediation
 * regression tests (task §11/§12). Synthetic scenarios (1-12) reproduce
 * the GENERALIZED shape of every Phase 2E finding without copying
 * package-specific language; the five FWRG-specific tests at the bottom
 * regress the exact five original findings using the real committed
 * fixture text, per task §12's own "tests may identify known source
 * sections/findings; production code may not" - no FWRG-specific rule
 * exists anywhere in lib/contract-model/compiler/context-retrieval/ or
 * structural-references.ts.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { detectStructuralDefinitions } from "../../lib/contract-model/compiler/structural-definitions";
import { detectStructuralReferences } from "../../lib/contract-model/compiler/structural-references";
import { buildStructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import { buildCovenantContextBundle } from "../../lib/contract-model/compiler/context-retrieval/pipeline";
import type { DiscoveredCandidate } from "../../lib/contract-model/compiler/discovery/types";
import { buildTestIndex, makeCandidate } from "./coverage-audit-test-utils";

const DOC = "doc";

function buildFor(text: string, sectionRef: string, budget?: Parameters<typeof buildCovenantContextBundle>[0]["budget"]) {
  const nodes = parseDocumentStructure({ documentId: DOC, label: "CA", text });
  const defs = detectStructuralDefinitions(DOC, text, nodes);
  const refs = detectStructuralReferences(DOC, text, nodes);
  const index = buildStructuralIndex(new Map([[DOC, { text, nodes }]]), defs, refs);
  const exactTermsByDocument = new Map([[DOC, new Map(defs.map((d) => [d.normalizedTerm, d.exactTerm] as const))]]);
  const node = index.getNodeByRef(DOC, sectionRef)!;
  const candidate = makeCandidate({ documentId: DOC, structuralNodeKeys: [node.nodeKey], structuralNodeIds: [node.nodeId], normalizedSourceRef: sectionRef });
  const bundle = buildCovenantContextBundle({ candidate, packageKey: "p", companyId: "c", instrumentKey: null, budget }, { index, packageGraph: null, exactTermsByDocument });
  return { index, bundle, node };
}

describe("Phase 2E.1 synthetic regression (task §11, generalized shapes)", () => {
  it("1. a reference to a parent section whose material mechanics live in children retrieves the children too", () => {
    const text = `SECTION 6.01. Indebtedness . The Borrower shall not incur Indebtedness except as permitted under Section 1.07. SECTION 1.07. Ratio Calculations . (a) the Leverage Ratio shall not exceed the greater of $10,000,000 and 15% of Consolidated EBITDA. (b) all calculations shall be made on a pro forma basis giving effect to the transaction.`;
    const { bundle } = buildFor(text, "6.01");
    const calc = bundle.items.find((i) => i.normalizedRef === "1.07" && (i.type === "CALCULATION_PROVISION" || i.type === "CROSS_REFERENCE"));
    expect(calc).toBeDefined();
    expect(calc!.excerptText).toContain("greater of $10,000,000");
    expect(calc!.excerptText).toContain("pro forma basis");
  });

  it("2. a reference to a calculation section with one relevant nested clause retrieves the nested clause", () => {
    const text = `SECTION 6.01. Indebtedness . Compliance shall be calculated in accordance with Section 1.05. SECTION 1.05. Calculations . (a) Pro forma compliance shall be determined using the accounting principles set forth herein, including a cap on adjustments not to exceed 20% of Consolidated EBITDA.`;
    const { bundle } = buildFor(text, "6.01");
    const calc = bundle.items.find((i) => i.normalizedRef === "1.05");
    expect(calc).toBeDefined();
    expect(calc!.excerptText).toContain("20% of Consolidated EBITDA");
  });

  it("3. a reference target with both relevant and irrelevant descendants only includes the relevant one", () => {
    const text = `SECTION 6.01. Indebtedness . Indebtedness permitted under Section 1.09 shall be excluded. SECTION 1.09. Miscellaneous Terms . (a) the term "Business Day" has the meaning customary for such term. (b) any determination hereunder not to exceed the greater of $5,000,000 and 10% of Consolidated EBITDA shall be made in good faith.`;
    const { bundle } = buildFor(text, "6.01");
    const calc = bundle.items.find((i) => i.normalizedRef === "1.09");
    expect(calc).toBeDefined();
    expect(calc!.excerptText).toContain("greater of $5,000,000");
    expect(calc!.excerptText).not.toContain("Business Day");
  });

  it("4. a relative reference requiring ancestor self-match resolves without a separate node", () => {
    const text = `SECTION 6.02. Liens . The Borrower shall not create Liens, except: (a) Liens for taxes. (b) Liens on property so long as, in the case of this clause (b), the aggregate amount does not exceed the greater of $8,000,000 and 12% of Consolidated EBITDA.`;
    const refs = detectStructuralReferences(DOC, text, parseDocumentStructure({ documentId: DOC, label: "CA", text }));
    const clauseRef = refs.find((r) => r.referenceText.includes("clause (b)"));
    expect(clauseRef?.resolved).toBe(true);
    expect(clauseRef?.normalizedTarget).toBe("6.02(b)");
  });

  it("5. a broad section reference plus a trailing proviso retrieves the proviso as its own item", () => {
    const text = `SECTION 6.03. Restricted Payments . (a) dividends not to exceed $5,000,000 shall be permitted. (b) provided that no Default shall have occurred and is continuing at the time of any such dividend.`;
    const { bundle } = buildFor(text, "6.03(a)");
    expect(bundle.items.some((i) => i.type === "PROVISO" && i.normalizedRef === "6.03(b)")).toBe(true);
  });

  it("6. calculation context without an obvious formula keyword ('giving effect to') is still classified as a calculation provision", () => {
    const text = `SECTION 6.01. Indebtedness . Compliance is tested under Section 1.06. SECTION 1.06. Testing . Compliance shall be tested after giving effect to the incurrence of Indebtedness on a consolidated basis.`;
    const { bundle } = buildFor(text, "6.01");
    const item = bundle.items.find((i) => i.normalizedRef === "1.06");
    expect(item?.type).toBe("CALCULATION_PROVISION");
  });

  it("7. a reference to a section with many children where only one is relevant does not expand past OWN text (bounded, no context dump)", () => {
    const clauses = Array.from({ length: 12 }, (_, idx) => `(${String.fromCharCode(97 + idx)}) ordinary course item number ${idx} not exceeding $1,000,000.`).join(" ");
    const text = `SECTION 6.01. Indebtedness . Indebtedness permitted under Section 1.08 shall be excluded. SECTION 1.08. Many Items . ${clauses}`;
    const { bundle } = buildFor(text, "6.01");
    const item = bundle.items.find((i) => i.normalizedRef === "1.08")!;
    expect(item).toBeDefined();
    // Bounded: only the node's OWN text (its own chapeau, if any) - not all 12 children auto-included.
    expect(item.excerptText).not.toContain("item number 5");
  });

  it("8. an unresolved referenced parent downgrades sufficiency away from SUFFICIENT", () => {
    const text = `SECTION 6.01. Indebtedness . The Borrower shall not incur Indebtedness except as permitted under Section 9.99.`;
    const { bundle } = buildFor(text, "6.01");
    expect(bundle.sufficiencyState).not.toBe("SUFFICIENT");
    expect(bundle.unresolvedDependencies.some((u) => u.dependencyType === "AMBIGUOUS_RELATIVE_REFERENCE" || u.dependencyType === "MISSING_SCHEDULE")).toBe(true);
  });

  it("9. an administrative cross-reference remains excluded from recursive expansion", () => {
    const text = `SECTION 6.01. Indebtedness . Notice of any incurrence shall be given pursuant to Section 9.01. SECTION 9.01. Notices . All notices shall be delivered by hand or courier to the address on the signature pages hereto.`;
    const { bundle } = buildFor(text, "6.01");
    const item = bundle.items.find((i) => i.normalizedRef === "9.01");
    expect(item?.type).toBe("CROSS_REFERENCE");
  });

  it("10. a reference cycle remains bounded (no infinite loop, budget respected)", () => {
    const text = `SECTION 6.01. Indebtedness . Compliance is calculated under Section 6.02. SECTION 6.02. Liens . Compliance is calculated under Section 6.01.`;
    const { bundle } = buildFor(text, "6.01");
    expect(bundle.items.length).toBeLessThan(50);
    expect(bundle.performance.deterministicWallClockMs).toBeLessThan(1000);
  });

  it("11. descendant expansion never crosses into the next sibling section", () => {
    const text = `SECTION 6.01. Indebtedness . Indebtedness permitted under Section 1.10 shall be excluded. SECTION 1.10. Calculations . the greater of $9,000,000 and 15% of Consolidated EBITDA on a pro forma basis. SECTION 1.11. Unrelated Section . this text must never appear in 6.01's own bundle.`;
    const { bundle } = buildFor(text, "6.01");
    const item = bundle.items.find((i) => i.normalizedRef === "1.10")!;
    expect(item.excerptText).not.toContain("Unrelated Section");
    expect(bundle.items.every((i) => !i.excerptText.includes("must never appear"))).toBe(true);
  });

  it("12. an unrelated high-density numeric section is not automatically included via reference resolution", () => {
    const text = `SECTION 6.01. Indebtedness . The Borrower shall not incur Indebtedness in excess of $5,000,000. SECTION 6.09. Financial Covenants . (a) $1 (b) $2 (c) $3 (d) $4 (e) $5 (f) $6 (g) $7 (h) $8.`;
    const { bundle } = buildFor(text, "6.01");
    expect(bundle.items.some((i) => i.normalizedRef.startsWith("6.09"))).toBe(false);
  });
});

describe("Phase 2E.1 - the five original FWRG findings, regressed against the real committed fixture (task §12)", () => {
  const dir = path.join(__dirname, "../fixtures/unseen-packages/fwrg-2021-credit-agreement");
  const fwrgText = fs.readFileSync(path.join(dir, "definitions-excerpt.txt"), "utf-8") + "\n\n" + fs.readFileSync(path.join(dir, "article-6-negative-covenants.txt"), "utf-8");

  function buildFwrgBundle(discoveryId: string) {
    const label = "fwrg";
    const nodes = parseDocumentStructure({ documentId: label, label, text: fwrgText });
    const defs = detectStructuralDefinitions(label, fwrgText, nodes);
    const refs = detectStructuralReferences(label, fwrgText, nodes);
    const index = buildStructuralIndex(new Map([[label, { text: fwrgText, nodes }]]), defs, refs);
    const exactTermsByDocument = new Map([[label, new Map(defs.map((d) => [d.normalizedTerm, d.exactTerm] as const))]]);
    const runDir = path.join(dir, "discovery-runs");
    const files = fs.readdirSync(runDir).filter((f) => f.endsWith(".json"));
    const raw = JSON.parse(fs.readFileSync(path.join(runDir, files[0]!), "utf-8")) as { candidates: DiscoveredCandidate[] };
    const legacyCandidate = raw.candidates.find((c) => c.discoveryId === discoveryId)!;
    // This committed fixture predates Phase 3F.1.2's nodeId field - it only
    // carries the legacy label-shaped structuralNodeKeys. Backfill real
    // structuralNodeIds by resolving each key's own section reference
    // against this run's freshly-built real index, never a synthetic
    // placeholder - buildCovenantContextBundle's primaryNodeId lookup needs
    // a real, resolvable physical occurrence id to retrieve anything.
    const structuralNodeIds = legacyCandidate.structuralNodeKeys.map((key) => {
      const sectionRef = key.slice(key.indexOf("::") + 2);
      return index.getNodeByRef(label, sectionRef)?.nodeId ?? "";
    });
    const candidate: DiscoveredCandidate = { ...legacyCandidate, structuralNodeIds };
    return buildCovenantContextBundle({ candidate, packageKey: label, companyId: label, instrumentKey: null }, { index, packageGraph: null, exactTermsByDocument });
  }

  // All five original findings were surfaced auditing the same candidate: discovery-candidate:8cf87439002864159b47cd6c (fwrg-6.07-fundamental-changes-dispositions).
  const DISCOVERY_ID = "discovery-candidate:8cf87439002864159b47cd6c";

  it("finding #1 (6.07(c)(ii) 'clause (j) thereof' -> 6.06(j)): resolves and retrieves real content, not the old wrongly-composed 6.07(c)(j)", () => {
    const bundle = buildFwrgBundle(DISCOVERY_ID);
    const item = bundle.items.find((i) => i.normalizedRef === "6.06(j)");
    expect(item).toBeDefined();
    expect(item!.excerptText.length).toBeGreaterThan(50);
  });

  it("finding #2 (6.07(c)(ii)(A) 'clause (a)' under 'this Section 6.07' -> 6.07(a)): resolves via antecedent override", () => {
    const bundle = buildFwrgBundle(DISCOVERY_ID);
    const item = bundle.items.find((i) => i.normalizedRef === "6.07(a)");
    expect(item).toBeDefined();
    expect(item!.excerptText.length).toBeGreaterThan(50);
  });

  it("finding #3 (6.07(i)(A) 'this clause (D)', self-referential to unparsed internal content): stays unresolved but with a disambiguated, traceable citation", () => {
    const bundle = buildFwrgBundle(DISCOVERY_ID);
    const unresolved = bundle.unresolvedDependencies.find((u) => u.sourceText === "clause (D)");
    expect(unresolved).toBeDefined();
    expect(unresolved!.citation).toContain("6.07(i)(D)");
  });

  it("finding #4 (6.07(i)(A) 'this clause (h)' -> 6.07(h) via ancestor-chain search): resolves to the real sibling section", () => {
    const bundle = buildFwrgBundle(DISCOVERY_ID);
    const item = bundle.items.find((i) => i.normalizedRef === "6.07(h)");
    expect(item).toBeDefined();
  });

  it("finding #5 (6.07(kk)(A)(2) 'this clause (kk)', self-referential to an ancestor): resolves via ancestor self-match", () => {
    const bundle = buildFwrgBundle(DISCOVERY_ID);
    const item = bundle.items.find((i) => i.normalizedRef === "6.07(kk)");
    expect(item).toBeDefined();
    // The ancestor self-match target must not be a fabricated new node - it is the same 6.07(kk) CHILD_RULE item already retrieved by ordinary child-rule traversal.
    expect(item!.type === "CHILD_RULE" || item!.type === "CROSS_REFERENCE" || item!.type === "CALCULATION_PROVISION").toBe(true);
  });

  it("all five original findings resolve simultaneously in one bundle build (no regression trade-off between them)", () => {
    const bundle = buildFwrgBundle(DISCOVERY_ID);
    const targets = ["6.06(j)", "6.07(a)", "6.07(h)", "6.07(kk)"];
    for (const t of targets) expect(bundle.items.some((i) => i.normalizedRef === t)).toBe(true);
    const unresolvedD = bundle.unresolvedDependencies.find((u) => u.sourceText === "clause (D)");
    expect(unresolvedD?.citation).toContain("6.07(i)(D)");
  });
});
