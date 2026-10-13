#!/usr/bin/env tsx
/**
 * npm run clf:sweep
 *
 * HTTPS Neon autonomous precedent sweep + executable learned-rules loop.
 *
 * Env:
 *   DATABASE_URL          Neon connection string
 *   NEON_TRANSPORT=https  required on Cloud Agent boxes (TCP 5432 blocked)
 *
 * Flags:
 *   --batch=N       sources per batch (default 10)
 *   --max=N         max sources per epoch (default all)
 *   --epochs=N      max learning epochs (default 8)
 *   --no-resume     ignore checkpoint cursor
 *   --dry-run       compute + learn in memory; no Neon writes / no rule files
 *   --rules-dir=P   learned-rules directory (default ./learned-rules)
 */

import { createNeonHttpsExecutor, getNeonTransportMode, redactConnectionSecrets } from "../../lib/covenant-learning-factory/store/neon-transport";
import { runCovenantLearningSweep } from "../../lib/covenant-learning-factory/sweep";
import { defaultCertificationGolden } from "../../lib/covenant-learning-factory/learned-rules/replay-gate";

function argNum(name: string, fallback: number): number {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  const n = Number(hit.slice(name.length + 3));
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function argStr(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required");
    process.exit(2);
  }
  if (getNeonTransportMode() !== "https") {
    console.error("clf:sweep requires NEON_TRANSPORT=https on this box");
    process.exit(2);
  }

  const dryRun = hasFlag("dry-run");
  const executor = await createNeonHttpsExecutor(url);

  console.log(
    JSON.stringify({
      event: "clf.sweep.start",
      transport: "https",
      dryRun,
      batch: argNum("batch", 10),
      max: argNum("max", Number.POSITIVE_INFINITY),
      epochs: argNum("epochs", 8),
      resume: !hasFlag("no-resume"),
    }),
  );

  try {
    const result = await runCovenantLearningSweep({
      executor,
      batchSize: argNum("batch", 10),
      maxSources: argNum("max", Number.POSITIVE_INFINITY),
      maxEpochs: argNum("epochs", 8),
      resume: !hasFlag("no-resume"),
      dryRun,
      rulesDir: argStr("rules-dir"),
      goldenChecks: [
        defaultCertificationGolden(() => ({
          packageKey: "sweep-golden-shell",
          companyId: "sweep",
          instrumentKey: "n/a",
          asOf: "1970-01-01",
          documents: [],
          baskets: [],
        })),
      ],
      log: (line) => console.log(line),
    });

    console.log(
      JSON.stringify({
        event: "clf.sweep.done",
        finalRulesetVersion: result.finalRulesetVersion,
        totalSources: result.totalSources,
        totalErrors: result.totalErrors,
        stoppedReason: result.stoppedReason,
        epochs: result.epochs,
      }, null, 2),
    );
  } catch (err) {
    console.error(
      "clf:sweep failed:",
      redactConnectionSecrets(err instanceof Error ? err.message : String(err)),
    );
    process.exit(1);
  }
}

main();
