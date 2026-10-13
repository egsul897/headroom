/**
 * Compilation-pipeline audit for operative-authority / calculation mismatches.
 *
 * Scans known production surfaces that can label a governing document while
 * publishing capacity from discovery / operative text. Additive, read-only,
 * issuer-agnostic. Does not rewrite historical evidence.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

export const PIPELINE_AUTHORITY_CALCULATION_AUDIT_VERSION =
  "pipeline-authority-calculation-audit.v1";

export type PipelineAuditFinding = {
  surface: string;
  severity: "P0_MISMATCH" | "P1_RISK" | "INFO_SAFE";
  summary: string;
  evidence: string;
};

const SURFACES: Array<{
  relativePath: string;
  surface: string;
  /**
   * Patterns that indicate capacity publication without OA/calculation sanitize.
   * Absence of sanitize near capacity publication is a P1 risk when the file
   * also remaps governingDocumentId independently of discovery documentId.
   */
  remapsGoverning: RegExp;
  publishesCapacity: RegExp;
  hasSanitizeGate: RegExp;
}> = [
  {
    relativePath: "lib/contract-model/analysis/operative-covenant-package.ts",
    surface: "operative-covenant-package",
    remapsGoverning: /governingDocumentId\s*=\s*provision\?\.governingDocumentId/,
    publishesCapacity: /SOURCE_BACKED_GROSS_CONTRACTUAL|sourceBackedGrossCapacityUsd/,
    hasSanitizeGate: /sanitizeCapacityForGoverningAuthority/,
  },
  {
    relativePath: "lib/product/real-dashboard-vertical-slice/verified-executable-compile-core.ts",
    surface: "verified-executable-compile-core",
    remapsGoverning: /governingDocumentId/,
    publishesCapacity: /sourceBackedGrossCapacityMm|SOURCE_BACKED_COMPILED_GROSS/,
    hasSanitizeGate: /operative_text_document_ne_governing_document|sanitizeCapacityForGoverningAuthority/,
  },
  {
    relativePath: "lib/product/real-dashboard-vertical-slice/ve-position-feed.ts",
    surface: "ve-position-feed",
    remapsGoverning: /governingDocumentId/,
    publishesCapacity: /SOURCE_BACKED_COMPILED_GROSS|sourceBackedGross/,
    hasSanitizeGate: /operative_text_document_ne_governing_document|sanitizeCapacityForGoverningAuthority/,
  },
  {
    relativePath: "lib/product/real-dashboard-vertical-slice/phase3-compile-bridge.ts",
    surface: "phase3-compile-bridge",
    remapsGoverning: /governingDocumentId/,
    publishesCapacity: /availableAmount|GROSS|capacity/,
    hasSanitizeGate: /operative_text_document_ne_governing_document|sanitizeCapacityForGoverningAuthority/,
  },
  {
    relativePath: "lib/contract-model/analysis/offline-package-compile.ts",
    surface: "offline-package-compile",
    remapsGoverning: /governingDocumentId|operativeSourceRemap/,
    publishesCapacity: /availableAmountUsd|VERIFIED_EXECUTABLE/,
    hasSanitizeGate: /operative_text_document_ne_governing_document|sanitizeCapacityForGoverningAuthority/,
  },
];

/**
 * Read-only source audit of compilation surfaces for OA/calculation consistency.
 * Call from tests; never mutates production behavior.
 */
export function auditCompilationPipelineAuthorityCalculation(
  repoRoot: string = process.cwd(),
): {
  version: string;
  findings: PipelineAuditFinding[];
  p0Count: number;
  p1Count: number;
} {
  const findings: PipelineAuditFinding[] = [];

  for (const s of SURFACES) {
    const abs = join(repoRoot, s.relativePath);
    let src: string;
    try {
      src = readFileSync(abs, "utf8");
    } catch {
      findings.push({
        surface: s.surface,
        severity: "INFO_SAFE",
        summary: "Surface file absent on this tip — skipped",
        evidence: s.relativePath,
      });
      continue;
    }

    const remaps = s.remapsGoverning.test(src);
    const publishes = s.publishesCapacity.test(src);
    const gated = s.hasSanitizeGate.test(src);

    if (s.surface === "operative-covenant-package") {
      findings.push({
        surface: s.surface,
        severity: gated && remaps && publishes ? "INFO_SAFE" : "P0_MISMATCH",
        summary: gated
          ? "Sanitize gate present at OA remap + capacity publication boundary"
          : "Missing sanitizeCapacityForGoverningAuthority at OA/capacity boundary",
        evidence: s.relativePath,
      });
      continue;
    }

    // Downstream surfaces that publish capacity but do not themselves remap
    // governing≠discovery are INFO if they only use unit.documentId as governing,
    // else P1 if they can carry a remapped governingDocumentId without sanitize.
    if (publishes && remaps && !gated) {
      findings.push({
        surface: s.surface,
        severity: "P1_RISK",
        summary:
          "Publishes capacity and references governingDocumentId without local OA/calculation sanitize — must consume sanitized operative-package units or refuse cross-doc amounts",
        evidence: s.relativePath,
      });
    } else if (publishes && !remaps) {
      findings.push({
        surface: s.surface,
        severity: "INFO_SAFE",
        summary:
          "Capacity publication present; no independent governing≠discovery remap in this file (relies on upstream sanitize)",
        evidence: s.relativePath,
      });
    } else if (gated) {
      findings.push({
        surface: s.surface,
        severity: "INFO_SAFE",
        summary: "Local sanitize / refusal marker present",
        evidence: s.relativePath,
      });
    } else {
      findings.push({
        surface: s.surface,
        severity: "INFO_SAFE",
        summary: "No capacity publication + governing remap pair detected",
        evidence: s.relativePath,
      });
    }
  }

  return {
    version: PIPELINE_AUTHORITY_CALCULATION_AUDIT_VERSION,
    findings,
    p0Count: findings.filter((f) => f.severity === "P0_MISMATCH").length,
    p1Count: findings.filter((f) => f.severity === "P1_RISK").length,
  };
}
