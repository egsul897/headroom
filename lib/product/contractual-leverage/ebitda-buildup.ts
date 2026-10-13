/**
 * Consolidated EBITDA from underlying financial line items + operative
 * contractual adjustment definition — compiled to IR and evaluated with the
 * existing runtime. Not a separate computation engine.
 *
 * Shape supported: BASE (Consolidated Net Income) + ADD line items − SUBTRACT
 * line items named/recognized from the definition. Missing required base or
 * unsupported discretionary prongs fail closed.
 */

import { evaluateExpression } from "@/lib/contract-model/runtime/evaluate-expression";
import { fixtureInputResolver, metricInput } from "@/lib/contract-model/runtime/input-resolver";
import { rational, rationalFromNumber, toApproximateNumber } from "@/lib/contract-model/runtime/decimal";
import { money } from "@/lib/contract-model/runtime/values";
import type { InputProvenance } from "@/lib/contract-model/runtime/types";
import type { IRExpression } from "@/lib/contract-model/ir/types";
import { withLeverageExprId } from "./expr-id";
import type {
  ApprovedFinancialLineItem,
  DefinitionText,
  EbitdaBuildupSummary,
  FinancialInputAuthority,
} from "./types";

const CAPACITY_DISCLAIMER =
  "Mathematical result only — not legally available debt-incurrence capacity.";

export interface EbitdaBuildupRequest {
  companyId: string;
  instrumentKey: string;
  ebitdaDefinition: DefinitionText;
  lineItems: ApprovedFinancialLineItem[];
  expectedPeriod?: string | null;
}

function parseNumeric(serialized: { type: string; amount?: string; value?: string } | null): number | null {
  if (!serialized) return null;
  const raw = serialized.type === "MONEY" ? serialized.amount : serialized.value;
  if (raw == null) return null;
  try {
    if (raw.includes("/")) {
      const [num, den] = raw.split("/");
      if (!num || !den) return null;
      return toApproximateNumber(rational(BigInt(num), BigInt(den)));
    }
    return toApproximateNumber(rationalFromNumber(Number(raw)));
  } catch {
    return null;
  }
}

function classifyRole(item: ApprovedFinancialLineItem, definitionText: string): "BASE" | "ADD" | "SUBTRACT" | "UNKNOWN" {
  const label = item.label.toLowerCase();
  const key = item.key.toLowerCase();
  if (/consolidated\s+net\s+income|net\s+income|^cni$/.test(label) || key === "cni" || key === "consolidated_net_income") {
    return "BASE";
  }
  // Tax benefit explicitly subtracted per common Consolidated EBITDA drafting.
  if (/income\s+tax\s+benefit|tax\s+benefit/.test(label) || /subtract|minus/.test(label)) {
    return "SUBTRACT";
  }
  if (/income\s+tax/.test(label) && /subtract/i.test(definitionText) && /tax/.test(definitionText.toLowerCase())) {
    // Definition says "minus any income tax benefit" — a negative tax benefit amount is ADD of negative; a positive benefit should SUBTRACT.
    if (item.amountMillions < 0) return "ADD"; // already signed as negative benefit contribution
    return "SUBTRACT";
  }
  if (
    /interest|depreciation|amortization|non-cash|write-down|write.?off|stock-based|compensation|restructuring|add-?back/.test(
      label,
    )
  ) {
    return "ADD";
  }
  return "UNKNOWN";
}

/**
 * Compile Consolidated EBITDA = CNI + Σ addbacks − Σ subtractions into IR ADD/SUBTRACT.
 */
export function compileEbitdaBuildupExpression(args: {
  companyId: string;
  instrumentKey: string;
  ebitdaDefinition: DefinitionText;
  classified: Array<{ item: ApprovedFinancialLineItem; role: "BASE" | "ADD" | "SUBTRACT" }>;
}): { expression: IRExpression; formulaDisplay: string } {
  const { companyId, instrumentKey, ebitdaDefinition } = args;
  const prov = {
    documentId: ebitdaDefinition.documentId,
    sourceNodeKey: null,
    sourceCitation: `${ebitdaDefinition.sectionRef} — ${ebitdaDefinition.termName}`,
    excerpt: ebitdaDefinition.fullText.slice(0, 400),
  };

  const metric = (key: string): IRExpression =>
    withLeverageExprId({
      kind: "METRIC_REFERENCE",
      type: "MONEY",
      metricName: key,
      companyId,
      instrumentKey,
      resolvedDefinitionId: null,
      provenance: prov,
    });

  const base = args.classified.find((c) => c.role === "BASE");
  if (!base) {
    throw new Error("compileEbitdaBuildupExpression requires a BASE (Consolidated Net Income) line");
  }

  let expr: IRExpression = metric(base.item.key);
  const parts = [`${base.item.label}`];

  for (const row of args.classified) {
    if (row.role === "BASE") continue;
    if (row.role === "ADD") {
      expr = withLeverageExprId({
        kind: "ADD",
        type: "MONEY",
        operands: [expr, metric(row.item.key)],
        provenance: prov,
      });
      parts.push(`+ ${row.item.label}`);
    } else {
      expr = withLeverageExprId({
        kind: "SUBTRACT",
        type: "MONEY",
        left: expr,
        right: metric(row.item.key),
        provenance: prov,
      });
      parts.push(`− ${row.item.label}`);
    }
  }

  return { expression: expr, formulaDisplay: parts.join(" ") };
}

