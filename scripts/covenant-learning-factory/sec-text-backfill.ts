/**
 * Additive SEC document-text backfill (owner-approved).
 * - Only sources with no document_byte_objects row and an SEC sourceUrl.
 * - Fetches ONLY the source's own sourceUrl, sequential, <=10 req/s (default 4/s).
 * - Identifying UA from SEC_EDGAR_USER_AGENT / SEC_EDGAR_CONTACT_EMAIL; fails closed otherwise.
 * - Writes bytes only when sha256(fetched) == originalBytesHash (INSERT ... ON CONFLICT DO NOTHING; never UPDATE/DELETE).
 * - Records every attempt in kf_source_text_backfill (FETCHED / HASH_MISMATCH / FETCH_FAILED); verifies each write with SELECT count.
 * - Resumable: skips sources already FETCHED or already present in document_byte_objects.
 * Usage: NEON_TRANSPORT=https DATABASE_URL=... SEC_EDGAR_USER_AGENT="Name/1.0 (contact: real@addr)" \
 *        npx tsx scripts/covenant-learning-factory/sec-text-backfill.ts [--limit=N] [--rps=4] [--dry-run]
 */
import { createHash, randomUUID } from "node:crypto";
import { createNeonHttpsExecutor, redactConnectionSecrets } from "../../lib/covenant-learning-factory/store/neon-transport";
import { requireSecUserAgentFromEnv } from "../../lib/edgar-historical-backfill/sec-identity";

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
const DRY = process.argv.includes("--dry-run");
const LIMIT = Number(arg("limit") ?? 1e9);
const RPS = Math.min(10, Number(arg("rps") ?? 4));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function isSecUrl(u: string): boolean {
  try { const h = new URL(u).hostname; return h === "www.sec.gov" || h === "sec.gov"; } catch { return false; }
}

async function main() {
  const ua = DRY ? "dry-run" : requireSecUserAgentFromEnv();
  const ex = await createNeonHttpsExecutor(process.env.DATABASE_URL!);
  await ex.execute(`CREATE TABLE IF NOT EXISTS kf_source_text_backfill (
    "sourceId" text PRIMARY KEY, status text NOT NULL, "httpStatus" int, sha256 text,
    "originalBytesHash" text, "byteSize" int, error text, "fetchedAt" timestamptz NOT NULL DEFAULT now())`);
  const rows = await ex.execute(`SELECT ks.id, ks."sourceUrl", ks."originalBytesHash", NULL AS filename
    FROM knowledge_sources ks
    WHERE ks."sourceUrl" IS NOT NULL AND ks."originalBytesHash" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM document_byte_objects d WHERE d."contentHash" = ks."originalBytesHash")
      AND NOT EXISTS (SELECT 1 FROM kf_source_text_backfill b WHERE b."sourceId" = ks.id AND b.status = 'FETCHED')
    ORDER BY ks.id`);
  const todo = rows.filter((r) => isSecUrl(String(r.sourceUrl))).slice(0, LIMIT);
  console.log(`pending=${todo.length} (of ${rows.length} without bytes) dry=${DRY} rps=${RPS}`);
  const counts: Record<string, number> = {};
  for (const r of todo) {
    const id = String(r.id), url = String(r.sourceUrl), expect = String(r.originalBytesHash).toLowerCase();
    let status = "FETCH_FAILED", http: number | null = null, sha: string | null = null, size: number | null = null, err: string | null = null;
    if (DRY) { console.log(`would fetch ${id}`); continue; }
    try {
      const res = await fetch(url, { headers: { "User-Agent": ua, Accept: "*/*" } });
      http = res.status;
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        sha = createHash("sha256").update(buf).digest("hex"); size = buf.length;
        if (sha === expect) {
          await ex.execute(`INSERT INTO document_byte_objects (id,"contentHash","byteSize","contentType",namespace,filename,bytes,"createdAt","updatedAt")
            VALUES ($1,$2,$3,$4,'sec-backfill',$5,$6,now(),now()) ON CONFLICT ("contentHash") DO NOTHING`,
            [randomUUID(), sha, size, res.headers.get("content-type") ?? "application/octet-stream", r.filename ?? null, buf]);
          const v = await ex.execute(`SELECT count(*)::int AS n FROM document_byte_objects WHERE "contentHash"=$1`, [sha]);
          status = Number(v[0]?.n) === 1 ? "FETCHED" : "WRITE_UNVERIFIED";
        } else status = "HASH_MISMATCH";
      } else err = `http ${res.status}`;
    } catch (e) { err = redactConnectionSecrets(String((e as Error).message)).slice(0, 300); }
    await ex.execute(`INSERT INTO kf_source_text_backfill ("sourceId",status,"httpStatus",sha256,"originalBytesHash","byteSize",error,"fetchedAt")
      VALUES ($1,$2,$3,$4,$5,$6,$7,now()) ON CONFLICT ("sourceId") DO UPDATE SET status=EXCLUDED.status,"httpStatus"=EXCLUDED."httpStatus",
      sha256=EXCLUDED.sha256,"byteSize"=EXCLUDED."byteSize",error=EXCLUDED.error,"fetchedAt"=now()
      WHERE kf_source_text_backfill.status <> 'FETCHED'`, [id, status, http, sha, expect, size, err]);
    counts[status] = (counts[status] ?? 0) + 1;
    console.log(`${id} ${status} http=${http ?? "-"}`);
    await sleep(Math.ceil(1000 / RPS));
  }
  const tot = await ex.execute(`SELECT count(*)::int AS n FROM document_byte_objects WHERE namespace='sec-backfill'`);
  console.log(JSON.stringify({ counts, verifiedSecBackfillRows: tot[0]?.n }));
}
main().catch((e) => { console.error(redactConnectionSecrets(String(e?.message ?? e))); process.exit(1); });
