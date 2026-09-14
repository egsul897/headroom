/**
 * F-2 evidence tool: parses one extracted-text file with the deterministic structure stage and prints every
 * structural node (identity, type, ref, parent, offsets). Zero paid calls. Used to diff before/after the
 * clause-hierarchy fix. Run: npx tsx scripts/f2-structure-snapshot.ts <file.txt> <docId>
 */
import { readFileSync } from "node:fs";
import { runStructureStage } from "../lib/contract-model/compiler/stage-structure";
const [file, docId = "doc"] = process.argv.slice(2);
const text = readFileSync(file!, "utf-8");
const nodes = runStructureStage([{ documentId: docId, label: docId, text }]).output;
console.log(JSON.stringify(nodes.map((n) => ({ nodeId: n.nodeId, nodeKey: n.nodeKey, nodeType: n.nodeType, sectionRef: n.sectionRef, parentNodeId: n.parentNodeId ?? null, charStart: n.charStart, charEnd: n.charEnd }))));
