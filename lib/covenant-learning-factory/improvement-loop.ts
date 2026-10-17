/**
 * Bounded improvement proposals from evaluation failures.
 * Proposals are never auto-applied; golden answers are never mutated here.
 */

import { createHash } from "node:crypto";
import type { ImprovementProposal, LearningErrorRecord, PackageAuditManifest } from "./types";

function pid(parts: string[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 20);
}

export function proposeBoundedImprovements(args: {
  manifest: PackageAuditManifest;
  errors: LearningErrorRecord[];
}): ImprovementProposal[] {
  const out: ImprovementProposal[] = [];
  const now = new Date().toISOString();
  const { manifest, errors } = args;

  for (const err of errors) {
    let lever: ImprovementProposal["lever"] = "COMPILATION";
    let summary = "";

    switch (err.class) {
      case "DANGEROUS_OMISSION":
      case "DISCOVERY_GAP":
      case "COVERAGE_GAP":
        lever = "COVERAGE";
        summary =
          "Investigate Pass A → exception-catalog / unit materialization gap; extend generalized catalog discovery only with regression + held-out evidence.";
        break;
      case "OPERATIVE_IDENTITY_UNRESOLVED":
        lever = "STRUCTURE";
        summary =
          "Improve package-graph / amendment operative-identity confirmation for multi-document packages; keep fail-closed for provisional identity.";
        break;
      case "UNSUPPORTED_SEMANTICS":
      case "COMPILATION_REFUSAL":
        lever = "COMPILATION";
        summary =
          "Classify unsupported semantics into the error ledger; add a generalized compiler path only when an independent fidelity case exists.";
        break;
      case "FIDELITY_FAILURE":
      case "CALCULATION_MISMATCH":
        lever = "INTERPRETATION";
        summary =
          "Do not change golden answers. Diagnose IR/source span mismatch and propose a bounded compiler fix with before/after independent eval.";
        break;
      case "STRUCTURE_PARSE_FAILURE":
        lever = "STRUCTURE";
        summary = "Reproduce structural parse failure on the source hash; fix generalized structure ownership without issuer branches.";
        break;
      default:
        lever = "RETRIEVAL";
        summary = "Record failure for retrieval/context review; no automatic promotion.";
    }

    out.push({
      proposalId: pid([manifest.runId, err.errorId, lever]),
      packageKey: manifest.packageKey,
      runId: manifest.runId,
      lever,
      summary,
      bounded: true,
      autoApply: false,
      evidenceRefs: [err.errorId, manifest.runId],
      createdAt: now,
      state: "PROPOSED",
    });
  }

  // Deduplicate by lever+summary
  const seen = new Set<string>();
  return out.filter((p) => {
    const k = `${p.lever}|${p.summary}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
