/** F-5: dumps the structural nodes inside one section of a document in region-relative coordinates (zero model calls).
 *  npx tsx scripts/f5-slots-snapshot.ts <text-file> <sectionRef> <out.json>  (offsets relative to the section node's charStart) */
import { readFileSync, writeFileSync } from "node:fs";
import { runStructureStage } from "../lib/contract-model/compiler/stage-structure";
const [file, sectionRef, out] = process.argv.slice(2);
const text = readFileSync(file!, "utf-8");
const nodes = runStructureStage([{ documentId: "doc-a", label: "doc", text }]).output;
const section = nodes.filter((n) => n.nodeType === "SECTION" && n.sectionRef === sectionRef).sort((a, b) => b.charEnd - b.charStart - (a.charEnd - a.charStart))[0]!;
const inside = nodes.filter((n) => n.charStart >= section.charStart && n.charEnd <= section.charEnd).sort((a, b) => a.charStart - b.charStart || b.charEnd - a.charEnd);
const rows = inside.map((n) => ({ nodeId: n.nodeId, sectionRef: n.sectionRef, nodeType: n.nodeType, parentNodeId: n.parentNodeId ?? null, charStart: n.charStart - section.charStart, charEnd: n.charEnd - section.charStart }));
writeFileSync(out!, JSON.stringify({ sectionRef, sectionCharStart: section.charStart, sectionCharEnd: section.charEnd, nodes: rows }, null, 1));
console.log(`${rows.length} nodes inside ${sectionRef} (${section.charStart}-${section.charEnd})`);
