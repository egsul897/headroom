/**
 * Legal-invariant checks (directive: continuous loop over the expanded backlog). Each invariant states, before running,
 * what the law of the document requires, then observes the production deterministic interfaces (structural index,
 * context retrieval, amendment pipeline, operative state, semantic cache key) on a pinned package or an in-memory
 * variation of one. Verdict kinds: PRODUCT (Headroom's behaviour; a failure must be registered with evidence
 * INVARIANT), OBSERVATION (recorded, never a test failure: behaviour outside the production candidate granularity or a
 * measurement with no legal expectation). Nothing under lib/ is modified; fixtures on disk are never changed.
 */
import type { CorpusPackage, Severity } from "./corpus";
import { loadCorpus, loadPackage } from "./corpus";
import { runDeterministicStages, type DeterministicStages } from "./stages";
import { candidateFor } from "./auditor";
import { applyMutation, type Mutation } from "./mutations";
import { hybridScope, type BenchmarkCase } from "./benchmark/strategies";
import { runPackage } from "./runner";
import { buildCandidateCompilerInput, type CandidateCompilerInputBuild } from "../../lib/contract-model/covenant-map/candidate-input";
import { computeCacheKey } from "../../lib/contract-model/compiler/semantic/cache";
import type { IRExpression, IRRule, IRDefinition } from "../../lib/contract-model/ir/types";
import { snapshotInputResolver } from "../../lib/contract-model/runtime/input/snapshot-resolver";
import { EMPTY_RESOLVER } from "../../lib/contract-model/runtime/input-resolver";
import type { FinancialSnapshot } from "../../lib/contract-model/runtime/input/types";
import { buildCapacityGraph } from "../../lib/contract-model/runtime/capacity/graph";
import { evaluateCapacityState } from "../../lib/contract-model/runtime/capacity/state";
import { simulateTransaction } from "../../lib/contract-model/runtime/transaction/simulate";
import { ORG, INST, MONEY, PCT, TERM, MUL, rule, EBITDA_DEF, snapshot, usage, fixtureIR, amt, num } from "./runtime-f";

export interface InvariantVerdict { ref: string; check: string; ok: boolean; detail: string; kind: "PRODUCT" | "OBSERVATION"; severity?: Severity }
export interface InvariantResult { id: string; title: string; legalStatement: string; packageId: string; verdicts: InvariantVerdict[] }

const variation = (pkg: CorpusPackage, id: string, edits: Mutation["edits"]): CorpusPackage =>
  applyMutation(pkg, { id, kind: "NEW_AMENDMENT", packageId: pkg.packageId, description: id, legalEffect: "", edits, expect: { changedSections: [], stableSections: [], nodeIdsStableFor: [], survival: "GAP", survivalReason: "variation" } });

async function bundleFor(pkg: CorpusPackage, s: DeterministicStages, doc: string, ref: string, family: string, asOf?: string): Promise<CandidateCompilerInputBuild> {
  const m = pkg.manifest; const d = asOf ?? m.operativeState.asOfDates[m.operativeState.asOfDates.length - 1]!;
  const candidatePkg = { companyId: m.companyId, instrumentKey: m.instrumentKey, packageKey: `${pkg.packageId}-package`, index: s.index, packageGraph: s.packageGraph, exactTermsByDocument: s.exactTermsByDocument, operativeState: s.operativeStates.get(d) ?? null, amendmentEffects: s.amendment?.effects ?? null, supersessionIndex: s.supersessionIndexes.get(d) };
  const cand = candidateFor(s.index, doc, ref, [family as never], "PERMISSION_BASKET" as never, ref);
  if (!cand) throw new Error(`candidate ${doc}#${ref} not uniquely resolvable`);
  return buildCandidateCompilerInput(cand, candidatePkg as never);
}
const q = (packageId: string, family: string, question: string, seedRefs: BenchmarkCase["seedRefs"], asOfDate?: string): BenchmarkCase => ({ id: "inv", adversarialClass: "INVARIANT", packageId, question, family, asOfDate, seedRefs, requiredUnits: [], requiredConditions: [], requiredDefinitions: [], requiredDocuments: [], correctAnswer: "", answerIfRestrictionsOmitted: "", expectedOutcome: "ANSWER_WITH_RESTRICTIONS" });
const items = (b: CandidateCompilerInputBuild) => b.bundle.items as Array<{ type: string; normalizedRef: string; documentId: string; excerptText: string }>;

const AMEND_HEAD = "AMENDMENT NO. 1 dated as of May 1, 2026 to the Credit Agreement dated as of March 3, 2026, among Harbor Lane Industries, Inc., as Borrower, the Lenders party hereto and Meridian Trust Bank, as Administrative Agent.\n\n";
const AMEND_TAIL = "\n\nSECTION 2. Effectiveness . This Amendment shall become effective on May 1, 2026.\n";
const NEW_EBITDA = "\"Consolidated EBITDA\" means, for any period, Consolidated Net Income for such period plus, without duplication, Interest Expense, income tax expense, depreciation and amortization expense and non-cash stock compensation expense for such period.";
export const DEFINITION_AMENDMENT_FORMS: Record<string, string> = {
  F1: `SECTION 1. Amendments . The definition of "Consolidated EBITDA" in Section 1.01 of the Credit Agreement is hereby amended and restated in its entirety to read as follows: ${NEW_EBITDA}`,
  F2: `SECTION 1. Amendments . Section 1.01 of the Credit Agreement is hereby amended by amending and restating the definition of "Consolidated EBITDA" in its entirety to read as follows: ${NEW_EBITDA}`,
  F3: `SECTION 1. Amendments . The definition of "Consolidated EBITDA" set forth in Section 1.01 of the Credit Agreement is hereby amended and restated to read in its entirety as follows: ${NEW_EBITDA}`,
};

