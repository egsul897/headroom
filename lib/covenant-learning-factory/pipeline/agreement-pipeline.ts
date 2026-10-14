/**
 * One deterministic end-to-end path for ANY agreement text:
 *   text → section tree → clause roles + cross-references → covenant checklist → basket extraction + compute
 *   → per-family summary → (optional) additive Neon persistence.
 *
 * General logic only: no per-issuer branches, zero AI / LLM calls. Missing figures are NEEDS_INPUT. A basket the
 * extractor could not find a cap for is reported NEEDS_INPUT ("no cap located"), never UNLIMITED by default; only
 * clauses whose text itself states unlimited capacity are reported UNLIMITED_EXPLICIT.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseDocumentTree, sectionOf, type TextBasis } from "../../contract-model/section-tree/parse";
import {
  CHECKLIST_FAMILIES, covenantChecklist, ownText, resolveCrossRefs, roleOf,
  type ChecklistItem, type ClauseRole, type CrossRef,
} from "../../contract-model/section-tree/semantics";
import { runCovenantComputation } from "../../contract-model/covenant-computation";
import type { ComputedBasket } from "../../contract-model/covenant-computation/types";
import { buildComputationPackage } from "../sweep/build-package";
import { emptyRuleSet } from "../learned-rules/types";

export const PIPELINE_VERSION = "agreement-pipeline-1";

let cachedParserVersion: string | null = null;
/** "st-" + sha256(parse.ts + semantics.ts)[0:12]; falls back to a static tag when sources are not on disk (bundled app). */
export function sectionTreeParserVersion(): string {
  if (cachedParserVersion) return cachedParserVersion;
  try {
    const p = (f: string) => readFileSync(new URL(`../../contract-model/section-tree/${f}`, import.meta.url));
    cachedParserVersion = "st-" + createHash("sha256").update(Buffer.concat([p("parse.ts"), p("semantics.ts")])).digest("hex").slice(0, 12);
  } catch {
    cachedParserVersion = `st-${PIPELINE_VERSION}`;
  }
  return cachedParserVersion;
}

export type FamilyOutcome = "CAP_COMPUTED" | "NEEDS_INPUT" | "CONDITIONS_LIMITED" | "UNLIMITED_EXPLICIT" | "MISSING";

export interface FamilySummary {
  family: string;
  outcome: FamilyOutcome;
  checklistStatus: ChecklistItem["status"] | "N/A";
  sectionPaths: string[];
  baskets: Array<{ sectionRef: string; category: string; capStatus: string; cap: string | null; currency: string | null; missingInputs: string[]; citation: string }>;
  needsInputs: string[];
}

