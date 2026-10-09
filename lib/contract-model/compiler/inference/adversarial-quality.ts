/**
 * Automatic quality improvement: generate adversarial tests from recurring
 * compiler failure patterns and feed confirmed defects into the engineering ledger.
 */
import { writeFileSync, existsSync, readFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { LocalSemanticOutput } from "../local-semantic";
import type { SelectiveCompilationPlan } from "../selective-compilation";

export type DefectClass =
  | "MISSING_LEGAL_RESTRICTION"
  | "MISCLASSIFIED_THRESHOLD"
  | "INCORRECT_ENTITY_SCOPE"
  | "MISSING_AMENDMENT"
  | "WRONG_SOURCE_VERSION"
  | "INCOMPLETE_DEPENDENCY_CLOSURE"
  | "FALSE_DEFINITION_CYCLE"
  | "INCORRECT_EXCEPTION_PARENTING"
  | "UNSUPPORTED_MARKED_COMPLETE";

export interface DetectedDefect {
  defectId: string;
  cls: DefectClass;
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
  evidence: string;
  caseId: string;
  confirmed: boolean;
}

export interface AdversarialCase {
  caseId: string;
  defectClass: DefectClass;
  operativeText: string;
  dependencyTexts: { ref: string; text: string }[];
  assertion: string;
}

export function generateAdversarialCasesFromDefects(defects: DetectedDefect[]): AdversarialCase[] {
  const templates: Record<DefectClass, (d: DetectedDefect) => AdversarialCase> = {
    MISSING_LEGAL_RESTRICTION: (d) => ({
      caseId: `adv-${d.defectId}`,
      defectClass: d.cls,
      operativeText: 'The Borrower shall not incur Indebtedness except as permitted by Section 7.02. Notwithstanding the foregoing, Indebtedness under the ABL Facility is prohibited unless the Leverage Ratio is less than 3.00 to 1.00.',
      dependencyTexts: [{ ref: "7.02", text: "Section 7.02 Permitted Indebtedness: (a) Indebtedness under this Agreement; (b) Indebtedness secured by Liens permitted under Section 7.01." }],
      assertion: "Must surface the Leverage Ratio prohibition gate; omission is MISSING_LEGAL_RESTRICTION.",
    }),
    MISCLASSIFIED_THRESHOLD: (d) => ({
      caseId: `adv-${d.defectId}`,
      defectClass: d.cls,
      operativeText: "Investments in an aggregate amount not to exceed $25,000,000.",
      dependencyTexts: [],
      assertion: "Threshold is a capacity fact, not a permission verdict.",
    }),
    INCORRECT_ENTITY_SCOPE: (d) => ({
      caseId: `adv-${d.defectId}`,
      defectClass: d.cls,
      operativeText: "No Restricted Subsidiary shall create any Lien on its Property, provided that the Borrower may create Liens permitted under Section 7.01.",
      dependencyTexts: [],
      assertion: "Entity scope must distinguish Restricted Subsidiary vs Borrower.",
    }),
    MISSING_AMENDMENT: (d) => ({
      caseId: `adv-${d.defectId}`,
      defectClass: d.cls,
      operativeText: "Section 7.05 as amended by Amendment No. 3: the basket is $40,000,000.",
      dependencyTexts: [{ ref: "amendment-3", text: "Amendment No. 3 deletes $25,000,000 and substitutes $40,000,000 in Section 7.05." }],
      assertion: "Operative version must reflect Amendment No. 3.",
    }),
    WRONG_SOURCE_VERSION: (d) => ({
      caseId: `adv-${d.defectId}`,
      defectClass: d.cls,
      operativeText: "Original Section 6.08 text prior to amendment.",
      dependencyTexts: [{ ref: "operative", text: "Current operative text post-restatement governs." }],
      assertion: "Must not compile superseded base text as operative.",
    }),
    INCOMPLETE_DEPENDENCY_CLOSURE: (d) => ({
      caseId: `adv-${d.defectId}`,
      defectClass: d.cls,
      operativeText: 'Subject to the definition of "Consolidated EBITDA" and the Combined Cap.',
      dependencyTexts: [],
      assertion: "Planner must pull definition + shared cap into closure.",
    }),
    FALSE_DEFINITION_CYCLE: (d) => ({
      caseId: `adv-${d.defectId}`,
      defectClass: d.cls,
      operativeText: '"A" means B. "B" means A.',
      dependencyTexts: [],
      assertion: "Definition cycle must remain UNSUPPORTED, not COMPLETE.",
    }),
    INCORRECT_EXCEPTION_PARENTING: (d) => ({
      caseId: `adv-${d.defectId}`,
      defectClass: d.cls,
      operativeText: "Section 7.03(a) prohibition. (b) Exceptions: (i) ordinary course; (ii) with consent.",
      dependencyTexts: [],
      assertion: "Exceptions must parent under 7.03, not float as free permissions.",
    }),
    UNSUPPORTED_MARKED_COMPLETE: (d) => ({
      caseId: `adv-${d.defectId}`,
      defectClass: d.cls,
      operativeText: "as otherwise provided in the Secured Notes Documents (not attached).",
      dependencyTexts: [],
      assertion: "Cross-document gap must not be marked COMPLETE.",
    }),
  };
  return defects.filter((d) => d.confirmed).map((d) => templates[d.cls](d));
}

export function detectDefectsFromOutput(args: {
  caseId: string;
  output: LocalSemanticOutput | null;
  plan?: SelectiveCompilationPlan | null;
  operativeText: string;
}): DetectedDefect[] {
  const defects: DetectedDefect[] = [];
  const { output, plan, operativeText, caseId } = args;
  if (output) {
    for (const rule of output.rules) {
      if (rule.sufficiency === "COMPLETE" && (rule.unsupportedSemantics.length > 0 || rule.missingInputs.length > 0)) {
        defects.push({
          defectId: `${caseId}:unsupported-complete`,
          cls: "UNSUPPORTED_MARKED_COMPLETE",
          severity: "CRITICAL",
          evidence: `Rule ${rule.localRef} marked COMPLETE with gaps`,
          caseId,
          confirmed: true,
        });
      }
      if (rule.permissionOrProhibition === "PERMISSION" && /^\$?[\d,%.\s]+$/.test(rule.support.excerpt.trim())) {
        defects.push({
          defectId: `${caseId}:threshold-permission`,
          cls: "MISCLASSIFIED_THRESHOLD",
          severity: "CRITICAL",
          evidence: `Permission from threshold excerpt ${rule.support.excerpt}`,
          caseId,
          confirmed: true,
        });
      }
    }
    if (/shall not|prohibited/i.test(operativeText) && !(output.rules ?? []).some((r) => r.permissionOrProhibition === "PROHIBITION")) {
      defects.push({
        defectId: `${caseId}:missing-restriction`,
        cls: "MISSING_LEGAL_RESTRICTION",
        severity: "HIGH",
        evidence: "Operative text contains prohibition language but no PROHIBITION rule",
        caseId,
        confirmed: true,
      });
    }
  }
  if (plan) {
    const needsDef = /definition of|"[^"]+"\s+means|Combined Cap/i.test(operativeText);
    if (needsDef && plan.compileUnitIds.length <= 1 && plan.stats.inventoryCount > 1) {
      defects.push({
        defectId: `${caseId}:incomplete-closure`,
        cls: "INCOMPLETE_DEPENDENCY_CLOSURE",
        severity: "HIGH",
        evidence: "Dependency signals present but compile set not expanded",
        caseId,
        confirmed: true,
      });
    }
  }
  return defects;
}