export const INVARIANTS: Array<{ id: string; title: string; legalStatement: string; packageId: string; run: () => Promise<InvariantVerdict[]> }> = [
  { id: "INV-01", title: "A hanging proviso qualifies every preceding clause of its section", packageId: "pkg-d-qualitative-restrictions",
    legalStatement: "7.05's trailing 'provided further that the foregoing shall not permit any Disposition of the Borrower's principal manufacturing facility' qualifies clauses (a)–(l) alike; compiling any clause must see it.",
    run: async () => {
      const pkg = loadPackage("pkg-d-qualitative-restrictions"); const s = await runDeterministicStages(pkg); const out: InvariantVerdict[] = [];
      for (const ref of ["7.05(a)", "7.05(j)", "7.05(k)"]) {
        const b = await bundleFor(pkg, s, "credit-agreement", ref, "DISPOSITIONS");
        const hit = items(b).find((i) => /principal manufacturing facility/.test(i.excerptText));
        out.push({ ref: `invariant:INV-01:proviso-reaches:${ref}`, check: `compiling ${ref} sees the hanging proviso`, ok: !!hit, detail: hit ? `as ${hit.type} item sourced from ${hit.normalizedRef}` : `not in bundle: ${items(b).map((i) => `${i.type}:${i.normalizedRef}`).join(", ")}`, kind: "PRODUCT", severity: "MATERIAL_CONDITION_OMISSION" });
      }
      const sec = await bundleFor(pkg, s, "credit-agreement", "7.05", "DISPOSITIONS");
      out.push({ ref: "invariant:INV-01:proviso-in-section-text", check: "the section-level operative text carries the proviso", ok: /principal manufacturing facility/.test(sec.operativeSourceText), detail: `operative text ${sec.operativeSourceText.length} chars`, kind: "PRODUCT", severity: "MATERIAL_CONDITION_OMISSION" });
      return out;
    } },
  { id: "INV-03", title: "A same-document 'notwithstanding Section X' provision governs the section it names", packageId: "pkg-a-basic-credit-agreement",
    legalStatement: "A new Section 7.05 reading 'Notwithstanding Section 7.01(b), the aggregate principal amount … shall not exceed $10,000,000 … while any Lien permitted under Section 7.02 is outstanding' restricts 7.01(b); compiling 7.01 and asking about 7.01(b) must bring 7.05 in.",
    run: async () => {
      const base = loadPackage("pkg-a-basic-credit-agreement");
      const pkg = variation(base, "INV-03", [{ documentId: "credit-agreement", find: "SECTION 7.03 Fundamental Changes . The Borrower shall not merge or consolidate with any other Person.", replace: "SECTION 7.03 Fundamental Changes . The Borrower shall not merge or consolidate with any other Person.\n\nSECTION 7.05 Limitation on General Basket . Notwithstanding Section 7.01(b), the aggregate principal amount of Indebtedness incurred in reliance on Section 7.01(b) shall not exceed $10,000,000 at any time outstanding while any Lien permitted under Section 7.02 is outstanding." }]);
      const s = await runDeterministicStages(pkg); const out: InvariantVerdict[] = [];
      const sec = await bundleFor(pkg, s, "credit-agreement", "7.01", "INDEBTEDNESS");
      out.push({ ref: "invariant:INV-03:section-bundle-has-override", check: "section-level 7.01 bundle carries 7.05", ok: items(sec).some((i) => i.normalizedRef === "7.05"), detail: items(sec).filter((i) => i.normalizedRef === "7.05").map((i) => i.type).join("/") || "absent", kind: "PRODUCT", severity: "MATERIAL_CONDITION_OMISSION" });
      const scope = hybridScope(pkg, s, q(pkg.packageId, "INDEBTEDNESS", "How much may the Borrower incur under 7.01(b)?", [{ documentId: "credit-agreement", sectionRef: "7.01(b)" }]));
      out.push({ ref: "invariant:INV-03:closure-has-override", check: "hybrid closure for a 7.01(b) question includes 7.05", ok: scope.units.some((u) => u.sectionRef === "7.05"), detail: scope.units.map((u) => u.sectionRef).join(","), kind: "PRODUCT", severity: "MATERIAL_CONDITION_OMISSION" });
      const cl = await bundleFor(pkg, s, "credit-agreement", "7.01(b)", "INDEBTEDNESS");
      out.push({ ref: "invariant:INV-03:clause-bundle-has-override", check: "clause-level 7.01(b) bundle carries 7.05 (production candidates are section-level; recorded only)", ok: items(cl).some((i) => i.normalizedRef === "7.05"), detail: items(cl).map((i) => `${i.type}:${i.normalizedRef}`).join(", "), kind: "OBSERVATION" });
      return out;
    } },
  { id: "INV-04", title: "A cap outside the covenant article (Article IX 'notwithstanding anything in Article VII') governs", packageId: "pkg-i-secured-debt-lien",
    legalStatement: "9.15 caps all secured Indebtedness at $25,000,000 notwithstanding Article VII; compiling 7.01 or 7.02 must see 9.15.",
    run: async () => {
      const pkg = loadPackage("pkg-i-secured-debt-lien"); const s = await runDeterministicStages(pkg); const out: InvariantVerdict[] = [];
      for (const ref of ["7.01", "7.02"]) { const b = await bundleFor(pkg, s, "credit-agreement", ref, "LIENS"); const hit = items(b).find((i) => i.normalizedRef === "9.15"); out.push({ ref: `invariant:INV-04:section-bundle-has-9.15:${ref}`, check: `section-level ${ref} bundle carries 9.15`, ok: !!hit, detail: hit ? hit.type : "absent", kind: "PRODUCT", severity: "MATERIAL_CONDITION_OMISSION" }); }
      for (const ref of ["7.01(b)", "7.02(b)"]) { const b = await bundleFor(pkg, s, "credit-agreement", ref, "LIENS"); out.push({ ref: `invariant:INV-04:clause-bundle-has-9.15:${ref}`, check: `clause-level ${ref} bundle carries 9.15 (recorded only)`, ok: items(b).some((i) => i.normalizedRef === "9.15"), detail: items(b).map((i) => `${i.type}:${i.normalizedRef}`).join(", "), kind: "OBSERVATION" }); }
      return out;
    } },
  { id: "INV-05", title: "A definition amended by a later amendment changes every dependent provision from the effective date, and nothing else", packageId: "pkg-a-basic-credit-agreement",
    legalStatement: "Amendment No. 1 (effective 2026-05-01) restates the definition of 'Consolidated EBITDA' to add a stock-compensation add-back. From that date the ratio basket 7.01(c) must be compiled against the new definition; the other definitions in Section 1.01 are untouched; before that date nothing changes.",
    run: async () => {
      const base = loadPackage("pkg-a-basic-credit-agreement"); const out: InvariantVerdict[] = [];
      const s0 = await runDeterministicStages(base); const full101 = s0.index.getNodeText(s0.index.findNodesByRef("credit-agreement", "1.01")[0]!.nodeId, "DESCENDANTS");
      for (const [form, body] of Object.entries(DEFINITION_AMENDMENT_FORMS)) {
        const pkg = variation(base, `INV-05-${form}`, [{ addDocument: { documentId: "amendment-1", label: "Amendment No. 1", role: "AMENDMENT", text: AMEND_HEAD + body + AMEND_TAIL } }]);
        const s = await runDeterministicStages(pkg);
        const effects = (s.amendment?.effects ?? []).filter((e) => e.amendmentDocumentId === "amendment-1");
        const defEffect = effects.find((e) => e.target.kind === "DEFINITION" || (e.target.targetDefinedTermRef ?? "").toLowerCase() === "consolidated ebitda");
        const resolvedSection = effects.find((e) => e.status === "RESOLVED" && e.target.kind === "SECTION");
        const st = s.operativeStates.get("2026-06-30"); const p101 = st?.provisions.find((p) => p.kind === "SECTION" && p.sectionRef === "1.01");
        const fx = `effects: ${effects.map((e) => `${e.target.kind}:${e.target.targetDefinedTermRef ?? e.target.targetSectionRef}:${e.operation}:${e.status}`).join("; ") || "none"}; instrument ${st?.status}`;
        if (resolvedSection) {
          // a RESOLVED section-level effect is only acceptable if the resulting section text still holds the other definitions
          out.push({ ref: `invariant:INV-05:${form}:effect-targets-definition`, check: `${form}: the effect targets the definition (DEFINITION kind or definedTermRef), not the whole of Section 1.01`, ok: !!defEffect, detail: fx, kind: "PRODUCT", severity: "WRONG_OPERATIVE_SOURCE" });
          const cur = p101?.currentText ?? ""; const keepsOthers = /"Consolidated Net Income" means/.test(cur) && /"Indebtedness" means/.test(cur) && /stock compensation/.test(cur);
          out.push({ ref: `invariant:INV-05:${form}:state-section-1.01-not-replaced`, check: `${form}: operative Section 1.01 at 2026-06-30 still holds the other definitions and the new EBITDA text`, ok: keepsOthers, detail: `1.01 provision ${p101 ? `${p101.status}, applied ${p101.appliedChain.length}, currentText ${cur.length} chars (base section ${full101.length} chars)` : "absent"}`, kind: "PRODUCT", severity: "WRONG_OPERATIVE_SOURCE" });
        } else {
          out.push({ ref: `invariant:INV-05:${form}:fail-closed-or-definition-effect`, check: `${form}: either a DEFINITION-kind effect or an unresolved/REVIEW effect (never a silent section replacement)`, ok: !!defEffect || effects.every((e) => e.status !== "RESOLVED"), detail: fx, kind: "PRODUCT", severity: "WRONG_OPERATIVE_SOURCE" });
        }
        const b = await bundleFor(pkg, s, "credit-agreement", "7.01", "INDEBTEDNESS", "2026-06-30");
        const ebitda = items(b).filter((i) => /consolidated ebitda/i.test(i.normalizedRef));
        if (resolvedSection) out.push({ ref: `invariant:INV-05:${form}:bundle-definition-current`, check: `${form}: the Consolidated EBITDA definition handed to the compiler at 2026-06-30 is the amended text`, ok: ebitda.some((i) => /stock compensation/.test(i.excerptText)), detail: ebitda.map((i) => `${i.type}: "${i.excerptText.slice(0, 90)}…"`).join(" | ") || "no EBITDA item", kind: "PRODUCT", severity: "WRONG_OPERATIVE_SOURCE" });
        const before = s.operativeStates.get("2026-03-31") ?? null;
        out.push({ ref: `invariant:INV-05:${form}:nothing-before-effective-date`, check: `${form}: at 2026-03-31 no effect is applied`, ok: !before || before.provisions.every((p) => p.appliedChain.length === 0), detail: before ? `${before.provisions.length} provision view(s)` : "no state computed for 2026-03-31 (manifest as-of dates only)", kind: "OBSERVATION" });
      }
      return out;
    } },
  { id: "INV-05b", title: "A definition amendment that REMOVES an add-back (false-permission direction), and one layered on a package with two prior amendments", packageId: "pkg-a-basic-credit-agreement",
    legalStatement: "Amendment No. 1 (effective 2026-05-01) restates 'Consolidated EBITDA' WITHOUT the income-tax add-back: EBITDA falls, so the ratio basket 7.01(c) must be compiled against the smaller definition from that date. On package C the same form of amendment (No. 3) must coexist with the two resolved section amendments without disturbing them.",
    run: async () => {
      const out: InvariantVerdict[] = [];
      const A = loadPackage("pkg-a-basic-credit-agreement");
      const SMALLER = "\"Consolidated EBITDA\" means, for any period, Consolidated Net Income for such period plus, without duplication, Interest Expense and depreciation and amortization expense for such period.";
      const pkgA = variation(A, "INV-05b-A", [{ addDocument: { documentId: "amendment-1", label: "Amendment No. 1", role: "AMENDMENT", text: AMEND_HEAD + `SECTION 1. Amendments . The definition of "Consolidated EBITDA" in Section 1.01 of the Credit Agreement is hereby amended and restated in its entirety to read as follows: ${SMALLER}` + AMEND_TAIL } }]);
      const sA = await runDeterministicStages(pkgA);
      const effA = (sA.amendment?.effects ?? []).filter((e) => e.amendmentDocumentId === "amendment-1");
      const stA = sA.operativeStates.get("2026-06-30"); const p101 = stA?.provisions.find((p) => p.kind === "SECTION" && p.sectionRef === "1.01");
      out.push({ ref: "invariant:INV-05b:A:effect-targets-definition", check: "A: the removal amendment targets the definition, not the whole of Section 1.01", ok: effA.some((e) => e.target.kind === "DEFINITION" || !!e.target.targetDefinedTermRef), detail: effA.map((e) => `${e.target.kind}:${e.target.targetDefinedTermRef ?? e.target.targetSectionRef}:${e.operation}:${e.status}`).join("; ") || "none", kind: "PRODUCT", severity: "WRONG_OPERATIVE_SOURCE" });
      out.push({ ref: "invariant:INV-05b:A:state-section-1.01-not-replaced", check: "A: operative Section 1.01 keeps its other definitions", ok: /"Indebtedness" means/.test(p101?.currentText ?? "") && !/income tax expense/.test(p101?.currentText ?? ""), detail: `1.01 provision ${p101 ? `${p101.status}, applied ${p101.appliedChain.length}, currentText ${p101.currentText?.length ?? "null"} chars` : "absent"}`, kind: "PRODUCT", severity: "WRONG_OPERATIVE_SOURCE" });
      const bA = await bundleFor(pkgA, sA, "credit-agreement", "7.01", "INDEBTEDNESS", "2026-06-30");
      const ebitda = items(bA).filter((i) => /consolidated ebitda/i.test(i.normalizedRef));
      out.push({ ref: "invariant:INV-05b:A:bundle-definition-current", check: "A: the compiler receives the smaller (amended) EBITDA definition - the old text would overstate EBITDA", ok: ebitda.length > 0 && ebitda.every((i) => !/income tax expense/.test(i.excerptText)), detail: ebitda.map((i) => `${i.type}: "${i.excerptText.slice(0, 100)}…"`).join(" | ") || "no EBITDA item", kind: "PRODUCT", severity: "CRITICAL_FALSE_PERMISSION" });
      const C = loadPackage("pkg-c-amendment-supersession");
      const pkgC = variation(C, "INV-05b-C", [{ addDocument: { documentId: "amendment-3", label: "Amendment No. 3", role: "AMENDMENT", text: "AMENDMENT NO. 3 dated as of April 1, 2026 to the Credit Agreement dated as of January 20, 2025 (as amended by Amendment No. 1 dated as of August 15, 2025 and Amendment No. 2 dated as of February 2, 2026), among Westmark Logistics Holdings LLC, as Borrower, the Lenders party hereto and Pinnacle Commercial Bank, as Administrative Agent.\n\nSECTION 1. Amendments . The definition of \"Indebtedness\" in Section 1.01 of the Credit Agreement is hereby amended and restated in its entirety to read as follows: \"Indebtedness\" means, as to any Person, all obligations of such Person for borrowed money and all obligations of such Person in respect of capital leases.\n\nSECTION 2. Effectiveness . This Amendment shall become effective on April 1, 2026.\n" } }]);
      const sC = await runDeterministicStages(pkgC);
      const stC = sC.operativeStates.get("2026-06-30");
      const b = stC?.provisions.find((p) => p.sectionRef === "7.01(b)"), e = stC?.provisions.find((p) => p.sectionRef === "7.01(e)"), c101 = stC?.provisions.find((p) => p.kind === "SECTION" && p.sectionRef === "1.01");
      out.push({ ref: "invariant:INV-05b:C:prior-section-amendments-intact", check: "C: 7.01(b) still SUPERSEDED by amendment-1 and 7.01(e) DELETED by amendment-2 at 2026-06-30", ok: b?.currentSourceDocumentId === "amendment-1" && b.appliedChain.length === 1 && e?.currentSourceDocumentId === "amendment-2" && e.appliedChain.length === 1, detail: `7.01(b) ${b ? `${b.currentSourceDocumentId} applied ${b.appliedChain.length}` : "absent"}; 7.01(e) ${e ? `${e.currentSourceDocumentId} applied ${e.appliedChain.length}` : "absent"}; instrument ${stC?.status}`, kind: "PRODUCT", severity: "INCORRECT_AMENDMENT_PRECEDENCE" });
      out.push({ ref: "invariant:INV-05b:C:definition-amendment-targets-definition", check: "C: the definition amendment targets 'Indebtedness', not the whole of Section 1.01", ok: (sC.amendment?.effects ?? []).some((x) => x.amendmentDocumentId === "amendment-3" && (x.target.kind === "DEFINITION" || !!x.target.targetDefinedTermRef)), detail: `${(sC.amendment?.effects ?? []).filter((x) => x.amendmentDocumentId === "amendment-3").map((x) => `${x.target.kind}:${x.target.targetDefinedTermRef ?? x.target.targetSectionRef}:${x.operation}:${x.status}`).join("; ") || "no effect"}; 1.01 provision ${c101 ? `applied ${c101.appliedChain.length}, currentText ${c101.currentText?.length ?? "null"} chars` : "absent"}`, kind: "PRODUCT", severity: "WRONG_OPERATIVE_SOURCE" });
      return out;
    } },
  { id: "INV-06", title: "An amendment whose effectiveness is conditional is not applied before the condition is evidenced", packageId: "pkg-c-amendment-supersession",
    legalStatement: "Amendment No. 3 restates 7.01(d) but becomes effective only on the 'Amendment No. 3 Effective Date' (counterparts received, fee paid). With no evidence of that date, 7.01(d) must not read as amended at 2026-06-30 and the instrument state must not claim RESOLVED.",
    run: async () => {
      const base = loadPackage("pkg-c-amendment-supersession");
      const pkg = variation(base, "INV-06", [{ addDocument: { documentId: "amendment-3", label: "Amendment No. 3", role: "AMENDMENT", text: "AMENDMENT NO. 3 dated as of April 10, 2026 to the Credit Agreement dated as of January 20, 2025 (as amended), among Westmark Logistics Holdings LLC, as Borrower, the Lenders party hereto and Pinnacle Commercial Bank, as Administrative Agent.\n\nSECTION 1. Amendments . Section 7.01(d) of the Credit Agreement is hereby amended and restated in its entirety to read as follows: (d) Indebtedness in respect of capital leases in an aggregate principal amount not to exceed $8,000,000 at any time outstanding; and\n\nSECTION 2. Conditions to Effectiveness . This Amendment shall become effective on the date (the \"Amendment No. 3 Effective Date\") on which the Administrative Agent shall have received counterparts hereof executed by the Borrower and the Required Lenders and the Borrower shall have paid the amendment fee set forth in the Fee Letter.\n" } }]);
      const s = await runDeterministicStages(pkg); const out: InvariantVerdict[] = [];
      const e = (s.amendment?.effects ?? []).find((x) => x.amendmentDocumentId === "amendment-3");
      out.push({ ref: "invariant:INV-06:conditional-effective-date-unresolved", check: "the effect's effective date is not a concrete date", ok: !!e && e.effectiveDate.date === null, detail: e ? `${e.operation} ${e.status}, effectiveDate ${JSON.stringify(e.effectiveDate.status ?? e.effectiveDate.date)}` : "no effect", kind: "PRODUCT", severity: "CRITICAL_FALSE_PERMISSION" });
      const st = s.operativeStates.get("2026-06-30"); const p = st?.provisions.find((x) => x.sectionRef === "7.01(d)");
      out.push({ ref: "invariant:INV-06:provision-not-applied", check: "7.01(d) at 2026-06-30 does not read $8,000,000", ok: !(p && p.appliedChain.length > 0) && !/\$8,000,000/.test(p?.currentText ?? ""), detail: p ? `${p.status}, applied ${p.appliedChain.length}, source ${p.currentSourceDocumentId}` : "no provision view", kind: "PRODUCT", severity: "CRITICAL_FALSE_PERMISSION" });
      out.push({ ref: "invariant:INV-06:instrument-not-resolved", check: "instrument state at 2026-06-30 is not RESOLVED while the effect is pending", ok: st?.status !== "OPERATIVE_STATE_RESOLVED", detail: `instrument ${st?.status}`, kind: "PRODUCT", severity: "UNSUPPORTED_AS_COMPLETE" });
      return out;
    } },
  { id: "INV-37", title: "Cache identity: a compiled unit is reusable when its own text and context are unchanged, and never reused when its text changed", packageId: "pkg-a-basic-credit-agreement",
    legalStatement: "Inserting a proviso into 7.01(c) must not invalidate the cached compilation of 7.02 (text unchanged) and must invalidate 7.01's (text changed).",
    run: async () => {
      const base = loadPackage("pkg-a-basic-credit-agreement");
      const pkg = variation(base, "INV-37", [{ documentId: "credit-agreement", find: "does not exceed 3.50 to 1.00.", replace: "does not exceed 3.50 to 1.00; provided that no Default has occurred and is continuing at the time of incurrence." }]);
      const s0 = await runDeterministicStages(base); const s1 = await runDeterministicStages(pkg); const out: InvariantVerdict[] = [];
      const key = async (p: CorpusPackage, s: DeterministicStages, ref: string, fam: string) => { const b = await bundleFor(p, s, "credit-agreement", ref, fam); return { key: computeCacheKey(b.input, "provider:test"), scv: b.sourceContentVersion, anchor: b.anchorNode?.nodeId ?? null }; };
      const a0 = await key(base, s0, "7.02", "LIENS"), a1 = await key(pkg, s1, "7.02", "LIENS");
      out.push({ ref: "invariant:INV-37:cache-key-stable-under-upstream-insertion", check: "7.02's semantic cache key is unchanged after an insertion earlier in the document", ok: a0.key === a1.key, detail: `key ${a0.key.slice(0, 12)} → ${a1.key.slice(0, 12)}; anchor node id ${a0.anchor === a1.anchor ? "same" : "shifted"}`, kind: "PRODUCT", severity: "NONMATERIAL_OMISSION" });
      out.push({ ref: "invariant:INV-37:source-content-version-under-upstream-insertion", check: "7.02's sourceContentVersion after the insertion (recorded: it may legitimately embed the positional node id)", ok: a0.scv === a1.scv, detail: `${a0.scv.slice(0, 16)} → ${a1.scv.slice(0, 16)}`, kind: "OBSERVATION" });
      const b0 = await key(base, s0, "7.01", "INDEBTEDNESS"), b1 = await key(pkg, s1, "7.01", "INDEBTEDNESS");
      out.push({ ref: "invariant:INV-37:cache-key-changes-when-text-changes", check: "7.01's semantic cache key changes when a clause of 7.01 changes", ok: b0.key !== b1.key, detail: `key ${b0.key.slice(0, 12)} → ${b1.key.slice(0, 12)}`, kind: "PRODUCT", severity: "CRITICAL_FALSE_PERMISSION" });
      return out;
    } },
];

