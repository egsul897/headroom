/**
 * Local-model experimentation path: compile one authenticated legal unit plus
 * controlling dependency context via the provider-independent inference layer.
 * Every material representation must carry source support; unresolved stays unresolved.
 * Output is always UNVERIFIED.
 */
import { z } from "zod";
import { extractDeterministicCovenantFacts } from "../deterministic-extraction";
import { hashCompilationContext, hashPrompt, hashSchema } from "../inference/hash";
import { InferenceRegistry } from "../inference/registry";
import { resolveExecutionPolicy } from "../inference/policy";
import type { InferenceExecutionMode, InferenceResponse, SourceLineage } from "../inference/types";
import { INFERENCE_CONTRACT_VERSION } from "../inference/types";
import {
  LOCAL_SEMANTIC_COMPILER_VERSION,
  LOCAL_SEMANTIC_SCHEMA_VERSION,
  LocalSemanticOutputSchema,
  type LocalSemanticOutput,
} from "./schema";

export interface LocalCompileUnit {
  unitId: string;
  documentId: string | null;
  sectionRef: string | null;
  operativeText: string;
  dependencyTexts?: { ref: string; text: string; citation?: string | null }[];
  lineage?: SourceLineage;
}

export interface LocalCompileOptions {
  mode: InferenceExecutionMode;
  registry?: InferenceRegistry;
  model?: string;
  founderPaidAuthorization?: boolean;
  authorizationRef?: string | null;
}

export interface LocalCompileResult {
  compilerVersion: typeof LOCAL_SEMANTIC_COMPILER_VERSION;
  schemaVersion: typeof LOCAL_SEMANTIC_SCHEMA_VERSION;
  unitId: string;
  contextHash: string;
  deterministicFacts: ReturnType<typeof extractDeterministicCovenantFacts>;
  inference: InferenceResponse;
  output: LocalSemanticOutput | null;
  verificationStatus: "UNVERIFIED";
}

function buildLocalPrompt(unit: LocalCompileUnit): { system: string; user: string } {
  const system = [
    "Compile this covenant unit into structured JSON.",
    "Distinguish permission vs prohibition only when the operative text clearly supports it; otherwise UNRESOLVED.",
    "Never infer permission solely from a numerical threshold.",
    "Never infer operative authority solely from structural recognition.",
    "Every rule/definition needs citation + excerpt support.",
    "Unknown semantics stay in missingInputs / unsupportedSemantics.",
    `Schema version: ${LOCAL_SEMANTIC_SCHEMA_VERSION}. verificationStatus must be UNVERIFIED.`,
  ].join(" ");
  const deps = (unit.dependencyTexts ?? []).map((d) => `--- DEP ${d.ref} (${d.citation ?? ""}) ---\n${d.text}`).join("\n\n");
  const user = [
    `Unit: ${unit.unitId}`,
    `Document: ${unit.documentId ?? ""}`,
    `Section: ${unit.sectionRef ?? ""}`,
    "",
    "OPERATIVE:",
    unit.operativeText,
    "",
    "CONTROLLING DEPENDENCIES:",
    deps || "(none)",
  ].join("\n");
  return { system, user };
}

export async function compileLocalSemanticUnit(unit: LocalCompileUnit, options: LocalCompileOptions): Promise<LocalCompileResult> {
  const registry = options.registry ?? new InferenceRegistry();
  const deterministicFacts = extractDeterministicCovenantFacts({
    text: unit.operativeText,
    documentId: unit.documentId,
    candidateRef: unit.unitId,
    citation: unit.sectionRef,
  });
  const { system, user } = buildLocalPrompt(unit);
  const schemaJson = z.toJSONSchema(LocalSemanticOutputSchema) as Record<string, unknown>;
  const contextHash = hashCompilationContext({
    operativeSourceText: unit.operativeText,
    dependencyRefs: (unit.dependencyTexts ?? []).map((d) => d.ref),
    compilerVersion: LOCAL_SEMANTIC_COMPILER_VERSION,
    promptVersion: LOCAL_SEMANTIC_COMPILER_VERSION,
    schemaVersion: LOCAL_SEMANTIC_SCHEMA_VERSION,
  });

  const policy = resolveExecutionPolicy({
    mode: options.mode,
    founderPaidAuthorization: options.founderPaidAuthorization ?? false,
    authorizationRef: options.authorizationRef ?? null,
  });

  const inference = await registry.infer({
    contractVersion: INFERENCE_CONTRACT_VERSION as typeof INFERENCE_CONTRACT_VERSION,
    requestId: `local:${unit.unitId}:${contextHash.slice(0, 12)}`,
    purpose: "SEMANTIC_COMPILATION",
    prompt: user,
    systemPrompt: system,
    outputSchemaName: "local_semantic_output",
    outputSchema: schemaJson,
    contextHash,
    promptHash: hashPrompt(system, user),
    schemaHash: hashSchema(schemaJson),
    sourceLineage: unit.lineage ?? {
      companyId: null,
      packageKey: null,
      instrumentKey: null,
      documentId: unit.documentId,
      candidateRef: unit.unitId,
      operativeVersionRef: null,
      sourceContentHashes: [],
    },
    policy,
    model: options.model ? { provider: options.mode.toLowerCase(), model: options.model, modelVersion: null, endpoint: null } : null,
    recordedOutputKey: null,
  });

  let output: LocalSemanticOutput | null = null;
  if (inference.status === "DETERMINISTIC") {
    output = LocalSemanticOutputSchema.parse({
      schemaVersion: LOCAL_SEMANTIC_SCHEMA_VERSION,
      verificationStatus: "UNVERIFIED",
      rules: [],
      definitions: [],
      sharedCaps: [],
      missingInputs: ["SEMANTIC_INTERPRETATION_REQUIRES_MODEL", ...deterministicFacts.hypotheses.map((h) => h.kind)],
      unsupportedSemantics: deterministicFacts.hypotheses.map((h) => h.claim),
    });
  } else if (inference.status === "OK" && inference.output != null) {
    const parsed = LocalSemanticOutputSchema.safeParse(inference.output);
    if (parsed.success) {
      output = { ...parsed.data, verificationStatus: "UNVERIFIED" };
      // Enforce source support on material rules.
      for (const rule of output.rules) {
        if (!rule.support?.citation || !rule.support?.excerpt) {
          rule.sufficiency = "UNSUPPORTED";
          rule.unsupportedSemantics = [...rule.unsupportedSemantics, "Missing exact source support"];
        }
        if (rule.permissionOrProhibition !== "UNRESOLVED") {
          const onlyThreshold = deterministicFacts.facts.some((f) => f.kind === "NUMERICAL_THRESHOLD") && rule.support.excerpt.match(/^\$?[\d,%.\s]+$/);
          if (onlyThreshold) {
            rule.permissionOrProhibition = "UNRESOLVED";
            rule.unsupportedSemantics = [...rule.unsupportedSemantics, "Refused permission inference from numerical threshold alone"];
          }
        }
      }
    }
  }

  return {
    compilerVersion: LOCAL_SEMANTIC_COMPILER_VERSION,
    schemaVersion: LOCAL_SEMANTIC_SCHEMA_VERSION,
    unitId: unit.unitId,
    contextHash,
    deterministicFacts,
    inference,
    output,
    verificationStatus: "UNVERIFIED",
  };
}
