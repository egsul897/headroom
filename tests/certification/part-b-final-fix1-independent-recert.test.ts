/**
 * HEADROOM FINAL 3F.1 CLOSURE - Part B INDEPENDENT recertification of FIX-1
 * (structural heading, lib/contract-model/compiler/stage-structure.ts).
 *
 * ===========================================================================
 * UPDATED IN PLACE - Phase 3F.1 HUMAN ARCHITECTURE DECISION (Workstream
 * OPEN-1), per that phase's own explicit charter for this exact file: "your
 * fix must make it either genuinely pass, OR you must update it in place
 * with a clear comment explaining why the new architecture correctly routes
 * that case to UNCERTAIN/review instead of a binary accept/reject."
 * ===========================================================================
 *
 * ORIGINAL SCOPE (Part 1-5 below, prose otherwise unchanged from the
 * original independent auditor's own write-up): FIX-1 removed
 * `NOISE_DISCOUNTED` and replaced it with `titleBodySeparationHolds` - a
 * candidate-local, purely POST-match signal inspecting what follows a
 * candidate's own matched span. Lowercase there => reject; anything else
 * (uppercase, digit, opening quote/bracket, a recognized heading keyword, or
 * end-of-document) => treated as "genuine, if weak, evidence real content
 * starts here." This auditor proved that assumption false whenever an
 * in-text citation is itself grammatically well-formed - terminates its own
 * sentence with a real period and is followed by an ordinary NEW sentence
 * (capitalized, exactly like a real heading's own body) - and that the
 * "bounded, single-hop wrap-tolerance mechanism" added to rescue wrapped
 * titles opened its own, narrower false-positive path (Case C vs Case D).
 * Part 4 additionally found a real-heading false negative (a "Term. means
 * ..." definitions convention wrongly vetoed by the same lowercase check).
 *
 * ORIGINAL DISPOSITION: STILL_OPEN.
 *
 * WHY THE NEW ARCHITECTURE IS THE CORRECT RESOLUTION, NOT A SIXTH HEURISTIC
 * PATCH: this auditor's own Part 2 proved, directly and mechanistically, that
 * NO purely typographic signal can distinguish "Section 6.09 Limitation on
 * Restricted Payments. This citation refers to..." (an in-text citation) from
 * "Section 6.09 Limitation on Restricted Payments. The Company shall not..."
 * (a real heading) - both terminate with a real period and are both followed
 * by an ordinary capitalized sentence; the shapes are BYTE-IDENTICAL in every
 * typographic dimension this file's own regex/positional-signal machinery can
 * observe. The Phase 3F.1 Human Architecture Decision's mandate is exactly
 * this: STOP trying to make deterministic heuristics alone resolve every
 * case. Every one of this auditor's own Part 2/3 falsifying constructions is
 * now, correctly, triaged AMBIGUOUS by `parseDocumentStructureWithTriage`
 * (lib/contract-model/compiler/stage-structure.ts) rather than silently
 * accepted - never fabricating a structural boundary - and routed to the new
 * bounded structural-ambiguity classifier
 * (structural-ambiguity-classifier.ts / structural-ambiguity-resolution.ts)
 * for actual resolution. Part 4's real-heading false negative is fixed more
 * directly: the new triage procedure's PARAGRAPH_BREAK signal alone already
 * resolves it deterministically (CONFIDENT_HEADING, no classifier call
 * needed) once the lowercase-veto is no longer a hard, universal gate - see
 * each Part below for the exact new assertions.
 *
 * The tests below are REWRITTEN (not merely re-labeled) to exercise the new
 * pipeline (`parseDocumentStructureWithTriage` + `resolveStructuralAmbiguity`)
 * against every one of this auditor's own original fixture constructions,
 * left otherwise unchanged so the before/after comparison is exact. Per the
 * governing spec, "this case went to AMBIGUOUS/UNCERTAIN" is the CORRECT,
 * REQUIRED outcome for a case genuinely unresolvable by typography alone -
 * it is never itself treated as a failure; only a FABRICATED confident
 * answer (a false accept or a false reject) or material rank-stack
 * corruption is.
 */
import { describe, expect, it } from "vitest";
import type { ZodType } from "zod";
import { parseDocumentStructure, parseDocumentStructureWithTriage } from "../../lib/contract-model/compiler/stage-structure";
import { resolveStructuralAmbiguity } from "../../lib/contract-model/compiler/structural-ambiguity-resolution";
import { InMemoryStructuralAmbiguityCache } from "../../lib/contract-model/compiler/structural-ambiguity-classifier";
import type { StageCaller } from "../../lib/contract-model/compiler/llm-caller";
import type { AnalyzerCallTelemetry } from "../../lib/contract-model/analyzer/telemetry";

