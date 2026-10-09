/**
 * Legal-invariant checks (directive: continuous loop over the expanded backlog). Each invariant states, before running,
 * what the law of the document requires, then observes the production deterministic interfaces (structural index,
 * context retrieval, amendment pipeline, operative state, semantic cache key) on a pinned package or an in-memory
 * variation of one. Verdict kinds: PRODUCT (Headroom's behaviour; a failure must be registered with evidence
 * INVARIANT), OBSERVATION (recorded, never a test failure: behaviour outside the production candidate granularity or a
 * measurement with no legal expectation). Nothing under lib/ is modified; fixtures on disk are never changed.
 */
import { runSemanticStage } from "./semantic-stage";
import type { CorpusPackage, Severity } from "./corpus";
import { loadCorpus, loadPackage } from "./corpus";
import { runDeterministicStages, type DeterministicStages } from "./stages";
import { candidateFor } from "./auditor";
import { MUTATIONS, applyMutation, type Mutation } from "./mutations";
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
  const operativeState = doc === s.baseDocumentId ? s.operativeStates.get(d) ?? null : s.operativeStates.get(`${d}::${doc}`) ?? s.operativeStates.get(d) ?? null;
  const instrumentKey = s.instrumentKeys.get(doc) ?? m.instrumentKey;
  const candidatePkg = { companyId: m.companyId, instrumentKey, packageKey: `${pkg.packageId}-package`, index: s.index, packageGraph: s.packageGraph, exactTermsByDocument: s.exactTermsByDocument, operativeState, amendmentEffects: s.amendment?.effects ?? null, supersessionIndex: s.supersessionIndexes.get(d) };
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
        // Always emit the IPV-19 signatures: either DEFINITION-targeted (preferred) or fail-closed REVIEW — never a silent SECTION 1.01 wipe.
        out.push({ ref: `invariant:INV-05:${form}:effect-targets-definition`, check: `${form}: the effect targets the definition (DEFINITION kind or definedTermRef), not the whole of Section 1.01`, ok: !!defEffect && !resolvedSection, detail: fx, kind: "PRODUCT", severity: "WRONG_OPERATIVE_SOURCE" });
        const cur = p101?.currentText ?? "";
        const keepsOthers = !p101 || (/"Consolidated Net Income" means/.test(cur) && /"Indebtedness" means/.test(cur) && (!resolvedSection || /stock compensation/.test(cur)));
        out.push({ ref: `invariant:INV-05:${form}:state-section-1.01-not-replaced`, check: `${form}: operative Section 1.01 at 2026-06-30 is untouched (absent or still holds the other definitions)`, ok: keepsOthers && !resolvedSection, detail: `1.01 provision ${p101 ? `${p101.status}, applied ${p101.appliedChain.length}, currentText ${cur.length} chars (base section ${full101.length} chars)` : "absent (definition-targeted)"}`, kind: "PRODUCT", severity: "WRONG_OPERATIVE_SOURCE" });
        if (!defEffect) out.push({ ref: `invariant:INV-05:${form}:fail-closed-or-definition-effect`, check: `${form}: either a DEFINITION-kind effect or an unresolved/REVIEW effect (never a silent section replacement)`, ok: effects.every((e) => e.status !== "RESOLVED"), detail: fx, kind: "PRODUCT", severity: "WRONG_OPERATIVE_SOURCE" });
        const b = await bundleFor(pkg, s, "credit-agreement", "7.01", "INDEBTEDNESS", "2026-06-30");
        const ebitda = items(b).filter((i) => /consolidated ebitda/i.test(i.normalizedRef));
        // IPV-20: always check bundle currency when a definition effect resolved (or F2 fail-closed leaves REVIEW).
        const bundleOk = !!defEffect && ebitda.some((i) => /stock compensation/.test(i.excerptText));
        out.push({ ref: `invariant:INV-05:${form}:bundle-definition-current`, check: `${form}: the Consolidated EBITDA definition handed to the compiler at 2026-06-30 is the amended text`, ok: bundleOk || (!!defEffect && defEffect.status !== "RESOLVED"), detail: ebitda.map((i) => `${i.type}: "${i.excerptText.slice(0, 90)}…"`).join(" | ") || "no EBITDA item", kind: "PRODUCT", severity: "WRONG_OPERATIVE_SOURCE" });
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
      // Absent SECTION 1.01 provision is success: the definition amendment did not REPLACE the whole section.
      const section101Ok = !p101 || ((/"Indebtedness" means/.test(p101.currentText ?? "") && !/income tax expense/.test(p101.currentText ?? "")));
      out.push({ ref: "invariant:INV-05b:A:state-section-1.01-not-replaced", check: "A: operative Section 1.01 is untouched (no provision, or still holds its other definitions)", ok: section101Ok, detail: `1.01 provision ${p101 ? `${p101.status}, applied ${p101.appliedChain.length}, currentText ${p101.currentText?.length ?? "null"} chars` : "absent (definition-targeted; section not replaced)"}`, kind: "PRODUCT", severity: "WRONG_OPERATIVE_SOURCE" });
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
  { id: "INV-05c", title: "Scan noise on the heading an amendment targets: the amendment must still attach to Section 7.01(b), or the mis-read heading must be diagnosed", packageId: "pkg-c-amendment-supersession",
    legalStatement: "Amendment No. 1 restates 7.01(b). If the base agreement's heading scanned as 'SECTION 7.0l Indebtedness' (IPV-23 shape), the law has not changed: 7.01(b) at 2025-12-31 reads $40,000,000 with a no-Default proviso. The product must either still apply the amendment to the clause or refuse with a diagnostic (unattached effect / health finding) - never leave the instrument RESOLVED on the base text.",
    run: async () => {
      const base = loadPackage("pkg-c-amendment-supersession");
      const pkg = variation(base, "INV-05c", [{ documentId: "credit-agreement", find: "SECTION 7.01 Indebtedness", replace: "SECTION 7.0l Indebtedness" }]);
      const s = await runDeterministicStages(pkg); const out: InvariantVerdict[] = [];
      const effects = s.amendment?.effects ?? [];
      const e = effects.find((x) => x.amendmentDocumentId === "amendment-1");
      const st = s.operativeStates.get("2025-12-31");
      const p = st?.provisions.find((x) => x.sectionRef === "7.01(b)");
      const nodes = s.index.findNodesByRef("credit-agreement", "7.01(b)");
      const health = s.index.healthDiagnostics().length;
      const applied = !!p && /\$40,000,000/.test(p.currentText ?? "") && /no Default/.test(p.currentText ?? "");
      const diagnosed = (e ? e.status !== "RESOLVED" : true) || (s.amendment?.unattachedEffects?.length ?? 0) > 0 || health > 0 || st?.status !== "OPERATIVE_STATE_RESOLVED";
      out.push({ ref: "invariant:INV-05c:target-node-exists", check: "7.01(b) is still a resolvable node after the heading mis-read (observation)", ok: nodes.length === 1, detail: `${nodes.length} node(s) for 7.01(b); SECTION labels ${s.index.allNodes().filter((n) => n.documentId === "credit-agreement" && n.nodeType === "SECTION").map((n) => n.sectionRef).join(",")}`, kind: "OBSERVATION" });
      out.push({ ref: "invariant:INV-05c:amendment-applied-or-diagnosed", check: "7.01(b) at 2025-12-31 reads as amended, OR the effect is not RESOLVED / is unattached / a health diagnostic exists / the instrument is not RESOLVED", ok: applied || diagnosed, detail: `effect ${e ? `${e.operation} ${e.status} → ${JSON.stringify(e.target).slice(0, 80)}` : "absent"}; unattached ${s.amendment?.unattachedEffects?.length ?? 0}; health ${health}; instrument ${st?.status}; 7.01(b) ${p ? `${p.status} "${(p.currentText ?? "").slice(0, 60)}"` : "no provision"}`, kind: "PRODUCT", severity: "INCORRECT_AMENDMENT_PRECEDENCE" });
      out.push({ ref: "invariant:INV-05c:amendment-applied", check: "7.01(b) at 2025-12-31 reads $40,000,000 with the no-Default proviso (the amendment attached despite the heading noise)", ok: applied, detail: p ? `${p.status}, applied chain ${p.appliedChain.length}, "${(p.currentText ?? "").slice(0, 80)}"` : "no 7.01(b) provision in the operative state", kind: "OBSERVATION" });
      return out;
    } },
  { id: "INV-16b", title: "An unresolved side letter or consent stays attached to the provision it names, blocks a RESOLVED reading, preserves the last authoritative text, and is never silently dropped from retrieval", packageId: "pkg-m-composed-p0",
    legalStatement: "Package M's side letter (2026-05-01) says the Borrower 'shall not incur other Indebtedness under Section 7.01(b) … exceeding $15,000,000'. Until its effect is classified, 7.01(b) must not be reported as a resolved $40,000,000 basket at 2026-06-30; the $40,000,000 text (the last text with authority) must stay visible for review; the override must remain attached to 7.01(b); and no retrieval view - clause-level or section-level - may serve the $40,000,000 clause as current truth without naming the override.",
    run: async () => {
      const out: InvariantVerdict[] = [];
      const M = loadPackage("pkg-m-composed-p0"); const s = await runDeterministicStages(M);
      const st = s.operativeStates.get("2026-06-30"); const p = st?.provisions.find((x) => x.kind === "SECTION" && x.sectionRef === "7.01(b)");
      const effects = (s.amendment?.effects ?? []).filter((e) => e.amendmentDocumentId === "side-letter");
      const attached = effects.filter((e) => e.target.targetDocumentId === "credit-agreement" && e.target.targetSectionRef === "7.01(b)");
      out.push({ ref: "invariant:INV-16b:override-attached-to-named-provision", check: "the side letter yields an effect targeting credit-agreement#7.01(b) (resolved or unresolved), with zero unattached effects", ok: attached.length > 0 && (s.amendment?.unattachedEffects.length ?? 0) === 0, detail: `${effects.length} effect(s) from side-letter: ${effects.map((e) => `${e.operation}/${e.status}→${e.target.targetDocumentId ?? "?"}#${e.target.targetSectionRef ?? "?"}`).join(", ") || "none"}; unattached ${s.amendment?.unattachedEffects.length ?? "?"}`, kind: "PRODUCT", severity: "CRITICAL_FALSE_PERMISSION" });
      const lastText = p?.currentText ?? null;
      out.push({ ref: "invariant:INV-16b:provision-not-resolved-last-text-preserved", check: "7.01(b) at 2026-06-30 is not OPERATIVE_STATE_RESOLVED (and not CONFLICTED), and its last authoritative text ($40,000,000) is preserved for review", ok: !!p && p.status !== "OPERATIVE_STATE_RESOLVED" && p.status !== "OPERATIVE_STATE_CONFLICTED" && !!lastText && /\$40,000,000/.test(lastText), detail: p ? `${p.status}; applied ${p.appliedChain.length}; source ${p.currentSourceDocumentId}; text ${lastText ? JSON.stringify(lastText.slice(0, 70)) : "null"}` : `no provision view; instrument ${st?.status}`, kind: "PRODUCT", severity: "CRITICAL_FALSE_PERMISSION" });
      const names = (x: unknown) => /side[- ]letter|UNCLASSIFIED_OVERRIDE/i.test(JSON.stringify(x));
      const clause = await bundleFor(M, s, "credit-agreement", "7.01(b)", "INDEBTEDNESS");
      const cItems = clause.bundle.items as Array<{ type: string; evidenceState?: { status?: string; isCurrentTruth?: boolean; reason?: string } }>;
      const cSrc = cItems.find((i) => i.type === "OPERATIVE_SOURCE");
      const cFlagged = (cSrc?.evidenceState?.isCurrentTruth === false) || names(clause.bundle.unresolvedDependencies) || names(clause.bundle.retrievalStops);
      out.push({ ref: "invariant:INV-16b:clause-retrieval-withheld-or-flagged", check: "the clause-level 7.01(b) bundle does not present the $40,000,000 text as current truth (withheld, or flagged by an unresolved item / stop naming the override)", ok: cFlagged, detail: `OPERATIVE_SOURCE evidence ${JSON.stringify(cSrc?.evidenceState ?? null)}; text ${(clause.operativeSourceText ?? "").length} chars; names the override: ${names(clause.bundle)}`, kind: "PRODUCT", severity: "WRONG_OPERATIVE_SOURCE" });
      out.push({ ref: "invariant:INV-16b:clause-withhold-reason-names-override", check: "when the clause text is withheld, the stated reason names the side letter / override (observation)", ok: names(cSrc?.evidenceState ?? {}), detail: cSrc?.evidenceState?.reason ?? "no reason", kind: "OBSERVATION" });
      const section = await bundleFor(M, s, "credit-agreement", "7.01", "INDEBTEDNESS");
      const sItems = section.bundle.items as Array<{ type: string; normalizedRef?: string; sectionRef?: string; evidenceState?: { status?: string; isCurrentTruth?: boolean } }>;
      const sSrc = sItems.find((i) => i.type === "OPERATIVE_SOURCE");
      const servesStale = /\$40,000,000/.test(section.operativeSourceText ?? "") && sSrc?.evidenceState?.isCurrentTruth === true;
      const childB = sItems.some((i) => i.type === "CHILD_RULE" && (i.normalizedRef ?? i.sectionRef) === "7.01(b)");
      out.push({ ref: "invariant:INV-16b:section-retrieval-does-not-serve-overridden-clause-as-current", check: "the section-level 7.01 bundle does not serve clause (b)'s $40,000,000 as current truth unless the bundle names the override (unresolved item, stop, or lead)", ok: !servesStale || names(section.bundle), detail: `OPERATIVE_SOURCE evidence ${JSON.stringify(sSrc?.evidenceState ?? null)}; text contains $40,000,000: ${/\$40,000,000/.test(section.operativeSourceText ?? "")}; CHILD_RULE 7.01(b) present: ${childB}; bundle names the override: ${names(section.bundle)}; items ${sItems.map((i) => `${i.type}:${i.normalizedRef ?? i.sectionRef ?? ""}`).join(", ").slice(0, 200)}`, kind: "PRODUCT", severity: "WRONG_OPERATIVE_SOURCE" });
      out.push({ ref: "invariant:INV-16b:section-child-rule-not-silently-dropped", check: "clause (b) is either listed as a CHILD_RULE of 7.01 or the bundle says why it is absent (observation)", ok: childB || names(section.bundle), detail: `CHILD_RULE 7.01(b): ${childB}; names the override: ${names(section.bundle)}`, kind: "OBSERVATION" });
      // Certification: on package A plus a tightening side letter on 7.01(b) (the MUT-13 shape, no other unresolved evidence in the way),
      // the section-level 7.01 unit must not be CERTIFIED with the overridden $30,000,000 cap compiled as its basket.
      const mut13 = MUTATIONS.find((x) => x.id === "MUT-13")!; const A13 = applyMutation(loadPackage("pkg-a-basic-credit-agreement"), mut13);
      const s13 = await runDeterministicStages(A13); const r13 = await runSemanticStage(A13, s13);
      const res13 = r13.faithful?.results.find((x) => x.candidate.description === "credit-agreement::7.01");
      const cert13 = res13?.certification; const capB = (res13?.compilation?.rules ?? []).find((x) => x.sourceSectionRef === "7.01(b)");
      out.push({ ref: "invariant:INV-16b:section-with-overridden-clause-not-certified", check: "A + tightening side letter on 7.01(b): the faithful section-level 7.01 submission is not CERTIFIED while the override is unresolved (the compiled 7.01(b) cap would otherwise be the superseded $30,000,000)", ok: !!cert13 && cert13.status !== "CERTIFIED", detail: `certification ${cert13?.status ?? "none"} [${(cert13?.blockers ?? []).map((b) => b.code).join(", ")}]; compiled 7.01(b) capacity ${JSON.stringify((capB?.capacityExpression as { amount?: unknown } | undefined)?.amount ?? null)}; package ${r13.faithful?.packageCertification.status ?? "none"}`, kind: "PRODUCT", severity: "CRITICAL_FALSE_PERMISSION" });
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
      // HISTORICAL (adjudicated 2026-10-08, doc 22): "Restricted Subsidiary" means … that is not an Unrestricted Subsidiary; "Unrestricted
      // Subsidiary" means … designated as an Unrestricted Subsidiary … - one directed edge plus a self-mention, NOT a cycle. The cycle main
      // reported came from the last definition's span running into §4.09 (IPV-21). The verdict is kept as a record, no longer asserted.
      out.push({ ref: "invariant:INV-19:true-cycle-still-reported", check: "HISTORICAL (invalid positive control, see doc 22): B indenture 4.09 Restricted/Unrestricted Subsidiary reported as a DEFINITION_CYCLE", ok: cyclesFor(bi).length > 0, detail: cyclesFor(bi).join("; ") || "none (correct: the pair is one-way)", kind: "OBSERVATION" });
      out.push({ ref: "invariant:INV-19:one-way-pair-is-not-a-cycle", check: "B indenture 4.09: a one-way pair (Restricted → Unrestricted Subsidiary, plus a self-mention) is NOT reported as a DEFINITION_CYCLE", ok: cyclesFor(bi).length === 0, detail: cyclesFor(bi).join("; ") || "no cycle", kind: "PRODUCT", severity: "UNSUPPORTED_AS_COMPLETE" });
      // Corrected positive control: a genuine two-way dependency on package A, reached by 7.01(c) through Consolidated Total Leverage Ratio.
      const genuine = variation(A, "INV-19-genuine", [{ documentId: "credit-agreement", find: '"Consolidated Total Debt" means, as of any date, the aggregate principal amount of Indebtedness of the Borrower and its Subsidiaries outstanding on such date.', replace: '"Consolidated Net Debt" means, as of any date, Consolidated Total Debt on such date minus unrestricted cash of the Borrower on such date.\n\n"Consolidated Total Debt" means, as of any date, Consolidated Net Debt on such date plus unrestricted cash of the Borrower on such date.' }]);
      const sg = await runDeterministicStages(genuine); const bg = await bundleFor(genuine, sg, "credit-agreement", "7.01", "INDEBTEDNESS");
      const gc = cyclesFor(bg).filter((c) => /consolidated total debt/i.test(c) && /consolidated net debt/i.test(c));
      out.push({ ref: "invariant:INV-19:genuine-cycle-reported", check: "A + ('Consolidated Total Debt' means Consolidated Net Debt plus cash; 'Consolidated Net Debt' means Consolidated Total Debt minus cash): compiling 7.01 reports a DEFINITION_CYCLE on exactly that pair (corrected positive control)", ok: gc.length > 0, detail: cyclesFor(bg).join("; ") || "none", kind: "PRODUCT", severity: "UNSUPPORTED_AS_COMPLETE" });
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
            // genuineness by exact defined-term boundaries on the full definition span (case-sensitive, \b-bounded, the term's own
            // name excluded) - never substring containment ("unrestricted subsidiary" contains "restricted subsidiary" as a substring)
            const defOf = (t: string) => s.index.allDefinitions().find((d) => d.normalizedTerm === t || d.exactTerm.toLowerCase() === t);
            // the span is taken from the SOURCE (declaration to the end of its paragraph), never from the product's own definition span,
            // which on main over-extends into later sections and would make every false cycle look genuine
            const sourceSpan = (d: { documentId: string; charStart: number }) => { const text = pkg.documents.find((x) => x.documentId === d.documentId)?.text ?? ""; const end = text.indexOf("\n\n", d.charStart); return text.slice(d.charStart, end < 0 ? text.length : end); };
            const mentions = (fromTerm: string, toTerm: string) => { const from = defOf(fromTerm); const to = defOf(toTerm); if (!from || !to || from.exactTerm === to.exactTerm) return false; return new RegExp(`\\b${to.exactTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(sourceSpan(from)); };
            const genuine = terms.slice(1).every((t, i) => mentions(terms[i]!, t));
            (genuine ? genuineRows : falseRows).push(`${pkg.packageId.replace(/^pkg-([a-z])-.*$/, "$1").toUpperCase()} ${c.documentId}#${c.sectionRef}: ${cy}`);
          }
        }
      }
      out.push({ ref: "invariant:INV-19b:no-false-cycles-corpus-wide", check: `no section-level candidate in the corpus carries a false DEFINITION_CYCLE (${total} candidates examined)`, ok: falseRows.length === 0, detail: falseRows.length ? `${falseRows.length} false cycle(s): ${falseRows.join("; ")}` : "none", kind: "PRODUCT", severity: "UNSUPPORTED_AS_COMPLETE" });
      // HISTORICAL: this used to assert that the corpus carries a genuine cycle (B indenture); by exact-term boundaries the corpus has none (doc 22).
      out.push({ ref: "invariant:INV-19b:genuine-cycles-reported", check: "HISTORICAL (see doc 22): genuine cycles found across the corpus by exact defined-term boundaries", ok: genuineRows.length > 0, detail: genuineRows.join("; ") || "none - the corpus has no genuine definition cycle", kind: "OBSERVATION" });
      const A = loadPackage("pkg-a-basic-credit-agreement");
      const genuinePkg = variation(A, "INV-19b-genuine", [{ documentId: "credit-agreement", find: '"Consolidated Total Debt" means, as of any date, the aggregate principal amount of Indebtedness of the Borrower and its Subsidiaries outstanding on such date.', replace: '"Consolidated Net Debt" means, as of any date, Consolidated Total Debt on such date minus unrestricted cash of the Borrower on such date.\n\n"Consolidated Total Debt" means, as of any date, Consolidated Net Debt on such date plus unrestricted cash of the Borrower on such date.' }]);
      const sg = await runDeterministicStages(genuinePkg); const bg = await bundleFor(genuinePkg, sg, "credit-agreement", "7.01", "INDEBTEDNESS");
      out.push({ ref: "invariant:INV-19b:genuine-cycle-control", check: "a genuine two-way definition cycle (A variation, Consolidated Total Debt ↔ Consolidated Net Debt) is reported on the section-level 7.01 candidate (corrected positive control)", ok: cyclesFor(bg).some((c) => /consolidated total debt/i.test(c) && /consolidated net debt/i.test(c)), detail: cyclesFor(bg).join("; ") || "none", kind: "PRODUCT", severity: "UNSUPPORTED_AS_COMPLETE" });
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
        // breadth: every other RATIO_THRESHOLD covenant in the corpus with its comparator flipped
        { pkg: "pkg-h-unseen-composition", id: "H-T4", claim: "7.11 requires the FCCR to be at most 1.00 to 1.00 (comparator flipped)", adversarial: { kind: "SET_RATIO", sectionRef: "7.11", operator: "LTE" } },
        { pkg: "pkg-m-composed-p0", id: "M-T1", claim: "7.01(c) is available when the leverage ratio is at least 4.00 to 1.00 (comparator flipped)", adversarial: { kind: "SET_RATIO", sectionRef: "7.01(c)", operator: "GTE" } },
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

INVARIANTS.push(
  { id: "INV-28b", title: "A posture flip or a changed percentage is not a faithful representation", packageId: "pkg-f-capacity-ledger-honesty",
    legalStatement: "F 7.01(c) permits Indebtedness 'not to exceed 20% of Consolidated EBITDA': a representation at 35% asserts a figure the text does not state. D 7.05 is a prohibition ('shall not … make any Disposition, except'): representing the section as a permission inverts it. Neither may certify.",
    run: async () => {
      const out: InvariantVerdict[] = [];
      const cases: Array<{ pkg: string; id: string; claim: string; adversarial: Record<string, unknown> }> = [
        { pkg: "pkg-f-capacity-ledger-honesty", id: "F-T1", claim: "7.01(c) permits Indebtedness up to 35% of Consolidated EBITDA", adversarial: { kind: "SET_PERCENT", sectionRef: "7.01(c)", percent: 35, excerpt: "35% of Consolidated EBITDA" } },
        { pkg: "pkg-d-qualitative-restrictions", id: "D-T1", claim: "7.05 permits Dispositions (the prohibition presented as a permission)", adversarial: { kind: "SET_POSTURE", sectionRef: "7.05", posture: "PERMISSION" } },
      ];
      for (const pid of [...new Set(cases.map((c) => c.pkg))]) {
        const base = loadPackage(pid); const manifest = JSON.parse(JSON.stringify(base.manifest)) as typeof base.manifest;
        for (const c of cases.filter((c) => c.pkg === pid)) manifest.prohibitedClaims.push({ id: c.id, claim: c.claim, severityIfAsserted: "CRITICAL_FALSE_PERMISSION", reason: "not what the text states", adversarial: c.adversarial as never });
        const r = await runPackage({ ...base, manifest });
        for (const c of cases.filter((c) => c.pkg === pid)) { const ch = r.checks.find((x) => x.expectationRef === `adversarial:${c.id}`); out.push({ ref: `invariant:INV-28b:${c.id}-refused`, check: `${c.id} (${c.claim}) is refused`, ok: ch?.result === "PASS", detail: (ch?.detail ?? "check absent").slice(0, 260), kind: "PRODUCT", severity: "CRITICAL_FALSE_PERMISSION" }); }
      }
      return out;
    } },
);

INVARIANTS.push(
  { id: "INV-18", title: "A defined term used in plural or possessive form is still that defined term: its definition must reach the compiler", packageId: "pkg-a-basic-credit-agreement",
    legalStatement: "'Guarantors', 'Subsidiaries', 'Investments', 'Liens', 'Restricted Payments', 'an Affiliate of' are uses of the defined terms Guarantor, Subsidiary, Investment, Lien, Restricted Payment, Affiliate (every corpus agreement carries the usual 'singular and plural forms' construction clause or relies on it). For every covenant whose own text uses a defined term only in such a form, the bundle must still carry the definition.",
    run: async () => {
      const out: InvariantVerdict[] = []; const misses: string[] = []; let examined = 0, pluralUses = 0;
      for (const pkg of loadCorpus()) {
        const s = await runDeterministicStages(pkg); const m = pkg.manifest; const asOf = m.operativeState.asOfDates[m.operativeState.asOfDates.length - 1]!;
        const candidatePkg = { companyId: m.companyId, instrumentKey: m.instrumentKey, packageKey: `${pkg.packageId}-package`, index: s.index, packageGraph: s.packageGraph, exactTermsByDocument: s.exactTermsByDocument, operativeState: s.operativeStates.get(asOf) ?? null, amendmentEffects: s.amendment?.effects ?? null, supersessionIndex: s.supersessionIndexes.get(asOf) };
        const terms = s.index.allDefinitions().map((d) => ({ term: d.exactTerm, doc: d.documentId }));
        for (const c of m.covenants.filter((c) => c.operative)) {
          const cand = candidateFor(s.index, c.documentId, c.sectionRef, [c.family as never], c.role as never, c.id, c.occurrence); if (!cand) continue;
          examined++;
          const own = s.index.getNodeText(cand.structuralNodeIds[0]!, "OWN");
          const b = buildCandidateCompilerInput(cand, candidatePkg as never);
          const retrieved = new Set(items(b).filter((i) => i.type === "DEFINITION" || i.type === "DEFINITION_DEPENDENCY").map((i) => i.normalizedRef.toLowerCase()));
          for (const t of terms.filter((t) => t.doc === c.documentId)) {
            const esc = t.term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const singular = new RegExp(`\\b${esc}\\b`).test(own);
            const inflected = new RegExp(`\\b${esc}(?:s|es|'s|’s)\\b`).test(own) || new RegExp(`\\b${esc.replace(/y$/, "")}ies\\b`).test(own);
            if (!singular && inflected) { pluralUses++; if (!retrieved.has(t.term.toLowerCase())) misses.push(`${pkg.packageId.replace(/^pkg-([a-z])-.*$/, "$1").toUpperCase()} ${c.sectionRef}: "${t.term}"`); }
          }
        }
      }
      out.push({ ref: "invariant:INV-18:inflected-terms-retrieved", check: `every defined term used only in an inflected form reaches the bundle (${examined} covenants, ${pluralUses} inflected-only uses)`, ok: misses.length === 0, detail: misses.length ? `${misses.length} miss(es): ${misses.join("; ")}` : "none", kind: "PRODUCT", severity: "NONMATERIAL_OMISSION" });
      return out;
    } },
);

INVARIANTS.push(
  { id: "INV-32", title: "A reclassification of usage between baskets executes only on a recorded, authorised election over an edge the contract provides; otherwise nothing moves", packageId: "pkg-f-capacity-ledger-honesty",
    legalStatement: "F 7.01(g) lets the Borrower reclassify usage out of 7.01(b) by written notice to the Administrative Agent. The fixture IR carries no reclassification edge (the runtime cases never model 7.01(g)); an election moving $5,000,000 from 7.01(b) to 7.01(c) must therefore not execute, must not free 7.01(b) capacity, and must not be committable; an election the caller did not select must be refused as not on the selected path.",
    run: async () => {
      const out: InvariantVerdict[] = [];
      const { rules, shared, definitions } = fixtureIR(); const asOf = "2026-09-30";
      const approved = snapshot("snap-inv32", "APPROVED", "2026-06-30", 80_000_000);
      const ledger = [usage("usage-inv32-1", 12_000_000, "rule:f-7.01(b)", "2026-03-15")];
      const inputs = snapshotInputResolver({ snapshots: [approved], rules, definitions, companyId: ORG, instrumentKey: INST });
      const graph = buildCapacityGraph({ rules, sharedCapacities: shared, definitions, companyId: ORG, instrumentKey: INST, asOf });
      const base = evaluateCapacityState({ graph, rules, sharedCapacities: shared, definitions, inputs, ledger, asOf });
      const election = { electionId: "elect-inv32", sourceRuleId: "rule:f-7.01(b)", destinationRuleId: "rule:f-7.01(c)", amount: { amount: "5000000", currency: "USD" }, effectiveAsOf: asOf, movesUsageIds: ["usage-inv32-1"], provenance: { source: "product-acceptance invariant", sourceVersion: "1", approvalRef: null } };
      const run = (selected: string[]) => simulateTransaction({ transaction: { transactionId: `tx-inv32-${selected.length}`, companyId: ORG, instrumentKey: INST, effectiveAsOf: asOf, category: "debt", label: "reclassify 5m from (b) to (c)", entities: ["BORROWER"], effects: [{ effectId: "e1", kind: "APPLY_RECLASSIFICATION", election }], provenance: { source: "product-acceptance invariant", sourceVersion: "1", approvalRef: null } } as never, currentState: base, capacityGraph: graph, selectedPath: { capacityNodeIds: ["capacity:rule:rule:f-7.01(b)", "capacity:rule:rule:f-7.01(c)"], ruleIds: ["rule:f-7.01(b)", "rule:f-7.01(c)"], sharedCapacityIds: [], reclassificationElectionIds: selected }, inputs, context: { rules, sharedCapacities: shared, definitions, ledger, asOf } });
      const sim = run(["elect-inv32"]) as unknown as { simulationStatus: string; limitations: Array<{ code: string; message: string }>; reclassificationEffects: { outcomes: Array<{ electionId: string; state: string; blocks?: Array<{ code: string }> }>; allExecuted: boolean }; commitPlan: { committable: boolean; blockedBy: string[] }; postState: { capacities: Array<{ ruleId: string; effectiveRemaining: unknown }> } };
      const executed = sim.reclassificationEffects.outcomes.some((o) => o.state === "EXECUTED");
      const codes = [...sim.limitations.map((l) => l.code), ...sim.reclassificationEffects.outcomes.flatMap((o) => (o.blocks ?? []).map((b) => b.code))];
      out.push({ ref: "invariant:INV-32:no-edge-not-executed", check: "an election over a reclassification edge the IR does not provide is not executed", ok: !executed, detail: `status ${sim.simulationStatus}; outcomes ${sim.reclassificationEffects.outcomes.map((o) => `${o.electionId}:${o.state}`).join(",") || "none"}; codes ${codes.join(",") || "none"}`, kind: "PRODUCT", severity: "CRITICAL_FALSE_PERMISSION" });
      out.push({ ref: "invariant:INV-32:no-edge-not-committable", check: "the commit plan is not committable and names the block", ok: sim.commitPlan.committable === false && sim.commitPlan.blockedBy.length > 0, detail: `committable ${sim.commitPlan.committable}; blockedBy ${sim.commitPlan.blockedBy.join(",")}`, kind: "PRODUCT", severity: "CRITICAL_FALSE_PERMISSION" });
      const beforeB = num(base.capacities.find((c) => c.ruleId === "rule:f-7.01(b)")!.effectiveRemaining);
      const post = sim.postState as { capacities: Array<{ ruleId: string; effectiveRemaining: unknown }> } | null;
      const afterB = post ? num((post.capacities.find((c) => c.ruleId === "rule:f-7.01(b)") as { effectiveRemaining: never } | undefined)?.effectiveRemaining as never) : null;
      out.push({ ref: "invariant:INV-32:no-edge-no-capacity-freed", check: "7.01(b) remaining capacity is unchanged (or no post state is produced): nothing freed", ok: post === null || afterB === beforeB, detail: `7.01(b) remaining before ${beforeB} after ${post ? afterB : "(no post state: simulation blocked before applying)"}`, kind: "PRODUCT", severity: "CRITICAL_FALSE_PERMISSION" });
      const unselected = run([]) as unknown as { simulationStatus: string; limitations: Array<{ code: string }> };
      out.push({ ref: "invariant:INV-32:unselected-election-refused", check: "an election the caller did not place on the selected path is refused (EFFECT_TARGET_NOT_IN_SELECTED_PATH)", ok: unselected.limitations.some((l) => l.code === "EFFECT_TARGET_NOT_IN_SELECTED_PATH") && unselected.simulationStatus !== "SIMULATED", detail: `status ${unselected.simulationStatus}; limitations ${unselected.limitations.map((l) => l.code).join(",")}`, kind: "PRODUCT", severity: "CRITICAL_FALSE_PERMISSION" });
      out.push({ ref: "invariant:INV-32:approval-reference-absent", check: "an election with approvalRef null is accepted as an election (recorded: the runtime does not require an approval reference; the product layer must)", ok: codes.some((c) => /APPROVAL|AUTHORI/i.test(c)), detail: `codes ${codes.join(",") || "none"}`, kind: "OBSERVATION" });
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
