/**
 * Mass precedent durable import — GATED.
 * Dry-run by default. Live write requires:
 *   KF_MASS_PRECEDENT_LIVE_WRITE=I_AUTHORIZE_NEON_BULK_WRITE
 * and document_byte_objects migration applied.
 *
 * Reuses consolidation importer for committed bytes (idempotent SHA-256).
 *
 *   npm run kf:mass-precedent-import
 *   KF_MASS_PRECEDENT_LIVE_WRITE=I_AUTHORIZE_NEON_BULK_WRITE npm run kf:mass-precedent-import
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  importOriginalByteCandidates,
  LIVE_WRITE_ENV as CONSOLIDATION_LIVE_ENV,
  LIVE_WRITE_TOKEN as CONSOLIDATION_LIVE_TOKEN,
} from "../../lib/knowledge-factory/consolidation";
import { buildMassPrecedentBatchPlan } from "../../lib/knowledge-factory/mass-precedent";
import { prisma } from "../../lib/prisma";

const OUT_DIR = "docs/knowledge-factory/mass-precedent";
export const MASS_LIVE_ENV = "KF_MASS_PRECEDENT_LIVE_WRITE";
export const MASS_LIVE_TOKEN = "I_AUTHORIZE_NEON_BULK_WRITE";

async function main() {
  const live =
    process.env[MASS_LIVE_ENV] === MASS_LIVE_TOKEN ||
    process.env[CONSOLIDATION_LIVE_ENV] === CONSOLIDATION_LIVE_TOKEN;

  const plan = await buildMassPrecedentBatchPlan({ batchSize: 100, includeNetworkFetch: false });
  mkdirSync(OUT_DIR, { recursive: true });

  if (!live) {
    const dry = {
      live: false,
      message: "Dry-run only. Set KF_MASS_PRECEDENT_LIVE_WRITE=I_AUTHORIZE_NEON_BULK_WRITE after owner approval.",
      proposed: plan.proposed,
      blockers: plan.blockers,
      approvalCheckpoint: plan.approvalCheckpoint,
    };
    writeFileSync(path.join(OUT_DIR, "import-result.json"), JSON.stringify(dry, null, 2) + "\n");
    console.log(JSON.stringify(dry, null, 2));
    await prisma.$disconnect();
    return;
  }

  if (!plan.neon.documentByteObjectsTablePresent) {
    const blocked = {
      live: true,
      blocked: true,
      reason: "document_byte_objects table missing — run npx prisma migrate deploy first",
      neon: plan.neon,
    };
    writeFileSync(path.join(OUT_DIR, "import-result.json"), JSON.stringify(blocked, null, 2) + "\n");
    console.log(JSON.stringify(blocked, null, 2));
    await prisma.$disconnect();
    process.exit(2);
  }

  // Bridge token so consolidation importer accepts the write.
  process.env[CONSOLIDATION_LIVE_ENV] = CONSOLIDATION_LIVE_TOKEN;
  const result = await importOriginalByteCandidates({ live: true });
  writeFileSync(path.join(OUT_DIR, "import-result.json"), JSON.stringify({ live: true, result }, null, 2) + "\n");
  console.log(JSON.stringify({ live: true, result }, null, 2));
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
