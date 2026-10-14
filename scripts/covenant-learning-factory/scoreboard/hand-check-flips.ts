/**
 * Hand-check tooling for tree-locator flips: for each named source, list candidates that are a
 * DISCOVERY_GAP without the tree but matched with it, printing the candidate and the matching
 * basket (family, declared ref, tree section, text) side by side for a human verdict.
 *
 *   npx tsx scripts/covenant-learning-factory/scoreboard/hand-check-flips.ts \
 *     --snapshot=PATH [--rules-file=PATH | --rules=v0] [--per=2] SOURCE_ID...
 *
 * Deterministic; offline; no Neon access; zero AI / LLM calls.
 */
import { readFileSync } from "node:fs";
import { runCovenantComputation } from "../../../lib/contract-model/covenant-computation";
import { readSnapshot } from "../../../lib/covenant-learning-factory/scoreboard/index";
import { buildComputationPackage } from "../../../lib/covenant-learning-factory/sweep/build-package";
import { candidatesAsRows } from "../../../lib/covenant-learning-factory/sweep/neon-load";
import { basketTreeSection, norm, strictCandidateMatch } from "../../../lib/covenant-learning-factory/sweep/self-check";
import { buildTreeLocator } from "../../../lib/covenant-learning-factory/sweep/tree-locator";
import { emptyRuleSet, normalizeLearnedRuleSet } from "../../../lib/covenant-learning-factory/learned-rules/types";

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const snapPath = arg("snapshot");
if (!snapPath) throw new Error("--snapshot=PATH required");
const rules =
  arg("rules") === "v0" || !arg("rules-file")
    ? emptyRuleSet(0)
    : normalizeLearnedRuleSet(JSON.parse(readFileSync(arg("rules-file")!, "utf8")));
const per = Number(arg("per") ?? 2);
const ids = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const snap = readSnapshot(snapPath);
for (const s of snap.sources) {
  if (!ids.includes(s.source.sourceId)) continue;
  const pkg = buildComputationPackage({ source: s.source, documentText: s.documentText, candidates: candidatesAsRows(s.candidates), rules });
  const res = runCovenantComputation(pkg, { rules, createdAt: "1970-01-01T00:00:00.000Z" });
  const loc = buildTreeLocator({ documentText: s.documentText, candidates: s.candidates });
  const bt = res.baskets.map((b) => basketTreeSection(loc, b.citationExcerpt));
  let n = 0;
  for (const c of s.candidates) {
    if (!c.excerpt || c.excerpt.length < 24) continue;
    const ex = norm(c.excerpt);
    const ct = loc.candidateSection(c);
    const plain = res.baskets.some((b) =>
      strictCandidateMatch({ excerpt: ex, sectionRef: c.sectionRef ?? null, family: c.family ?? null }, { cite: norm(b.citationExcerpt), sectionRef: b.sectionRef, family: b.covenantFamily }),
    );
    if (plain) continue;
    const i = res.baskets.findIndex((b, k) =>
      strictCandidateMatch(
        { excerpt: ex, sectionRef: c.sectionRef ?? null, family: c.family ?? null, treeSection: ct },
        { cite: norm(b.citationExcerpt), sectionRef: b.sectionRef, family: b.covenantFamily, treeSection: bt[k] },
      ),
    );
    if (i < 0) continue;
    const b = res.baskets[i]!;
    console.log(`### ${s.source.sourceId}`);
    console.log(` CAND fam=${c.family} ref=${c.sectionRef} tree=${ct}: ${JSON.stringify(c.excerpt.slice(0, 220))}`);
    console.log(` BASK fam=${b.covenantFamily} ref=${b.sectionRef} tree=${bt[i]}: ${JSON.stringify(String(b.citationExcerpt).slice(0, 220))}`);
    if (++n >= per) break;
  }
}
