/**
 * Resolve and fetch SEC EDGAR credit-agreement / indenture exhibits, then
 * hand the local bytes to the HTTPS precedent loader.
 *
 *   export SEC_EDGAR_CONTACT_EMAIL='authorized-operator@your-domain'
 *   export HEADROOM_SEC_FETCH_OWNER=WS-CKF
 *   export NEON_TRANSPORT=https
 *   npm run kf:edgar-expand
 *   npm run kf:edgar-expand -- --universe=sp1500 --max-fetches=50
 *   npm run kf:edgar-expand -- --fresh
 *
 * Body downloads stay at or below 10 requests/second. Dry-run Neon import
 * unless KF_MASS_PRECEDENT_LIVE_WRITE=I_AUTHORIZE_NEON_BULK_WRITE.
 * Knife River (CIK 0001955520 / KNF) is never fetched.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { runEdgarExpand } from "../../lib/edgar-expand/run";
import type { ExpandUniverse } from "../../lib/edgar-expand/targets";

function argValue(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : undefined;
}

function argNum(name: string): number | undefined {
  const raw = argValue(name);
  if (raw === undefined) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

async function main(): Promise<void> {
  const universeRaw = argValue("--universe") ?? "pilot-100";
  if (universeRaw !== "pilot-100" && universeRaw !== "sp1500") {
    console.error(JSON.stringify({ ok: false, detail: "--universe must be pilot-100 or sp1500" }));
    process.exit(2);
  }
  const universe = universeRaw as ExpandUniverse;
  const fresh = process.argv.includes("--fresh");
  const checkpoint = join(process.cwd(), ".local-knowledge-corpus/edgar-expand/checkpoint.json");
  const resume = process.argv.includes("--resume") || (!fresh && existsSync(checkpoint));

  if (!process.env.HEADROOM_SEC_FETCH_OWNER) {
    process.env.HEADROOM_SEC_FETCH_OWNER = "WS-CKF";
    console.error(
      JSON.stringify({
        note: "HEADROOM_SEC_FETCH_OWNER was unset; this process is the single SEC fetch owner WS-CKF. Do not run a second live SEC agent at the same time.",
      }),
    );
  }

  let expand;
  try {
    expand = await runEdgarExpand({
      universe,
      resume,
      maxIssuers: argNum("--max-issuers"),
      maxIndexesPerIssuer: argNum("--max-indexes"),
      maxIbrIndexFetches: argNum("--max-ibr-indexes"),
      maxFetches: argNum("--max-fetches"),
      maxRequestsPerSecond: argNum("--max-rps") ?? 8,
    });
  } catch (err) {
    console.error(
      JSON.stringify({
        ok: false,
        detail: (err instanceof Error ? err.message : String(err)).slice(0, 500),
      }),
    );
    process.exit(1);
  }

  let importResult: unknown = {
    import: "deferred",
    detail:
      "Bytes are under .local-knowledge-corpus/edgar-expand. Set NEON_TRANSPORT=https and DATABASE_URL, then npm run neon:https-precedent-import (dry-run unless KF_MASS_PRECEDENT_LIVE_WRITE=I_AUTHORIZE_NEON_BULK_WRITE).",
  };
  if (process.env.NEON_TRANSPORT === "https" && process.env.DATABASE_URL && !process.argv.includes("--skip-import")) {
    try {
      const { createNeonHttpsExecutor } = await import("../../lib/covenant-learning-factory/store/neon-transport");
      const { importPrecedentsOverHttps, isLiveAuthorized } = await import("../../lib/neon-https/precedent-import");
      const executor = await createNeonHttpsExecutor(process.env.DATABASE_URL);
      const live = isLiveAuthorized();
      importResult = await importPrecedentsOverHttps(executor, {
        live,
        skipBytes: true,
        skipExport: true,
      });
      expand.import = "ran";
    } catch (err) {
      const { redactConnectionSecrets } = await import("../../lib/covenant-learning-factory/store/neon-transport");
      importResult = {
        import: "failed",
        detail: redactConnectionSecrets(err instanceof Error ? err.message : String(err)).slice(0, 500),
      };
    }
  }

  console.log(JSON.stringify({ expand, importResult }, null, 2));
}

main();
