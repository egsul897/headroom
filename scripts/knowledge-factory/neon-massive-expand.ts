/**
 * Continuous Neon massive corpus expansion.
 *
 *   # Dry-run (no Neon writes)
 *   npx tsx scripts/knowledge-factory/neon-massive-expand.ts --dry-run --max=5
 *
 *   # Live (requires explicit write gate)
 *   HEADROOM_SEC_FETCH_OWNER=WS-CKF \
 *   KF_MASS_PRECEDENT_LIVE_WRITE=I_AUTHORIZE_NEON_BULK_WRITE \
 *   npx tsx scripts/knowledge-factory/neon-massive-expand.ts --max=25 --issuers=12
 */
import { runNeonExpandBatch } from "../../lib/knowledge-factory/continuous/neon-expand-batch";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : undefined;
}
function flag(name: string): boolean {
  return process.argv.includes(name);
}

async function main() {
  const dryRun = flag("--dry-run");
  const max = Number(arg("--max") ?? "25");
  const issuers = Number(arg("--issuers") ?? "12");
  const filingLimit = Number(arg("--filing-limit") ?? "80");
  const maxPerIssuer = Number(arg("--max-per-issuer") ?? "3");
  const tickers = arg("--tickers")?.split(",").map((t) => t.trim().toUpperCase()).filter(Boolean);

  // Ensure identifying User-Agent for SEC fair-access when contact email is present.
  if (!process.env.SEC_EDGAR_USER_AGENT && process.env.SEC_EDGAR_CONTACT_EMAIL) {
    process.env.SEC_EDGAR_USER_AGENT = `HeadroomNeonMassiveExpand/1.0 (contact: ${process.env.SEC_EDGAR_CONTACT_EMAIL}; research; respectful fair-access; WS-CKF)`;
  }

  const { result } = await runNeonExpandBatch({
    live: !dryRun,
    maxNewDocuments: max,
    maxIssuers: issuers,
    filingLimit,
    maxPerIssuer,
    tickers,
    includeCbcfl: !flag("--skip-cbcfl"),
    includeEhbHandoff: !flag("--skip-ehb"),
    includeLiveEdgar: !flag("--skip-live"),
    batchKey: arg("--batch-key"),
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch(async (err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