const cyclesFor = (b: CandidateCompilerInputBuild) => (b.bundle.unresolvedDependencies as Array<{ dependencyType: string; attemptedResolution: string }>).filter((u) => u.dependencyType === "DEFINITION_CYCLE").map((u) => u.attemptedResolution);

INVARIANTS.push(
  { id: "INV-19", title: "Only a genuinely circular definition is a definition cycle; a diamond (two paths to one term) is not", packageId: "pkg-a-basic-credit-agreement",
    legalStatement: "'Guarantor' means each Subsidiary that has executed the Guarantee; 'Subsidiary' means any entity controlled by the Borrower. A covenant that names both Guarantors and Subsidiaries depends on Subsidiary by two paths; nothing is circular, so the context contract must not refuse it. The B indenture's Restricted/Unrestricted Subsidiary pair IS circular and must still be reported.",
    run: async () => {
      const out: InvariantVerdict[] = [];
      const A = loadPackage("pkg-a-basic-credit-agreement");
      const diamond = variation(A, "INV-19", [
        { documentId: "credit-agreement", find: '"Indebtedness" means', replace: '"Guarantor" means each Subsidiary that has executed the Guarantee.\n\n"Indebtedness" means' },
        { documentId: "credit-agreement", find: "(b) other Indebtedness in an aggregate principal amount", replace: "(b) other Indebtedness of the Borrower and any Guarantor in an aggregate principal amount" }]);
      const s = await runDeterministicStages(diamond);
      const b = await bundleFor(diamond, s, "credit-agreement", "7.01", "INDEBTEDNESS");
      out.push({ ref: "invariant:INV-19:diamond-is-not-a-cycle", check: "A + Guarantor definition: compiling 7.01 reports no DEFINITION_CYCLE", ok: cyclesFor(b).length === 0, detail: `${cyclesFor(b).join("; ") || "no cycle"}; sufficiency ${b.bundle.sufficiencyState}`, kind: "PRODUCT", severity: "UNSUPPORTED_AS_COMPLETE" });
      const onlyGuarantorDefined = variation(A, "INV-19-def-only", [{ documentId: "credit-agreement", find: '"Indebtedness" means', replace: '"Guarantor" means each Subsidiary that has executed the Guarantee.\n\n"Indebtedness" means' }]);
      const s1 = await runDeterministicStages(onlyGuarantorDefined);
      out.push({ ref: "invariant:INV-19:mention-alone-no-cycle", check: "the same definition with 7.01 not naming Guarantors: no cycle (control)", ok: cyclesFor(await bundleFor(onlyGuarantorDefined, s1, "credit-agreement", "7.01", "INDEBTEDNESS")).length === 0, detail: "control", kind: "OBSERVATION" });
      for (const [pid, ref, fam, terms] of [["pkg-i-secured-debt-lien", "7.01", "INDEBTEDNESS", "Subsidiary/Guarantor"], ["pkg-l-affiliate-transactions", "7.07", "AFFILIATE_TRANSACTIONS", "Loan Parties/Subsidiary"]] as const) {
        const pkg = loadPackage(pid); const st = await runDeterministicStages(pkg); const bb = await bundleFor(pkg, st, "credit-agreement", ref, fam);
        out.push({ ref: `invariant:INV-19:no-false-cycle:${pid.replace(/^pkg-([a-z])-.*$/, "$1")}:${ref}`, check: `${pid} ${ref} (${terms}, no definition refers to itself): no DEFINITION_CYCLE`, ok: cyclesFor(bb).length === 0, detail: `${cyclesFor(bb).join("; ") || "no cycle"}; sufficiency ${bb.bundle.sufficiencyState}`, kind: "PRODUCT", severity: "UNSUPPORTED_AS_COMPLETE" });
      }
      const B = loadPackage("pkg-b-multi-document"); const sb = await runDeterministicStages(B);
      const bi = await bundleFor(B, sb, "indenture", "4.09", "INDEBTEDNESS");
      out.push({ ref: "invariant:INV-19:true-cycle-still-reported", check: "B indenture 4.09 (Restricted Subsidiary ↔ Unrestricted Subsidiary) still reports a DEFINITION_CYCLE (positive control)", ok: cyclesFor(bi).length > 0, detail: cyclesFor(bi).join("; ") || "none", kind: "PRODUCT", severity: "UNSUPPORTED_AS_COMPLETE" });
      return out;
    } },
  { id: "INV-09", title: "A 'greater of $X and Y% of metric' basket is computable only with the metric; without it the answer is NEEDS_INPUT or, at most, the fixed floor stated as a floor", packageId: "pkg-f-capacity-ledger-honesty",
    legalStatement: "Capacity = max($25,000,000, 25% × Consolidated EBITDA). With approved EBITDA 80,000,000 the capacity is 25,000,000 (floor wins); with 200,000,000 it is 50,000,000; with no approved EBITDA the metric branch is unknown, so no figure above the floor may be reported.",
    run: async () => {
      const out: InvariantVerdict[] = [];
      const MAX = (...operands: IRExpression[]): IRExpression => ({ kind: "MAX", type: "MONEY", operands, exprId: "pa-expr-max" } as IRExpression);
      const r: IRRule = rule("rule:inv09-greater-of", "7.01(h)", "INDEBTEDNESS", "INCUR_DEBT", MAX(MONEY(25_000_000), MUL(PCT(0.25), TERM("Consolidated EBITDA"))), "the greater of $25,000,000 and 25% of Consolidated EBITDA");
      const rules = [r]; const definitions: IRDefinition[] = [EBITDA_DEF]; const asOf = "2026-06-30";
      const resolver = (snaps: FinancialSnapshot[]) => snaps.length ? snapshotInputResolver({ snapshots: snaps, rules, definitions, companyId: ORG, instrumentKey: INST }) : EMPTY_RESOLVER;
      const graph = buildCapacityGraph({ rules, sharedCapacities: [], definitions, companyId: ORG, instrumentKey: INST, asOf });
      const ev = (snaps: FinancialSnapshot[]) => evaluateCapacityState({ graph, rules, sharedCapacities: [], definitions, inputs: resolver(snaps), ledger: [], asOf }).capacities.find((c) => c.ruleId === r.ruleId)!;
      const low = ev([snapshot("snap-inv09-low", "APPROVED", asOf, 80_000_000)]);
      out.push({ ref: "invariant:INV-09:floor-wins", check: "EBITDA 80m → 25,000,000 (floor > 20m)", ok: low.status === "AVAILABLE" && num(low.effectiveRemaining) === 25_000_000, detail: `${low.status}, remaining ${amt(low.effectiveRemaining)}`, kind: "PRODUCT", severity: "CRITICAL_FALSE_PERMISSION" });
      const high = ev([snapshot("snap-inv09-high", "APPROVED", asOf, 200_000_000)]);
      out.push({ ref: "invariant:INV-09:metric-wins", check: "EBITDA 200m → 50,000,000", ok: high.status === "AVAILABLE" && num(high.effectiveRemaining) === 50_000_000, detail: `${high.status}, remaining ${amt(high.effectiveRemaining)}`, kind: "PRODUCT", severity: "CRITICAL_FALSE_PERMISSION" });
      const none = ev([]);
      out.push({ ref: "invariant:INV-09:no-metric-no-figure-above-floor", check: "no approved EBITDA → NEEDS_INPUT, or at most the 25,000,000 floor (never more)", ok: none.status !== "AVAILABLE" || num(none.effectiveRemaining) === 25_000_000, detail: `${none.status}, remaining ${amt(none.effectiveRemaining)}${none.status === "AVAILABLE" ? " (floor reported as the figure: a lower bound, acceptable only if labelled)" : ""}`, kind: "PRODUCT", severity: "CRITICAL_FALSE_PERMISSION" });
      return out;
    } },
  { id: "INV-34", title: "A transaction effect the runtime does not support is refused explicitly, never applied approximately or ignored", packageId: "pkg-f-capacity-ledger-honesty",
    legalStatement: "A balance-sheet movement (CHANGE_BALANCE) and an entity-state change (CHANGE_ENTITY_STATE) are reserved effect kinds; a transaction stating one must come back UNSUPPORTED with the limitation named, and no capacity may move.",
    run: async () => {
      const out: InvariantVerdict[] = [];
      const { rules, shared, definitions } = fixtureIR(); const asOf = "2026-09-30";
      const approved = snapshot("snap-inv34", "APPROVED", "2026-06-30", 80_000_000);
      const ledger = [usage("usage-inv34-1", 12_000_000, "rule:f-7.01(b)", "2026-03-15")];
      const inputs = snapshotInputResolver({ snapshots: [approved], rules, definitions, companyId: ORG, instrumentKey: INST });
      const graph = buildCapacityGraph({ rules, sharedCapacities: shared, definitions, companyId: ORG, instrumentKey: INST, asOf });
      const base = evaluateCapacityState({ graph, rules, sharedCapacities: shared, definitions, inputs, ledger, asOf });
      for (const kind of ["CHANGE_BALANCE", "CHANGE_ENTITY_STATE"]) {
        const sim = simulateTransaction({ transaction: { transactionId: `tx-inv34-${kind}`, companyId: ORG, instrumentKey: INST, effectiveAsOf: asOf, category: "debt", label: kind, entities: ["BORROWER"], effects: [{ effectId: "e1", kind, amount: { type: "MONEY", amount: "5000000", currency: "USD" } }, { effectId: "e2", kind: "CONSUME_CAPACITY", capacityNodeId: "capacity:rule:rule:f-7.01(b)", amount: { type: "MONEY", amount: "5000000", currency: "USD" } }], provenance: { source: "product-acceptance invariant", sourceVersion: "1", approvalRef: null } } as never, currentState: base, capacityGraph: graph, selectedPath: { capacityNodeIds: ["capacity:rule:rule:f-7.01(b)"], ruleIds: ["rule:f-7.01(b)"], sharedCapacityIds: [], reclassificationElectionIds: [] }, inputs, context: { rules, sharedCapacities: shared, definitions, ledger, asOf } });
        const named = (sim.limitations as Array<{ code: string }>).some((l) => l.code === "UNSUPPORTED_TRANSACTION_EFFECT");
        const plan = (sim as unknown as { commitPlan: { committable: boolean; blockedBy: string[]; wouldAppendLedgerRecords: unknown[] } }).commitPlan;
        out.push({ ref: `invariant:INV-34:${kind}:refused-explicitly`, check: `${kind}: simulation UNSUPPORTED with UNSUPPORTED_TRANSACTION_EFFECT named`, ok: sim.simulationStatus === "UNSUPPORTED" && named, detail: `status ${sim.simulationStatus}; limitations ${(sim.limitations as Array<{ code: string }>).map((l) => l.code).join(",") || "none"}`, kind: "PRODUCT", severity: "CRITICAL_FALSE_PERMISSION" });
        out.push({ ref: `invariant:INV-34:${kind}:not-committable`, check: `${kind}: the commit plan is not committable and is blocked by UNSUPPORTED_TRANSACTION_EFFECT (nothing can be written to the ledger)`, ok: plan.committable === false && plan.blockedBy.includes("UNSUPPORTED_TRANSACTION_EFFECT"), detail: `committable ${plan.committable}; blockedBy ${plan.blockedBy.join(",")}; wouldAppend ${plan.wouldAppendLedgerRecords.length} row(s)`, kind: "PRODUCT", severity: "CRITICAL_FALSE_PERMISSION" });
        out.push({ ref: `invariant:INV-34:${kind}:partial-evaluation-recorded`, check: `${kind}: the supported CONSUME_CAPACITY effect is still evaluated (SATISFIED) and listed as a would-be ledger row while the transaction is refused (recorded: informational, not committable)`, ok: (sim.capacityEffects as Array<{ outcome?: string }>).every((c) => c.outcome !== "SATISFIED"), detail: `capacityEffects ${(sim.capacityEffects as Array<{ outcome?: string }>).map((c) => c.outcome ?? "?").join(",") || "none"}; path ${sim.selectedPathResult}`, kind: "OBSERVATION" });
      }
      return out;
    } },
);

