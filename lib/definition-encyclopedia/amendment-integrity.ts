/**
 * Amendment integrity reconciliation.
 *
 * Text-change pairs from the encyclopedia are OBSERVATIONS only. Legal effect
 * requires instrument identity, effective dates, amendment authority, and
 * supersession — when those cannot be established, status is UNRESOLVED.
 */

import type { AmendmentChange, DefinitionExample } from "./schema";

export type AmendmentAuthorityStatus =
  | "TEXT_OBSERVATION_ONLY"
  | "SAME_PACKAGE_VERSION_PAIR"
  | "SUPERSESSION_UNRESOLVED"
  | "EFFECTIVE_DATE_UNRESOLVED"
  | "AMENDMENT_AUTHORITY_UNRESOLVED"
  | "LEGAL_EFFECT_UNRESOLVED";

export interface AmendmentIntegrityRecord {
  changeId: string;
  packageKey: string;
  normalizedTerm: string;
  beforeExampleId: string;
  afterExampleId: string;
  beforeAgreementVersion: string;
  afterAgreementVersion: string;
  textChanged: boolean;
  beforeTextSha256: string;
  afterTextSha256: string;
  instrumentIdentity: {
    beforePackageKey: string;
    afterPackageKey: string;
    samePackage: boolean;
    beforeSourceId: string;
    afterSourceId: string;
  };
  effectiveDating: {
    beforeLabel: string;
    afterLabel: string;
    parsedBeforeDate: string | null;
    parsedAfterDate: string | null;
    status: "ORDERED" | "UNORDERED" | "UNPARSED";
  };
  supersession: {
    status: "UNRESOLVED" | "SAME_INSTRUMENT_LINEAGE_HYPOTHESIS";
    note: string;
  };
  authorityStatus: AmendmentAuthorityStatus;
  legalEffectClaim: "NONE";
  observation: string;
}

function parseDateFromVersion(label: string): string | null {
  const m = label.match(/(20\d{2}-\d{2}-\d{2})/) || label.match(/\b(20\d{2})\b/);
  return m?.[1] ?? null;
}

export function reconcileAmendmentChanges(args: {
  changes: AmendmentChange[];
  definitions: DefinitionExample[];
}): AmendmentIntegrityRecord[] {
  const byId = new Map(args.definitions.map((d) => [d.exampleId, d]));
  return args.changes.map((c) => {
    const before = byId.get(c.beforeExampleId);
    const after = byId.get(c.afterExampleId);
    const beforeDate = parseDateFromVersion(c.beforeAgreementVersion);
    const afterDate = parseDateFromVersion(c.afterAgreementVersion);
    let datingStatus: AmendmentIntegrityRecord["effectiveDating"]["status"] = "UNPARSED";
    if (beforeDate && afterDate) {
      datingStatus = beforeDate <= afterDate ? "ORDERED" : "UNORDERED";
    }
    const samePackage = c.packageKey === before?.source.packageKey && c.packageKey === after?.source.packageKey;

    let authorityStatus: AmendmentAuthorityStatus = "TEXT_OBSERVATION_ONLY";
    if (!samePackage) authorityStatus = "AMENDMENT_AUTHORITY_UNRESOLVED";
    else if (datingStatus === "UNPARSED") authorityStatus = "EFFECTIVE_DATE_UNRESOLVED";
    else if (c.textChanged) authorityStatus = "LEGAL_EFFECT_UNRESOLVED";
    else authorityStatus = "SAME_PACKAGE_VERSION_PAIR";

    return {
      changeId: c.changeId,
      packageKey: c.packageKey,
      normalizedTerm: c.normalizedTerm,
      beforeExampleId: c.beforeExampleId,
      afterExampleId: c.afterExampleId,
      beforeAgreementVersion: c.beforeAgreementVersion,
      afterAgreementVersion: c.afterAgreementVersion,
      textChanged: c.textChanged,
      beforeTextSha256: c.beforeTextSha256,
      afterTextSha256: c.afterTextSha256,
      instrumentIdentity: {
        beforePackageKey: before?.source.packageKey ?? c.packageKey,
        afterPackageKey: after?.source.packageKey ?? c.packageKey,
        samePackage: !!samePackage,
        beforeSourceId: before?.source.sourceId ?? "unknown",
        afterSourceId: after?.source.sourceId ?? "unknown",
      },
      effectiveDating: {
        beforeLabel: c.beforeAgreementVersion,
        afterLabel: c.afterAgreementVersion,
        parsedBeforeDate: beforeDate,
        parsedAfterDate: afterDate,
        status: datingStatus,
      },
      supersession: {
        status: samePackage ? "SAME_INSTRUMENT_LINEAGE_HYPOTHESIS" : "UNRESOLVED",
        note: samePackage
          ? "Same packageKey lineage hypothesis only — Document.supersedesDocumentId / AmendmentEffect not established."
          : "No supersession edge available; legal authority unresolved.",
      },
      authorityStatus,
      legalEffectClaim: "NONE",
      observation: c.observation,
    };
  });
}
