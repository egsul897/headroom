/**
 * Static audit of elevated-standing emission sites.
 *
 * Ensures SEMANTIC_HYPOTHESIS / SOURCE_SUPPORTED_LEGAL_DIFFERENCE /
 * REVIEWER_VERIFIED_CONCLUSION only leave the module through makeClaim /
 * applyClaimReviews (or documented counterexample / retrieval ceilings that
 * are not claim objects).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export const ELEVATED_STANDINGS = [
  "SEMANTIC_HYPOTHESIS",
  "SOURCE_SUPPORTED_LEGAL_DIFFERENCE",
  "REVIEWER_VERIFIED_CONCLUSION",
] as const;

export type ElevatedStanding = (typeof ELEVATED_STANDINGS)[number];

export interface StandingEmissionSite {
  file: string;
  line: number;
  standing: ElevatedStanding;
  snippet: string;
  viaMakeClaim: boolean;
  viaApplyClaimReviews: boolean;
  /** Non-claim ceilings / documented type unions — allowed but not claim emission. */
  nonClaimSurface: boolean;
}

const ALLOWED_NON_CLAIM_FILES = new Set([
  "types.ts",
  "epistemic.ts",
  "epistemic-audit.ts",
  "retrieve.ts", // standingCeiling on RetrievalHit — not a ComparisonClaim
  "counterexamples.ts", // CounterexampleHit.standing is a separate surface
  "quality/reviewed-examples.ts", // ClaimReviewRecord affirmedStanding literals
]);

function walkTsFiles(dir: string, out: string[] = []): string[] {
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return out;
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    const st = statSync(abs);
    if (st.isDirectory()) {
      if (name === "corpus") continue; // JSON corpus only
      walkTsFiles(abs, out);
    } else if (name.endsWith(".ts") && !name.endsWith(".d.ts")) {
      out.push(abs);
    }
  }
  return out;
}

function lineViaMakeClaim(lines: string[], idx: number): boolean {
  for (let i = idx; i >= Math.max(0, idx - 12); i--) {
    if (/makeClaim\s*\(/.test(lines[i]!)) return true;
    if (/^\s*(export\s+)?function\s+/.test(lines[i]!) && i < idx) break;
  }
  // Also accept standing: inside an object literal passed to makeClaim on nearby lines below/above
  const window = lines.slice(Math.max(0, idx - 8), Math.min(lines.length, idx + 3)).join("\n");
  return /makeClaim\s*\(/.test(window);
}

function lineViaApplyClaimReviews(lines: string[], idx: number): boolean {
  const window = lines.slice(Math.max(0, idx - 15), Math.min(lines.length, idx + 2)).join("\n");
  return /applyClaimReviews|affirmedStanding/.test(window) || /standing:\s*"REVIEWER_VERIFIED_CONCLUSION"/.test(lines[idx]!);
}

/**
 * Scan lib/precedent-comparison for elevated standing literals and classify each site.
 */
export function auditElevatedStandingEmissions(baseDir: string = process.cwd()): {
  sites: StandingEmissionSite[];
  claimEmissionViolations: StandingEmissionSite[];
  summary: string;
} {
  const root = join(baseDir, "lib/precedent-comparison");
  const files = walkTsFiles(root);
  const sites: StandingEmissionSite[] = [];

  for (const abs of files) {
    const rel = abs.slice(join(baseDir, "lib/precedent-comparison").length + 1);
    const text = readFileSync(abs, "utf8");
    const lines = text.split(/\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      for (const standing of ELEVATED_STANDINGS) {
        if (!line.includes(`"${standing}"`) && !line.includes(`'${standing}'`)) continue;
        // Skip type-position / import-only / comments
        if (/^\s*(\*|\/\/)/.test(line)) continue;
        if (/import\s+type|^\s*\|/.test(line) && !/standing:/.test(line)) continue;
        const viaMakeClaim = lineViaMakeClaim(lines, i);
        const viaApplyClaimReviews = standing === "REVIEWER_VERIFIED_CONCLUSION" && lineViaApplyClaimReviews(lines, i);
        const nonClaimSurface = ALLOWED_NON_CLAIM_FILES.has(rel) || ALLOWED_NON_CLAIM_FILES.has(rel.split("/").pop()!);
        sites.push({
          file: rel,
          line: i + 1,
          standing,
          snippet: line.trim().slice(0, 160),
          viaMakeClaim,
          viaApplyClaimReviews,
          nonClaimSurface,
        });
      }
    }
  }

  const claimEmissionViolations = sites.filter((s) => {
    if (s.nonClaimSurface) return false;
    if (s.viaMakeClaim) return false;
    if (s.standing === "REVIEWER_VERIFIED_CONCLUSION" && s.viaApplyClaimReviews) return false;
    // Type annotations / unions inside compare return types etc.
    if (/ComparisonStanding|affirmedStanding|standing\?:/.test(s.snippet) && !/standing:\s*"/.test(s.snippet)) return false;
    if (!/standing:\s*["']/.test(s.snippet) && !/affirmedStanding:\s*["']/.test(s.snippet)) return false;
    return true;
  });

  const summary =
    `audited ${sites.length} elevated-standing sites across ${files.length} files; ` +
    `${claimEmissionViolations.length} claim-emission violations ` +
    `(every claim standing must pass makeClaim evidence checks or claim-bound applyClaimReviews)`;

  return { sites, claimEmissionViolations, summary };
}
