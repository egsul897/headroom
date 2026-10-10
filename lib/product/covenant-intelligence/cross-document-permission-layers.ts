/**
 * Favorable-result honesty — keep legal, numerical, condition, and certification
 * layers distinguishable. A legacy basket number is never a certified
 * package-wide permission.
 */

import type {
  ConditionEvidenceAuthority,
  CrossDocumentCovenantVerdict,
  CrossDocumentOverallResult,
  LegalOutcomeAuthority,
} from "./cross-document-covenant";
import type { CrossDocumentNumericalLayer } from "./cross-document-capacity";
import type { CertifiedPathEnumeration } from "../north-star-workflow/verified-path-enumeration";

export const CROSS_DOCUMENT_PERMISSION_LAYERS_VERSION =
  "product.cross-document-permission-layers.v1" as const;

export interface CrossDocumentPermissionLayers {
  version: typeof CROSS_DOCUMENT_PERMISSION_LAYERS_VERSION;
  /** Numerically modeled capacity (legacy engine / pathway flats) — not permission. */
  numericallyModeledCapacity: {
    authority: CrossDocumentNumericalLayer["authority"];
    postsToLedger: false;
    mostRestrictiveMillions: number | null;
    pathwayCount: number;
    note: string;
  };
  /** Legally applicable restrictions identified by conjunction evaluator. */
  legallyApplicableRestrictions: Array<{
    documentId: string;
    sectionRef: string;
    family: string;
    stance: string;
  }>;
  conditionsSatisfied: string[];
  conditionsUnresolved: string[];
  overallPermission: CrossDocumentOverallResult;
  conditionEvidenceAuthority: ConditionEvidenceAuthority;
  legalOutcomeAuthority: LegalOutcomeAuthority;
  /** Never true solely because the caller supplied favorable knownFacts. */
  isVerifiedProductionCapacity: false | true;
  certificationStatus: {
    pathEnumerationAuthority: CertifiedPathEnumeration["authority"] | "NOT_RUN";
    verified4dOutcome: string | null;
    legacyIsCertifiedPackagePermission: false;
    note: string;
  };
  honestyGuards: {
    legacySeparatedFromVerdict: true;
    favorableRequiresAllApplicableDocuments: true;
    missingRestrictionIsUnknown: true;
    stipulatedFactsAreNotVerifiedCapacity: true;
  };
}

export function projectPermissionLayers(args: {
  verdict: CrossDocumentCovenantVerdict;
  numerical: CrossDocumentNumericalLayer;
  pathEnumeration?: CertifiedPathEnumeration | null;
}): CrossDocumentPermissionLayers {
  const conditionsUnresolved = [
    ...args.verdict.unknowns,
    ...args.verdict.conditions.filter((c) =>
      args.verdict.unknowns.some((u) => u.includes(c) || u.toLowerCase().includes(c.slice(0, 24).toLowerCase())),
    ),
  ];
  // Permissions that cleared without residual unknowns on that pathway.
  const conditionsSatisfied = args.verdict.conditions.filter(
    (c) => !conditionsUnresolved.some((u) => u.includes(c) || u.toLowerCase().includes(c.slice(0, 24).toLowerCase())),
  );

  return {
    version: CROSS_DOCUMENT_PERMISSION_LAYERS_VERSION,
    numericallyModeledCapacity: {
      authority: args.numerical.authority,
      postsToLedger: false,
      mostRestrictiveMillions: args.numerical.mostRestrictiveMillions,
      pathwayCount: args.numerical.pathwayCapacities.length,
      note:
        "LEGACY_ENGINE / pathway FLAT_AMOUNT figures only. Never treat as certified package-wide permission.",
    },
    legallyApplicableRestrictions: args.verdict.evaluatedRestrictions.map((r) => ({
      documentId: r.documentId,
      sectionRef: r.sectionRef,
      family: r.family,
      stance: r.stance,
    })),
    conditionsSatisfied,
    conditionsUnresolved: [...new Set(conditionsUnresolved)],
    overallPermission: args.verdict.overallResult,
    conditionEvidenceAuthority: args.verdict.conditionEvidenceAuthority,
    legalOutcomeAuthority: args.verdict.legalOutcomeAuthority,
    isVerifiedProductionCapacity: args.verdict.isVerifiedProductionCapacity,
    certificationStatus: {
      pathEnumerationAuthority: args.pathEnumeration?.authority ?? "NOT_RUN",
      verified4dOutcome: args.numerical.verifiedSimulation?.outcome ?? null,
      legacyIsCertifiedPackagePermission: false,
      note:
        "crossDocumentVerdict and legacySimulation remain separate fields. Certification requires verified-execution EXECUTED / CERTIFIED_4E — not a basket number. Caller-stipulated knownFacts are hypothetical only.",
    },
    honestyGuards: {
      legacySeparatedFromVerdict: true,
      favorableRequiresAllApplicableDocuments: true,
      missingRestrictionIsUnknown: true,
      stipulatedFactsAreNotVerifiedCapacity: true,
    },
  };
}
