/**
 * Executable legal-intelligence path results.
 * DISCOVERED ≠ VERIFIED. SOURCE_BACKED ≠ LEGALLY_EXECUTABLE.
 */

export type LegalConclusionKind =
  | "CAPACITY_EXECUTED"
  | "SIMULATION_EXECUTED"
  | "STRUCTURE_SOURCE_BACKED"
  | "PACKAGE_FACT"
  | "UNRESOLVED";

export type LegalExecutability =
  | "EXECUTABLE_VERIFIED"
  | "LEGACY_ENGINE"
  | "NOT_EXECUTABLE"
  | "BLOCKED";

export interface LegalConclusion {
  id: string;
  kind: LegalConclusionKind;
  statement: string;
  executability: LegalExecutability;
  evidenceCitations: string[];
  missingInputs: string[];
  limitations: string[];
  /** Always 0 unless verified-execution REQUIRE path succeeded. */
  promotedToLegalTruth: 0 | 1;
}

export interface ChallengeFinding {
  id: string;
  severity: "BLOCKER" | "MATERIAL" | "INFO";
  targetConclusionId: string | null;
  category:
    | "MISSING_FINANCIALS"
    | "MISSING_IR"
    | "MISSING_VERIFICATION"
    | "AMENDMENT_OUT_OF_PACKAGE"
    | "UNRESOLVED_DEFINITION"
    | "CROSS_PROVISION_RESTRICTION"
    | "UTILIZATION_UNKNOWN"
    | "ENTITY_SCOPE"
    | "CONTRADICTION";
  statement: string;
  invalidatesExecutability: boolean;
}

export interface PackageLegalPathResult {
  schemaVersion: "product.legal-intelligence-path.v1";
  generatedAt: string;
  companyId: string;
  packageKey: string;
  pathExecuted: string[];
  conclusions: LegalConclusion[];
  challenges: ChallengeFinding[];
  survivingExecutableConclusions: number;
  blockedReasons: string[];
  metrics: {
    covenantRowsExamined: number;
    packageFacts: number;
    capacityExecuted: number;
    unresolved: number;
  };
}