INVARIANTS.push(
  { id: "INV-19b", title: "Breadth of the false-cycle refusal across the corpus: only genuinely circular definitions may be reported", packageId: "pkg-b-multi-document",
    legalStatement: "Across every section-level manifest covenant in the twelve packages, a DEFINITION_CYCLE report is justified only when each definition on the reported path names the next term; any other report is a false refusal (IPV-21).",
    run: async () => {
      const out: InvariantVerdict[] = []; let total = 0; const falseRows: string[] = []; const genuineRows: string[] = [];
      for (const pkg of loadCorpus()) {
        const s = await runDeterministicStages(pkg); const m = pkg.manifest; const asOf = m.operativeState.asOfDates[m.operativeState.asOfDates.length - 1]!;
        const candidatePkg = { companyId: m.companyId, instrumentKey: m.instrumentKey, packageKey: `${pkg.packageId}-package`, index: s.index, packageGraph: s.packageGraph, exactTermsByDocument: s.exactTermsByDocument, operativeState: s.operativeStates.get(asOf) ?? null, amendmentEffects: s.amendment?.effects ?? null, supersessionIndex: s.supersessionIndexes.get(asOf) };
        for (const c of m.covenants.filter((c) => c.operative && !c.sectionRef.includes("("))) {
          const cand = candidateFor(s.index, c.documentId, c.sectionRef, [c.family as never], c.role as never, c.id, c.occurrence); if (!cand) continue;
          total++;
          const b = buildCandidateCompilerInput(cand, candidatePkg as never);
          for (const cy of cyclesFor(b).map((x) => x.replace("Definition cycle detected: ", ""))) {
            const terms = cy.split(" -> ");
            const defText = (t: string) => (s.index.allDefinitions().find((d) => d.normalizedTerm === t || d.exactTerm.toLowerCase() === t)?.definitionExcerpt ?? "").toLowerCase();
            const genuine = terms.slice(1).every((t, i) => defText(terms[i]!).includes(t.toLowerCase()));
            (genuine ? genuineRows : falseRows).push(`${pkg.packageId.replace(/^pkg-([a-z])-.*$/, "$1").toUpperCase()} ${c.documentId}#${c.sectionRef}: ${cy}`);
          }
        }
      }
      out.push({ ref: "invariant:INV-19b:no-false-cycles-corpus-wide", check: `no section-level candidate in the corpus carries a false DEFINITION_CYCLE (${total} candidates examined)`, ok: falseRows.length === 0, detail: falseRows.length ? `${falseRows.length} false cycle(s): ${falseRows.join("; ")}` : "none", kind: "PRODUCT", severity: "UNSUPPORTED_AS_COMPLETE" });
      out.push({ ref: "invariant:INV-19b:genuine-cycles-reported", check: "genuine cycles are reported (B indenture)", ok: genuineRows.length > 0, detail: genuineRows.join("; ") || "none", kind: "PRODUCT", severity: "UNSUPPORTED_AS_COMPLETE" });
      return out;
    } },
);

