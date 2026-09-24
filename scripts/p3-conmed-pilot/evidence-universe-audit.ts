/**
 * AUDIT ONLY - semantic accountability vs numeric grounding: do they use the same evidence universe?
 *
 * Reads code and preserved artifacts. Calls nothing, changes nothing, writes one artifact.
 *
 * The comparison is deliberately run on the SAME value set from BOTH sides: every value the
 * historical attribution regex finds in a compiled IR is put to both graders, so a disagreement is
 * a disagreement about EVIDENCE, never about which values each side happened to look at.
 */
import fs from "node:fs";
import path from "node:path";
import { collectNumericAssertions, groundNumericAssertions } from "../../lib/contract-model/compiler/semantic-verification/numeric-assertion";
import { attributionCheck } from "./span-validation";
import { normalizeSectionScopeKey, normalizeTermScopeKey } from "../../lib/contract-model/compiler/semantic-verification/retrieved-evidence";
import type { NumericAssertionEvidenceText } from "../../lib/contract-model/compiler/semantic-verification/types";
import type { IRDefinition, IRRule } from "../../lib/contract-model/ir/types";
import type { SemanticCompilationResult } from "../../lib/contract-model/compiler/semantic/types";

const ROOTS = ["docs", "tests/fixtures/unseen-packages"];
export type PairClass = "BOTH_GROUNDED" | "BOTH_UNGROUNDED" | "ACCOUNTABILITY_ONLY_GROUNDED" | "FIX_B_ONLY_GROUNDED" | "INSUFFICIENT_ARTIFACT";

/** A minimal, real IRRule carrying one free-text assertion - so the production grounder is exercised, not imitated. */
function probeRule(value: string): IRRule {
  return {
    ruleId: "audit-probe", irSchemaVersion: "v1", companyId: "audit", instrumentKey: "audit", sourceDocumentId: "audit",
    sourceSectionRef: null, covenantFamily: "OTHER", ruleType: "QUANTITATIVE_PERMISSION", posture: "PERMISSION", action: null,
    entityScope: [], entityScopeExcluded: [], transactionScope: null, capacityExpression: null,
    conditions: [{ conditionId: "c0", conditionType: "OTHER", expression: null, referencesDefinitionId: null, description: `the stated figure is ${value} for this purpose`, provenance: null }],
    exceptions: [], dependsOn: [], operativeLineage: null, sufficiency: "COMPLETE", sufficiencyReasons: [], provenance: null,
    compilerVersion: "audit", sourceContentVersion: null,
  } as unknown as IRRule;
}

/** Fix B's verdict for one value against one evidence universe, using the production functions end to end. */
export function fixBGrounds(value: string, evidence: NumericAssertionEvidenceText[]): { grounded: boolean; status: string; groundedIn: string | null } {
  const inv = collectNumericAssertions("audit", [probeRule(value)], []);
  if (inv.items.length === 0) return { grounded: false, status: "NOT_A_MATERIAL_NUMERIC_UNDER_FIX_B", groundedIn: null };
  const g = groundNumericAssertions(inv, evidence)[0]!;
  return { grounded: g.status !== "UNGROUNDED" && g.status !== "AMBIGUOUS", status: g.status, groundedIn: g.groundedIn };
}

/** The historical universe's own test, verbatim: substring containment in the anchor (or linked) text. */
const norm = (s: string) => s.replace(/\s+/g, " ").trim();
export function accountabilityGrounds(value: string, universeText: string): boolean {
  return norm(universeText).includes(value);
}

// ---------------------------------------------------------------------------
// Preserved-artifact walk (same shape the §15 scan uses).
// ---------------------------------------------------------------------------

interface ToolEvidence { text: string; requestKind: "DEFINITION" | "PROVISION"; requestKey: string }
interface Site { file: string; jsonPath: string; rules: IRRule[]; definitions: IRDefinition[]; operativeText: string | null; contextExcerpts: string[]; toolTexts: ToolEvidence[] }

const STRING_FIELD = (o: Record<string, unknown>, ...names: string[]): string | null => {
  for (const n of names) if (typeof o[n] === "string" && (o[n] as string).length > 0) return o[n] as string;
  return null;
};