function weakestAuthority(items: ApprovedFinancialLineItem[]): FinancialInputAuthority {
  if (items.some((i) => i.authority === "CALLER_SUPPLIED")) return "CALLER_SUPPLIED";
  if (items.some((i) => i.authority === "SEEDED_SNAPSHOT")) return "SEEDED_SNAPSHOT";
  return "APPROVED_PERIOD_MATCHED";
}

/**
 * Calculate Consolidated EBITDA from line items under the operative definition.
 */
export function calculateEbitdaBuildup(req: EbitdaBuildupRequest): EbitdaBuildupSummary {
  const def = req.ebitdaDefinition;
  const limitations: string[] = [];
  const missing: string[] = [];

  if (!/\b(consolidated\s+net\s+income|net\s+income)\b/i.test(def.fullText)) {
    return {
      status: "UNSUPPORTED_DEFINITION_SHAPE",
      valueMillions: null,
      formulaDisplay: null,
      lineItems: [],
      citations: [`${def.sectionRef} — ${def.termName}`],
      missingRequirements: [],
      limitations: [
        `EBITDA definition does not clearly start from Consolidated Net Income — build-up refused (${CAPACITY_DISCLAIMER})`,
      ],
      authority: "CALLER_SUPPLIED",
      runtimeStatus: null,
    };
  }

  // Discretionary / uncapped synergy prongs without matching line items → disclose, do not invent.
  if (/\brun[- ]rate|synerg(?:y|ies)|extraordinary|non-recurring/i.test(def.fullText)) {
    const hasMatching = req.lineItems.some((i) => /synerg|run[- ]rate|extraordinary|non-recurring/i.test(i.label));
    if (!hasMatching) {
      limitations.push(
        "Definition contemplates run-rate/synergy/extraordinary add-backs; no matching approved line items supplied — those prongs are not applied.",
      );
    }
  }

  const classified: Array<{ item: ApprovedFinancialLineItem; role: "BASE" | "ADD" | "SUBTRACT" }> = [];
  for (const item of req.lineItems) {
    if (req.expectedPeriod && item.period !== req.expectedPeriod) {
      missing.push(`Period mismatch for ${item.label}: got ${item.period}, expected ${req.expectedPeriod}`);
      continue;
    }
    const role = classifyRole(item, def.fullText);
    if (role === "UNKNOWN") {
      missing.push(`Unrecognized line item role for "${item.label}" under the EBITDA definition`);
      continue;
    }
    classified.push({ item, role });
  }

  if (!classified.some((c) => c.role === "BASE")) {
    missing.push("Consolidated Net Income (BASE)");
  }

  if (missing.length > 0) {
    return {
      status: "MISSING_INPUTS",
      valueMillions: null,
      formulaDisplay: null,
      lineItems: classified.map((c) => ({
        key: c.item.key,
        label: c.item.label,
        amountMillions: c.item.amountMillions,
        role: c.role,
      })),
      citations: [`${def.sectionRef} — ${def.termName}`],
      missingRequirements: missing,
      limitations,
      authority: req.lineItems.length ? weakestAuthority(req.lineItems) : "CALLER_SUPPLIED",
      runtimeStatus: null,
    };
  }

  const { expression, formulaDisplay } = compileEbitdaBuildupExpression({
    companyId: req.companyId,
    instrumentKey: req.instrumentKey,
    ebitdaDefinition: def,
    classified,
  });

  const authority = weakestAuthority(classified.map((c) => c.item));
  const provenance: InputProvenance = {
    source:
      authority === "APPROVED_PERIOD_MATCHED"
        ? "approved-period-matched-line-items"
        : authority === "SEEDED_SNAPSHOT"
          ? "seeded-snapshot-line-items"
          : "caller-supplied-line-items",
    sourceVersion: "contractual-leverage.ebitda-buildup.v1",
    selectionMethod: "EXACT_CALLER_SUPPLIED",
    identityStrength: "CONTRACT_NAME_ONLY",
    currency: "USD",
    note: `Line-item authority: ${authority}`,
  };

  const metrics = classified.map((c) =>
    metricInput(
      c.item.key,
      money(rationalFromNumber(c.item.amountMillions), "USD", { exprId: null, inputKeys: [c.item.key] }),
      provenance,
    ),
  );

  const ev = evaluateExpression({
    expression,
    inputs: fixtureInputResolver({ metrics }),
    context: { companyId: req.companyId, instrumentKey: req.instrumentKey },
  });

  if (ev.status !== "EXECUTABLE" || !ev.value) {
    return {
      status: "MISSING_INPUTS",
      valueMillions: null,
      formulaDisplay,
      lineItems: classified.map((c) => ({
        key: c.item.key,
        label: c.item.label,
        amountMillions: c.item.amountMillions,
        role: c.role,
      })),
      citations: [`${def.sectionRef} — ${def.termName}`, ...ev.provenance.sourceCitations],
      missingRequirements: ev.missingInputKeys.length ? ev.missingInputKeys : ev.diagnostics.map((d) => d.message),
      limitations,
      authority,
      runtimeStatus: ev.status,
    };
  }

  return {
    status: "COMPUTED",
    valueMillions: parseNumeric(ev.value as { type: string; amount?: string }),
    formulaDisplay,
    lineItems: classified.map((c) => ({
      key: c.item.key,
      label: c.item.label,
      amountMillions: c.item.amountMillions,
      role: c.role,
    })),
    citations: [...new Set([`${def.sectionRef} — ${def.termName}`, ...ev.provenance.sourceCitations])],
    missingRequirements: [],
    limitations,
    authority,
    runtimeStatus: ev.status,
  };
}