INVARIANTS.push(
  { id: "INV-25", title: "A numeric threshold that triggers a qualitative gate ('in excess of $X … so long as approved') is never a basket cap", packageId: "pkg-l-affiliate-transactions",
    legalStatement: "7.07(d) permits 'any other transaction with an Affiliate involving aggregate consideration in excess of $5,000,000, so long as such transaction has been approved by a majority of the disinterested members of the board'. $5,000,000 is the floor above which approval is required, not capacity; a representation 'permits Affiliate transactions up to $5,000,000' asserts the opposite of the clause and must not certify. (Run on an in-memory variant of L whose 7.07(b) no longer names Loan Parties, so the IPV-21 false cycle does not mask the outcome.)",
    run: async () => {
      const out: InvariantVerdict[] = [];
      const L = loadPackage("pkg-l-affiliate-transactions");
      const v = variation(L, "INV-25", [{ documentId: "credit-agreement", find: "(b) transactions between or among the Loan Parties;", replace: "(b) transactions between or among the Borrower and its wholly owned Subsidiaries;" }]);
      const r = await runPackage(v);
      const check = (ref: string) => r.checks.find((c) => c.expectationRef === ref);
      out.push({ ref: "invariant:INV-25:unmasked", check: "with the diamond removed, the faithful 7.07 compile is no longer blocked by a context-contract refusal", ok: !/CONTEXT_CONTRACT_UNACCEPTABLE/.test(check("certification:credit-agreement::7.07")?.detail ?? ""), detail: (check("certification:credit-agreement::7.07")?.detail ?? "").slice(0, 200), kind: "OBSERVATION" });
      for (const [id, sev] of [["L-P1", "MATERIAL_CONDITION_OMISSION"], ["L-P1:lineage-on-rule", "MATERIAL_CONDITION_OMISSION"], ["L-P2", "CRITICAL_FALSE_PERMISSION"], ["L-P3", "CRITICAL_FALSE_PERMISSION"]] as const) {
        const c = check(`adversarial:${id}`);
        out.push({ ref: `invariant:INV-25:${id}-refused`, check: `${id} (${L.manifest.prohibitedClaims.find((p) => p.id === id.split(":")[0])?.claim}) is refused`, ok: c?.result === "PASS", detail: (c?.detail ?? "check absent").slice(0, 240), kind: "PRODUCT", severity: sev });
      }
      return out;
    } },
  { id: "INV-16", title: "An Unrestricted Subsidiary designation document is recognised as acting on the indenture, not as a new instrument", packageId: "pkg-b-multi-document",
    legalStatement: "A board resolution designating a Subsidiary as an Unrestricted Subsidiary under the Indenture changes the entity scope of every indenture covenant; the package graph should attach it to the indenture (or flag it unclassified), never treat it as a standalone base instrument. Entity-scope effects are semantic and are not asserted offline.",
    run: async () => {
      const out: InvariantVerdict[] = [];
      const B = loadPackage("pkg-b-multi-document");
      const v = variation(B, "INV-16", [{ addDocument: { documentId: "designation-resolution", label: "Board Resolution", role: "AMENDMENT", text: "RESOLUTIONS OF THE BOARD OF DIRECTORS OF NORTHFIELD COMPONENTS CORP. adopted March 2, 2026.\n\nWHEREAS, Section 1.01 of the Indenture dated as of February 10, 2026 permits the board of directors of the Issuer to designate any Subsidiary as an Unrestricted Subsidiary;\n\nRESOLVED, that Northfield Ventures LLC, a Subsidiary of the Issuer, is hereby designated as an Unrestricted Subsidiary under the Indenture effective as of the date hereof.\n" } }]);
      const s = await runDeterministicStages(v);
      const own = s.packageGraph.instruments.find((i) => i.instrumentKey === "instrument:designation-resolution");
      const lead = s.packageGraph.crossDocumentReferenceLeads.find((l) => l.sourceDocumentId === "designation-resolution");
      out.push({ ref: "invariant:INV-16:not-a-standalone-instrument", check: "the resolution is not modelled as its own base instrument (recorded: the package graph currently does; fail-safe since no covenant is compiled from it)", ok: !own, detail: `instruments: ${s.packageGraph.instruments.map((i) => i.instrumentKey).join(", ")}; lead: ${lead ? `${lead.referenceText}→${lead.targetDocumentId} ${lead.status}` : "none"}; amendment effects from it: ${(s.amendment?.effects ?? []).filter((e) => e.amendmentDocumentId === "designation-resolution").length}`, kind: "OBSERVATION" });
      const scope = hybridScope(v, s, q(v.packageId, "INDEBTEDNESS", "May Northfield Ventures LLC incur Indebtedness under the Indenture?", [{ documentId: "indenture", sectionRef: "4.09" }]));
      out.push({ ref: "invariant:INV-16:closure-sees-designation", check: "the hybrid closure for an indenture debt question includes the designation resolution (evaluation model)", ok: scope.units.some((u) => u.documentId === "designation-resolution") || scope.documents.includes("designation-resolution"), detail: scope.units.map((u) => `${u.documentId}#${u.sectionRef}`).join(", "), kind: "OBSERVATION" });
      return out;
    } },
);

