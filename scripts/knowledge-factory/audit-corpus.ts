#!/usr/bin/env tsx
import { mkdirSync, copyFileSync, existsSync } from "node:fs";
import path from "node:path";
import { CorpusStore, defaultCorpusPaths } from "../../lib/knowledge-factory/store/corpus-store";
import { auditCorpusQuality } from "../../lib/knowledge-factory/audit/corpus-quality";
import { runIntegrityChecks } from "../../lib/knowledge-factory/integrity/checks";

async function main() {
  const store = new CorpusStore(defaultCorpusPaths());
  const audit = auditCorpusQuality(store);
  const integrity = runIntegrityChecks(store);
  store.writeJson("corpus-quality-audit.json", audit);
  store.writeJson("integrity.json", integrity);
  const outDir = path.resolve("docs/knowledge-factory/manifests");
  mkdirSync(outDir, { recursive: true });
  copyFileSync(path.join(store.paths.manifests, "corpus-quality-audit.json"), path.join(outDir, "corpus-quality-audit.json"));
  console.log(JSON.stringify({ audit, integritySummary: { total: integrity.length, ok: integrity.filter((f) => f.ok).length } }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
