/**
 * Duplicate detection for discovered exhibits.
 *
 * Collapses true repeats (same accession+filename, or same resolved IBR
 * target) WITHOUT discarding distinct amendments / restatements / versions —
 * those carry distinct agreementIdentityKeys by construction.
 */

import type { DuplicateGroup, ExhibitRef } from "./types";

export interface DedupeResult {
  kept: ExhibitRef[];
  groups: DuplicateGroup[];
  collapsedCount: number;
}

function exhibitId(e: ExhibitRef): string {
  return `${e.accessionNumber}:${e.filename}:${e.description.slice(0, 40)}`;
}

export function dedupeExhibits(exhibits: ExhibitRef[]): DedupeResult {
  const groups: DuplicateGroup[] = [];
  // Track discarded by array index so identical logical ids don't drop the keeper.
  const discardedIdx = new Set<number>();

  const memberMeta = (m: ExhibitRef) => ({
    accessionNumber: m.accessionNumber,
    filename: m.filename,
    filingDate: m.filingDate,
    documentKind: m.documentKind,
  });

  // Pass 1: exact accession + filename repeats (re-listed in multiple indexes).
  const byAccFile = new Map<string, number[]>();
  exhibits.forEach((e, idx) => {
    const key = `${e.accessionNumber}|${e.filename.toLowerCase()}`;
    const arr = byAccFile.get(key) ?? [];
    arr.push(idx);
    byAccFile.set(key, arr);
  });
  for (const [, idxs] of byAccFile) {
    if (idxs.length < 2) continue;
    const sorted = [...idxs].sort(
      (a, b) => exhibits[b]!.relevanceScore - exhibits[a]!.relevanceScore || a - b,
    );
    const keepIdx = sorted[0]!;
    const dropIdxs = sorted.slice(1);
    for (const d of dropIdxs) discardedIdx.add(d);
    const members = idxs.map((i) => exhibits[i]!);
    groups.push({
      agreementIdentityKey: exhibits[keepIdx]!.agreementIdentityKey,
      reason: "SAME_ACCESSION_FILENAME",
      members: members.map(memberMeta),
      keepId: exhibitId(exhibits[keepIdx]!),
      discardedIds: dropIdxs.map((i) => exhibitId(exhibits[i]!)),
    });
  }

  // Pass 2: same resolved IBR target (many 10-K/10-Q re-cite the same exhibit).
  const byIbr = new Map<string, number[]>();
  exhibits.forEach((e, idx) => {
    if (discardedIdx.has(idx)) return;
    if (!e.ibr?.resolvedAccessionNumber) return;
    const key = `${e.ibr.resolvedAccessionNumber}|${(e.ibr.resolvedExhibitType ?? e.ibr.resolvedFilename ?? "").toUpperCase()}`;
    if (key.endsWith("|")) return;
    const arr = byIbr.get(key) ?? [];
    arr.push(idx);
    byIbr.set(key, arr);
  });
  for (const [, idxs] of byIbr) {
    if (idxs.length < 2) continue;
    const sorted = [...idxs].sort((a, b) => {
      const ea = exhibits[a]!;
      const eb = exhibits[b]!;
      if (ea.isIncorporatedByReference !== eb.isIncorporatedByReference) {
        return ea.isIncorporatedByReference ? 1 : -1;
      }
      return eb.filingDate.localeCompare(ea.filingDate) || eb.relevanceScore - ea.relevanceScore || a - b;
    });
    const keepIdx = sorted[0]!;
    const dropIdxs = sorted.slice(1);
    for (const d of dropIdxs) discardedIdx.add(d);
    groups.push({
      agreementIdentityKey: exhibits[keepIdx]!.agreementIdentityKey,
      reason: "SAME_IBR_TARGET",
      members: idxs.map((i) => memberMeta(exhibits[i]!)),
      keepId: exhibitId(exhibits[keepIdx]!),
      discardedIds: dropIdxs.map((i) => exhibitId(exhibits[i]!)),
    });
  }

  // Pass 3: identical normalized identity for non-versioned base agreements only.
  const byIdentity = new Map<string, number[]>();
  exhibits.forEach((e, idx) => {
    if (discardedIdx.has(idx)) return;
    const arr = byIdentity.get(e.agreementIdentityKey) ?? [];
    arr.push(idx);
    byIdentity.set(e.agreementIdentityKey, arr);
  });
  const versioned = new Set(["AMENDMENT", "RESTATEMENT", "SUPPLEMENTAL_INDENTURE", "WAIVER", "CONSENT"]);
  for (const [identity, idxs] of byIdentity) {
    if (idxs.length < 2) continue;
    const keepKind = exhibits[idxs[0]!]!.documentKind;
    if (versioned.has(keepKind)) continue;
    const sorted = [...idxs].sort(
      (a, b) =>
        exhibits[b]!.filingDate.localeCompare(exhibits[a]!.filingDate) ||
        exhibits[b]!.relevanceScore - exhibits[a]!.relevanceScore ||
        a - b,
    );
    const keepIdx = sorted[0]!;
    const dropIdxs = sorted.slice(1);
    for (const d of dropIdxs) discardedIdx.add(d);
    if (dropIdxs.length === 0) continue;
    groups.push({
      agreementIdentityKey: identity,
      reason: "SAME_NORM_DESCRIPTION",
      members: idxs.map((i) => memberMeta(exhibits[i]!)),
      keepId: exhibitId(exhibits[keepIdx]!),
      discardedIds: dropIdxs.map((i) => exhibitId(exhibits[i]!)),
    });
  }

  const kept = exhibits.filter((_, idx) => !discardedIdx.has(idx));
  return {
    kept,
    groups,
    collapsedCount: discardedIdx.size,
  };
}

export function markDuplicates(exhibits: ExhibitRef[], groups: DuplicateGroup[]): ExhibitRef[] {
  const discarded = new Set(groups.flatMap((g) => g.discardedIds));
  const seenKeep = new Set<string>();
  return exhibits.map((e) => {
    const id = exhibitId(e);
    if (discarded.has(id)) {
      // Only mark surplus copies; the first surviving instance of a keepId stays DISCOVERED.
      if (!seenKeep.has(id) && groups.some((g) => g.keepId === id)) {
        seenKeep.add(id);
        return e;
      }
      return { ...e, discoveryStatus: "SKIPPED_DUPLICATE" as const };
    }
    return e;
  });
}