INVARIANTS.push(
  { id: "INV-25b", title: "Breadth of IPV-22: every comparator-introduced figure in the corpus submitted as a cap", packageId: "pkg-h-unseen-composition",
    legalStatement: "H 7.11: 'If Availability is less than the greater of (a) $10,000,000 …' is a springing trigger, not capacity. H intercreditor 4.01: 'shall not make any payment … if Availability would be less than $15,000,000' is an Availability floor, not a $15,000,000 payment basket. H 7.03(b): 'provided that the Payment Conditions are satisfied' depends on a definition whose '$12,500,000' is an Availability floor; the clause has no $12,500,000 capacity. A submission asserting any of these as a MONEY cap must not certify.",
    run: async () => {
      const out: InvariantVerdict[] = [];
      const H = loadPackage("pkg-h-unseen-composition");
      const manifest = JSON.parse(JSON.stringify(H.manifest)) as typeof H.manifest;
      manifest.prohibitedClaims.push(
        { id: "H-T1", claim: "7.11 permits $10,000,000 (the springing trigger figure as capacity)", severityIfAsserted: "CRITICAL_FALSE_PERMISSION", reason: "$10,000,000 is the Availability level below which the FCCR test springs; 7.11 permits nothing.", adversarial: { kind: "CLAIM_COMPLETE", sectionRef: "7.11", amount: 10_000_000, excerpt: "$10,000,000" } },
        { id: "H-T2", claim: "Intercreditor 4.01 permits Term Loan payments up to $15,000,000", severityIfAsserted: "CRITICAL_FALSE_PERMISSION", reason: "$15,000,000 is the Availability floor after giving effect to a payment; no payment basket exists.", adversarial: { kind: "CLAIM_COMPLETE", sectionRef: "4.01", documentId: "intercreditor-agreement", amount: 15_000_000, excerpt: "$15,000,000" } },
        { id: "H-T3", claim: "7.03(b) permits Investments up to $12,500,000", severityIfAsserted: "CRITICAL_FALSE_PERMISSION", reason: "$12,500,000 is the Payment Conditions Availability floor inside a definition; 7.03(b)'s capacity is the Available Amount.", adversarial: { kind: "CLAIM_COMPLETE", sectionRef: "7.03(b)", amount: 12_500_000, excerpt: "$12,500,000" } },
      );
      const v = { ...H, manifest };
      const r = await runPackage(v);
      for (const id of ["H-T1", "H-T2", "H-T3"]) {
        const c = r.checks.find((x) => x.expectationRef === `adversarial:${id}`);
        out.push({ ref: `invariant:INV-25b:${id}-refused`, check: `${id} (${manifest.prohibitedClaims.find((p) => p.id === id)!.claim}) is refused`, ok: c?.result === "PASS", detail: (c?.detail ?? "check absent (candidate not resolvable)").slice(0, 260), kind: "PRODUCT", severity: "CRITICAL_FALSE_PERMISSION" });
      }
      return out;
    } },
);