function parse(text: string, documentId = "doc") {
  const nodes = parseDocumentStructure({ documentId, label: documentId, text });
  return {
    nodes,
    sections: nodes.filter((n) => n.nodeType === "SECTION").map((n) => n.sectionRef),
    articles: nodes.filter((n) => n.nodeType === "ARTICLE").map((n) => n.sectionRef),
  };
}

const IDENTITY = { companyId: "co-1", instrumentKey: "inst-1", sourceDocumentId: "doc-1" };

/**
 * A SCRIPTED caller playing an accurate classifier for THIS test file's own
 * known-ground-truth constructions - the same "scripted-semantic tier"
 * discipline tests/contract-model/condition-suspicion-classifier.test.ts
 * already established, never a claim about real-model accuracy (this
 * sandbox has no functioning AI_GATEWAY_API_KEY/ANTHROPIC_API_KEY - see
 * tests/contract-model/structural-ambiguity-resolution.test.ts's own
 * dedicated coverage of the REAL no-credential SyntheticStageCaller
 * fail-safe path). `isRealHeading` decides the verdict for the ONE
 * AMBIGUOUS candidate each fixture below is built around.
 */
function scriptedClassifier(isRealHeading: (userContent: string) => boolean): StageCaller {
  return {
    providerName: "test-provider",
    model: "test-model",
    isSynthetic: false,
    async call<T>(schema: ZodType<T>, _stage: string, _systemPrompt: string, userContent: string): Promise<T> {
      return schema.parse({ verdict: isRealHeading(userContent) ? "LIKELY_HEADING" : "LIKELY_PROSE_REFERENCE", reason: "scripted", relatedSourceSpans: [] });
    },
    lastTelemetry: (): AnalyzerCallTelemetry | null => null,
  };
}

/** Runs the FULL new pipeline: deterministic triage, then classifier resolution for whatever it marks AMBIGUOUS. */
async function parseWithNewArchitecture(text: string, documentId: string, isRealHeading: (userContent: string) => boolean) {
  const doc = { documentId, label: documentId, text };
  const triageResult = parseDocumentStructureWithTriage(doc);
  const { nodes, resolutions, reviewSignals } = await resolveStructuralAmbiguity(doc, triageResult.ambiguousCandidates, IDENTITY, scriptedClassifier(isRealHeading), new InMemoryStructuralAmbiguityCache());
  return {
    nodes,
    sections: nodes.filter((n) => n.nodeType === "SECTION").map((n) => n.sectionRef),
    ambiguousCandidates: triageResult.ambiguousCandidates,
    resolutions,
    reviewSignals,
  };
}

// =============================================================================
// PART 1 - TRUE HEADING, fresh constructions - confirm the fix's own claimed
// wins hold up (no regression introduced by this audit's own probing)
// =============================================================================
describe("1. TRUE HEADING - fresh constructions confirm no regression", () => {
  it("footnote-adjacent true heading, fresh numbers/wording, survives", () => {
    const text =
      'Section 3.11 Insurance. The Borrower shall maintain insurance coverage as required under the definition of "Required Insurance Amount")14\n\n' +
      "Section 3.12 Environmental Compliance. The Borrower shall comply with Environmental Laws in all material respects.";
    const { sections } = parse(text, "true-fresh-footnote-adjacent");
    expect(sections).toEqual(expect.arrayContaining(["3.11", "3.12"]));
  });

  it("true heading immediately followed by OCR-style extra whitespace/tabs of its own (not merely preceding it) survives", () => {
    const text = "Section 4.01 Indebtedness .   \t \n\n   No Loan Party shall incur Indebtedness except Permitted Indebtedness.\n\nSection 4.02 Liens. Real text.";
    const { sections } = parse(text, "true-fresh-ocr-artifact-after-own-title");
    expect(sections).toEqual(expect.arrayContaining(["4.01", "4.02"]));
  });

  it("adjacent ARTICLE/lowercase-keyword SECTION (signal C shape), fresh construction, survives with correct parentage", () => {
    const text = "ARTICLE VII EVENTS OF DEFAULT\nsection 7.01 Payment Default. Real text describing payment default.\n\nSection 7.02 Covenant Default. Real text.";
    const { nodes } = parse(text, "true-fresh-adjacent-article-section");
    expect(nodes.find((n) => n.sectionRef === "7.01")?.parentSectionRef).toBe("VII");
    expect(nodes.find((n) => n.sectionRef === "7.02")?.parentSectionRef).toBe("VII");
  });

  it("lower-case real heading (ARTICLE and SECTION keywords both lowercase, real title) survives with correct parentage", () => {
    const text = "article ix miscellaneous\n\nsection 9.01 counterparts. this agreement may be executed in counterparts.\n\nSection 9.02 Notices. Real text.";
    const { nodes } = parse(text, "true-fresh-lowercase-real-heading");
    const article = nodes.find((n) => n.nodeType === "ARTICLE");
    expect(article?.sectionRef).toBe("ix");
    expect(nodes.find((n) => n.sectionRef === "9.01")?.parentSectionRef).toBe("ix");
  });

  it("numerically-next prose citation, fresh construction: real preceding section retained, false-numbered continuation correctly rejected", () => {
    const text =
      "Section 5.01 Financial Covenants. Leverage Ratio shall not exceed 4.00 to 1.00 as further described in the succeeding provision immediately below\n" +
      "Section 5.02 Reporting. is discussed only as an aside within this same paragraph and creates no independent heading of its own at this point in the text.\n\n" +
      "(a) Within 45 days.";
    const { sections, nodes } = parse(text, "true-fresh-numerically-next-prose-citation");
    expect(sections).toEqual(["5.01"]);
    const clauseA = nodes.find((n) => n.sectionRef.endsWith("(a)"));
    expect(clauseA?.parentSectionRef).toBe("5.01");
  });
});

