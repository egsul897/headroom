/**
 * Derive learned-rule seed provenance for the scoreboard self-credit guard (lib/covenant-learning-factory/scoreboard/self-credit.ts).
 *   npx tsx scripts/covenant-learning-factory/scoreboard/derive-seed-provenance.ts \
 *     --snapshot=scripts/covenant-learning-factory/scoreboard/snapshot.json.gz \
 *     --rules-file=scripts/covenant-learning-factory/scoreboard/ruleset.json \
 *     --out=scripts/covenant-learning-factory/scoreboard/rule-seed-provenance.json
 * Deterministic; reads only the ruleset and the snapshot inputs. No AI / LLM calls, no network.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { deriveSeedProvenance, serializeSeedProvenance, readSnapshot, rulesetIdentity, snapshotIdentitySha256, sourceInputSha256 } from "../../../lib/covenant-learning-factory/scoreboard";
import { normalizeLearnedRuleSet } from "../../../lib/covenant-learning-factory/learned-rules/types";

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const snapshotPath = arg("snapshot");
const rulesPath = arg("rules-file");
const out = arg("out");
if (!snapshotPath || !rulesPath || !out) throw new Error("usage: --snapshot=PATH --rules-file=PATH --out=PATH");
const rules = normalizeLearnedRuleSet(JSON.parse(readFileSync(resolve(rulesPath), "utf8")));
const snap = readSnapshot(resolve(snapshotPath));
const snapshotSha256 = snapshotIdentitySha256(snap.sources.map((s) => [s.source.sourceId, sourceInputSha256(s)] as const));
const prov = deriveSeedProvenance(rules, snap.sources, { rulesetSha256: rulesetIdentity(rules).rulesetSha256, snapshotSha256 });
writeFileSync(resolve(out), serializeSeedProvenance(prov));
console.log(JSON.stringify({ out, rulesetSha256: prov.rulesetSha256, snapshotSha256, ...prov.summary }));