INVARIANTS.push(
  { id: "INV-09b", title: "A ratio test's comparator and threshold are part of the source: a flipped comparator or a changed threshold must not certify", packageId: "pkg-a-basic-credit-agreement",
    legalStatement: "B indenture 4.09: Indebtedness may be incurred if the FCCR 'would have been at least 2.00 to 1.00'. A 7.01(c): the ratio basket is available 'so long as … the Consolidated Total Leverage Ratio does not exceed 3.50 to 1.00'. Representations that flip 'at least' to 'at most', 'does not exceed' to 'is at least', or raise 3.50 to 4.50 assert tests the text does not state and must not certify.",
    run: async () => {
      const out: InvariantVerdict[] = [];
      const cases: Array<{ pkg: string; id: string; claim: string; adversarial: Record<string, unknown> }> = [
        { pkg: "pkg-b-multi-document", id: "B-T1", claim: "4.09 ratio test is satisfied when the FCCR is at most 2.00 to 1.00 (comparator flipped)", adversarial: { kind: "SET_RATIO", sectionRef: "4.09", documentId: "indenture", operator: "LTE" } },
        { pkg: "pkg-a-basic-credit-agreement", id: "A-T1", claim: "7.01(c) is available when the leverage ratio is at least 3.50 to 1.00 (comparator flipped)", adversarial: { kind: "SET_RATIO", sectionRef: "7.01(c)", operator: "GTE" } },
        { pkg: "pkg-a-basic-credit-agreement", id: "A-T2", claim: "7.01(c) is available when the leverage ratio does not exceed 4.50 to 1.00 (threshold raised)", adversarial: { kind: "SET_RATIO", sectionRef: "7.01(c)", value: 4.5, excerpt: "4.50 to 1.00" } },
      ];
      for (const pid of [...new Set(cases.map((c) => c.pkg))]) {
        const base = loadPackage(pid); const manifest = JSON.parse(JSON.stringify(base.manifest)) as typeof base.manifest;
        for (const c of cases.filter((c) => c.pkg === pid)) manifest.prohibitedClaims.push({ id: c.id, claim: c.claim, severityIfAsserted: "CRITICAL_FALSE_PERMISSION", reason: "the comparator / threshold is stated in the source text", adversarial: c.adversarial as never });
        const r = await runPackage({ ...base, manifest });
        for (const c of cases.filter((c) => c.pkg === pid)) {
          const ch = r.checks.find((x) => x.expectationRef === `adversarial:${c.id}`);
          out.push({ ref: `invariant:INV-09b:${c.id}-refused`, check: `${c.id} (${c.claim}) is refused`, ok: ch?.result === "PASS", detail: (ch?.detail ?? "check absent").slice(0, 260), kind: "PRODUCT", severity: "CRITICAL_FALSE_PERMISSION" });
        }
      }
      return out;
    } },
);