// =============================================================================
// PART 2 - UPDATED: ordinary, grammatically well-formed citations
// (capitalized/digit-led new sentence, never a lowercase run-on) are exactly
// the shape the new architecture's own module-level doc-comment names as
// GENUINELY, PROVABLY unresolvable by typography alone (the candidate's own
// matched text is byte-identical, in every dimension `stage-structure.ts`'s
// regex/positional-signal machinery can observe, to a real heading whose
// body starts an ordinary new sentence). `parseDocumentStructure` alone
// (deterministic-only, unchanged) is therefore NOT the right tool to resolve
// these - and correctly does not silently fabricate a confident answer any
// more: every case below is triaged AMBIGUOUS, never CONFIDENT_HEADING,
// under `parseDocumentStructureWithTriage`. The bounded classifier then
// resolves each one correctly (LIKELY_PROSE_REFERENCE, verified below with a
// scripted, known-ground-truth caller - never a real-model accuracy claim in
// this sandbox), and the fail-closed default (no classifier connected) keeps
// them safely excluded rather than fabricated.
// =============================================================================
describe("2. RESOLVED BY THE NEW ARCHITECTURE - well-punctuated citation followed by an ordinary NEW sentence is triaged AMBIGUOUS (never a confident false accept), and the classifier correctly resolves it", () => {
  it("citation followed by a completely ordinary capitalized new sentence (no lowercase run-on, no footnote, no noise at all)", async () => {
    const text =
      "ARTICLE VI COVENANTS\n\n" +
      "Section 6.08 Restricted Payments. The Borrower shall not make any Restricted Payment except as otherwise agreed.\n" +
      "Section 6.09 Limitation on Restricted Payments. This citation refers to a limitation described in the Credit Agreement and does not itself constitute an independent covenant of this Agreement.\n" +
      "(a) Permitted Liens existing on the Closing Date.\n\n" +
      "Section 6.10 Liens. The Borrower shall not create Liens.";
    // Fail-closed default (no classifier consulted): 6.09 is never fabricated as a confident heading.
    const deterministicOnly = parseDocumentStructureWithTriage({ documentId: "falsify-capitalized-ordinary-continuation", label: "d", text });
    expect(deterministicOnly.nodes.some((n) => n.sectionRef === "6.09")).toBe(false);
    expect(deterministicOnly.ambiguousCandidates.some((c) => c.candidateNumber === "6.09")).toBe(true);
    // The classifier correctly resolves it (scripted, known-ground-truth caller).
    const resolved = await parseWithNewArchitecture(text, "falsify-capitalized-ordinary-continuation-resolved", (userContent) => !userContent.includes("This citation refers"));
    expect(resolved.sections).not.toContain("6.09");
    // Zero material rank-stack corruption: the real clause (a) stays correctly parented to 6.08.
    const clauseA = resolved.nodes.find((n) => n.sectionRef.endsWith("(a)"));
    expect(clauseA?.parentSectionRef).toBe("6.08");
  });

  it("citation followed by a quoted defined term (opening quote is itself treated as self-contained, per design) - correctly triaged AMBIGUOUS and resolved, zero noise/footnote involvement", async () => {
    const text =
      "ARTICLE VI COVENANTS\n\n" +
      "Section 6.08 Restricted Payments. The obligations remain subject to normal terms.\n" +
      'Section 6.09 Limitation on Restricted Payments. "Indebtedness" shall have the meaning given to it elsewhere in this instrument for purposes of this cross-reference only.\n' +
      "(a) Permitted Liens existing on the Closing Date.\n\n" +
      "Section 6.10 Liens. The Borrower shall not create Liens.";
    const deterministicOnly = parseDocumentStructureWithTriage({ documentId: "falsify-quote-after-citation", label: "d", text });
    expect(deterministicOnly.nodes.some((n) => n.sectionRef === "6.09")).toBe(false);
    const resolved = await parseWithNewArchitecture(text, "falsify-quote-after-citation-resolved", (userContent) => !userContent.includes('"Indebtedness" shall have the meaning'));
    expect(resolved.nodes.some((n) => n.sectionRef === "6.09")).toBe(false);
    const clauseA = resolved.nodes.find((n) => n.sectionRef.endsWith("(a)"));
    expect(clauseA?.parentSectionRef).toBe("6.08");
  });

  it("citation followed by an ALL-CAPS defined-term acronym (GAAP) starting the next sentence - correctly triaged AMBIGUOUS and resolved", async () => {
    const text =
      "ARTICLE VI COVENANTS\n\n" +
      "Section 6.08 Restricted Payments. The obligations remain subject to normal terms.\n" +
      "Section 6.09 Limitation on Restricted Payments. GAAP principles shall govern the calculation of any amount referenced in this cross-reference for accounting purposes.\n" +
      "(a) Permitted Liens existing on the Closing Date.\n\n" +
      "Section 6.10 Liens. The Borrower shall not create Liens.";
    const deterministicOnly = parseDocumentStructureWithTriage({ documentId: "falsify-allcaps-acronym-after-citation", label: "d", text });
    expect(deterministicOnly.nodes.some((n) => n.sectionRef === "6.09")).toBe(false);
    const resolved = await parseWithNewArchitecture(text, "falsify-allcaps-acronym-after-citation-resolved", (userContent) => !userContent.includes("GAAP principles shall govern"));
    expect(resolved.nodes.some((n) => n.sectionRef === "6.09")).toBe(false);
    const clauseA = resolved.nodes.find((n) => n.sectionRef.endsWith("(a)"));
    expect(clauseA?.parentSectionRef).toBe("6.08");
  });

  it("citation followed by a digit-led ordinary sentence (a percentage, not a list marker) - correctly triaged AMBIGUOUS and resolved", async () => {
    const text =
      "ARTICLE VI COVENANTS\n\n" +
      "Section 6.08 Restricted Payments. The obligations remain subject to normal terms.\n" +
      "Section 6.09 Limitation on Restricted Payments. 50% of any Excess Cash Flow shall be applied as described elsewhere in this instrument for illustrative purposes only in this same paragraph.\n" +
      "(a) Permitted Liens existing on the Closing Date.\n\n" +
      "Section 6.10 Liens. The Borrower shall not create Liens.";
    const deterministicOnly = parseDocumentStructureWithTriage({ documentId: "falsify-digit-led-sentence-after-citation", label: "d", text });
    expect(deterministicOnly.nodes.some((n) => n.sectionRef === "6.09")).toBe(false);
    const resolved = await parseWithNewArchitecture(text, "falsify-digit-led-sentence-after-citation-resolved", (userContent) => !userContent.includes("50% of any Excess Cash Flow"));
    expect(resolved.nodes.some((n) => n.sectionRef === "6.09")).toBe(false);
    const clauseA = resolved.nodes.find((n) => n.sectionRef.endsWith("(a)"));
    expect(clauseA?.parentSectionRef).toBe("6.08");
  });

  it("a completely UNRELATED, well-formed second sentence (not merely a citation gloss) - correctly triaged AMBIGUOUS (never a confident accept) and resolved, no real content swallowed between the citation's own two lines", async () => {
    // Named shape: "two unrelated short lines that happen to look like they
    // could be wrapped into one heading-shaped span" - here the wrap is a
    // real title fragment ("Waiver of") glued to a wholly unrelated next
    // sentence about notice delivery, which has nothing to do with waiver.
    const text =
      "ARTICLE IX MISCELLANEOUS\n\n" +
      "Section 9.04 Assignment. Real prior body text ends here properly.\n\n" +
      "Section 9.05 Waiver of\n" +
      "Notices required under this arrangement shall be delivered in writing to the addresses set forth in Schedule 1 hereto and shall be effective upon actual receipt by the intended recipient party in all cases.\n\n" +
      "Section 9.06 Governing Law. Real next body text.";
    const deterministicOnly = parseDocumentStructureWithTriage({ documentId: "falsify-two-unrelated-lines-wrap", label: "d", text });
    expect(deterministicOnly.nodes.some((n) => n.sectionRef === "9.05")).toBe(false);
    expect(deterministicOnly.ambiguousCandidates.some((c) => c.candidateNumber === "9.05")).toBe(true);
    const resolved = await parseWithNewArchitecture(text, "falsify-two-unrelated-lines-wrap-resolved", (userContent) => !userContent.includes("Notices required under this arrangement"));
    expect(resolved.nodes.some((n) => n.sectionRef === "9.05")).toBe(false);
  });
});

