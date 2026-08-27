/**
 * Phase 2F.2 §2 - reproduces the exact real Document B Phase 2B crash from
 * source, and captures the raw model "role" values that fail strict
 * enum validation, using a diagnostic-only tolerant schema (role/families
 * as z.string()/z.array(z.string())) so the raw values survive instead of
 * throwing. This script does NOT modify any production schema - it is a
 * one-off, read-only reproduction tool, kept for the record.
 */
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { parseDocumentStructure } from "../lib/contract-model/compiler/stage-structure";
import { buildStructuralIndex } from "../lib/contract-model/compiler/structural-index";
import { getStageCaller } from "../lib/contract-model/compiler/llm-caller";
import { DISCOVERY_ROLES } from "../lib/contract-model/compiler/discovery/pass-b-semantic";

const PKG_DIR = path.join(__dirname, "..", "tests", "fixtures", "unseen-packages", "conmed-2025-credit-facility", "curated");
const OUT_DIR = path.join(__dirname, "..", "tests", "fixtures", "unseen-packages", "phase-2f-freeze", "phase-2f2");

// Diagnostic-only tolerant mirror of SemanticSectionResultSchema - role/families widened to raw strings so a real out-of-enum model value is captured instead of throwing.
const ToleranteRuleItemSchema = z.object({
  relativeRef: z.string(),
  families: z.array(z.string()).default([]),
  otherFamilyDescription: z.string().optional(),
  role: z.string(),
  description: z.string(),
  multipleRulesLikely: z.boolean().default(false),
  definedTermDependencyLikely: z.boolean().default(false),
  confidence: z.number().min(0).max(1),
  needsReview: z.boolean().default(false),
});
const ToleranteSectionResultSchema = z.object({ rules: z.array(ToleranteRuleItemSchema).default([]) });

const SYSTEM_PROMPT = [
  "You are finding every economically operative covenant rule inside ONE section of a real financing document.",
  "This is a DISCOVERY pass, not a rule-extraction pass: do not compute thresholds, formulas, or final dollar amounts. Only identify what exists.",
  "A section commonly bundles a general prohibition PLUS many independent baskets, exceptions, and provisos (e.g. clause (a), (b), (c)... each its own operative rule). List EVERY one you can find - missing one is far worse than listing an extra borderline candidate.",
  "For each rule, give: the most specific relative sub-reference you can identify (e.g. '(a)', '(b)(ii)') or empty string for the section's own general language; every CovenantFamily this rule concerns (use the real closed enum values given; if truly none fit, leave families empty and explain in otherFamilyDescription); its operative role (what the rule DOES - prohibits, permits, excepts, tests a ratio, etc, not what it concerns); a one-sentence description; whether this single node likely bundles multiple further sub-rules your list didn't fully separate; whether it clearly depends on a defined term you were not given the definition of; a 0-1 confidence; and whether a human should review it.",
  "Definitions of terms are NOT covenants themselves - do not list a definition as its own rule merely because it contains a dollar figure or percentage, unless that definition itself imposes a restriction.",
  "Boilerplate (headings, general provisions, miscellaneous, governing law) is not a rule - do not list it.",
].join(" ");

async function main() {
  const text = fs.readFileSync(path.join(PKG_DIR, "guarantee-and-collateral-agreement-full.txt"), "utf-8");
  const documentId = "conmed-doc-b-guarantee-collateral-agreement";
  const nodes = parseDocumentStructure({ documentId, label: documentId, text });
  const nodesByDocument = new Map([[documentId, { text, nodes }]]);
  const index = buildStructuralIndex(nodesByDocument, [], []);
  const caller = getStageCaller();
  console.error(`provider=${caller.providerName} model=${caller.model}`);

  const sections = index.allNodes().filter((n) => n.documentId === documentId && n.nodeType === "SECTION");
  console.error(`${sections.length} SECTION nodes to attempt`);

  const results: unknown[] = [];
  const invalidRoleValues = new Set<string>();
  const invalidFamilyValues = new Set<string>();

  for (const section of sections.slice(0, 15)) {
    const sectionText = index.getNodeText(section.nodeKey, "DESCENDANTS");
    const content = [`Document: ${documentId}`, `Section: ${section.sectionRef} - "${section.heading}"`, "", "Full section text (own text plus every nested sub-clause):", sectionText].join("\n");
    try {
      const result = await caller.call(ToleranteSectionResultSchema, "covenant_discovery_section_diagnostic", SYSTEM_PROMPT, content);
      for (const rule of result.rules) {
        const isValidRole = (DISCOVERY_ROLES as readonly string[]).includes(rule.role);
        if (!isValidRole) invalidRoleValues.add(rule.role);
        results.push({ sectionRef: section.sectionRef, ...rule, roleWasValidEnum: isValidRole });
      }
      console.error(`[${section.sectionRef}] ${result.rules.length} rules, roles: ${result.rules.map((r) => r.role).join(", ")}`);
    } catch (err) {
      console.error(`[${section.sectionRef}] call failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  fs.writeFileSync(path.join(OUT_DIR, "document-b-raw-role-reproduction.json"), JSON.stringify({ generatedAt: new Date().toISOString(), sectionsAttempted: Math.min(15, sections.length), results, invalidRoleValues: [...invalidRoleValues], invalidFamilyValues: [...invalidFamilyValues] }, null, 2));
  console.error("\n=== INVALID ROLE VALUES FOUND (real model output outside DISCOVERY_ROLES) ===");
  console.error([...invalidRoleValues]);
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
