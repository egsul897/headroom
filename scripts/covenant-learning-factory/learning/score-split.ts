/**
 * Guarded scoreboard on ONE split (default DEV) for a ruleset, with the no-rules score alongside.
 * Used for issuer-held-out validation on DEV; never pass --split=HELDOUT while choosing rules.
 *   npx tsx scripts/covenant-learning-factory/learning/score-split.ts --rules-file=R.json [--split=DEV] [--issuers=a,b] [--out=O.json]
 * Provenance for the guard comes from each rule's recorded packageKeys (generalized rules always record them).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  readSnapshot,
  scoreSource,
  selfCreditGuard,
  deriveSeedProvenance,
  rulesetIdentity,
  snapshotIdentitySha256,
  sourceInputSha256,
  splitFor,
  type DevManifest,
} from "../../../lib/covenant-learning-factory/scoreboard";
import { normalizeLearnedRuleSet, emptyRuleSet } from "../../../lib/covenant-learning-factory/learned-rules/types";
import { issuerKey, issuerAliases, fixtureSlug } from "../../../lib/covenant-learning-factory/learned-rules/issuer-generalize";

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const dir = "scripts/covenant-learning-factory/scoreboard";
const manifest = JSON.parse(readFileSync(`${dir}/dev-manifest.json`, "utf8")) as DevManifest;
const split = (arg("split") ?? "DEV").toUpperCase();
const issuers = arg("issuers") ? new Set(arg("issuers")!.split(",")) : null;
const rf = arg("rules-file");
const rules = rf ? normalizeLearnedRuleSet(JSON.parse(readFileSync(resolve(rf), "utf8"))) : { ...emptyRuleSet(0), updatedAt: "1970-01-01T00:00:00.000Z" };
const snap = readSnapshot(resolve(arg("snapshot") ?? `${dir}/snapshot.json.gz`));
const aliases = issuerAliases(manifest.devIssuerCiks ?? [], snap.sources.map((x) => fixtureSlug(x.source.sourceId)).filter((x): x is string => Boolean(x)));
const fullSha = snapshotIdentitySha256(snap.sources.map((i) => [i.source.sourceId, sourceInputSha256(i)] as const));
const rsha = rulesetIdentity(rules).rulesetSha256;
const prov = deriveSeedProvenance(rules, snap.sources, { rulesetSha256: rsha, snapshotSha256: fullSha });
const guard = selfCreditGuard(rules, prov, { rulesetSha256: rsha, snapshotSha256: fullSha });
const per: unknown[] = [];
const tot = { total: 0, US: 0, CG: 0, DG: 0, nrTotal: 0, nrUS: 0, sources: 0 };
const refused: Record<string, number> = {};
const credited: Record<string, number> = {};
const t0 = Date.now();
for (const input of snap.sources) {
  const sid = input.source.sourceId;
  if (splitFor(sid, manifest, input.source.issuerCik) !== split) continue;
  if (manifest.duplicates?.some((d) => d.sourceId === sid)) continue;
  if (issuers && !issuers.has(issuerKey(input.source, aliases))) continue;
  const s = scoreSource(input, rules, manifest, undefined, { guard, noRules: true });
  tot.sources += 1;
  tot.total += s.total; tot.US += s.counts.UNSUPPORTED_SEMANTICS; tot.CG += s.counts.COVERAGE_GAP; tot.DG += s.counts.DISCOVERY_GAP;
  tot.nrTotal += s.noRules!.total; tot.nrUS += s.noRules!.counts.UNSUPPORTED_SEMANTICS;
  for (const [k, v] of Object.entries(s.selfCredit ?? {})) refused[k] = (refused[k] ?? 0) + v;
  for (const [k, v] of Object.entries(s.learnedCredit ?? {})) credited[k] = (credited[k] ?? 0) + v;
  per.push({ sourceId: sid, issuer: issuerKey(input.source, aliases), total: s.total, noRules: s.noRules!.total, counts: s.counts, nrCounts: s.noRules!.counts, refused: s.selfCredit, credited: s.learnedCredit, findings: s.findings });
}
const summary = { split, rules: rules.rules.length, ...tot, refused, credited, rulesWithoutProvenance: guard.rulesWithoutProvenance, seconds: Math.round((Date.now() - t0) / 1000) };
console.log(JSON.stringify(summary));
if (arg("out")) writeFileSync(arg("out")!, JSON.stringify({ summary, perSource: per }, null, 1));
