/**
 * Non-promoting library status model for basket/formula intelligence.
 *
 * Concepts requested by mission:
 *   RESEARCH_HYPOTHESIS | SOURCE_SUPPORTED | LEGALLY_REVIEW_REQUIRED | VERIFIED | EXECUTABLE
 *
 * Compatible mapping onto existing import-contract verificationLane without
 * inventing a competing production schema or auto-promoting to VERIFIED/EXECUTABLE.
 */

import type { SemanticRoleClassification } from "./semantic-role";
import type { GoverningSourceBinding } from "./governing-binding";
import type { FormulaDependencyGraph } from "./dependency-graph";

export const LIBRARY_STATUSES = [
  "RESEARCH_HYPOTHESIS",
  "SOURCE_SUPPORTED",
  "LEGALLY_REVIEW_REQUIRED",
  "VERIFIED",
  "EXECUTABLE",
] as const;

export type LibraryStatus = (typeof LIBRARY_STATUSES)[number];

export interface LibraryStatusAssignment {
  status: LibraryStatus;
  /** Existing import-contract lane — never REVIEWER_VERIFIED without gates. */
  verificationLane: "SOURCE_SUPPORTED_HYPOTHESIS" | "REVIEWER_VERIFIED";
  executable: false;
  verified: false;
  rationale: string;
}

/**
 * Assign library status. VERIFIED and EXECUTABLE are intentionally unreachable
 * without independent legal + financial verification gates (not performed here).
 */
export function assignLibraryStatus(input: {
  semantic: SemanticRoleClassification;
  binding: GoverningSourceBinding;
  graph: FormulaDependencyGraph;
  independentLegalVerified?: boolean;
  independentFinancialVerified?: boolean;
}): LibraryStatusAssignment {
  const gates =
    input.independentLegalVerified === true && input.independentFinancialVerified === true;

  // Hard non-promotion: this library never sets VERIFIED/EXECUTABLE on its own.
  if (gates && input.graph.completeness.fullyClosed && input.binding.sufficientForAffirmativePermission) {
    // Even if gates were hypothetically true, refuse silent promotion from this module.
    return {
      status: "LEGALLY_REVIEW_REQUIRED",
      verificationLane: "SOURCE_SUPPORTED_HYPOTHESIS",
      executable: false,
      verified: false,
      rationale:
        "Independent gates are external to this library; status remains LEGALLY_REVIEW_REQUIRED until Integration Lead / Legal Core promotion.",
    };
  }

  if (input.binding.spanReplayable && input.binding.extractedSpan?.provenance.matchKind !== "NOT_FOUND") {
    if (input.semantic.suppliesPermissionAuthority && input.binding.sufficientForAffirmativePermission) {
      return {
        status: "SOURCE_SUPPORTED",
        verificationLane: "SOURCE_SUPPORTED_HYPOTHESIS",
        executable: false,
        verified: false,
        rationale: "Source-backed operative permission language bound; not legally verified or executable.",
      };
    }
    if (input.semantic.isCeilingOrThreshold || input.semantic.role === "DEFINITION") {
      return {
        status: "SOURCE_SUPPORTED",
        verificationLane: "SOURCE_SUPPORTED_HYPOTHESIS",
        executable: false,
        verified: false,
        rationale: "Source-backed non-permission (ceiling/definition/threshold); not executable capacity.",
      };
    }
    return {
      status: "LEGALLY_REVIEW_REQUIRED",
      verificationLane: "SOURCE_SUPPORTED_HYPOTHESIS",
      executable: false,
      verified: false,
      rationale: "Span recoverable but governing/legal context incomplete.",
    };
  }

  return {
    status: "RESEARCH_HYPOTHESIS",
    verificationLane: "SOURCE_SUPPORTED_HYPOTHESIS",
    executable: false,
    verified: false,
    rationale: "Research hypothesis without replayable governing source binding.",
  };
}

export function assertNeverExecutable(status: LibraryStatusAssignment): void {
  if (status.executable !== false || status.verified !== false) {
    throw new Error("Basket Formula Library must not mark VERIFIED/EXECUTABLE without external gates");
  }
  if (status.status === "VERIFIED" || status.status === "EXECUTABLE") {
    throw new Error("VERIFIED/EXECUTABLE unreachable from assignLibraryStatus without external promotion");
  }
}
