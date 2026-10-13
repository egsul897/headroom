/**
 * Turn discovered exhibits into fetch targets.
 *
 * The historical pilot-100-v2 acquisition queue kept 149 fetchable rows out of
 * 868 distinct agreements. Expansion does not stop at that ranked queue: every
 * kept non-UNKNOWN agreement is either fetched or logged UNRESOLVED with a
 * reason. Nothing is invented when a URL cannot be resolved.
 */

import { createHash } from "node:crypto";
import type { DebtDocumentKind, ExhibitRef, IssuerRef } from "../edgar-historical-backfill/types";
import { archivesDocUrl } from "../edgar-historical-backfill/ibr-resolver";
import { isReservedBlindIssuer, isReservedBlindReference } from "./blind";

export type ExpandUniverse = "pilot-100" | "sp1500";

export type ExpandTarget = {
  targetId: string;
  cik: string;
  ticker?: string;
  issuerName?: string;
  accessionNumber: string;
  filename: string;
  filingDate: string;
  form: string;
  exhibitType: string;
  documentKind: DebtDocumentKind;
  agreementIdentityKey: string;
  description: string;
  url: string | null;
  disposition: "FETCH" | "UNRESOLVED" | "EXCLUDED_BLIND";
  reason: string;
};

const PILOT_KINDS = new Set<DebtDocumentKind>([
  "CREDIT_AGREEMENT",
  "INDENTURE",
  "AMENDMENT",
  "RESTATEMENT",
  "SUPPLEMENTAL_INDENTURE",
  "WAIVER",
  "CONSENT",
  "INTERCREDITOR",
  "GUARANTEE",
  "SECURITY_AGREEMENT",
  "OTHER_DEBT_AGREEMENT",
]);

const SP1500_KINDS = new Set<DebtDocumentKind>([
  "CREDIT_AGREEMENT",
  "INDENTURE",
  "RESTATEMENT",
  "SUPPLEMENTAL_INDENTURE",
  "AMENDMENT",
]);

function isEx4OrEx10(exhibitType: string): boolean {
  const t = exhibitType.toUpperCase().replace(/\s+/g, "");
  return /^EX-10(\.|$)/.test(t) || /^EX-4(\.|$)/.test(t) || t === "EX-10" || t === "EX-4";
}

function isFetchableExhibitUri(uri: string): boolean {
  if (!uri) return false;
  if (/index\.htm/i.test(uri)) return false;
  return /^https:\/\/www\.sec\.gov\//i.test(uri) || /^https:\/\/data\.sec\.gov\//i.test(uri);
}

export function resolveExhibitBodyUrl(exhibit: ExhibitRef): { url: string | null; reason: string } {
  const candidates = [exhibit.sourceUri, exhibit.ibr?.resolvedSourceUri].filter((u): u is string => Boolean(u));
  for (const url of candidates) {
    if (isFetchableExhibitUri(url)) return { url, reason: "RESOLVED_URL" };
  }
  const filename = exhibit.isIncorporatedByReference
    ? (exhibit.ibr?.resolvedFilename ?? "")
    : exhibit.filename;
  const accession = exhibit.isIncorporatedByReference
    ? (exhibit.ibr?.resolvedAccessionNumber ?? "")
    : exhibit.accessionNumber;
  if (accession && filename && !/index\.htm/i.test(filename) && /\.(htm|html|txt|pdf)$/i.test(filename)) {
    return { url: archivesDocUrl(exhibit.cik, accession, filename), reason: "CONSTRUCTED_FROM_ACCESSION_FILENAME" };
  }
  if (exhibit.isIncorporatedByReference) {
    if (!exhibit.ibr?.resolvedAccessionNumber) return { url: null, reason: "IBR_UNRESOLVED" };
    if (!exhibit.ibr.resolvedFilename) return { url: null, reason: "IBR_PARTIAL_NO_FILENAME" };
    return { url: null, reason: "IBR_UNRESOLVED" };
  }
  if (!exhibit.sourceUri) return { url: null, reason: "URL_MISSING" };
  return { url: null, reason: "URL_NOT_FETCHABLE" };
}

const KIND_RANK: Record<string, number> = {
  CREDIT_AGREEMENT: 0,
  RESTATEMENT: 1,
  INDENTURE: 2,
  SUPPLEMENTAL_INDENTURE: 3,
  AMENDMENT: 4,
};

export function buildExpandTargets(params: {
  exhibits: ExhibitRef[];
  issuers: IssuerRef[];
  universe: ExpandUniverse;
}): ExpandTarget[] {
  const byCik = new Map(params.issuers.map((i) => [i.cik.padStart(10, "0"), i]));
  const allowed = params.universe === "sp1500" ? SP1500_KINDS : PILOT_KINDS;
  const targets: ExpandTarget[] = [];
  const seen = new Set<string>();

  for (const exhibit of params.exhibits) {
    if (!allowed.has(exhibit.documentKind)) continue;
    if (params.universe === "sp1500" && !isEx4OrEx10(exhibit.exhibitType)) continue;
    const cik = exhibit.cik.padStart(10, "0");
    const issuer = byCik.get(cik);
    const dedupeKey = `${cik}|${exhibit.accessionNumber}|${exhibit.filename.toLowerCase()}|${exhibit.agreementIdentityKey}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    const targetId = createHash("sha256").update(dedupeKey).digest("hex").slice(0, 24);
    const blind =
      isReservedBlindIssuer({
        cik,
        ticker: issuer?.ticker,
        title: issuer?.title,
        name: issuer?.title,
      }) ||
      isReservedBlindReference(exhibit.description) ||
      isReservedBlindReference(exhibit.filename) ||
      isReservedBlindReference(exhibit.sourceUri);
    if (blind) {
      targets.push({
        targetId,
        cik,
        ticker: issuer?.ticker,
        issuerName: issuer?.title,
        accessionNumber: exhibit.accessionNumber,
        filename: exhibit.filename,
        filingDate: exhibit.filingDate,
        form: exhibit.form,
        exhibitType: exhibit.exhibitType,
        documentKind: exhibit.documentKind,
        agreementIdentityKey: exhibit.agreementIdentityKey,
        description: exhibit.description,
        url: null,
        disposition: "EXCLUDED_BLIND",
        reason: "KNIFE_RIVER_RESERVED_BLIND",
      });
      continue;
    }
    const resolved = resolveExhibitBodyUrl(exhibit);
    targets.push({
      targetId,
      cik,
      ticker: issuer?.ticker,
      issuerName: issuer?.title,
      accessionNumber: exhibit.accessionNumber,
      filename: exhibit.filename,
      filingDate: exhibit.filingDate,
      form: exhibit.form,
      exhibitType: exhibit.exhibitType,
      documentKind: exhibit.documentKind,
      agreementIdentityKey: exhibit.agreementIdentityKey,
      description: exhibit.description,
      url: resolved.url,
      disposition: resolved.url ? "FETCH" : "UNRESOLVED",
      reason: resolved.reason,
    });
  }

  targets.sort((a, b) => {
    const ra = KIND_RANK[a.documentKind] ?? 9;
    const rb = KIND_RANK[b.documentKind] ?? 9;
    return ra - rb || b.filingDate.localeCompare(a.filingDate) || a.targetId.localeCompare(b.targetId);
  });
  return targets;
}
