import type { CovenantFamily, ExceptionRecordV2, PermissionClassification } from "./types";

export interface SearchQueryV2 {
  text?: string;
  covenantFamily?: CovenantFamily | CovenantFamily[];
  issuerKey?: string | string[];
  permissionClassification?: PermissionClassification | PermissionClassification[];
  hasLocalConditions?: boolean;
  hasRemoteConditions?: boolean;
  negativeControlOnly?: boolean;
  unresolvedControllingSources?: boolean;
}

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

export function searchExceptionsV2(records: ExceptionRecordV2[], query: SearchQueryV2 = {}): ExceptionRecordV2[] {
  const families = new Set(asArray(query.covenantFamily));
  const issuers = new Set(asArray(query.issuerKey));
  const classes = new Set(asArray(query.permissionClassification));
  const text = query.text?.trim().toLowerCase();

  return records.filter((r) => {
    if (families.size && !families.has(r.covenantFamily)) return false;
    if (issuers.size && !issuers.has(r.sourceIdentity.issuerKey)) return false;
    if (classes.size && !classes.has(r.permissionClassification)) return false;
    if (query.hasLocalConditions === true && r.localConditions.length === 0) return false;
    if (query.hasLocalConditions === false && r.localConditions.length > 0) return false;
    if (query.hasRemoteConditions === true && r.remoteConditions.length === 0) return false;
    if (query.hasRemoteConditions === false && r.remoteConditions.length > 0) return false;
    if (query.negativeControlOnly === true && !r.isNegativeControl) return false;
    if (query.unresolvedControllingSources === true && r.unresolvedControllingSources.length === 0) return false;
    if (text) {
      const hay = [
        r.exceptionId,
        r.exactExceptionText,
        r.paraphraseSummary,
        r.classificationRationale,
        r.exceptionSectionRef,
        ...r.definedTerms,
        ...r.localConditions.map((c) => c.text),
        ...r.remoteConditions.map((c) => c.text),
      ]
        .join("\n")
        .toLowerCase();
      if (!hay.includes(text)) return false;
    }
    return true;
  });
}
