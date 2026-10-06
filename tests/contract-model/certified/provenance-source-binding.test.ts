/**
 * PROVENANCE EXCERPT SOURCE-BINDING CONTRACT - authoritative provenance is always source-addressable.
 *
 * Matrix A-M over the pure resolver (synthetic texts), the normalizer integration (raw vs authoritative provenance,
 * diagnostics, sufficiency limit), the verifier's qualitative grounding (an UNRESOLVED binding is FABRICATED - never a
 * relaxation), the projection (raw model excerpt never shown to Layer 2), determinism, and the frozen §7.2(c) regression
 * read from the immutable final live evidence (never rewritten). Zero provider calls.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import crypto from "node:crypto";
import { MIN_ANCHOR_CHARS, PROVENANCE_SOURCE_BINDING_VERSION, normalizeWithMap, resolveProvenanceExcerpt, splitExcerptSegments, type AdmissibleSourceText } from "../../../lib/contract-model/compiler/semantic/provenance-binding";
import { admissibleSourcesFor, normalizeSubmission } from "../../../lib/contract-model/compiler/semantic/normalize";
import { SubmitCompilationSchema } from "../../../lib/contract-model/compiler/semantic/wire-schema";
import { SEMANTIC_COMPILER_ALGORITHM_VERSION } from "../../../lib/contract-model/compiler/semantic/types";
import { auditQualitativeLineage, QUALITATIVE_GROUNDING_VERSION, qualitativeGroundingFindings } from "../../../lib/contract-model/compiler/semantic-verification/qualitative-grounding";
import { buildSemanticVerificationProjection, computeSemanticVerificationProjectionHash, SEMANTIC_VERIFICATION_PROJECTION_VERSION } from "../../../lib/contract-model/compiler/semantic-verification/projection";
import { SEMANTIC_VERIFIER_ALGORITHM_VERSION } from "../../../lib/contract-model/compiler/semantic-verification/types";
import { buildTestIndex } from "../context-retrieval-test-utils";
import { emptyContextBundle, testCompilerInput, TEST_DOCUMENT_ID } from "../semantic-compiler/test-helpers";

const src = (sourceKey: string, text: string, over: Partial<AdmissibleSourceText> = {}): AdmissibleSourceText => ({ sourceKey, kind: "OPERATIVE", documentId: "doc-a", sectionRef: "9.1", text, absCharStart: 1000, ...over });
const T1 = "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau";
const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

describe("provenance-source-binding.v1 - the pure resolver (matrix A-M)", () => {
  it("A EXACT UNIQUE MATCH: an exact substring resolves unchanged with exact offsets and source identity", () => {
    const r = resolveProvenanceExcerpt("gamma delta epsilon", [src("operative", T1)]);
    expect(r.authoritativeExcerpt).toBe("gamma delta epsilon");
    expect(r.resolution).toMatchObject({ version: PROVENANCE_SOURCE_BINDING_VERSION, status: "VERBATIM_UNIQUE", reason: null, segments: 1, sourceKey: "operative", sourceKind: "OPERATIVE", sourceDocumentId: "doc-a", sourceSectionRef: "9.1", charStart: T1.indexOf("gamma"), charEnd: T1.indexOf("epsilon") + "epsilon".length, absCharStart: 1000 + T1.indexOf("gamma"), boundSha256: sha("gamma delta epsilon") });
  });
  it("B ELIDED UNIQUE MATCH: 'alpha beta … theta iota' binds to the full exact source substring; the raw text is not the authoritative excerpt", () => {
    const r = resolveProvenanceExcerpt("alpha beta gamma … theta iota kappa", [src("operative", T1)]);
    expect(r.resolution.status).toBe("SOURCE_BOUND_ELIDED");
    expect(r.authoritativeExcerpt).toBe("alpha beta gamma delta epsilon zeta eta theta iota kappa");
    expect([r.resolution.charStart, r.resolution.charEnd, r.resolution.segments]).toEqual([0, "alpha beta gamma delta epsilon zeta eta theta iota kappa".length, 2]);
    expect(resolveProvenanceExcerpt("alpha beta gamma ... theta iota kappa", [src("operative", T1)]).authoritativeExcerpt).toBe(r.authoritativeExcerpt);
    expect(resolveProvenanceExcerpt("alpha beta gamma . . . theta iota kappa", [src("operative", T1)]).authoritativeExcerpt).toBe(r.authoritativeExcerpt);
  });
  it("C LEFT ANCHOR MISSING: reject", () => {
    const r = resolveProvenanceExcerpt("omega psi chi phi … theta iota kappa", [src("operative", T1)]);
    expect([r.resolution.status, r.resolution.reason, r.authoritativeExcerpt]).toEqual(["UNRESOLVED", "LEFT_ANCHOR_MISSING", null]);
  });
  it("D RIGHT ANCHOR MISSING: reject", () => {
    const r = resolveProvenanceExcerpt("alpha beta gamma … omega psi chi phi", [src("operative", T1)]);
    expect([r.resolution.status, r.resolution.reason]).toEqual(["UNRESOLVED", "RIGHT_ANCHOR_MISSING"]);
  });
  it("E/F/G NON-UNIQUE ANCHORS / MULTIPLE PAIRINGS: reject whenever more than one contiguous span satisfies the anchors; accept when the full binding is still unique", () => {
    const T2 = "alpha beta gamma one two theta iota kappa; alpha beta gamma three four theta iota kappa";
    const r = resolveProvenanceExcerpt("alpha beta gamma … theta iota kappa", [src("operative", T2)]);
    expect([r.resolution.status, r.resolution.reason]).toEqual(["UNRESOLVED", "AMBIGUOUS_SPAN"]); // 3 ordered pairings, none chosen
    // left anchor twice, both BEFORE the unique right anchor: two contiguous spans satisfy the anchors -> rejected, never the "nearest" one
    const T3 = "alpha beta gamma one two theta iota kappa; alpha beta gamma three four theta iota omega";
    expect(resolveProvenanceExcerpt("alpha beta gamma … theta iota omega", [src("operative", T3)]).resolution.reason).toBe("AMBIGUOUS_SPAN");
    // left anchor twice but only one occurrence precedes the right anchor: the full binding is uniquely provable -> bound
    const T3b = "alpha beta gamma three four theta iota omega; alpha beta gamma one two theta iota kappa";
    const left = resolveProvenanceExcerpt("alpha beta gamma … theta iota omega", [src("operative", T3b)]);
    expect([left.resolution.status, left.authoritativeExcerpt]).toEqual(["SOURCE_BOUND_ELIDED", "alpha beta gamma three four theta iota omega"]);
    const right = resolveProvenanceExcerpt("alpha beta omega … theta iota kappa", [src("operative", "alpha beta omega x theta iota kappa y theta iota kappa")]);
    expect([right.resolution.status, right.resolution.reason]).toEqual(["UNRESOLVED", "AMBIGUOUS_SPAN"]); // right anchor twice after the left
  });
  it("H REVERSED ANCHORS: reject", () => {
    const r = resolveProvenanceExcerpt("theta iota kappa … alpha beta gamma", [src("operative", T1)]);
    expect([r.resolution.status, r.resolution.reason]).toEqual(["UNRESOLVED", "REVERSED_ANCHORS"]);
  });
  it("I CROSS-SOURCE MATCH: anchors in different admissible sources never form one span", () => {
    const r = resolveProvenanceExcerpt("alpha beta gamma … theta iota kappa", [src("operative", "alpha beta gamma delta"), src("xref-1", "zeta eta theta iota kappa lambda", { kind: "SOURCE_REGION", sectionRef: "7.1" })]);
    expect([r.resolution.status, r.resolution.reason]).toEqual(["UNRESOLVED", "CROSS_SOURCE"]);
  });
  it("J CROSS-INADMISSIBLE-BOUNDARY MATCH: a span straddling a separately-owned boundary is rejected; a span inside one admissible stretch binds", () => {
    const boundaries: [number, number][] = [[T1.indexOf("zeta"), T1.indexOf("lambda")]]; // zeta..kappa owned by another candidate
    const r = resolveProvenanceExcerpt("alpha beta gamma … theta iota kappa", [src("operative", T1, { boundaries })]);
    expect([r.resolution.status, r.resolution.reason]).toEqual(["UNRESOLVED", "CROSSES_INADMISSIBLE_BOUNDARY"]);
    const inside = resolveProvenanceExcerpt("zeta eta theta … iota kappa", [src("operative", T1, { boundaries })]);
    expect([inside.resolution.status, inside.authoritativeExcerpt]).toEqual(["SOURCE_BOUND_ELIDED", "zeta eta theta iota kappa"]);
    // anchors never overlap: a right anchor that begins inside the left anchor's text is not an ordered chain
    expect(resolveProvenanceExcerpt("zeta eta theta … theta iota kappa", [src("operative", T1)]).resolution.reason).toBe("REVERSED_ANCHORS");
    const exact = resolveProvenanceExcerpt("epsilon zeta eta", [src("operative", T1, { boundaries })]);
    expect([exact.resolution.status, exact.resolution.reason]).toEqual(["UNRESOLVED", "CROSSES_INADMISSIBLE_BOUNDARY"]);
  });
  it("K EMPTY / DEGENERATE ELLIPSIS: never invents a span; leading or trailing ellipses are dropped and the rest is judged as written", () => {
    expect(resolveProvenanceExcerpt("…", [src("operative", T1)]).resolution).toMatchObject({ status: "UNRESOLVED", reason: "DEGENERATE_ELLIPSIS", segments: 0 });
    expect(resolveProvenanceExcerpt("... ...", [src("operative", T1)]).resolution.reason).toBe("DEGENERATE_ELLIPSIS");
    expect(splitExcerptSegments("… gamma delta epsilon …")).toEqual({ segments: ["gamma delta epsilon"], hadEllipsis: true });
    expect(resolveProvenanceExcerpt("… gamma delta epsilon …", [src("operative", T1)]).resolution.status).toBe("VERBATIM_UNIQUE");
    const short = resolveProvenanceExcerpt("alpha beta gamma … iota", [src("operative", T1)]);
    expect([short.resolution.status, short.resolution.reason]).toEqual(["UNRESOLVED", "ANCHOR_TOO_SHORT"]);
    expect(MIN_ANCHOR_CHARS).toBe(8);
    expect(resolveProvenanceExcerpt("gamma delta epsilon", []).resolution.reason).toBe("NO_ADMISSIBLE_SOURCE");
  });
  it("L MULTIPLE ELLIPSES: supported only when every segment locates in order and exactly one contiguous span results; otherwise rejected (frozen policy)", () => {
    const r = resolveProvenanceExcerpt("alpha beta gamma … zeta eta theta … omicron pi rho", [src("operative", T1)]);
    expect([r.resolution.status, r.resolution.segments]).toEqual(["SOURCE_BOUND_ELIDED", 3]);
    expect(r.authoritativeExcerpt).toBe(T1.slice(0, T1.indexOf("rho") + 3));
    const T4 = "alpha beta gamma x zeta eta theta y omicron pi rho z zeta eta theta w omicron pi rho";
    expect(resolveProvenanceExcerpt("alpha beta gamma … zeta eta theta … omicron pi rho", [src("operative", T4)]).resolution.reason).toBe("AMBIGUOUS_SPAN");
    expect(resolveProvenanceExcerpt("alpha beta gamma … nothing here at all … omicron pi rho", [src("operative", T1)]).resolution.reason).toBe("SEGMENT_MISSING");
  });
  it("M WHITESPACE / LINE-WRAP: only the existing canonical normalization (whitespace collapse, case-insensitive) is applied for matching; the bound excerpt is the ORIGINAL source substring with its line wraps at original offsets", () => {
    const wrapped = "the Borrower shall be in\ncompliance   with the   financial covenants\n  contained in Section 7.1 recomputed";
    const r = resolveProvenanceExcerpt("The Borrower shall be in compliance … contained in section 7.1", [src("operative", wrapped)]);
    expect(r.resolution.status).toBe("SOURCE_BOUND_ELIDED");
    expect(r.authoritativeExcerpt).toBe("the Borrower shall be in\ncompliance   with the   financial covenants\n  contained in Section 7.1");
    expect(wrapped.slice(r.resolution.charStart!, r.resolution.charEnd!)).toBe(r.authoritativeExcerpt);
    expect(normalizeWithMap(" a  b\n c ").norm).toBe("a b c");
    // no lexical repair: a changed word never matches
    expect(resolveProvenanceExcerpt("the Borrower shall be in compliance … contained in Section 7.2", [src("operative", wrapped)]).resolution.reason).toBe("RIGHT_ANCHOR_MISSING");
    // an exact excerpt occurring twice is a verbatim quotation but claims no span
    const twice = resolveProvenanceExcerpt("financial covenants contained", [src("operative", "financial covenants contained in A; financial covenants contained in B")]);
    expect([twice.resolution.status, twice.authoritativeExcerpt, twice.resolution.charStart]).toEqual(["VERBATIM_NON_UNIQUE", "financial covenants contained", null]);
    const none = resolveProvenanceExcerpt("words the source never says", [src("operative", wrapped)]);
    expect([none.resolution.status, none.resolution.reason, none.authoritativeExcerpt]).toEqual(["UNRESOLVED", "NOT_IN_SOURCE", null]);
  });
  it("identical texts supplied under several identities count once (the operative region duplicates the operative text)", () => {
    const r = resolveProvenanceExcerpt("gamma delta epsilon", [src("operative", T1), src("operative-region", T1, { kind: "SOURCE_REGION" }), src("ctx-1", T1, { kind: "CONTEXT_ITEM" })]);
    expect(r.resolution.status).toBe("VERBATIM_UNIQUE");
    expect(r.resolution.sourceKey).toBe("operative");
  });
});

// ---- normalizer integration -------------------------------------------------------------------------------------------
const DOC = ["CREDIT AGREEMENT dated as of March 1, 2026.", "", "ARTICLE IX NEGATIVE COVENANTS", "", "The Company shall not, and shall not permit any Subsidiary to, directly or indirectly:", "",
  "SECTION 9.2 Limitation on Indebtedness . Create, incur, assume or suffer to exist any Indebtedness, except:", "",
  "(a) Indebtedness secured by Liens permitted by Section 9.3(b); provided that the Company shall be in compliance, on a pro forma basis after giving effect to the incurrence of such Indebtedness, with the financial covenants contained in Section 9.1 recomputed as at the last day of the most recently ended fiscal quarter of the Company and its Subsidiaries for which financial statements are available as if such Indebtedness had been incurred on the first day of each relevant period;", "",
  "(b) Indebtedness in an aggregate principal amount not to exceed $5,000,000 at any time outstanding; and", "",
  "SECTION 9.3 Liens . Create, incur, assume or suffer to exist any Lien, except:", "", "(a) Liens for taxes not yet due; and", "", "(b) Liens securing Indebtedness in a principal amount not exceeding 80% of the fair market value of such property.", ""].join("\n");
const idx = buildTestIndex([{ documentId: TEST_DOCUMENT_ID, label: "synthetic", text: DOC }]);
const node = idx.allNodes().find((n) => n.sectionRef === "9.2(a)")!;
const OP = idx.getNodeText(node.nodeId, "DESCENDANTS").trim();
const FULL = "provided that the Company shall be in compliance, on a pro forma basis after giving effect to the incurrence of such Indebtedness, with the financial covenants contained in Section 9.1 recomputed as at the last day of the most recently ended fiscal quarter of the Company and its Subsidiaries for which financial statements are available as if such Indebtedness had been incurred on the first day of each relevant period";
const ELIDED = "provided that the Company shall be in compliance, on a pro forma basis after giving effect to the incurrence of such Indebtedness, with the financial covenants contained in Section 9.1 recomputed as at the last day of the most recently ended fiscal quarter… as if such Indebtedness had been incurred on the first day of each relevant period";
const rule = (conditionExcerpt: string | null, over: Record<string, unknown> = {}) => ({ localRef: "r1", sourceSectionRef: "9.2(a)", covenantFamily: "INDEBTEDNESS", ruleType: "QUANTITATIVE_PERMISSION", posture: "PERMISSION", action: "INCUR_DEBT", entityScope: ["BORROWER"], entityScopeExcluded: [], capacityExpression: { kind: "UNLIMITED_CAPACITY", citation: "9.2(a)" }, conditions: [{ conditionType: "OTHER_RULE_SATISFIED", expression: null, referencesRuleTargets: [{ targetRef: "Section 9.1" }], targetCombination: "ALL_SATISFIED", referencesDefinitionId: null, description: "pro forma compliance", citation: "9.2(a)", excerpt: conditionExcerpt }], exceptions: [], dependsOn: [{ relationshipType: "REQUIRES", targetRef: "Section 9.3(b)", description: "" }], sufficiency: "COMPLETE", sufficiencyReasons: [], citation: "9.2(a)", excerpt: OP.slice(0, 120), inventoryItemIds: ["inv-item:a"], ...over });
const input = (over: Record<string, unknown> = {}) => testCompilerInput({ candidateRef: "cand:9.2(a)", sourceSectionRef: "9.2(a)", operativeSourceText: OP, operativeCharStart: node.charStart, contextBundle: emptyContextBundle({ originatingStructuralNodeIds: [node.nodeId] }), toolAccess: { structuralIndex: idx, operativeState: null, packageGraph: null, amendmentEffects: null, contextBundle: emptyContextBundle() }, ...over });
const normalize = (r: Record<string, unknown>, over: Record<string, unknown> = {}) => normalizeSubmission(SubmitCompilationSchema.parse({ rules: [r], definitions: [], sharedCapacities: [], irExtensionCandidates: [], overallNotes: [] }), input(over));

describe("normalizer integration: raw model provenance vs authoritative source provenance", () => {
  it("admissible sources mirror the verifier's grounding texts: operative text (with separately-owned child spans as boundaries), source-context regions, context-bundle excerpts", () => {
    const pop = [{ discoveryId: "cand:9.2(a)", structuralNodeIds: [node.nodeId] }, { discoveryId: "cand:9.2", structuralNodeIds: [idx.allNodes().find((n) => n.sectionRef === "9.2")!.nodeId] }];
    const srcs = admissibleSourcesFor(input({ candidatePopulation: pop, sourceContext: { state: "DEPENDENCY_EXPANDED_SOURCE", regions: [{ regionId: "operative", kind: "OPERATIVE", documentId: TEST_DOCUMENT_ID, sourceNodeId: node.nodeId, sectionRef: "9.2(a)", charStart: node.charStart, charEnd: node.charStart + OP.length, text: OP, expandedFor: null, truncatedAtBudget: false, unitExtension: null }, { regionId: "xref-1", kind: "CROSS_REFERENCE_EXPANSION", documentId: TEST_DOCUMENT_ID, sourceNodeId: null, sectionRef: "9.3(b)", charStart: 10, charEnd: 20, text: "Liens securing Indebtedness", expandedFor: null, truncatedAtBudget: false, unitExtension: null }], unresolvedReferences: [], reasons: [], totalChars: 0, budgetChars: 0 } }));
    expect(srcs.map((s) => [s.sourceKey, s.kind, s.sectionRef, s.absCharStart])).toEqual([["operative", "OPERATIVE", "9.2(a)", node.charStart], ["operative", "SOURCE_REGION", "9.2(a)", node.charStart], ["xref-1", "SOURCE_REGION", "9.3(b)", 10]]);
    expect(srcs[0]!.boundaries).toEqual([]); // 9.2 is the parent, not a child inside the window
  });
  it("exact excerpt: provenance unchanged, VERBATIM_UNIQUE resolution with offsets, no raw copy, no diagnostic", () => {
    const n = normalize(rule(FULL));
    const p = n.rules[0]!.conditions[0]!.provenance!;
    expect(p.excerpt).toBe(FULL);
    expect(p.rawModelExcerpt).toBeUndefined();
    expect(p.excerptResolution).toMatchObject({ status: "VERBATIM_UNIQUE", sourceKey: "operative", charStart: OP.indexOf(FULL), charEnd: OP.indexOf(FULL) + FULL.length, absCharStart: node.charStart + OP.indexOf(FULL) });
    expect(n.diagnostics.filter((d) => d.message.startsWith("PROVENANCE"))).toEqual([]);
    expect(n.rules[0]!.sufficiency).toBe("COMPLETE");
  });
  it("elided excerpt: authoritative excerpt becomes the exact source substring, the model's text survives as rawModelExcerpt, a DIAGNOSTIC records the binding, sufficiency stays COMPLETE", () => {
    const n = normalize(rule(ELIDED));
    const p = n.rules[0]!.conditions[0]!.provenance!;
    expect(p.excerpt).toBe(FULL);
    expect(p.rawModelExcerpt).toBe(ELIDED);
    expect(p.excerptResolution).toMatchObject({ status: "SOURCE_BOUND_ELIDED", segments: 2, sourceKey: "operative", sourceKind: "OPERATIVE", charStart: OP.indexOf(FULL), charEnd: OP.indexOf(FULL) + FULL.length });
    const diag = n.diagnostics.find((d) => d.message.startsWith("PROVENANCE_EXCERPT_SOURCE_BOUND"))!;
    expect(diag).toBeDefined();
    expect(diag.kind).toBe("DIAGNOSTIC");
    expect(diag.scope).toBe("rule[r1].condition[0]");
    expect(n.rules[0]!.sufficiency).toBe("COMPLETE");
    expect(n.rules[0]!.sufficiencyReasons.some((x) => x.startsWith("PROVENANCE"))).toBe(false);
    // the rule's own excerpt (exact) and the dependency's provenance (no excerpt) are untouched
    expect(n.rules[0]!.provenance!.excerptResolution!.status).toBe("VERBATIM_UNIQUE");
    expect(n.rules[0]!.sourceDependencies![0]!.provenance!.excerpt).toBeNull();
    expect(n.rules[0]!.sourceDependencies![0]!.provenance!.excerptResolution).toBeUndefined();
  });
  it("unresolvable excerpt (invented words, ambiguous or reversed anchors): excerpt is null, the raw text is audit-only, the rule is limited with PROVENANCE_EXCERPT_UNRESOLVED before verification", () => {
    for (const bad of ["provided that the Company shall be in compliance … on the first day of each fiscal year", "as if such Indebtedness had been incurred … provided that the Company shall be in compliance", "the Company shall comply with everything always"]) {
      const n = normalize(rule(bad));
      const p = n.rules[0]!.conditions[0]!.provenance!;
      expect(p.excerpt, bad).toBeNull();
      expect(p.rawModelExcerpt).toBe(bad);
      expect(p.excerptResolution!.status).toBe("UNRESOLVED");
      expect(n.rules[0]!.sufficiency).not.toBe("COMPLETE");
      expect(n.rules[0]!.sufficiencyReasons.some((x) => x.startsWith("PROVENANCE_EXCERPT_UNRESOLVED: rule[r1].condition[0]"))).toBe(true);
    }
    expect(normalize(rule("as if such Indebtedness had been incurred … provided that the Company shall be in compliance")).rules[0]!.conditions[0]!.provenance!.excerptResolution!.reason).toBe("REVERSED_ANCHORS");
  });
  it("raw model output is never altered: the wire submission still carries the elided excerpt after normalization", () => {
    const wire = SubmitCompilationSchema.parse({ rules: [rule(ELIDED)], definitions: [], sharedCapacities: [], irExtensionCandidates: [], overallNotes: [] });
    const before = JSON.stringify(wire);
    normalizeSubmission(wire, input());
    expect(JSON.stringify(wire)).toBe(before);
    expect((wire.rules[0]!.conditions[0] as { excerpt: string }).excerpt).toBe(ELIDED);
  });
});

describe("verifier: qualitative grounding v4 is not relaxed - an UNRESOLVED binding is FABRICATED, a bound excerpt is GROUNDED by the real source", () => {
  const inventory = { items: [{ inventoryItemId: "inv-item:a" }] };
  it("bound elided excerpt: GROUNDED against the real operative text (the exact substring locates); the model's raw text is irrelevant to the verdict", () => {
    const n = normalize(rule(ELIDED));
    const audit = auditQualitativeLineage({ rules: n.rules, definitions: [], frozenInventory: inventory, sourceTexts: [OP] });
    expect(audit.version).toBe("qualitative-grounding.v4");
    expect(audit.units[0]!.verdict).toBe("GROUNDED");
    expect(audit.units[0]!.ungrounded).toEqual([]);
    expect(audit.materialUngrounded).toBe(0);
  });
  it("unresolved excerpt: FABRICATED (MATERIAL) even though the unit cites a known inventory item - the raw model text never rescues it; the reason names the binding failure", () => {
    const n = normalize(rule("the Company shall comply with everything always"));
    const audit = auditQualitativeLineage({ rules: n.rules, definitions: [], frozenInventory: inventory, sourceTexts: [OP] });
    const u = audit.units[0]!;
    expect(u.verdict).toBe("FABRICATED");
    expect(u.ungrounded.map((x) => [x.field, x.verdict])).toEqual([["conditions[0]", "FABRICATED"]]);
    expect(u.ungrounded[0]!.reason).toContain("could not bind the model's excerpt to a source span: NOT_IN_SOURCE");
    const findings = qualitativeGroundingFindings(audit, { companyId: "c", instrumentKey: "i", sourceDocumentId: TEST_DOCUMENT_ID, candidateRef: "cand:9.2(a)" });
    expect(findings.map((f) => [f.findingType, f.severity])).toEqual([["QUALITATIVE_ASSERTION_UNGROUNDED", "MATERIAL"]]);
  });
  it("a hand-built (pre-binding) provenance with an unlocatable excerpt is still FABRICATED exactly as before (v3 behaviour preserved)", () => {
    const n = normalize(rule(FULL));
    const legacy = { ...n.rules[0]!, conditions: [{ ...n.rules[0]!.conditions[0]!, provenance: { documentId: TEST_DOCUMENT_ID, sourceNodeKey: null, sourceCitation: "9.2(a)", excerpt: "words the source never says anywhere" } }] };
    expect(auditQualitativeLineage({ rules: [legacy], definitions: [], frozenInventory: inventory, sourceTexts: [OP] }).units[0]!.verdict).toBe("FABRICATED");
  });
});

describe("projection, identity and determinism", () => {
  it("the Layer-2 projection carries the authoritative excerpt and its resolution but never the raw model excerpt; projection v4, verifier v5, compiler v8", () => {
    const n = normalize(rule(ELIDED));
    const proj = buildSemanticVerificationProjection({ rules: n.rules, definitions: [], sharedCapacities: [] });
    const text = JSON.stringify(proj);
    expect(text).toContain(FULL);
    expect(text).not.toContain("rawModelExcerpt");
    expect(text).not.toContain("fiscal quarter… as if");
    expect(text).toContain('"status":"SOURCE_BOUND_ELIDED"');
    expect(SEMANTIC_VERIFICATION_PROJECTION_VERSION).toBe("phase-3c-verification-projection.v4");
    expect(SEMANTIC_VERIFIER_ALGORITHM_VERSION).toBe("phase-3c-semantic-verifier.v5");
    expect(SEMANTIC_COMPILER_ALGORITHM_VERSION).toBe("semantic-accountability-compiler.v8");
    expect(QUALITATIVE_GROUNDING_VERSION).toBe("qualitative-grounding.v4");
  });
  it("determinism: the same inputs give the same status, source identity, span, excerpt, diagnostics and projection hash across runs", () => {
    const runs = [0, 1, 2].map(() => { const n = normalize(rule(ELIDED)); return { p: n.rules[0]!.conditions[0]!.provenance, d: n.diagnostics.map((x) => x.message), h: computeSemanticVerificationProjectionHash(buildSemanticVerificationProjection({ rules: n.rules, definitions: [], sharedCapacities: [] })) }; });
    expect(JSON.stringify(runs[1])).toBe(JSON.stringify(runs[0]));
    expect(JSON.stringify(runs[2])).toBe(JSON.stringify(runs[0]));
    const a = resolveProvenanceExcerpt(ELIDED, [src("operative", OP)]), b = resolveProvenanceExcerpt(ELIDED, [src("operative", OP)]);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

// ---- the frozen §7.2(c) regression (immutable final live evidence, read only) -------------------------------------------
describe("§7.2(c) regression: the final live defect class, replayed through the generic contract without touching the evidence", () => {
  const EV = "docs/phase-3-live-validation/7.2c-final-source-authority";
  const identity = JSON.parse(fs.readFileSync(`${EV}/01-target-identity.json`, "utf8")).identity as { operativeSourceText: string; operativeSourceSha256: string; documentId: string; normalizedSourceRef: string; anchor: { charStart: number } };
  const compilation = JSON.parse(fs.readFileSync(`${EV}/06-compilation.json`, "utf8")) as { rawModelOutput: { rules: { conditions: { excerpt: string }[]; excerpt: string }[] }; rules: { conditions: { provenance: { excerpt: string } }[] }[] };
  const rawExcerpt = compilation.rawModelOutput.rules[0]!.conditions[0]!.excerpt;
  const EXPECTED = "provided that the Parent Borrower shall be in compliance, on a pro forma basis after giving effect to the incurrence of such Indebtedness, with the financial covenants contained in Section 7.1 recomputed as at the last day of the most recently ended fiscal quarter of the Parent Borrower and its Subsidiaries for which financial statements are available as if such Indebtedness had been incurred on the first day of each relevant period for testing such compliance";
  it("the frozen raw model excerpt elides the source with '...'; the persisted artifact carried it verbatim into provenance (the recorded MATERIAL finding); the evidence is byte-stable", () => {
    expect(rawExcerpt).toContain("most recently ended fiscal quarter... as if such Indebtedness");
    expect(compilation.rules[0]!.conditions[0]!.provenance.excerpt).toBe(rawExcerpt);
    expect(sha(identity.operativeSourceText)).toBe(identity.operativeSourceSha256);
    expect(identity.operativeSourceText).toContain("of the Parent Borrower and its Subsidiaries for which financial\nstatements are available");
  });
  it("the generic resolver binds the raw excerpt to exactly one source span whose whitespace-normalized text is the expected full quotation, with exact offsets", () => {
    const op = identity.operativeSourceText;
    const r = resolveProvenanceExcerpt(rawExcerpt, [{ sourceKey: "operative", kind: "OPERATIVE", documentId: identity.documentId, sectionRef: identity.normalizedSourceRef, text: op, absCharStart: identity.anchor.charStart }]);
    expect(r.resolution.status).toBe("SOURCE_BOUND_ELIDED");
    expect(r.resolution.reason).toBeNull();
    expect(r.authoritativeExcerpt!.replace(/\s+/g, " ")).toBe(EXPECTED);
    expect(op.slice(r.resolution.charStart!, r.resolution.charEnd!)).toBe(r.authoritativeExcerpt);
    expect(r.resolution).toMatchObject({ segments: 2, sourceKey: "operative", sourceDocumentId: identity.documentId, sourceSectionRef: "7.2(c)", charStart: op.indexOf("provided that"), charEnd: op.indexOf("for testing such compliance") + "for testing such compliance".length, absCharStart: identity.anchor.charStart + op.indexOf("provided that") });
    expect(r.authoritativeExcerpt).toContain("financial\nstatements are available"); // the ORIGINAL line wrap, never a reflowed quotation
    expect(JSON.stringify(resolveProvenanceExcerpt(rawExcerpt, [{ sourceKey: "operative", kind: "OPERATIVE", documentId: identity.documentId, sectionRef: "7.2(c)", text: op, absCharStart: identity.anchor.charStart }]))).toBe(JSON.stringify(r));
  });
  it("through the normalizer the frozen raw submission yields source-bound authoritative provenance (raw text retained), and qualitative grounding v4 finds the condition GROUNDED against the authenticated operative text", () => {
    const raw = JSON.parse(fs.readFileSync(`${EV}/06-compilation.json`, "utf8")).rawModelOutput;
    const op = identity.operativeSourceText;
    const n = normalizeSubmission(SubmitCompilationSchema.parse(raw), testCompilerInput({ candidateRef: "regression:7.2(c)", sourceSectionRef: "7.2(c)", operativeSourceText: op, operativeCharStart: identity.anchor.charStart, sourceDocumentId: identity.documentId }));
    const p = n.rules[0]!.conditions[0]!.provenance!;
    expect(p.excerpt!.replace(/\s+/g, " ")).toBe(EXPECTED);
    expect(p.rawModelExcerpt).toBe(rawExcerpt);
    expect(p.excerptResolution!.status).toBe("SOURCE_BOUND_ELIDED");
    expect(n.diagnostics.some((d) => d.message.startsWith("PROVENANCE_EXCERPT_SOURCE_BOUND: rule[r1].condition[0]"))).toBe(true);
    expect(n.rules[0]!.sufficiencyReasons.some((x) => x.startsWith("PROVENANCE"))).toBe(false);
    const audit = auditQualitativeLineage({ rules: n.rules, definitions: n.definitions, frozenInventory: { items: [] }, sourceTexts: [op] });
    expect(audit.units[0]!.verdict).toBe("GROUNDED");
    expect(audit.units[0]!.ungrounded).toEqual([]);
    // the persisted evidence is untouched by this replay
    expect(sha(fs.readFileSync(`${EV}/06-compilation.json`, "utf8"))).toBe(sha(JSON.stringify(JSON.parse(fs.readFileSync(`${EV}/06-compilation.json`, "utf8")), null, 2)));
  });
});
