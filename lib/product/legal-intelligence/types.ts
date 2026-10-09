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
    | "CONTRADICTION"
    /** A legacy covenant-engine number: never legally verified executable capacity. */
    | "LEGACY_EXECUTION"
    | "UNRESOLVED_CROSS_REFERENCE"
    | "AMBIGUOUS_GOVERNING_PROVISION";
  statement: string;
  invalidatesExecutability: boolean;
}

/** Everything the challenge stage needs to know about a package's evidentiary state. Every field is evidence-derived, never assumed. */
export interface LegalChallengeContext {
  hasApprovedFinancialSnapshot: boolean;
  /** True only when the company has ACTIVE utilization ledger evidence; never hardcoded. */
  hasUtilizationLedger: boolean;
  hasVerifiedIrPackage: boolean;
  outOfPackageAmendments: string[];
  unresolvedDefinitionTerms: string[];
  entityScopeUnresolved: boolean;
  /** Cross-references the package could not resolve to a governing provision. */
  unresolvedCrossReferences?: string[];
  /** Provisions whose governing authority (which document / version governs) is ambiguous. */
  ambiguousGoverningProvisions?: string[];
}

/** How a package result was produced. Fixture paths are regression surfaces, never generalized capability. */
export type LegalExecutionBasis = "FIXTURE_PATH" | "GENERALIZED_FAIL_CLOSED";

export interface PackageLegalPathResult {
  schemaVersion: "product.legal-intelligence-path.v1" | "product.legal-intelligence-path.v2";
  /** v2: present on every result produced after the legacy/verified separation. */
  executionBasis?: LegalExecutionBasis;
  generatedAt: string;
  companyId: string;
  packageKey: string;
  pathExecuted: string[];
  conclusions: LegalConclusion[];
  challenges: ChallengeFinding[];
  /** Conclusions whose executability is EXECUTABLE_VERIFIED after challenge. LEGACY_ENGINE never counts. */
  survivingExecutableConclusions: number;
  /** v2: legacy covenant-engine conclusions that survived challenge as LEGACY_ENGINE (reported, never verified capability). */
  survivingLegacyConclusions?: number;
  blockedReasons: string[];
  metrics: {
    covenantRowsExamined: number;
    packageFacts: number;
    capacityExecuted: number;
    unresolved: number;
  };
}
