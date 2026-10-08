/**
 * Model comparison harness for locally runnable open-weight models.
 * Uses the same source-backed fixture corpus for each adapter.
 * Does NOT invent benchmark results — only measures what is executed.
 *
 * IPV failure-mode IDs (independent verification protocol labels used by this
 * harness; not Claude-owned acceptance fixtures):
 *   IPV-16 missing material restriction
 *   IPV-19 incorrect entity scope
 *   IPV-20 missing amendment / wrong source version
 *   IPV-21 incomplete dependency closure
 *   IPV-22 false permission / threshold-as-permission
 */
import { compileLocalSemanticUnit, type LocalCompileUnit } from "../local-semantic";
import type { InferenceExecutionMode } from "./types";
import { InferenceRegistry } from "./registry";

export const IPV_FAILURE_MODES = [
  { id: "IPV-16", name: "missing_material_restriction", description: "Material restriction present in source omitted from output" },
  { id: "IPV-19", name: "incorrect_entity_scope", description: "Entity scope wrong or over-broad" },
  { id: "IPV-20", name: "amendment_or_version_error", description: "Missing amendment effect or wrong source version" },
  { id: "IPV-21", name: "incomplete_dependency_closure", description: "Controlling dependency omitted from compile set" },
  { id: "IPV-22", name: "false_permission", description: "Permission inferred from threshold or structural recognition alone" },
] as const;

export interface ComparisonCase {
  caseId: string;
  unit: LocalCompileUnit;
  /** Expected deterministic signals for scoring without claiming semantic verification. */
  expect?: {
    mustMentionExcerpts?: string[];
    forbidPermissionWithoutSupport?: boolean;
    ipvModes?: (typeof IPV_FAILURE_MODES)[number]["id"][];
  };
}

export interface ModelComparisonRow {
  modelId: string;
  mode: InferenceExecutionMode;
  caseId: string;
  status: string;
  latencyMs: number;
  memoryUsageMb: number | null;
  costUsd: number | null;
  invalidStructuredOutput: boolean;
  falsePermissionSuspected: boolean;
  sourceSpanPresent: boolean;
  ipvFlags: string[];
  notes: string[];
  /** Measured only — never fabricated. */
  measured: true;
}

export interface ModelComparisonReport {
  harnessVersion: "model-comparison.v1";
  ranAt: string;
  hardwareNote: string;
  modelsAttempted: string[];
  rows: ModelComparisonRow[];
  limitations: string[];
}

function memoryMb(): number | null {
  try {
    return Math.round(process.memoryUsage().heapUsed / (1024 * 1024));
  } catch {
    return null;
  }
}

export async function runModelComparison(args: {
  cases: ComparisonCase[];
  models: { modelId: string; mode: InferenceExecutionMode; model?: string }[];
  registry?: InferenceRegistry;
  hardwareNote?: string;
}): Promise<ModelComparisonReport> {
  const registry = args.registry ?? new InferenceRegistry();
  const rows: ModelComparisonRow[] = [];
  const limitations: string[] = [];

  for (const model of args.models) {
    for (const c of args.cases) {
      const before = memoryMb();
      const result = await compileLocalSemanticUnit(c.unit, {
        mode: model.mode,
        registry,
        model: model.model ?? model.modelId,
      });
      const after = memoryMb();
      const ipvFlags: string[] = [];
      let falsePermissionSuspected = false;
      const out = result.output;
      if (out) {
        for (const rule of out.rules) {
          if (rule.permissionOrProhibition === "PERMISSION") {
            const excerpt = rule.support?.excerpt ?? "";
            if (/^\$?[\d,%.\s]+$/.test(excerpt.trim()) || !rule.support?.citation) {
              falsePermissionSuspected = true;
              ipvFlags.push("IPV-22");
            }
          }
        }
        for (const must of c.expect?.mustMentionExcerpts ?? []) {
          const blob = JSON.stringify(out);
          if (!blob.includes(must)) ipvFlags.push("IPV-16");
        }
      } else if (result.inference.status === "TRANSPORT_ERROR" || result.inference.status === "NOT_FOUND") {
        limitations.push(`${model.modelId}/${c.caseId}: ${result.inference.error ?? result.inference.status}`);
      }
      if ((c.expect?.ipvModes ?? []).includes("IPV-21") && (c.unit.dependencyTexts?.length ?? 0) === 0) {
        ipvFlags.push("IPV-21");
      }
      rows.push({
        modelId: model.modelId,
        mode: model.mode,
        caseId: c.caseId,
        status: result.inference.status,
        latencyMs: result.inference.latencyMs,
        memoryUsageMb: after != null && before != null ? Math.max(0, after - before) : after,
        costUsd: result.inference.cost.costUsd,
        invalidStructuredOutput: result.inference.status === "SCHEMA_INVALID" || (result.inference.status === "OK" && result.output == null),
        falsePermissionSuspected,
        sourceSpanPresent: (out?.rules ?? []).every((r) => Boolean(r.support?.citation && r.support?.excerpt)),
        ipvFlags: [...new Set(ipvFlags)],
        notes: result.inference.error ? [result.inference.error] : [],
        measured: true,
      });
    }
  }

  if (!process.env.OLLAMA_BASE_URL && args.models.some((m) => m.mode === "OLLAMA_LOCAL")) {
    limitations.push("OLLAMA_LOCAL requested but OLLAMA_BASE_URL may be unreachable in this environment; transport errors are recorded, not invented as quality scores.");
  }
  if (!process.env.VLLM_BASE_URL && args.models.some((m) => m.mode === "VLLM_LOCAL")) {
    limitations.push("VLLM_LOCAL requested but VLLM_BASE_URL may be unreachable in this environment; transport errors are recorded, not invented as quality scores.");
  }

  return {
    harnessVersion: "model-comparison.v1",
    ranAt: new Date().toISOString(),
    hardwareNote: args.hardwareNote ?? `process.arch=${process.arch}; platform=${process.platform}; model weights not bundled in Git`,
    modelsAttempted: args.models.map((m) => m.modelId),
    rows,
    limitations,
  };
}
