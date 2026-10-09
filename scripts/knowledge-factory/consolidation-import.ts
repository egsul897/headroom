/**
 * Gated consolidation importer.
 *
 * Default: dry-run (no writes).
 * Live: requires --live AND KF_CONSOLIDATION_LIVE_WRITE=I_AUTHORIZE_NEON_BULK_WRITE
 *
 *   npm run kf:consolidation-import
 *   npm run kf:consolidation-import -- --live --only=gibraltar
 */
import {
  importOriginalByteCandidates,
  LIVE_WRITE_ENV,
  LIVE_WRITE_TOKEN,
} from "../../lib/knowledge-factory/consolidation";
import { importExportSourcesMetadataOnly } from "../../lib/knowledge-factory/consolidation/import-derived-export";

const GIBRALTAR = "edgar:0001140361-26-003087:ef20064499_ex10-1.htm";
const CHEWY =
  "edgar:0001193125-26-281042:doc-a-2026-06-23-credit-agreement.htm";

function parseArgs(argv: string[]) {
  const out = {
    live: false,
    only: "all" as "all" | "gibraltar" | "chewy" | "bytes" | "metadata",
    limit: undefined as number | undefined,
  };
  for (const a of argv) {
    if (a === "--live") out.live = true;
    if (a.startsWith("--only=")) out.only = a.slice("--only=".length) as typeof out.only;
    if (a.startsWith("--limit=")) out.limit = Number(a.slice("--limit=".length));
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.live && process.env[LIVE_WRITE_ENV] !== LIVE_WRITE_TOKEN) {
    console.error(
      JSON.stringify(
        {
          refused: true,
          reason: `Missing ${LIVE_WRITE_ENV}=${LIVE_WRITE_TOKEN}`,
          hint: "Dry-run only until owner explicitly authorizes live Neon writes.",
        },
        null,
        2,
      ),
    );
    process.exit(2);
  }

  if (args.only === "metadata") {
    const r = await importExportSourcesMetadataOnly({
      live: args.live,
      limit: args.limit,
    });
    console.log(JSON.stringify(r, null, 2));
    return;
  }

  let onlySourceIds: string[] | undefined;
  if (args.only === "gibraltar") onlySourceIds = [GIBRALTAR];
  if (args.only === "chewy") onlySourceIds = [CHEWY];

  const r = await importOriginalByteCandidates({
    live: args.live,
    onlySourceIds,
    limit: args.limit,
  });
  console.log(JSON.stringify(r, null, 2));
  if (r.errors.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