export interface AgreementPipelineResult {
  pipelineVersion: string;
  parserVersion: string;
  textSha256: string;
  basis: TextBasis;
  textLength: number;
  tree: ReturnType<typeof parseDocumentTree>;
  roles: Map<string, ClauseRole>;
  crossRefs: CrossRef[];
  checklist: ChecklistItem[];
  computedBaskets: ComputedBasket[];
  families: FamilySummary[];
  stats: { nodes: number; sections: number; clauses: number; xrefs: number; xrefResolved: number; baskets: number };
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/** Map extractor families onto the checklist vocabulary (general aliases only). */
function checklistFamilyOf(f: string): string {
  const u = f.toUpperCase();
  if (/INDEBTEDNESS|^DEBT/.test(u)) return "DEBT";
  if (/LIEN/.test(u)) return "LIENS";
  if (/RESTRICTED_PAYMENT|DIVIDEND/.test(u)) return "RESTRICTED_PAYMENTS";
  if (/INVESTMENT/.test(u)) return "INVESTMENTS";
  if (/ASSET_SALE|DISPOSITION/.test(u)) return "ASSET_SALES";
  if (/AFFILIATE/.test(u)) return "AFFILIATE_TRANSACTIONS";
  if (/FUNDAMENTAL|MERGER/.test(u)) return "FUNDAMENTAL_CHANGES";
  if (/PREPAY|JUNIOR/.test(u)) return "PREPAYMENTS";
  if (/RATIO|FINANCIAL/.test(u)) return "FINANCIAL_RATIOS";
  return u;
}

export function runAgreementPipeline(args: { sourceId: string; text: string; issuerCik?: string | null }): AgreementPipelineResult {
  const raw = args.text ?? "";
  const tree = parseDocumentTree(raw);
  const roles = new Map<string, ClauseRole>();
  for (const n of tree.nodes) if (n.kind === "CLAUSE") roles.set(n.id, roleOf(tree, tree.text, n));
  const crossRefs = resolveCrossRefs(tree, tree.text);
  const checklist = covenantChecklist(tree, tree.text);

  // Extractor-only (v0 ruleset): no learned rules, so nothing issuer-specific can leak in.
  const rules = emptyRuleSet(0);
  const pkg = buildComputationPackage({ source: { sourceId: args.sourceId, issuerCik: args.issuerCik ?? null }, documentText: raw, candidates: [], rules });
  // Amount-bearing tree clauses (BASKET / EXCEPTION_PROVISO with a "$" figure or "greater of") inside sections the
  // checklist assigned to a covenant family, when the regional extractor did not already cite them. Exact spans of
  // the tree text; family from the section classifier. Pipeline-only (the scoreboard path is unchanged).
  const famBySection = new Map<string, string>();
  for (const c of checklist) for (const p of c.sectionPaths) if (!famBySection.has(p)) famBySection.set(p, c.family);
  const cited = pkg.baskets.map((b) => b.operativeText.replace(/[^A-Za-z0-9]/g, "")).join("|");
  for (const n of tree.nodes) {
    if (n.kind !== "CLAUSE") continue;
    const role = roles.get(n.id);
    if (role !== "BASKET" && role !== "EXCEPTION_PROVISO") continue;
    const sec = sectionOf(tree, n);
    const family = sec ? famBySection.get(sec.path) : undefined;
    if (!family) continue;
    const own = ownText(tree, tree.text, n).trim();
    if (own.length < 24 || !/\$\s?[\d,]{3,}|greater\s+of/i.test(own)) continue;
    const key = own.replace(/[^A-Za-z0-9]/g, "").slice(0, 80);
    if (key.length < 20 || cited.includes(key)) continue;
    pkg.baskets.push({ stableKey: `tree:${n.path}`, sectionRef: n.path, covenantFamily: family, documentId: pkg.baskets[0]?.documentId ?? args.sourceId, operativeText: own, role: "PERMISSION" });
  }
  const computed = runCovenantComputation(pkg, { rules, createdAt: "1970-01-01T00:00:00.000Z" }).baskets;

  const families: FamilySummary[] = [];
  const byFam = new Map<string, ComputedBasket[]>();
  for (const b of computed) {
    const f = checklistFamilyOf(b.covenantFamily);
    byFam.set(f, [...(byFam.get(f) ?? []), b]);
  }
  const famNames = [...CHECKLIST_FAMILIES, ...[...byFam.keys()].filter((f) => !(CHECKLIST_FAMILIES as readonly string[]).includes(f)).sort()];
  for (const family of famNames) {
    const ck = checklist.find((c) => c.family === family);
    const bs = byFam.get(family) ?? [];
    const baskets = bs.map((b) => {
      // Never unlimited by default: only explicit unlimited-capacity text keeps UNLIMITED.
      const explicitUnlimited = b.capKind === "UNLIMITED" && b.category === "UNLIMITED";
      const defaulted = b.capKind === "UNLIMITED" && !explicitUnlimited;
      return {
        sectionRef: b.sectionRef,
        category: b.category,
        capStatus: defaulted ? "NEEDS_INPUT" : b.capStatus,
        cap: defaulted ? null : b.capCanonical ?? (explicitUnlimited ? "UNLIMITED_EXPLICIT" : null),
        currency: b.capCurrency,
        missingInputs: defaulted ? ["cap not located in clause text"] : b.missingInputs,
        citation: b.citationExcerpt.slice(0, 240),
      };
    });
    const needsInputs = [...new Set([...(ck?.needsInputs ?? []), ...baskets.flatMap((b) => b.missingInputs)])];
    let outcome: FamilyOutcome;
    if (baskets.some((b) => b.capStatus === "COMPUTED" && b.cap && b.cap !== "UNLIMITED_EXPLICIT")) outcome = "CAP_COMPUTED";
    else if (baskets.some((b) => b.capStatus === "NEEDS_INPUT" || b.capStatus === "UNKNOWN") || ck?.status === "NEEDS_INPUT") outcome = "NEEDS_INPUT";
    else if (baskets.some((b) => b.cap === "UNLIMITED_EXPLICIT")) outcome = "UNLIMITED_EXPLICIT";
    else if (ck && ck.status !== "MISSING") outcome = ck.status === "CAP_FOUND" ? "NEEDS_INPUT" : "CONDITIONS_LIMITED";
    else outcome = "MISSING";
    if (outcome === "MISSING" && !ck) continue;
    families.push({ family, outcome, checklistStatus: ck?.status ?? "N/A", sectionPaths: ck?.sectionPaths ?? [], baskets, needsInputs });
  }

  return {
    pipelineVersion: PIPELINE_VERSION,
    parserVersion: sectionTreeParserVersion(),
    textSha256: sha(raw),
    basis: tree.basis,
    textLength: raw.length,
    tree, roles, crossRefs, checklist, computedBaskets: computed, families,
    stats: {
      nodes: tree.nodes.length,
      sections: tree.nodes.filter((n) => n.kind === "SECTION").length,
      clauses: tree.nodes.filter((n) => n.kind === "CLAUSE").length,
      xrefs: crossRefs.length,
      xrefResolved: crossRefs.filter((x) => x.status === "RESOLVED").length,
      baskets: computed.length,
    },
  };
}

// ---------------- persistence (additive tables, idempotent) ----------------

export interface SqlExecutor { execute(sql: string, params?: unknown[]): Promise<Array<Record<string, unknown>>> }

/** Adapt a Prisma client ($queryRawUnsafe / $executeRawUnsafe) to SqlExecutor. */
export function prismaSqlExecutor(db: { $queryRawUnsafe: (sql: string, ...p: unknown[]) => Promise<unknown>; $executeRawUnsafe: (sql: string, ...p: unknown[]) => Promise<unknown> }): SqlExecutor {
  return {
    async execute(sql, params = []) {
      if (/^\s*(SELECT|WITH)\b/i.test(sql)) return (await db.$queryRawUnsafe(sql, ...params)) as Array<Record<string, unknown>>;
      await db.$executeRawUnsafe(sql, ...params);
      return [];
    },
  };
}

export const KNOWLEDGE_DDL = [
  `CREATE TABLE IF NOT EXISTS kf_tree_parses (
    "textSha256" text NOT NULL, "parserVersion" text NOT NULL, "sourceId" text NOT NULL, basis text NOT NULL,
    verification text, "textLength" int NOT NULL, "nodeCount" int NOT NULL, "xrefCount" int NOT NULL,
    "checklistCount" int NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY ("textSha256","parserVersion"))`,
  `CREATE INDEX IF NOT EXISTS kf_tree_parses_source ON kf_tree_parses ("sourceId")`,
  `CREATE TABLE IF NOT EXISTS kf_tree_nodes (
    "textSha256" text NOT NULL, "parserVersion" text NOT NULL, "nodeId" text NOT NULL, "parentId" text,
    kind text NOT NULL, label text, path text, "sectionNumber" text, title text, level text,
    "start" int NOT NULL, "headingEnd" int NOT NULL, "end" int NOT NULL, depth int NOT NULL,
    status text NOT NULL, role text, issues jsonb NOT NULL DEFAULT '[]',
    PRIMARY KEY ("textSha256","parserVersion","nodeId"))`,
  `CREATE TABLE IF NOT EXISTS kf_tree_xrefs (
    "textSha256" text NOT NULL, "parserVersion" text NOT NULL, ord int NOT NULL, "fromNodeId" text NOT NULL,
    at int NOT NULL, raw text NOT NULL, target text NOT NULL, status text NOT NULL, "targetNodeId" text,
    PRIMARY KEY ("textSha256","parserVersion",ord))`,
  `CREATE TABLE IF NOT EXISTS kf_tree_checklist (
    "textSha256" text NOT NULL, "parserVersion" text NOT NULL, family text NOT NULL, status text NOT NULL,
    "sectionPaths" jsonb NOT NULL, parts jsonb NOT NULL, "needsInputs" jsonb NOT NULL, note text,
    PRIMARY KEY ("textSha256","parserVersion",family))`,
  `CREATE TABLE IF NOT EXISTS kf_scoreboard_runs (
    "runId" text PRIMARY KEY, "gitCommit" text NOT NULL, "rulesLabel" text NOT NULL, "rulesetVersion" text,
    tree boolean NOT NULL, "snapshotSha256" text NOT NULL, totals jsonb NOT NULL, "findingCount" int NOT NULL,
    "createdAt" timestamptz NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS kf_scoreboard_findings (
    "runId" text NOT NULL, "sourceId" text NOT NULL, ord int NOT NULL, "textSha256" text, split text NOT NULL,
    class text NOT NULL, key text, family text, "sectionRef" text, excerpt text, message text,
    PRIMARY KEY ("runId","sourceId",ord))`,
  `CREATE TABLE IF NOT EXISTS kf_agreement_pipeline_results (
    "textSha256" text NOT NULL, "parserVersion" text NOT NULL, "pipelineVersion" text NOT NULL, "sourceId" text NOT NULL,
    "companyId" text, "documentId" text, stats jsonb NOT NULL, families jsonb NOT NULL,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY ("textSha256","parserVersion","pipelineVersion","sourceId"))`,
];

export async function ensureKnowledgeTables(ex: SqlExecutor): Promise<void> {
  for (const d of KNOWLEDGE_DDL) await ex.execute(d);
}

const JSONB_COLS = new Set(["issues", "sectionPaths", "parts", "needsInputs", "totals", "stats", "families"]);
const INT_COLS = new Set(["start", "headingEnd", "end", "depth", "ord", "at", "textLength", "nodeCount", "xrefCount", "checklistCount", "findingCount"]);

/** Multi-row INSERT ... ON CONFLICT DO NOTHING, chunked. */
export async function insertRows(ex: SqlExecutor, table: string, cols: string[], rows: unknown[][], chunk = 150): Promise<void> {
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    const params: unknown[] = [];
    // Explicit casts so typed drivers (Prisma) bind JSON text and integers correctly.
    const values = part.map((r) => "(" + r.map((v, j) => { params.push(v); return `$${params.length}${JSONB_COLS.has(cols[j] ?? "") ? "::jsonb" : INT_COLS.has(cols[j] ?? "") ? "::int" : ""}`; }).join(",") + ")");
    await ex.execute(`INSERT INTO ${table} (${cols.map((c) => `"${c}"`).join(",")}) VALUES ${values.join(",")} ON CONFLICT DO NOTHING`, params);
  }
}

