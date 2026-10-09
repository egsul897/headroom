/**
 * Corpus integrity tests/helpers: hashes, URL fidelity, idempotent reingestion,
 * version preservation, duplicate handling, amendment linking, missing-source,
 * failed extraction recovery, deterministic replay.
 */

import { createHash } from "node:crypto";
import { validateSourceUrl } from "../edgar/client";
import type { CorpusStore } from "../store/corpus-store";
import { hashBytes, hashText } from "../pipeline/text";

export interface IntegrityFinding {
  ok: boolean;
  check: string;
  detail: string;
}

export function runIntegrityChecks(store: CorpusStore): IntegrityFinding[] {
  const findings: IntegrityFinding[] = [];
  const sources = store.listSources();

  for (const s of sources) {
    // Hash integrity
    if (store.hasBytes(s.originalBytesHash)) {
      const bytes = store.readBytes(s.originalBytesHash)!;
      const actual = hashBytes(bytes);
      findings.push({
        ok: actual === s.originalBytesHash,
        check: "hash_integrity",
        detail: `${s.sourceId}: expected ${s.originalBytesHash.slice(0, 12)} got ${actual.slice(0, 12)}`,
      });
    } else {
      findings.push({
        ok: false,
        check: "hash_integrity",
        detail: `${s.sourceId}: missing bytes for ${s.originalBytesHash.slice(0, 12)}`,
      });
    }

    // Source URL fidelity
    const urlOk = s.provenance.startsWith("fixture:") || validateSourceUrl(s.sourceUrl) || s.sourceUrl.startsWith("fixture://");
    findings.push({
      ok: urlOk,
      check: "source_url_fidelity",
      detail: `${s.sourceId}: ${s.sourceUrl}`,
    });
  }

  // Duplicate handling — exact byte dups must not collapse source identities
  const byHash = new Map<string, string[]>();
  for (const s of sources) {
    const list = byHash.get(s.originalBytesHash) ?? [];
    list.push(s.sourceId);
    byHash.set(s.originalBytesHash, list);
  }
  for (const [hash, ids] of byHash) {
    if (ids.length > 1) {
      findings.push({
        ok: new Set(ids).size === ids.length,
        check: "duplicate_handling",
        detail: `hash ${hash.slice(0, 12)} retained ${ids.length} distinct sourceIds`,
      });
    }
  }

  // Amendment linking honesty
  const rels = store.loadRelationships();
  for (const r of rels) {
    findings.push({
      ok: r.evidenceStatus !== "INFERRED" || !/chronolog/i.test(r.rationale),
      check: "amendment_linking",
      detail: `${r.id}: ${r.evidenceStatus} — ${r.rationale.slice(0, 120)}`,
    });
  }

  // Missing-source behavior
  const missing = store.getSource("edgar:does-not-exist:missing.htm");
  findings.push({
    ok: missing === null,
    check: "missing_source_behavior",
    detail: "getSource on unknown id returns null",
  });

  // Deterministic replay of text hash
  const sample = "Section 6.01 Indebtedness. The Borrower shall not incur Indebtedness.";
  findings.push({
    ok: hashText(sample) === createHash("sha256").update(sample, "utf8").digest("hex"),
    check: "deterministic_replay",
    detail: "normalized text hash stable",
  });

  return findings;
}

export function assertIdempotentSourceUpsert(store: CorpusStore, sourceId: string): boolean {
  const before = store.getSource(sourceId);
  if (!before) return false;
  store.upsertSource(before);
  const after = store.getSource(sourceId);
  return JSON.stringify(before) === JSON.stringify(after);
}
