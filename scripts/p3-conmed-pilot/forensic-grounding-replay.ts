/**
 * Harness R1 evidence: the legacy attribution helper and the new production-backed forensic
 * grounding, run side by side over the same inputs.
 *
 * Three demonstrations, all from preserved artifacts and deterministic fixtures:
 *   1. 7.2(f) - the historical false unsourced, reproduced and then corrected.
 *   2. rendering equivalence - "$50 million" in source, "$50,000,000" asserted.
 *   3. a corpus replay over every preserved compiler output with enough evidence to grade.
 *
 * Zero cost: credentials are cleared, no provider is contacted, no compiler is invoked.
 *
 * Forensic tooling. Nothing in the production pipeline imports it.
 */
import fs from "node:fs";
import path from "node:path";
import { attributionCheck } from "./span-validation";
import { groundCompiledResult, GROUNDING_STATUSES } from "./forensic-grounding";
import { buildDeterministicStages, contextBundlesFor, rehydrateNodeIds, sealedPopulation } from "./pipeline";
import { buildInput } from "./compile-run";
import { collectNumericAssertions, groundNumericAssertions } from "../../lib/contract-model/compiler/semantic-verification/numeric-assertion";
import type { NumericAssertionEvidenceText, NumericGroundingStatus } from "../../lib/contract-model/compiler/semantic-verification/types";
import type { SemanticCompilationResult } from "../../lib/contract-model/compiler/semantic/types";
import type { IRDefinition, IRRule } from "../../lib/contract-model/ir/types";

for (const key of ["AI_GATEWAY_API_KEY", "ANTHROPIC_API_KEY", "OPENAI_API_KEY"]) delete process.env[key];

const EVIDENCE_7_2_F = "docs/phase-3-numeric-grounding/paid-validation-evidence/THE_CASE-discovery-candidate:1084b12277d101d1e3928d59.json";

/** §5 - the historical case, both helpers, same inputs. */
export function replay72f() {
  const ev = JSON.parse(fs.readFileSync(EVIDENCE_7_2_F, "utf8"));
  const stages = buildDeterministicStages();
  const { rehydrated } = rehydrateNodeIds(sealedPopulation().eligible, stages.index);
  const bundles = contextBundlesFor(rehydrated, stages.access);
  const candidate = rehydrated.find((c) => String(c.normalizedSourceRef) === "7.2(f)")!;
  const input = buildInput(candidate, bundles.get(candidate.discoveryId), stages, null, []);
  const anchorText = input.operativeSourceText;
  const linkedText = (candidate.structuralNodeIds ?? []).slice(1).map((id) => stages.index.getNodeText(id, "DESCENDANTS")).join("\n\n");

  const cases = [
    { label: "RELATED", description: "the guarantee may cover up to 100% of the obligations of any Subsidiary Guarantor" },
    { label: "UNRELATED", description: "the Borrower may prepay up to 100% of the outstanding Revolving Loans at any time" },
  ];

  return cases.map((c) => {
    const rules = JSON.parse(JSON.stringify(ev.compilation.rules));
    rules[0].conditions[0].description = c.description;
    const compilation = { ...ev.compilation, rules, toolCallLog: ev.compilation.toolCallLog } as SemanticCompilationResult;
    const legacy = attributionCheck(compilation, anchorText, linkedText);
    const g = groundCompiledResult(input, compilation).assertions.find((a) => a.value === "100%");
    return {
      label: c.label,
      assertion: c.description,
      legacy: { assertedAmounts: legacy.assertedAmounts, supportedByAnchor: legacy.supportedByAnchor, violations: legacy.violations, unsourced: legacy.unsourced },
      new: g ? { status: g.status, groundedIn: g.groundedIn, relation: g.relation, matchedEvidenceId: g.matchedEvidenceId, fieldPath: g.fieldPath } : null,
    };
  });
}

