/**
 * §15 - offline scan: apply Fix B's numeric-assertion inventory to every compiler output this
 * repository has already preserved, and report how many additional ungrounded prose numerics the
 * fix exposes.
 *
 * The discipline that matters here is what it REFUSES to do. A preserved artifact that kept the
 * compiled rules but not the source text they were compiled from cannot be grounded - and a
 * missing source is not an absent source. Those are reported INSUFFICIENT_ARTIFACT, never counted
 * as ungrounded, and never counted as grounded either.
 *
 * Zero cost: reads files, calls nothing.
 *
 * Forensic tooling. Nothing in the production pipeline imports it.
 */
import fs from "node:fs";
import path from "node:path";
import { collectNumericAssertions, groundNumericAssertions } from "../../lib/contract-model/compiler/semantic-verification/numeric-assertion";
import type { NumericAssertionEvidenceText, NumericGroundingStatus } from "../../lib/contract-model/compiler/semantic-verification/types";
import type { IRDefinition, IRRule } from "../../lib/contract-model/ir/types";

const ROOTS = ["docs", "tests/fixtures/unseen-packages"];

interface CompilerOutputSite {
  file: string;
  jsonPath: string;
  rules: IRRule[];
  definitions: IRDefinition[];
  operativeSourceText: string | null;
  contextExcerpts: string[];
}

function isRuleArray(v: unknown): v is IRRule[] {
  return Array.isArray(v) && v.length > 0 && v.every((r) => typeof r === "object" && r !== null && typeof (r as { ruleId?: unknown }).ruleId === "string");
}

const STRING_FIELD = (o: Record<string, unknown>, ...names: string[]): string | null => {
  for (const n of names) if (typeof o[n] === "string" && (o[n] as string).length > 0) return o[n] as string;
  return null;
};

/** The operative text and the context excerpts are looked for on the compiler-output object itself and on its immediate ancestors - artifacts nest these differently, and an ancestor's window is still this unit's window. */
function collectSites(file: string, root: unknown): CompilerOutputSite[] {
  const sites: CompilerOutputSite[] = [];
  const walk = (node: unknown, jsonPath: string, inheritedText: string | null, inheritedExcerpts: string[]) => {
    if (Array.isArray(node)) { node.forEach((v, i) => walk(v, `${jsonPath}[${i}]`, inheritedText, inheritedExcerpts)); return; }
    if (typeof node !== "object" || node === null) return;
    const obj = node as Record<string, unknown>;

    const own = STRING_FIELD(obj, "operativeSourceText", "operativeText", "sourceText", "anchorText");
    const inputObj = (obj.compilerInput ?? obj.input) as Record<string, unknown> | undefined;
    const fromInput = inputObj && typeof inputObj === "object" ? STRING_FIELD(inputObj, "operativeSourceText") : null;
    const text = own ?? fromInput ?? inheritedText;

    const bundle = (obj.contextBundle ?? inputObj?.contextBundle) as { items?: { excerptText?: unknown }[] } | undefined;
    const excerpts = Array.isArray(bundle?.items)
      ? [...inheritedExcerpts, ...bundle!.items!.map((i) => (typeof i.excerptText === "string" ? i.excerptText : "")).filter((s) => s.length > 0)]
      : inheritedExcerpts;

    if (isRuleArray(obj.rules)) {
      const definitions = Array.isArray(obj.definitions) ? (obj.definitions as IRDefinition[]).filter((d) => typeof (d as { definitionId?: unknown }).definitionId === "string") : [];
      sites.push({ file, jsonPath: jsonPath || "$", rules: obj.rules, definitions, operativeSourceText: text, contextExcerpts: excerpts });
    }
    for (const [k, v] of Object.entries(obj)) {
      if (k === "rules" || k === "definitions") continue;
      walk(v, `${jsonPath}.${k}`, text, excerpts);
    }
  };
  walk(root, "", null, []);
  return sites;
}

function* jsonFiles(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* jsonFiles(full);
    else if (entry.isFile() && entry.name.endsWith(".json")) yield full;
  }
}

