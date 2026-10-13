/**
 * Offline refusal audit over persisted product-proof / CLF unit dumps.
 *
 *   npx tsx scripts/covenant-learning-factory/audit-refusals.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { classifyFixedDollarBasket } from "../../lib/contract-model/compiler/fixed-dollar-basket/classify";
import { classifyGreaterOfAssetsBasket } from "../../lib/contract-model/compiler/greater-of-assets-basket/classify";

interface UnitLike {
  sourceRef: string;
  role?: string;
  families?: string[];
  operativeText?: string;
  executableAuthority?: string;
  supportStatus?: string;
  fixedDollarSlice?: { compileClass?: string; fidelityVerdict?: string | null } | null;
  greaterOfSlice?: { compileClass?: string; fidelityVerdict?: string | null } | null;
}

function loadUnits(p: string): UnitLike[] {
  if (!existsSync(p)) return [];
  const raw = JSON.parse(readFileSync(p, "utf8"));
  return (Array.isArray(raw) ? raw : raw.units ?? []) as UnitLike[];
}

function isCatalogClause(ref: string): boolean {
  return (
    (/\([a-z0-9]+\)$/i.test(ref) || /\(\d{1,2}\)\([a-z0-9]+\)$/i.test(ref)) &&
    (ref.startsWith("def:") || /^\d+\.\d+\(/i.test(ref))
  );
}

export type RefusalRootCause =
  | "VERIFIED_EXECUTABLE"
  | "NOT_EXCEPTION_CATALOG_CLAUSE"
  | "QUALITATIVE_PERMISSION_NO_NUMERIC_CAP"
  | "FIXED_DOLLAR_CAP_ROLE_MISSED"
  | "FIXED_DOLLAR_MULTI_AMOUNT"
  | "FIXED_DOLLAR_COMPLEX_FORMULA_HANDOFF"
  | "GREATER_OF_VARIANT_UNSUPPORTED"
  | "RATIO_GATED_CAPACITY"
  | "BUILDER_OR_AVAILABLE_AMOUNT"
  | "HYBRID_OR_OTHER_UNSUPPORTED"
  | "VERTICAL_SLICE_ATTEMPTED_FIDELITY_FAIL";

export function classifyRefusal(u: UnitLike): { cause: RefusalRootCause; legalStructure: string; detail: string } {
  if (u.executableAuthority === "VERIFIED_EXECUTABLE") {
    return {
      cause: "VERIFIED_EXECUTABLE",
      legalStructure: u.fixedDollarSlice ? "FIXED_DOLLAR_BASKET" : "GREATER_OF_ASSETS_BASKET",
      detail: "vertical_slice_pass",
    };
  }

  const text = (u.operativeText ?? "").replace(/\s+/g, " ").trim();
  if (!isCatalogClause(u.sourceRef)) {
    return {
      cause: "NOT_EXCEPTION_CATALOG_CLAUSE",
      legalStructure:
        u.role === "GENERAL_PROHIBITION"
          ? "GENERAL_PROHIBITION_OR_SECTION_CHAPEAU"
          : `NON_CLAUSE_${u.role ?? "UNKNOWN"}`,
      detail: "executable vertical slice only attempts numbered/lettered exception-catalog limbs",
    };
  }

  if (u.fixedDollarSlice && u.fixedDollarSlice.fidelityVerdict && u.fixedDollarSlice.fidelityVerdict !== "PASS") {
    return {
      cause: "VERTICAL_SLICE_ATTEMPTED_FIDELITY_FAIL",
      legalStructure: "FIXED_DOLLAR_BASKET",
      detail: String(u.fixedDollarSlice.fidelityVerdict),
    };
  }
  if (u.greaterOfSlice && u.greaterOfSlice.fidelityVerdict && u.greaterOfSlice.fidelityVerdict !== "PASS") {
    return {
      cause: "VERTICAL_SLICE_ATTEMPTED_FIDELITY_FAIL",
      legalStructure: "GREATER_OF_ASSETS_BASKET",
      detail: String(u.greaterOfSlice.fidelityVerdict),
    };
  }

  const fd = classifyFixedDollarBasket(text);
  const go = classifyGreaterOfAssetsBasket(text);

  if (/\bAvailable Amount\b|\bBuilder Basket\b|\bCumulative Credit\b/i.test(text)) {
    return { cause: "BUILDER_OR_AVAILABLE_AMOUNT", legalStructure: "BUILDER_BASKET", detail: "builder semantics unsupported" };
  }
  if (/\b(?:Leverage|Coverage)\s+Ratio\b/i.test(text) && !/\$\s?[\d,]/.test(text)) {
    return { cause: "RATIO_GATED_CAPACITY", legalStructure: "RATIO_INCURRENCE", detail: "ratio-gated no fixed dollar" };
  }
  if (
    go.class === "PERCENT_OF_ASSETS_SOLE_CAP" ||
    go.class === "PERCENT_OF_ASSETS_SOLE_CAP_WITH_QUALITATIVE_GATES"
  ) {
    // Classified as sole percent-of-assets — if still refused, fidelity/eval failed.
    return {
      cause: "VERTICAL_SLICE_ATTEMPTED_FIDELITY_FAIL",
      legalStructure: "PERCENT_OF_ASSETS_SOLE_CAP",
      detail: `classified=${go.class}; executableAuthority=${u.executableAuthority}`,
    };
  }
  if (go.class !== "NOT_GREATER_OF_ASSETS") {
    return { cause: "GREATER_OF_VARIANT_UNSUPPORTED", legalStructure: "GREATER_OF_ASSETS_BASKET", detail: go.reasons.join(",") };
  }
  if (fd.reasons.includes("complex_formula_or_grower")) {
    return {
      cause: "FIXED_DOLLAR_COMPLEX_FORMULA_HANDOFF",
      legalStructure: "COMPLEX_OR_GROWER_FORMULA",
      detail: fd.reasons.join(","),
    };
  }
  if (fd.reasons.includes("multiple_distinct_dollar_amounts")) {
    return { cause: "FIXED_DOLLAR_MULTI_AMOUNT", legalStructure: "MULTI_DOLLAR_CLAUSE", detail: fd.reasons.join(",") };
  }
  if (fd.reasons.includes("dollar_present_but_not_cap_role") || (fd.amountUsd != null && !fd.capRoleOk)) {
    return {
      cause: "FIXED_DOLLAR_CAP_ROLE_MISSED",
      legalStructure: "FIXED_DOLLAR_CAP_VARIANT",
      detail: `amount=${fd.amountUsd}; reasons=${fd.reasons.join(",")}`,
    };
  }
  if (!/\$\s?[\d,]/.test(text) && !/\d+(?:\.\d+)?\s*%/.test(text)) {
    return {
      cause: "QUALITATIVE_PERMISSION_NO_NUMERIC_CAP",
      legalStructure: "QUALITATIVE_EXCEPTION",
      detail: "no dollar/percent capacity pattern",
    };
  }
  return {
    cause: "HYBRID_OR_OTHER_UNSUPPORTED",
    legalStructure: "OTHER_UNSUPPORTED",
    detail: `fd=${fd.class}/${fd.reasons.join(",")}; go=${go.class}`,
  };
}

async function main() {
  const repo = process.cwd();
  const unitPaths = [
    "docs/product-proof/002/artifacts/mhk-holdout/units.json",
    "docs/product-proof/002/artifacts/mtn-regression/units.json",
  ];
  // Also pick up any CLF-exported unit dumps if present
  const clfUnitsDir = path.join(repo, "docs/covenant-learning-factory/unit-dumps");
  if (existsSync(clfUnitsDir)) {
    for (const f of require("fs").readdirSync(clfUnitsDir) as string[]) {
      if (f.endsWith(".json")) unitPaths.push(path.join("docs/covenant-learning-factory/unit-dumps", f));
    }
  }

  const byCause: Record<string, number> = {};
  const byStructure: Record<string, number> = {};
  const bySupport: Record<string, number> = {};
  const samples: Record<string, { sourceRef: string; excerpt: string; detail: string }[]> = {};
  let total = 0;
  let refused = 0;
  let verified = 0;

  for (const rel of unitPaths) {
    const abs = path.isAbsolute(rel) ? rel : path.join(repo, rel);
    for (const u of loadUnits(abs)) {
      total += 1;
      bySupport[u.supportStatus ?? "?"] = (bySupport[u.supportStatus ?? "?"] ?? 0) + 1;
      const c = classifyRefusal(u);
      byCause[c.cause] = (byCause[c.cause] ?? 0) + 1;
      byStructure[c.legalStructure] = (byStructure[c.legalStructure] ?? 0) + 1;
      if (c.cause === "VERIFIED_EXECUTABLE") verified += 1;
      else {
        refused += 1;
        const list = samples[c.cause] ?? [];
        if (list.length < 3) {
          list.push({
            sourceRef: u.sourceRef,
            excerpt: (u.operativeText ?? "").replace(/\s+/g, " ").trim().slice(0, 220),
            detail: c.detail,
          });
          samples[c.cause] = list;
        }
      }
    }
  }

  const report = {
    schemaVersion: "covenant-learning-factory.refusal-audit.v1",
    generatedAt: new Date().toISOString(),
    sources: unitPaths.filter((p) => existsSync(path.isAbsolute(p) ? p : path.join(repo, p))),
    totals: { units: total, verifiedExecutable: verified, refusedExecutable: refused },
    metricClarification: {
      supportedStructureUnits:
        "Count of units with supportStatus===SUPPORTED_STRUCTURE (catalog support + no unresolved context). Independent of executableAuthority.",
      verifiedExecutableUnits:
        "Count of units elevated by fixed-dollar/greater-of vertical slices after fidelity PASS. May be >0 while supportedStructureUnits===0 when supportStatus is PARTIAL due to unresolved context bundles.",
      dangerousOmissions:
        "Must be NOT_MEASURED unless an independently adjudicated completeness oracle exists for the package.",
    },
    refusalRootCauseDistribution: Object.fromEntries(
      Object.entries(byCause).sort((a, b) => b[1] - a[1]),
    ),
    legalStructureDistribution: Object.fromEntries(
      Object.entries(byStructure).sort((a, b) => b[1] - a[1]),
    ),
    supportStatusDistribution: bySupport,
    samples,
  };

  const outDir = path.join(repo, "docs/covenant-learning-factory");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "refusal-audit.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