// =============================================================================
// PART 3 - UPDATED: THE OLD WRAP-TOLERANCE MECHANISM'S OWN FALSE-POSITIVE
// PATH (`looksLikeNewContentStartAfterPossibleTitleWrap`, the "bounded,
// single-hop" rescue this auditor's Case C/D pair proved unsound) NO LONGER
// EXISTS in the new architecture - it is not repaired, it is REMOVED
// entirely (see stage-structure.ts's own `resolveStructuralSeam`/
// `StructuralSeamValidation` doc-comments): a candidate whose own matched
// text does not reach a validated seam WITHOUT any hop or guess is now
// honestly routed AMBIGUOUS, never resolved by hopping forward into
// uncertain territory. Case D - the auditor's own minimal, mechanistic proof
// that identical text, merely re-wrapped, used to flip a correct rejection
// into a false acceptance - now triages IDENTICALLY-SAFELY to Case C: never
// a confident false accept, whether wrapped or not.
// =============================================================================
describe("3. RESOLVED BY THE NEW ARCHITECTURE - the old wrap-tolerance false-positive path is removed, not patched: identical text, differently line-wrapped, no longer flips the verdict", () => {
  it("Case C (no wrap): the classic lowercase-run-on false citation is still correctly, CONFIDENTLY rejected - baseline sanity check, unaffected by the new architecture", () => {
    const text =
      "ARTICLE III REPRESENTATIONS\n\n" +
      "Section 3.08 Litigation. Real prior body text ends properly.\n" +
      "Section 3.09 Limitation on Restricted Payments. is only a cross-reference embedded in ordinary prose describing another part of this instrument and creates no boundary here at all.\n" +
      "(a) Real clause that belongs to 3.08.\n\n" +
      "Section 3.10 Compliance. Real next body text.";
    const { nodes } = parse(text, "wrap-caseC-no-wrap-baseline");
    expect(nodes.some((n) => n.sectionRef === "3.09")).toBe(false);
    const clauseA = nodes.find((n) => n.sectionRef.endsWith("(a)"));
    expect(clauseA?.parentSectionRef).toBe("3.08");
    // Confidently resolved even by the new triage - no classifier call needed at all.
    const triaged = parseDocumentStructureWithTriage({ documentId: "wrap-caseC-triage-check", label: "d", text });
    expect(triaged.ambiguousCandidates.some((c) => c.candidateNumber === "3.09")).toBe(false);
  });

  it("Case D (identical text, ONE newline inserted before the wrapped remainder of the fake title): the exact defect this auditor found is CLOSED - 3.09 is triaged AMBIGUOUS, never confidently accepted, deterministically OR after resolution", async () => {
    // The ONLY difference from Case C: "Limitation on" and "Restricted
    // Payments." are split across a line break. The crude line-anchored
    // fallback pattern's own match for THIS candidate now stops at "Limitation
    // on" (the physical line break), reaching neither its own terminal
    // punctuation nor an internal one - `resolveStructuralSeam` classifies
    // this INCOMPLETE_NO_TERMINAL and routes straight to AMBIGUOUS, never
    // attempting the old hop-forward guess that used to (wrongly) find the
    // real giveaway's ABSENCE by looking in the wrong place.
    const text =
      "ARTICLE III REPRESENTATIONS\n\n" +
      "Section 3.08 Litigation. Real prior body text ends properly.\n" +
      "Section 3.09 Limitation on\n" +
      "Restricted Payments. is only a cross-reference embedded in ordinary prose describing another part of this instrument and creates no boundary here at all.\n" +
      "(a) Real clause that belongs to 3.08.\n\n" +
      "Section 3.10 Compliance. Real next body text.";
    const deterministicOnly = parseDocumentStructureWithTriage({ documentId: "wrap-caseD-with-wrap-flips-verdict", label: "d", text });
    expect(deterministicOnly.nodes.some((n) => n.sectionRef === "3.09")).toBe(false); // fail-closed: never fabricated, unlike the original defect
    expect(deterministicOnly.ambiguousCandidates.some((c) => c.candidateNumber === "3.09")).toBe(true);
    const resolved = await parseWithNewArchitecture(text, "wrap-caseD-resolved", (userContent) => !userContent.includes("is only a cross-reference"));
    expect(resolved.nodes.some((n) => n.sectionRef === "3.09")).toBe(false);
    const clauseA = resolved.nodes.find((n) => n.sectionRef.endsWith("(a)"));
    expect(clauseA?.parentSectionRef).toBe("3.08"); // correctly parented, exactly as Case C - the wrap no longer changes the outcome
  });

  it("unrelated footnote + wrapped citation (named required shape): correctly triaged AMBIGUOUS (never a confident accept) and resolved", async () => {
    const text =
      "ARTICLE VI COVENANTS\n\n" +
      'Section 6.08 Restricted Payments. The Borrower shall not make any Restricted Payment except as permitted under the definition of "Permitted Tax Distribution")9\n' +
      "Section 6.09 Limitation on\n" +
      "Restricted Payments is only an illustrative cross-reference embedded in the same paragraph of ordinary body prose and creates no real section break here at all, regardless of how it wraps across this physical line boundary.\n" +
      "(a) Permitted Liens existing on the Closing Date.\n\n" +
      "Section 6.10 Liens. The Borrower shall not create Liens.";
    const deterministicOnly = parseDocumentStructureWithTriage({ documentId: "wrap-unrelated-footnote-plus-wrapped-citation", label: "d", text });
    expect(deterministicOnly.nodes.some((n) => n.sectionRef === "6.09")).toBe(false);
    const resolved = await parseWithNewArchitecture(text, "wrap-unrelated-footnote-plus-wrapped-citation-resolved", (userContent) => !userContent.includes("is only an illustrative cross-reference"));
    expect(resolved.nodes.some((n) => n.sectionRef === "6.09")).toBe(false);
    const clauseA = resolved.nodes.find((n) => n.sectionRef.endsWith("(a)"));
    expect(clauseA?.parentSectionRef).toBe("6.08");
  });

  it("unrelated page artifact + wrapped citation (named required shape): same composition via the page-number noise path, correctly triaged AMBIGUOUS and resolved", async () => {
    const text =
      "ARTICLE VI COVENANTS\n\n" +
      "Section 6.08 Restricted Payments. The Borrower shall not make any Restricted Payment as further described\n42\n" +
      "Section 6.09 Limitation on\n" +
      "Restricted Payments is only an illustrative cross-reference within the same paragraph and does not create a new section here at all regardless of the physical line wrap.\n" +
      "(a) Permitted Liens existing on the Closing Date.\n\n" +
      "Section 6.10 Liens. The Borrower shall not create Liens.";
    const deterministicOnly = parseDocumentStructureWithTriage({ documentId: "wrap-unrelated-page-artifact-plus-wrapped-citation", label: "d", text });
    expect(deterministicOnly.nodes.some((n) => n.sectionRef === "6.09")).toBe(false);
    const resolved = await parseWithNewArchitecture(text, "wrap-unrelated-page-artifact-plus-wrapped-citation-resolved", (userContent) => !userContent.includes("is only an illustrative cross-reference"));
    expect(resolved.nodes.some((n) => n.sectionRef === "6.09")).toBe(false);
    const clauseA = resolved.nodes.find((n) => n.sectionRef.endsWith("(a)"));
    expect(clauseA?.parentSectionRef).toBe("6.08");
  });

  it("a fake continuation that is its own complete, unpunctuated-until-line-end sentence (no internal terminal at all) is no longer laundered through just because a real heading happens to follow it - the unbounded keyword-lookahead hole is closed", async () => {
    // The exact hole this closes: `classifyContinuationShapeForTriage`'s
    // IMMEDIATE_KEYWORD recognition is now bounded to AT MOST ONE newline of
    // separation (see its own doc-comment) - a keyword found only after a
    // real paragraph break is never treated as "immediately adjacent"
    // regardless of how much fake prose was absorbed before it. This
    // candidate is instead correctly triaged AMBIGUOUS on the strength of
    // its own (genuine, but not independently sufficient) paragraph-break
    // "before" evidence, exactly as an ordinary, well-punctuated citation
    // sitting after a paragraph break would be - never a confident accept.
    const text =
      "ARTICLE III REPRESENTATIONS\n\n" +
      "Section 3.08 Litigation. Real prior body text ends properly.\n\n" +
      "Section 3.09 Limitation on Restricted Payments is only a cross-reference embedded in ordinary prose describing another part of this instrument and creates no boundary here at all.\n\n" +
      "Section 3.10 Compliance. Real next body text.";
    const deterministicOnly = parseDocumentStructureWithTriage({ documentId: "wrap-no-internal-terminal-rescued-by-following-real-heading", label: "d", text });
    expect(deterministicOnly.nodes.some((n) => n.sectionRef === "3.09")).toBe(false); // fail-closed: never fabricated, unlike the original defect
    expect(deterministicOnly.ambiguousCandidates.some((c) => c.candidateNumber === "3.09")).toBe(true);
    expect(deterministicOnly.nodes.some((n) => n.sectionRef === "3.10")).toBe(true); // the REAL next heading is completely unaffected
    const resolved = await parseWithNewArchitecture(text, "wrap-no-internal-terminal-resolved", (userContent) => !userContent.includes("is only a cross-reference"));
    expect(resolved.sections).toEqual(expect.arrayContaining(["3.08", "3.10"]));
    expect(resolved.sections).not.toContain("3.09");
  });
});