export function scanPreservedOutputs() {
  const byStatus: Record<string, number> = { GROUNDED_OPERATIVE: 0, GROUNDED_CONTEXT: 0, NORMALIZED_EQUIVALENT: 0, UNGROUNDED: 0, AMBIGUOUS: 0, INSUFFICIENT_ARTIFACT: 0 };
  const ungrounded: { file: string; jsonPath: string; ruleOrDefinitionId: string; fieldPath: string; rawText: string; fieldClass: string; contextPreserved: boolean; reason: string }[] = [];
  const insufficient: { file: string; jsonPath: string; assertions: number; reason: string }[] = [];
  let filesRead = 0, filesWithCompilerOutput = 0, sitesScanned = 0, rulesScanned = 0, assertionsFound = 0;

  for (const root of ROOTS) {
    if (!fs.existsSync(root)) continue;
    for (const file of jsonFiles(root)) {
      filesRead++;
      let parsed: unknown;
      try { parsed = JSON.parse(fs.readFileSync(file, "utf8")); } catch { continue; }
      const sites = collectSites(file, parsed);
      if (sites.length === 0) continue;
      filesWithCompilerOutput++;

      for (const site of sites) {
        sitesScanned++;
        rulesScanned += site.rules.length;
        const inventory = collectNumericAssertions(`${site.file}${site.jsonPath}`, site.rules, site.definitions);
        if (inventory.items.length === 0) continue;
        assertionsFound += inventory.items.length;

        if (site.operativeSourceText === null) {
          byStatus.INSUFFICIENT_ARTIFACT! += inventory.items.length;
          insufficient.push({ file: site.file, jsonPath: site.jsonPath, assertions: inventory.items.length, reason: "the artifact preserved the compiled rules but not the operative source text they were compiled from - a figure cannot be called unsupported when the source was never kept" });
          continue;
        }

        const evidence: NumericAssertionEvidenceText[] = [
          { scope: "OPERATIVE", evidenceId: "PRESERVED_OPERATIVE_TEXT", label: "the preserved operative source text", text: site.operativeSourceText },
          ...site.contextExcerpts.map((text, i) => ({ scope: "CONTEXT" as const, evidenceId: `PRESERVED_CONTEXT_${i}`, label: `preserved context excerpt ${i}`, text })),
        ];
        const definitionIds = new Set(site.definitions.map((d) => d.definitionId));
        for (const grounding of groundNumericAssertions(inventory, evidence)) {
          // An IRDefinition's figures come from the DEFINITION's own text, which lives outside the
          // covenant window. When the artifact preserved no retrieved/context excerpts, grounding a
          // definition's assertion against the covenant's operative text is not a fair test - and an
          // unfair test that produces an accusation is worse than no test.
          if (grounding.status === "UNGROUNDED" && definitionIds.has(grounding.assertion.ruleOrDefinitionId) && site.contextExcerpts.length === 0) {
            byStatus.INSUFFICIENT_ARTIFACT! += 1;
            insufficient.push({ file: site.file, jsonPath: site.jsonPath, assertions: 1, reason: `${grounding.assertion.fieldPath} belongs to an IRDefinition whose own source text this artifact did not preserve - not gradeable` });
            continue;
          }
          byStatus[grounding.status as NumericGroundingStatus]! += 1;
          if (grounding.status === "UNGROUNDED") {
            // `contextPreserved: false` says the grounding universe here was the operative window
            // alone - the figure may well be supported by a retrieved definition this artifact did
            // not keep. The row is a review candidate, never a proven fabrication.
            ungrounded.push({ file: site.file, jsonPath: site.jsonPath, ruleOrDefinitionId: grounding.assertion.ruleOrDefinitionId, fieldPath: grounding.assertion.fieldPath, rawText: grounding.assertion.rawText, fieldClass: grounding.assertion.fieldClass, contextPreserved: site.contextExcerpts.length > 0, reason: grounding.reason });
          }
        }
      }
    }
  }

  return { filesRead, filesWithCompilerOutput, sitesScanned, rulesScanned, assertionsFound, byStatus, ungrounded, insufficient };
}

if (process.argv[1]?.endsWith("numeric-grounding-scan.ts")) {
  const result = scanPreservedOutputs();
  const dir = "docs/phase-3-numeric-grounding";
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "05-existing-output-scan.json"), JSON.stringify({
    mission: "HEADROOM PHASE-3 - NUMERIC GROUNDING VERIFICATION REMEDIATION (Fix B)",
    section: "§15 - offline scan of every preserved compiler output",
    paidModelCalls: 0,
    scope: ROOTS,
    ...result,
    honestLimits: [
      "A preserved artifact whose source text was not kept is INSUFFICIENT_ARTIFACT, never UNGROUNDED - the fix is not permitted to accuse a figure whose evidence was thrown away.",
      "Context here is whatever context EXCERPTS the artifact itself preserved, which is weaker than the live verifier's authenticated evidence set (retrieved-evidence.ts re-resolves and hash-checks each one). An UNGROUNDED result in this scan is therefore a candidate for review, not a proven fabrication.",
      "Hand-authored IR fixtures are included: they are compiler OUTPUT shapes, and a prose numeric in one is exactly as ungrounded as a model's would be - but their provenance is an author, not a model.",
    ],
  }, null, 2));
  console.log(JSON.stringify({ ...result, ungrounded: result.ungrounded.slice(0, 40), insufficient: result.insufficient.slice(0, 10) }, null, 2));
}
