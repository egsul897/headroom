/**
 * Learn issuer-generalized capture rules from DEV only, accepted by leave-one-issuer-out validation on DEV.
 *   npx tsx scripts/covenant-learning-factory/learning/learn-generalized.ts [--out-dir=DIR] [--min-issuers=2]
 * Writes DIR/ruleset-generalized.json (accepted rules, MECHANICALLY_REPLAYED) and DIR/learn-report.json.
 * HELDOUT sources are never read for seeding or acceptance (they are filtered out before anything is scored).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { readSnapshot, splitFor, type DevManifest, type ScoreboardSourceInput } from "../../../lib/covenant-learning-factory/scoreboard";
import {
  DEFAULT_ACCEPTANCE,
  DEFAULT_GENERALIZE_OPTIONS,
  heldOutAcceptance,
  issuerKey,
  rulesetOf,
  synthesizeIssuerGeneralized,
  type HeldOutRuleStats,
  type SeedUnit,
} from "../../../lib/covenant-learning-factory/learned-rules/issuer-generalize";
import { scoreWithAttribution } from "../../../lib/covenant-learning-factory/learning/held-out-eval";
import type { LearnedRule } from "../../../lib/covenant-learning-factory/learned-rules/types";

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const dir = "scripts/covenant-learning-factory/scoreboard";
const outDir = resolve(arg("out-dir") ?? "scripts/covenant-learning-factory/learning");
mkdirSync(outDir, { recursive: true });
const manifest = JSON.parse(readFileSync(`${dir}/dev-manifest.json`, "utf8")) as DevManifest;
const opts = { ...DEFAULT_GENERALIZE_OPTIONS, minIssuers: Number(arg("min-issuers") ?? DEFAULT_GENERALIZE_OPTIONS.minIssuers) };
const snap = readSnapshot(resolve(`${dir}/snapshot.json.gz`));
const dev: ScoreboardSourceInput[] = snap.sources.filter(
  (i) => splitFor(i.source.sourceId, manifest, i.source.issuerCik) === "DEV" && !manifest.duplicates?.some((d) => d.sourceId === i.source.sourceId),
);
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);
log(`DEV sources ${dev.length}`);

// 1. No-rules DEV score → the gaps to learn from.
const none = rulesetOf([], 0);
const noRules = new Map(dev.map((i) => [i.source.sourceId, scoreWithAttribution(i, none, () => new Set())] as const));
const units: SeedUnit[] = [];
for (const i of dev) {
  const s = noRules.get(i.source.sourceId)!;
  const issuer = issuerKey(i.source);
  const gc = new Set(s.gapCandidateIds);
  const gk = new Set(s.gapConditionIds);
  for (const c of i.candidates) if (gc.has(c.candidateId) && c.excerpt) units.push({ sourceId: i.source.sourceId, issuer, itemId: c.candidateId, kind: "candidate", family: c.family ?? null, text: c.excerpt });
  for (const c of i.conditions) if (gk.has(c.conditionId) && c.excerpt) units.push({ sourceId: i.source.sourceId, issuer, itemId: c.conditionId, kind: "condition", family: null, text: c.excerpt });
}
const noRulesTotal = [...noRules.values()].reduce((a, s) => a + s.total, 0);
log(`no-rules DEV total ${noRulesTotal}; seed units (gaps) ${units.length} from ${new Set(units.map((u) => u.issuer)).size} issuers`);

// 2. Leave-one-issuer-out: rules from the other issuers, scored on the held-out issuer.
const issuers = [...new Set(dev.map((i) => issuerKey(i.source)))].sort();
const stats: Record<string, HeldOutRuleStats> = {};
const folds: unknown[] = [];
for (const g of issuers) {
  const cands = synthesizeIssuerGeneralized(units.filter((u) => u.issuer !== g), opts);
  const rules: LearnedRule[] = cands.map((c) => ({ ...c.rule, state: "MECHANICALLY_REPLAYED" }));
  const support = new Map(cands.map((c) => [c.rule.ruleId, new Set(c.support.map((u) => u.sourceId))] as const));
  const rs = rulesetOf(rules, 1);
  let withRules = 0;
  let base = 0;
  const foldRule: Record<string, { credited: number; unsupported: number; baskets: number }> = {};
  for (const i of dev.filter((x) => issuerKey(x.source) === g)) {
    const s = scoreWithAttribution(i, rs, (r) => support.get(r) ?? new Set());
    withRules += s.total;
    base += noRules.get(i.source.sourceId)!.total;
    for (const [r, a] of Object.entries(s.perRule)) {
      const f = (foldRule[r] ??= { credited: 0, unsupported: 0, baskets: 0 });
      f.credited += a.credited; f.unsupported += a.unsupported; f.baskets += a.baskets;
    }
  }
  for (const r of rules) {
    const st = (stats[r.ruleId] ??= { credited: 0, unsupported: 0, baskets: 0, idle: 0, heldOutIssuers: 0 });
    const f = foldRule[r.ruleId] ?? { credited: 0, unsupported: 0, baskets: 0 };
    st.credited += f.credited; st.unsupported += f.unsupported; st.baskets += f.baskets;
    st.idle += Math.max(0, f.baskets - f.credited);
    st.heldOutIssuers += 1;
  }
  folds.push({ heldOutIssuer: g, rules: rules.length, noRules: base, withRules });
  log(`fold ${g}: ${rules.length} rules; held-out errors ${base} → ${withRules}`);
}

// 3. Final rules from all DEV gaps; keep only those accepted on held-out issuers.
const final = synthesizeIssuerGeneralized(units, opts);
const decisions = final.map((c) => {
  const d = heldOutAcceptance(stats[c.rule.ruleId], DEFAULT_ACCEPTANCE);
  return { ruleId: c.rule.ruleId, signature: c.signature, issuers: c.issuers, support: c.support.length, pattern: c.rule.pattern, stats: stats[c.rule.ruleId] ?? null, ...d };
});
const accepted: LearnedRule[] = final
  .filter((c, k) => decisions[k]!.accepted)
  .map((c) => {
    const st = stats[c.rule.ruleId]!;
    return {
      ...c.rule,
      state: "MECHANICALLY_REPLAYED" as const,
      metrics: { errorsBefore: 0, errorsAfter: 0, sourcesReplayed: st.heldOutIssuers, goldenOk: true, adjudicationClass: "MECHANICAL_REPLAY" as const, heldoutFixed: st.credited, sourcesSpanned: c.rule.provenance.sourcesSpanned },
    };
  });
const ruleset = rulesetOf(accepted, 3);
writeFileSync(`${outDir}/ruleset-generalized.json`, JSON.stringify(ruleset, null, 2) + "\n");
writeFileSync(
  `${outDir}/learn-report.json`,
  JSON.stringify({ options: opts, acceptance: DEFAULT_ACCEPTANCE, devSources: dev.length, issuers, seedUnits: units.length, noRulesDevTotal: noRulesTotal, folds, proposed: final.length, accepted: accepted.length, decisions }, null, 1) + "\n",
);
log(`proposed ${final.length}, accepted ${accepted.length} → ${outDir}/ruleset-generalized.json`);