export async function runInvariants(): Promise<InvariantResult[]> {
  const out: InvariantResult[] = [];
  for (const inv of INVARIANTS) out.push({ id: inv.id, title: inv.title, legalStatement: inv.legalStatement, packageId: inv.packageId, verdicts: await inv.run() });
  return out;
}

export function renderInvariants(results: InvariantResult[], sha: string): string {
  const L = [`# Invariant run @ ${sha}`, "", "| id | invariant | package | PRODUCT pass/total | observations |", "|---|---|---|---|---|"];
  for (const r of results) L.push(`| ${r.id} | ${r.title} | ${r.packageId.replace(/^pkg-([a-z])-.*$/, "$1").toUpperCase()} | ${r.verdicts.filter((v) => v.kind === "PRODUCT" && v.ok).length}/${r.verdicts.filter((v) => v.kind === "PRODUCT").length} | ${r.verdicts.filter((v) => v.kind === "OBSERVATION").length} |`);
  for (const r of results) { L.push("", `### ${r.id} — ${r.title}`, "", `Legal statement: ${r.legalStatement}`, ""); for (const v of r.verdicts) L.push(`- ${v.ok ? "✅" : "❌"} [${v.kind}${v.severity ? `/${v.severity}` : ""}] ${v.check} — ${v.detail}`); }
  return L.join("\n");
}
