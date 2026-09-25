/**
 * R2 verified on the REAL evidence that produced the defect, not only on synthetic fixtures.
 *
 * The audit measured this pair on the live 7.2(f) compiler input and its own authenticated
 * getDefinition("Subsidiary Guarantor") retrieval - whose text genuinely contains "(100%)" - and
 * found Fix B grounding BOTH halves. This re-runs exactly that measurement after R2.
 *
 * Zero cost: credentials are cleared from the process and both verifier gates are stubbed.
 */
import fs from "node:fs";
import path from "node:path";
import type { ZodType } from "zod";
import { buildDeterministicStages, contextBundlesFor, rehydrateNodeIds, sealedPopulation } from "./pipeline";
import { buildInput } from "./compile-run";
import { verifyCompiledCandidate } from "../../lib/contract-model/compiler/semantic-verification/verify";
import type { StageCaller } from "../../lib/contract-model/compiler/llm-caller";

for (const key of ["AI_GATEWAY_API_KEY", "ANTHROPIC_API_KEY", "OPENAI_API_KEY"]) delete process.env[key];
const stub = (response: unknown): StageCaller => ({ providerName: "r2-stub", model: "none", isSynthetic: false, async call<T>(schema: ZodType<T>): Promise<T> { return schema.parse(response); }, lastTelemetry: () => null });

const EVIDENCE = "docs/phase-3-numeric-grounding/paid-validation-evidence/THE_CASE-discovery-candidate:1084b12277d101d1e3928d59.json";

export async function runRealCase() {
  const ev = JSON.parse(fs.readFileSync(EVIDENCE, "utf8"));
  const stages = buildDeterministicStages();
  const { rehydrated } = rehydrateNodeIds(sealedPopulation().eligible, stages.index);
  const bundles = contextBundlesFor(rehydrated, stages.access);
  const candidate = rehydrated.find((c) => String(c.normalizedSourceRef) === "7.2(f)")!;
  const input = buildInput(candidate, bundles.get(candidate.discoveryId), stages, null, []);

  const cases: { label: string; description: string }[] = [
    { label: "RELATED", description: "the guarantee may cover up to 100% of the obligations of any Subsidiary Guarantor" },
    { label: "UNRELATED", description: "the Borrower may prepay up to 100% of the outstanding Revolving Loans at any time" },
  ];

  const out = [];
  for (const c of cases) {
    const rules = JSON.parse(JSON.stringify(ev.compilation.rules));
    rules[0].conditions[0].description = c.description;
    const result = await verifyCompiledCandidate(
      { compilerInput: input, compilationResult: { ...ev.compilation, rules, toolCallLog: ev.compilation.toolCallLog } },
      { reviewCaller: stub({ findings: [], overallNotes: [] }), conditionSuspicionCaller: stub({ status: "NO_MATERIAL_CONDITION_SUSPECTED", evidence: [] }) },
    );
    const g = (result.numericAssertions?.groundings ?? [])[0];
    out.push({ label: c.label, assertion: c.description, value: g?.assertion.rawText ?? null, status: g?.status ?? null, groundedIn: g?.groundedIn ?? null, relation: g?.relation ?? null, matchedEvidenceId: g?.matchedEvidenceId ?? null, unrelatedEvidenceIds: g?.unrelatedEvidenceIds ?? [], unsupportedNumericFindings: result.findings.filter((f) => f.findingType === "UNSUPPORTED_NUMERIC_ASSERTION").length, verificationStatus: result.status });
  }
  return out;
}

if (process.argv[1]?.endsWith("r2-real-case-verification.ts")) {
  void (async () => {
    const results = await runRealCase();
    const dir = "docs/phase-3-numeric-grounding-scoping";
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "03-real-case-verification.json"), JSON.stringify({
      mission: "HEADROOM PHASE-3 - FIX B FREE-TEXT NUMERIC EVIDENCE-SCOPING TIGHTENING (R2)",
      section: "the audit's measured counterexample, re-measured on the real CONMED evidence after R2",
      paidModelCalls: 0,
      evidenceRecord: EVIDENCE,
      authenticatedEvidence: 'getDefinition("Subsidiary Guarantor") - real source text reading "... Pledge Eligible Foreign Subsidiary (100%)"',
      beforeR2: { RELATED: "GROUNDED_CONTEXT", UNRELATED: "GROUNDED_CONTEXT (the defect)" },
      afterR2: results,
    }, null, 2));
    for (const r of results) console.log(`${r.label.padEnd(10)} ${String(r.value).padEnd(6)} ${String(r.status).padEnd(24)} groundedIn=${r.groundedIn} findings=${r.unsupportedNumericFindings}\n           relation: ${r.relation ?? "(none established)"}`);
  })();
}