export interface EngineeringLedgerEntry {
  defectId: string;
  cls: DefectClass;
  severity: DetectedDefect["severity"];
  evidence: string;
  caseId: string;
  status: "OPEN" | "IN_PROGRESS" | "CLOSED";
  recordedAt: string;
  source: "adversarial-quality.v1";
}

export function appendEngineeringLedger(ledgerPath: string, defects: DetectedDefect[]): EngineeringLedgerEntry[] {
  mkdirSync(dirname(ledgerPath), { recursive: true });
  const existing: EngineeringLedgerEntry[] = existsSync(ledgerPath)
    ? (JSON.parse(readFileSync(ledgerPath, "utf8")) as { entries: EngineeringLedgerEntry[] }).entries ?? []
    : [];
  const known = new Set(existing.map((e) => e.defectId));
  const added: EngineeringLedgerEntry[] = [];
  for (const d of defects.filter((x) => x.confirmed)) {
    if (known.has(d.defectId)) continue;
    const entry: EngineeringLedgerEntry = {
      defectId: d.defectId,
      cls: d.cls,
      severity: d.severity,
      evidence: d.evidence,
      caseId: d.caseId,
      status: "OPEN",
      recordedAt: new Date().toISOString(),
      source: "adversarial-quality.v1",
    };
    existing.push(entry);
    added.push(entry);
  }
  writeFileSync(ledgerPath, JSON.stringify({ artifact: "vercel-independent-compilation-engineering-ledger", entries: existing }, null, 2));
  return added;
}
