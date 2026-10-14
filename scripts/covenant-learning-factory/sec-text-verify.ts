/**
 * Reconcile SEC-backfilled bytes against the original ingest (additive; no deletes, no byte overwrites).
 *
 * Finding: knowledge_sources.originalBytesHash = sha256(raw SEC response body) at original ingest
 * (lib/knowledge-factory/edgar/client.ts fetchDocument). Re-fetched bodies differ byte-wise for all 138,
 * but the original ingest ALSO recorded normalizedTextHash = sha256(normalizeText(parseDocument(bytes)))
 * (lib/knowledge-factory/pipeline/text.ts extractTextAsync). Recomputing it the same way proves text equality.
 *
 * Status per source (kf_source_text_backfill.verification):
 *   BYTES_VERIFIED  sha256(bytes) == originalBytesHash
 *   TEXT_VERIFIED   bytes differ, normalizedTextHash recomputed by the original pipeline matches
 *   UNVERIFIED_TEXT neither matches, but accession + exhibit filename match the source (same SEC document path)
 *   UNLINKED        identity check failed
 * Only BYTES_VERIFIED / TEXT_VERIFIED are linked for scoring by default.
 */
import { createNeonHttpsExecutor, redactConnectionSecrets } from "../../lib/covenant-learning-factory/store/neon-transport";
import { extractTextAsync } from "../../lib/knowledge-factory/pipeline/text";

const DRY = process.argv.includes("--dry-run");
async function main() {
  const ex = await createNeonHttpsExecutor(process.env.DATABASE_URL!);
  if (!DRY) {
    await ex.execute(`ALTER TABLE kf_source_text_backfill ADD COLUMN IF NOT EXISTS verification text`);
    await ex.execute(`ALTER TABLE kf_source_text_backfill ADD COLUMN IF NOT EXISTS "recomputedNormalizedTextHash" text`);
    await ex.execute(`ALTER TABLE kf_source_text_backfill ADD COLUMN IF NOT EXISTS "verifiedAt" timestamptz`);
  }
  const ids = await ex.execute(`SELECT "sourceId" FROM kf_source_text_backfill WHERE sha256 IS NOT NULL ORDER BY "sourceId"`);
  const counts: Record<string, number> = {};
  for (const { sourceId } of ids) {
    const [r] = await ex.execute(
      `SELECT b.sha256, ks."originalBytesHash" o, ks."normalizedTextHash" n, ks."accessionNumber" acc, ks."exhibitFilename" f,
              ks."sourceUrl" u, d.bytes
       FROM kf_source_text_backfill b JOIN knowledge_sources ks ON ks.id = b."sourceId"
       JOIN document_byte_objects d ON d."contentHash" = b.sha256 WHERE b."sourceId" = $1`, [sourceId]);
    if (!r) { counts.MISSING_BYTES = (counts.MISSING_BYTES ?? 0) + 1; continue; }
    const bytes = Buffer.from(r.bytes as Uint8Array);
    const t = await extractTextAsync(bytes, String(r.f));
    const url = String(r.u);
    const sameDoc = !!r.acc && !!r.f && url.includes(String(r.acc).replace(/-/g, "")) && url.endsWith(`/${r.f}`);
    const v = r.sha256 === r.o ? "BYTES_VERIFIED"
      : r.n && t.normalizedTextHash === r.n ? "TEXT_VERIFIED"
      : sameDoc ? "UNVERIFIED_TEXT" : "UNLINKED";
    counts[v] = (counts[v] ?? 0) + 1;
    if (!DRY) await ex.execute(
      `UPDATE kf_source_text_backfill SET verification=$2, "recomputedNormalizedTextHash"=$3, "verifiedAt"=now() WHERE "sourceId"=$1`,
      [sourceId, v, t.normalizedTextHash]);
  }
  const check = DRY ? [] : await ex.execute(`SELECT verification, count(*)::int n FROM kf_source_text_backfill GROUP BY 1 ORDER BY 1`);
  console.log(JSON.stringify({ dry: DRY, counts, neon: check }));
}
main().catch((e) => { console.error(redactConnectionSecrets(String(e?.message ?? e))); process.exit(1); });
