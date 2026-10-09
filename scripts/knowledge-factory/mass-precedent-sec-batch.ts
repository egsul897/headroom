/**
 * Fetch remaining SEC financing locators → Neon BYTEA + analysis + covenant summaries.
 *
 *   HEADROOM_SEC_FETCH_OWNER=WS-CKF \
 *   KF_MASS_PRECEDENT_LIVE_WRITE=I_AUTHORIZE_NEON_BULK_WRITE \
 *   npm run kf:mass-precedent-sec-batch -- --limit=71
 */
import { prisma } from "../../lib/prisma";
import { persistSecManifestBatch } from "../../lib/knowledge-factory/mass-precedent/sec-batch-persist";

function argValue(name: string, fallback: number): number {
  const hit = process.argv.find((a) => a.startsWith(`${name}=`));
  if (!hit) return fallback;
  const n = Number(hit.split("=")[1]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function main() {
  const limit = argValue("--limit", 71);
  const live = !process.argv.includes("--dry-run");
  const result = await persistSecManifestBatch({ limit, live });
  const bytes = await prisma.documentByteObject.count();
  const ks = await prisma.knowledgeSource.count({ where: { storageRef: { not: null } } });
  console.log(JSON.stringify({ result, neon: { documentByteObjects: bytes, knowledgeSourcesWithRef: ks } }, null, 2));
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err instanceof Error ? err.message : err);
  try {
    await prisma.$disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