// =============================================================================
// PART 4 - UPDATED: FIXED, DETERMINISTICALLY, by the new architecture - a
// common definitions-section drafting convention ("Term. means ...",
// omitting a repeated subject) was previously vetoed as if it were the
// false-citation shape (the OLD design's hard, universal lowercase veto).
// The new triage procedure never uses a universal "lowercase => reject"
// rule: a lowercase "means"/"shall mean" continuation is its own disclosed,
// bounded signal (LOWERCASE_DEFINITIONAL - see stage-structure.ts's own
// `classifyContinuationShapeForTriage` doc-comment), and when genuine
// PARAGRAPH_BREAK evidence also precedes the candidate (as it does here),
// that is independently sufficient - the real heading is now accepted
// CONFIDENTLY, with zero classifier calls needed, fixing this false negative
// at the root rather than routing it to AMBIGUOUS.
// =============================================================================
describe("4. FIXED BY THE NEW ARCHITECTURE - 'Term. means ...' definitions convention is no longer wrongly vetoed", () => {
  it("a real definitions-style heading immediately followed by 'means' (no repeated subject), preceded by a genuine paragraph break, is now correctly accepted deterministically - zero classifier calls needed", () => {
    const text =
      "ARTICLE I DEFINITIONS\n\n" +
      "Section 1.07 Applicable Rate. Real prior definition body text ends here properly.\n\n" +
      "Section 1.08 Applicable Margin. means, with respect to any Loan, the percentage per annum set forth in the Pricing Grid attached as Schedule 1 to this Agreement, as such percentage may be adjusted from time to time.\n\n" +
      "Section 1.09 Business Day. Real next definition body text.";
    const { nodes, ambiguousCandidates, triageStats } = parseDocumentStructureWithTriage({ documentId: "false-negative-definitions-means-style", label: "d", text });
    expect(nodes.some((n) => n.sectionRef === "1.08")).toBe(true); // FIXED - the real heading no longer vanishes
    expect(ambiguousCandidates.some((c) => c.candidateNumber === "1.08")).toBe(false); // resolved CONFIDENTLY, never even routed to the classifier
    expect(triageStats.ambiguousCount).toBe(0);
    const s108 = nodes.find((n) => n.sectionRef === "1.08")!;
    const s109 = nodes.find((n) => n.sectionRef === "1.09")!;
    // 1.08's own real content is correctly owned by 1.08 itself, not bled into 1.07's span (the opposite-direction corruption the original defect produced).
    expect(text.slice(s108.charStart, s109.charStart)).toContain("Applicable Margin");
    expect(text.slice(s108.charStart, s109.charStart)).toContain("Pricing Grid");
    const s107 = nodes.find((n) => n.sectionRef === "1.07")!;
    expect(text.slice(s107.charStart, s107.charEnd)).not.toContain("Applicable Margin");
  });

  it("the same convention with WEAK preceding evidence (no paragraph break) is honestly routed AMBIGUOUS rather than guessed, and the classifier correctly resolves it", async () => {
    const text = "Section 1.07 Applicable Rate. Real prior text.\nSection 1.08 Applicable Margin. means, with respect to any Loan, the percentage set forth in the Pricing Grid.";
    const deterministicOnly = parseDocumentStructureWithTriage({ documentId: "definitions-means-weak-evidence", label: "d", text });
    expect(deterministicOnly.ambiguousCandidates.some((c) => c.candidateNumber === "1.08")).toBe(true);
    const resolved = await parseWithNewArchitecture(text, "definitions-means-weak-evidence-resolved", (userContent) => userContent.includes("means, with respect"));
    expect(resolved.nodes.some((n) => n.sectionRef === "1.08")).toBe(true);
  });
});