async function countWhere(ex: SqlExecutor, table: string, h: string, pv: string): Promise<number> {
  return Number((await ex.execute(`SELECT count(*)::int AS n FROM ${table} WHERE "textSha256"=$1 AND "parserVersion"=$2`, [h, pv]))[0]?.n ?? -1);
}

/**
 * Write tree nodes / xrefs / checklist (keyed by textSha256+parserVersion), verify counts with SELECT, then write the
 * kf_tree_parses completion marker and the per-source pipeline result. Re-runs are no-ops.
 */
export async function persistAgreementPipeline(ex: SqlExecutor, r: AgreementPipelineResult, meta: { sourceId: string; verification?: string | null; companyId?: string | null; documentId?: string | null }): Promise<{ nodes: number; xrefs: number; checklist: number }> {
  const h = r.textSha256, pv = r.parserVersion;
  const nodes = r.tree.nodes.map((n) => [h, pv, n.id, n.parentId, n.kind, n.label, n.path, n.sectionNumber, n.title, n.level,
    n.start, n.headingEnd, n.end, n.depth, n.status, r.roles.get(n.id) ?? null, JSON.stringify(n.issues)]);
  const xr = r.crossRefs.map((x, i) => [h, pv, i, x.fromNodeId, x.at, x.raw, x.target, x.status, x.targetNodeId]);
  const cl = r.checklist.map((c) => [h, pv, c.family, c.status, JSON.stringify(c.sectionPaths), JSON.stringify(c.parts), JSON.stringify(c.needsInputs), c.note]);
  await insertRows(ex, "kf_tree_nodes", ["textSha256","parserVersion","nodeId","parentId","kind","label","path","sectionNumber","title","level","start","headingEnd","end","depth","status","role","issues"], nodes, 100);
  await insertRows(ex, "kf_tree_xrefs", ["textSha256","parserVersion","ord","fromNodeId","at","raw","target","status","targetNodeId"], xr);
  await insertRows(ex, "kf_tree_checklist", ["textSha256","parserVersion","family","status","sectionPaths","parts","needsInputs","note"], cl);
  const got = { nodes: await countWhere(ex, "kf_tree_nodes", h, pv), xrefs: await countWhere(ex, "kf_tree_xrefs", h, pv), checklist: await countWhere(ex, "kf_tree_checklist", h, pv) };
  if (got.nodes !== nodes.length || got.xrefs !== xr.length || got.checklist !== cl.length) {
    throw new Error(`knowledge count mismatch for ${meta.sourceId}: nodes ${got.nodes}/${nodes.length} xrefs ${got.xrefs}/${xr.length} checklist ${got.checklist}/${cl.length}`);
  }
  await insertRows(ex, "kf_tree_parses", ["textSha256","parserVersion","sourceId","basis","verification","textLength","nodeCount","xrefCount","checklistCount"],
    [[h, pv, meta.sourceId, r.basis, meta.verification ?? null, r.textLength, nodes.length, xr.length, cl.length]]);
  await insertRows(ex, "kf_agreement_pipeline_results", ["textSha256","parserVersion","pipelineVersion","sourceId","companyId","documentId","stats","families"],
    [[h, pv, r.pipelineVersion, meta.sourceId, meta.companyId ?? null, meta.documentId ?? null, JSON.stringify(r.stats), JSON.stringify(r.families)]]);
  return got;
}