/** §6 - rendering equivalence, the class the substring test could never see. */
export function replayRenderingEquivalence() {
  const SOURCE = "The Borrower shall not permit Liquidity to be less than $50 million at any time.";
  const rule = {
    ruleId: "r1-render", irSchemaVersion: "v1", companyId: "r1", instrumentKey: "r1", sourceDocumentId: "r1",
    sourceSectionRef: "1.01", covenantFamily: "OTHER", ruleType: "FINANCIAL_COVENANT", posture: "OBLIGATION", action: null,
    entityScope: [], entityScopeExcluded: [], transactionScope: null, capacityExpression: null,
    conditions: [{ conditionId: "c0", conditionType: "OTHER", expression: null, referencesDefinitionId: null, description: "Liquidity must be at least $50,000,000 at all times", provenance: null }],
    exceptions: [], dependsOn: [], operativeLineage: null, sufficiency: "COMPLETE", sufficiencyReasons: [], provenance: null,
    compilerVersion: "r1", sourceContentVersion: null,
  } as unknown as IRRule;

  const legacy = attributionCheck({ rules: [rule], definitions: [] } as unknown as SemanticCompilationResult, SOURCE, "");
  const inventory = collectNumericAssertions("r1-render", [rule], []);
  const evidence: NumericAssertionEvidenceText[] = [{ scope: "OPERATIVE", evidenceId: "PRIMARY_LOCAL", label: "the candidate's own operative source window", text: SOURCE }];
  const g = groundNumericAssertions(inventory, evidence)[0]!;
  return {
    source: SOURCE,
    asserted: "$50,000,000",
    legacy: { unsourced: legacy.unsourced, supportedByAnchor: legacy.supportedByAnchor },
    new: { status: g.status, groundedIn: g.groundedIn, matchedText: g.matchedText },
  };
}

// ---------------------------------------------------------------------------
// §9 corpus replay
// ---------------------------------------------------------------------------

const STRING_FIELD = (o: Record<string, unknown>, ...names: string[]): string | null => {
  for (const n of names) if (typeof o[n] === "string" && (o[n] as string).length > 0) return o[n] as string;
  return null;
};

interface Site { file: string; rules: IRRule[]; definitions: IRDefinition[]; operativeText: string | null; contextExcerpts: string[]; tools: { text: string; requestKind: "DEFINITION" | "PROVISION"; requestKey: string }[] }

function collectSites(file: string, root: unknown): Site[] {
  const sites: Site[] = [];
  const walk = (node: unknown, text: string | null, excerpts: string[], tools: Site["tools"]) => {
    if (Array.isArray(node)) { node.forEach((v) => walk(v, text, excerpts, tools)); return; }
    if (typeof node !== "object" || node === null) return;
    const obj = node as Record<string, unknown>;
    const inputObj = (obj.compilerInput ?? obj.input) as Record<string, unknown> | undefined;
    const nextText = STRING_FIELD(obj, "operativeSourceText", "operativeText", "sourceText", "anchorText") ?? (inputObj && typeof inputObj === "object" ? STRING_FIELD(inputObj, "operativeSourceText") : null) ?? text;
    const bundle = (obj.contextBundle ?? inputObj?.contextBundle) as { items?: { excerptText?: unknown }[] } | undefined;
    const nextExcerpts = Array.isArray(bundle?.items) ? [...excerpts, ...bundle!.items!.map((i) => (typeof i.excerptText === "string" ? i.excerptText : "")).filter(Boolean)] : excerpts;
    const log = obj.toolCallLog as { retrievedSource?: { rawText?: unknown; evidenceStatus?: unknown; requestKind?: unknown; requestKey?: unknown }; evidenceUnresolved?: unknown; outputSummary?: unknown }[] | undefined;
    const nextTools = Array.isArray(log)
      ? [...tools, ...log.filter((e) => e.retrievedSource && typeof e.retrievedSource.rawText === "string" && e.retrievedSource.evidenceStatus === "CURRENT" && e.evidenceUnresolved !== true && !String(e.outputSummary ?? "").startsWith("refused"))
          .map((e) => ({ text: e.retrievedSource!.rawText as string, requestKind: (e.retrievedSource!.requestKind === "PROVISION" ? "PROVISION" : "DEFINITION") as "DEFINITION" | "PROVISION", requestKey: String(e.retrievedSource!.requestKey ?? "") }))]
      : tools;

    if (Array.isArray(obj.rules) && obj.rules.length > 0 && obj.rules.every((r) => typeof (r as { ruleId?: unknown })?.ruleId === "string")) {
      sites.push({ file, rules: obj.rules as IRRule[], definitions: Array.isArray(obj.definitions) ? (obj.definitions as IRDefinition[]).filter((d) => typeof (d as { definitionId?: unknown }).definitionId === "string") : [], operativeText: nextText, contextExcerpts: nextExcerpts, tools: nextTools });
    }
    for (const [k, v] of Object.entries(obj)) if (k !== "rules" && k !== "definitions") walk(v, nextText, nextExcerpts, nextTools);
  };
  walk(root, null, [], []);
  return sites;
}

