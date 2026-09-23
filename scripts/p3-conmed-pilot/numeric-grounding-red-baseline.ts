/**
 * FIX B - RED BASELINE. Runs the REAL verifier over the seven synthetic numeric-grounding cases and
 * records exactly what it does today, before any remediation. Zero cost: both model gates are
 * stubbed locally and every credential is cleared from this process's environment first, so nothing
 * here can reach a provider even if one is configured.
 *
 * The hole this is meant to photograph: a material numeric assertion that exists only in a
 * free-text IR field is never inventoried, so nothing ever compares it with the source and no
 * finding of any kind is produced - while the structured path, on the same shape, correctly
 * produces IR_ONLY.
 *
 * Forensic tooling. Nothing in the production pipeline imports it.
 */
import fs from "node:fs";
import path from "node:path";
import type { ZodType } from "zod";
import { verifyCompiledCandidate } from "../../lib/contract-model/compiler/semantic-verification/verify";
import type { StageCaller } from "../../lib/contract-model/compiler/llm-caller";
import type { SemanticVerificationResult } from "../../lib/contract-model/compiler/semantic-verification/types";
import { NG_CASES } from "../../tests/contract-model/numeric-grounding-fixtures";

for (const key of ["AI_GATEWAY_API_KEY", "ANTHROPIC_API_KEY", "OPENAI_API_KEY"]) delete process.env[key];

/** A local, non-network stub. isSynthetic:false so the routing/downgrade logic behaves as it would with a real reviewer - the point is to photograph deterministic behavior, not the stub-fallback path. */
function stub(response: unknown): StageCaller {
  return { providerName: "red-baseline-stub", model: "none", isSynthetic: false, async call<T>(schema: ZodType<T>): Promise<T> { return schema.parse(response); }, lastTelemetry: () => null };
}

export function summarize(caseId: string, result: SemanticVerificationResult) {
  const structuredIrOnly = result.reconciliation.items.filter((i) => i.classification === "IR_ONLY");
  return {
    caseId,
    status: result.status,
    findingTypes: result.findings.map((f) => `${f.findingType}/${f.severity}`).sort(),
    structuredIrOnlyCount: structuredIrOnly.length,
    structuredIrOnlyReasons: structuredIrOnly.map((i) => i.reason),
    materialUnresolvedCount: result.reconciliation.materialUnresolvedCount,
    /** Fix B's own output, absent by construction before the fix. */
    numericAssertionsInventoried: result.numericAssertions?.inventory.items.length ?? null,
    numericGroundingStatuses: result.numericAssertions?.groundings.map((g) => `${g.assertion.fieldPath}=${g.status}`) ?? null,
    numericGroundingFindings: result.findings.filter((f) => f.findingType === "UNSUPPORTED_NUMERIC_ASSERTION").length,
  };
}

export async function runAllCases() {
  const out = [];
  for (const [caseId, build] of Object.entries(NG_CASES)) {
    const result = await verifyCompiledCandidate(build(), {
      reviewCaller: stub({ findings: [], overallNotes: [] }),
      conditionSuspicionCaller: stub({ status: "NO_MATERIAL_CONDITION_SUSPECTED", evidence: [] }),
    });
    out.push(summarize(caseId, result));
  }
  return out;
}

if (process.argv[1]?.endsWith("numeric-grounding-red-baseline.ts")) {
  void (async () => {
    const cases = await runAllCases();
    const a = cases.find((c) => c.caseId === "A_unsupported_prose_percentage")!;
    const c = cases.find((c) => c.caseId === "C_structured_numeric_control")!;
    const f = cases.find((c) => c.caseId === "F_fabricated_excerpt")!;
    const artifact = {
      mission: "HEADROOM PHASE-3 - NUMERIC GROUNDING VERIFICATION REMEDIATION (Fix B)",
      section: "§3 RED BASELINE - the UNFIXED verifier's own behavior",
      paidModelCalls: 0,
      cases,
      redBaselineAssertions: {
        A_prose_100_percent_produces_no_numeric_grounding_finding: a.numericGroundingFindings === 0 && a.numericAssertionsInventoried === null,
        A_prose_100_percent_produces_no_structured_IR_ONLY_either: a.structuredIrOnlyCount === 0,
        C_structured_percent_still_produces_IR_ONLY: c.structuredIrOnlyCount > 0,
        F_fabricated_excerpt_produces_no_finding: f.numericGroundingFindings === 0,
      },
      interpretation:
        "The structured path works and is not the defect. The hole is that a numeric asserted only in free text is never inventoried at all, so no comparison against the source ever happens - which is why a 100% supported by nothing produced no finding, and why a fabricated provenance excerpt self-authenticated.",
    };
    const dir = "docs/phase-3-numeric-grounding";
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "02-red-baseline.json"), JSON.stringify(artifact, null, 2));
    console.log(JSON.stringify(artifact.redBaselineAssertions, null, 2));
    for (const row of cases) console.log(`${row.caseId.padEnd(34)} ${row.status.padEnd(34)} irOnly=${row.structuredIrOnlyCount} numericGroundingFindings=${row.numericGroundingFindings} findings=${row.findingTypes.join(",") || "(none)"}`);
  })();
}