function collectSites(file: string, root: unknown): Site[] {
  const sites: Site[] = [];
  const walk = (node: unknown, jsonPath: string, text: string | null, excerpts: string[], tools: ToolEvidence[]) => {
    if (Array.isArray(node)) { node.forEach((v, i) => walk(v, `${jsonPath}[${i}]`, text, excerpts, tools)); return; }
    if (typeof node !== "object" || node === null) return;
    const obj = node as Record<string, unknown>;
    const inputObj = (obj.compilerInput ?? obj.input) as Record<string, unknown> | undefined;
    const own = STRING_FIELD(obj, "operativeSourceText", "operativeText", "sourceText", "anchorText") ?? (inputObj && typeof inputObj === "object" ? STRING_FIELD(inputObj, "operativeSourceText") : null);
    const nextText = own ?? text;

    const bundle = (obj.contextBundle ?? inputObj?.contextBundle) as { items?: { excerptText?: unknown }[] } | undefined;
    const nextExcerpts = Array.isArray(bundle?.items) ? [...excerpts, ...bundle!.items!.map((i) => (typeof i.excerptText === "string" ? i.excerptText : "")).filter(Boolean)] : excerpts;

    // §7: only a tool result that actually carries authenticated, current, non-refused source text counts.
    const log = obj.toolCallLog as { retrievedSource?: { rawText?: unknown; evidenceStatus?: unknown; requestKind?: unknown; requestKey?: unknown }; evidenceUnresolved?: unknown; outputSummary?: unknown }[] | undefined;
    const nextTools = Array.isArray(log)
      ? [...tools, ...log.filter((e) => e.retrievedSource && typeof e.retrievedSource.rawText === "string" && e.retrievedSource.evidenceStatus === "CURRENT" && e.evidenceUnresolved !== true && !String(e.outputSummary ?? "").startsWith("refused")).map((e) => ({ text: e.retrievedSource!.rawText as string, requestKind: (e.retrievedSource!.requestKind === "PROVISION" ? "PROVISION" : "DEFINITION") as "DEFINITION" | "PROVISION", requestKey: String(e.retrievedSource!.requestKey ?? "") }))]
      : tools;

    if (Array.isArray(obj.rules) && obj.rules.length > 0 && obj.rules.every((r) => typeof (r as { ruleId?: unknown })?.ruleId === "string")) {
      sites.push({ file, jsonPath: jsonPath || "$", rules: obj.rules as IRRule[], definitions: Array.isArray(obj.definitions) ? (obj.definitions as IRDefinition[]).filter((d) => typeof (d as { definitionId?: unknown }).definitionId === "string") : [], operativeText: nextText, contextExcerpts: nextExcerpts, toolTexts: nextTools });
    }
    for (const [k, v] of Object.entries(obj)) { if (k !== "rules" && k !== "definitions") walk(v, `${jsonPath}.${k}`, nextText, nextExcerpts, nextTools); }
  };
  walk(root, "", null, [], []);
  return sites;
}

function* jsonFiles(dir: string): Generator<string> {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* jsonFiles(full);
    else if (e.isFile() && e.name.endsWith(".json")) yield full;
  }
}

export function auditCorpus() {
  const counts: Record<PairClass, number> = { BOTH_GROUNDED: 0, BOTH_UNGROUNDED: 0, ACCOUNTABILITY_ONLY_GROUNDED: 0, FIX_B_ONLY_GROUNDED: 0, INSUFFICIENT_ARTIFACT: 0 };
  const disagreements: Record<string, unknown>[] = [];
  let sites = 0, artifacts = 0, assertions = 0, sitesWithToolEvidence = 0;

  for (const root of ROOTS) {
    if (!fs.existsSync(root)) continue;
    for (const file of jsonFiles(root)) {
      let parsed: unknown;
      try { parsed = JSON.parse(fs.readFileSync(file, "utf8")); } catch { continue; }
      const found = collectSites(file, parsed);
      if (found.length === 0) continue;
      artifacts++;
      for (const site of found) {
        sites++;
        if (site.toolTexts.length > 0) sitesWithToolEvidence++;
        const asserted = attributionCheck({ rules: site.rules, definitions: site.definitions } as unknown as SemanticCompilationResult, "", "").assertedAmounts;
        if (asserted.length === 0) continue;
        assertions += asserted.length;

        if (site.operativeText === null) { counts.INSUFFICIENT_ARTIFACT += asserted.length; continue; }

        const accountabilityUniverse = site.operativeText;
        const complete: NumericAssertionEvidenceText[] = [
          { scope: "OPERATIVE", evidenceId: "OPERATIVE", label: "preserved operative source", text: site.operativeText },
          ...site.contextExcerpts.map((t, i) => ({ scope: "CONTEXT" as const, evidenceId: `CTX_${i}`, label: `preserved context excerpt ${i}`, text: t })),
          // R2: the retrieval identity travels with the text, so the audit exercises the same
          // relation test production now applies - not a looser stand-in for it.
          ...site.toolTexts.map((t, i) => ({ scope: "CONTEXT" as const, evidenceId: `TOOL_${i}`, label: `authenticated ${t.requestKind === "DEFINITION" ? `definition of "${t.requestKey}"` : `section ${t.requestKey}`}`, text: t.text, requestKind: t.requestKind, scopeKey: t.requestKind === "DEFINITION" ? normalizeTermScopeKey(t.requestKey) : normalizeSectionScopeKey(t.requestKey), requestKey: t.requestKey })),
        ];

        for (const value of asserted) {
          const acc = accountabilityGrounds(value, accountabilityUniverse);
          const fb = fixBGrounds(value, complete);
          const cls: PairClass = acc && fb.grounded ? "BOTH_GROUNDED" : !acc && !fb.grounded ? "BOTH_UNGROUNDED" : acc ? "ACCOUNTABILITY_ONLY_GROUNDED" : "FIX_B_ONLY_GROUNDED";
          counts[cls]++;
          if (cls === "FIX_B_ONLY_GROUNDED" || cls === "ACCOUNTABILITY_ONLY_GROUNDED") {
            disagreements.push({ pairClass: cls, file: site.file, jsonPath: site.jsonPath, value, fixBStatus: fb.status, fixBGroundedIn: fb.groundedIn, accountabilityGrounded: acc, toolEvidencePresent: site.toolTexts.length > 0, contextEvidencePresent: site.contextExcerpts.length > 0 });
          }
        }
      }
    }
  }
  return { artifacts, sites, sitesWithToolEvidence, assertions, counts, disagreements };
}

if (process.argv[1]?.endsWith("evidence-universe-audit.ts")) {
  const r = auditCorpus();
  console.log(JSON.stringify({ ...r, disagreements: r.disagreements.slice(0, 25) }, null, 2));
}