// =============================================================================
// PART 5 - UPDATED COMPOSITION SUMMARY: zero material rank-stack corruption
// under the new architecture, in either direction, across the whole matrix -
// neither a fail-closed-excluded AMBIGUOUS candidate nor a deterministically
// FIXED real heading ever re-parents or swallows real content incorrectly.
// =============================================================================
describe("5. COMPOSITION - zero material rank-stack corruption under the new architecture, in either direction", () => {
  it("a fail-closed-excluded AMBIGUOUS candidate never re-parents a real child clause away from its true enclosing section (over Part 2's first case)", async () => {
    const text =
      "ARTICLE VI COVENANTS\n\n" +
      "Section 6.08 Restricted Payments. The Borrower shall not make any Restricted Payment except as otherwise agreed.\n" +
      "Section 6.09 Limitation on Restricted Payments. This citation refers to a limitation described in the Credit Agreement and does not itself constitute an independent covenant of this Agreement.\n" +
      "(a) Permitted Liens existing on the Closing Date.\n" +
      "(b) Indebtedness existing on the Closing Date.\n\n" +
      "Section 6.10 Liens. The Borrower shall not create Liens.";
    const deterministicOnly = parseDocumentStructureWithTriage({ documentId: "composition-false-accept-reparents-children", label: "d", text });
    const aDet = deterministicOnly.nodes.find((n) => n.sectionRef.endsWith("(a)"));
    const bDet = deterministicOnly.nodes.find((n) => n.sectionRef.endsWith("(b)"));
    expect(aDet?.parentSectionRef).toBe("6.08"); // fail-closed default: correct, never "6.09"
    expect(bDet?.parentSectionRef).toBe("6.08");
    const resolved = await parseWithNewArchitecture(text, "composition-false-accept-resolved", (userContent) => !userContent.includes("This citation refers"));
    const a = resolved.nodes.find((n) => n.sectionRef.endsWith("(a)"));
    const b = resolved.nodes.find((n) => n.sectionRef.endsWith("(b)"));
    expect(a?.parentSectionRef).toBe("6.08");
    expect(b?.parentSectionRef).toBe("6.08");
  });

  it("the deterministically-fixed real heading (Part 4) owns its own content correctly with no cross-node bleed", () => {
    const text =
      "ARTICLE I DEFINITIONS\n\n" +
      "Section 1.07 Applicable Rate. Real prior definition body text ends here properly.\n\n" +
      "Section 1.08 Applicable Margin. means, with respect to any Loan, the percentage per annum set forth in the Pricing Grid attached as Schedule 1 to this Agreement.\n\n" +
      "Section 1.09 Business Day. Real next definition body text.";
    const { nodes } = parseDocumentStructureWithTriage({ documentId: "composition-false-negative-fixed", label: "d", text });
    const s107 = nodes.find((n) => n.sectionRef === "1.07")!;
    const s108 = nodes.find((n) => n.sectionRef === "1.08")!;
    const s109 = nodes.find((n) => n.sectionRef === "1.09")!;
    expect(s107.charEnd).toBe(s108.charStart); // 1.07 no longer swallows 1.08's content
    expect(s108.charEnd).toBe(s109.charStart);
    expect(text.slice(s108.charStart, s108.charEnd)).toContain("Applicable Margin"); // 1.08 owns its own content
  });
});

