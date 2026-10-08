/**
 * Legal-invariant checks (directive: continuous loop over the expanded backlog). Each invariant states, before running,
 * what the law of the document requires, then observes the production deterministic interfaces (structural index,
 * context retrieval, amendment pipeline, operative state, semantic cache key) on a pinned package or an in-memory
 * variation of one. Verdict kinds: PRODUCT (Headroom's behaviour; a failure must be registered with evidence
 * INVARIANT), OBSERVATION (recorded, never a test failure: behaviour outside the production candidate granularity or a
 * measurement with no legal expectation). Nothing under lib/ is modified; fixtures on disk are never changed.
 */
import type { CorpusPackage, Severity } from "./corpus";
import { loadPackage } from "./corpus";
import { runDeterministicStages, type DeterministicStages } from "./stages";
import { candidateFor } from "./auditor";
import { applyMutation, type Mutation } from "./mutations";
import { hybridScope, type BenchmarkCase } from "./benchmark/strategies";
import { buildCandidateCompilerInput, type CandidateCompilerInputBuild } from "../../lib/contract-model/covenant-map/candidate-input";
import { computeCacheKey } from "../../lib/contract-model/compiler/semantic/cache";

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