function* jsonFiles(dir: string): Generator<string> {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* jsonFiles(full);
    else if (e.isFile() && e.name.endsWith(".json")) yield full;
  }
}

export function replayCorpus() {
  const counts: Record<string, number> = Object.fromEntries([...GROUNDING_STATUSES, "INSUFFICIENT_ARTIFACT"].map((s) => [s, 0]));
  const disagreements: Record<string, unknown>[] = [];
  let sites = 0, assertions = 0;

  for (const root of ["docs", "tests/fixtures/unseen-packages"]) {
    if (!fs.existsSync(root)) continue;
    for (const file of jsonFiles(root)) {
      let parsed: unknown;
      try { parsed = JSON.parse(fs.readFileSync(file, "utf8")); } catch { continue; }
      for (const site of collectSites(file, parsed)) {
        const inventory = collectNumericAssertions(`${file}`, site.rules, site.definitions);
        if (inventory.items.length === 0) continue;
        sites++;
        assertions += inventory.items.length;
        if (site.operativeText === null) { counts.INSUFFICIENT_ARTIFACT! += inventory.items.length; continue; }

        const evidence: NumericAssertionEvidenceText[] = [
          { scope: "OPERATIVE", evidenceId: "OPERATIVE", label: "preserved operative source", text: site.operativeText },
          ...site.tools.map((t, i) => ({ scope: "CONTEXT" as const, evidenceId: `TOOL_${i}`, label: `authenticated ${t.requestKind === "DEFINITION" ? `definition of "${t.requestKey}"` : `section ${t.requestKey}`}`, text: t.text, requestKind: t.requestKind, scopeKey: t.requestKind === "DEFINITION" ? t.requestKey.toLowerCase().replace(/\s+/g, " ").trim() : t.requestKey.replace(/\s+/g, "").toLowerCase(), requestKey: t.requestKey })),
          ...site.contextExcerpts.map((t, i) => ({ scope: "CONTEXT" as const, evidenceId: `BUNDLE_${i}`, label: `preserved context excerpt ${i} (unauthenticated)`, text: t })),
        ];
        const legacy = attributionCheck({ rules: site.rules, definitions: site.definitions } as unknown as SemanticCompilationResult, site.operativeText, site.contextExcerpts.join("\n\n"));
        for (const g of groundNumericAssertions(inventory, evidence)) {
          counts[g.status as NumericGroundingStatus]! += 1;
          const legacySaysUnsourced = legacy.unsourced.includes(g.assertion.rawText);
          const newSaysGrounded = g.status !== "UNGROUNDED" && g.status !== "AMBIGUOUS";
          if (legacySaysUnsourced && newSaysGrounded) disagreements.push({ file, value: g.assertion.rawText, fieldPath: g.assertion.fieldPath, legacy: "unsourced", new: g.status, groundedIn: g.groundedIn, relation: g.relation });
        }
      }
    }
  }
  return { sites, assertions, counts, legacyCalledUnsourcedButIsGrounded: disagreements.length, disagreements };
}

if (process.argv[1]?.endsWith("forensic-grounding-replay.ts")) {
  const artifact = {
    mission: "HEADROOM PHASE-3 - FORENSIC ATTRIBUTION HARNESS CLEANUP (R1)",
    paidModelCalls: 0,
    case_7_2_f: replay72f(),
    renderingEquivalence: replayRenderingEquivalence(),
    corpus: replayCorpus(),
  };
  const dir = "docs/phase-3-forensic-harness-r1";
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "02-replay.json"), JSON.stringify(artifact, null, 2));
  console.log("7.2(f):");
  for (const r of artifact.case_7_2_f) console.log(`  ${r.label.padEnd(10)} legacy.unsourced=${JSON.stringify(r.legacy.unsourced)}  ->  new=${r.new?.status} (${r.new?.relation ?? "no relation established"})`);
  console.log(`rendering: legacy.unsourced=${JSON.stringify(artifact.renderingEquivalence.legacy.unsourced)} -> new=${artifact.renderingEquivalence.new.status} via ${JSON.stringify(artifact.renderingEquivalence.new.matchedText)}`);
  console.log(`corpus: ${artifact.corpus.assertions} assertions over ${artifact.corpus.sites} sites -> ${JSON.stringify(artifact.corpus.counts)}`);
  console.log(`legacy called unsourced but production grounds: ${artifact.corpus.legacyCalledUnsourcedButIsGrounded}`);
}
