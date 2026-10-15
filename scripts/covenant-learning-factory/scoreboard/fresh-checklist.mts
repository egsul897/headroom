import { readFileSync, writeFileSync } from "node:fs";
const WT = process.argv[2]!, OUT = process.argv[3]!;
const { extractTextAsync } = await import("${WT}/lib/knowledge-factory/pipeline/text.ts");
const { parseDocumentTree } = await import(`${WT}/lib/contract-model/section-tree/parse.ts`);
const { covenantChecklist } = await import(`${WT}/lib/contract-model/section-tree/semantics.ts`);
const man = JSON.parse(readFileSync("/workspace/fresh/fresh-manifest.json","utf8"));
const per: any = {}; const agg: any = {}; let docs=0;
for (const p of man) {
  const buf = readFileSync(`/workspace/fresh/docs/${p.cik}_${p.file}`);
  let text; try { text = (await extractTextAsync(buf, p.file)).text; } catch { continue; }
  if (!text || text.length < 2000) continue;
  let t; try { t = parseDocumentTree(text); } catch { continue; }
  docs++; per[p.cik] = {};
  for (const c of covenantChecklist(t, t.text)) {
    const k = c.status === "MISSING" ? "M" : c.status === "ABSENT_VERIFIED" ? "A" : "F";
    per[p.cik][c.family] = k; (agg[c.family] ??= {F:0,M:0,A:0})[k]++;
  }
}
const tot = {F:0,M:0,A:0} as any; for (const a of Object.values(agg) as any[]) for (const k of ["F","M","A"]) tot[k]+=a[k];
writeFileSync(OUT, JSON.stringify({docs, tot, agg, per}));
console.log(WT.split("/").pop(), "docs", docs, "F/M/A", tot.F, tot.M, tot.A);