// =============================================================================
// Summary
// =============================================================================
describe("summary", () => {
  it("prints the Part B independent recertification result for FIX-1, as superseded by the Phase 3F.1 Human Architecture Decision", () => {
    // eslint-disable-next-line no-console
    console.log(
      "HEADROOM FINAL 3F.1 CLOSURE Part B independent recert of FIX-1: this auditor proved titleBodySeparationHolds's " +
        "entire discriminating power rested on 'a fake continuation is lowercase' - false whenever a citation is its own " +
        "well-punctuated sentence followed by an ordinary capitalized/digit-led new sentence, which laundered through and " +
        "corrupted the rank-stack, plus a wrap-tolerance-specific false-positive path (Case C vs Case D) and a real-heading " +
        "false negative ('Term. means ...'). Original disposition: STILL_OPEN. SUPERSEDED by the Phase 3F.1 Human " +
        "Architecture Decision (Workstream OPEN-1): every Part 2/3 falsifying construction is now triaged AMBIGUOUS by " +
        "parseDocumentStructureWithTriage (never a confident false accept, closing the defect at the root rather than " +
        "patching the heuristic further) and correctly resolved by the new bounded structural-ambiguity classifier; the " +
        "Part 4 false negative is fixed deterministically via the paragraph-break signal once the lowercase check was " +
        "demoted from a universal veto to one disclosed, bounded input among several. Zero material rank-stack corruption " +
        "in either direction (Part 5). See docs/phase-3f1-human-architecture-decision/ for the full design record.",
    );
    expect(true).toBe(true);
  });
});
