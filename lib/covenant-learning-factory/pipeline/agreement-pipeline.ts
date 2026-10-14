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

// ---------------- persistence (additive tables created by prisma/migrations/20261014220000_section_tree_knowledge) ----------------
// No DDL here: tables come from migrations. Public corpus → kf_* (text sha256 + parser version).
// Customer uploads → customer_* only, scoped by (companyId, documentId); never the shared kf_* corpus tables.

export interface SqlExecutor { execute(sql: string, params?: unknown[]): Promise<Array<Record<string, unknown>>> }

const JSONB_COLS = new Set(["issues", "sectionPaths", "parts", "needsInputs", "totals", "stats", "families"]);
const INT_COLS = new Set(["start", "headingEnd", "end", "depth", "ord", "at", "textLength", "nodeCount", "xrefCount", "checklistCount", "findingCount", "spanStart", "spanEnd", "occurrence"]);

/** Multi-row INSERT ... ON CONFLICT DO NOTHING, chunked. */
export async function insertRows(ex: SqlExecutor, table: string, cols: string[], rows: unknown[][], chunk = 150): Promise<void> {
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    const params: unknown[] = [];
    // Explicit casts so typed drivers bind JSON text and integers correctly.
    const values = part.map((r) => "(" + r.map((v, j) => { params.push(v); return `$${params.length}${JSONB_COLS.has(cols[j] ?? "") ? "::jsonb" : INT_COLS.has(cols[j] ?? "") ? "::int" : ""}`; }).join(",") + ")");
    await ex.execute(`INSERT INTO ${table} (${cols.map((c) => `"${c}"`).join(",")}) VALUES ${values.join(",")} ON CONFLICT DO NOTHING`, params);
  }
}

/** Content key for a cross-reference: its span in the tree text plus sha256 of that span (not list position). */
export function xrefSpanKey(text: string, x: CrossRef): { spanStart: number; spanEnd: number; spanSha256: string } {
  const spanEnd = x.at + x.raw.length;
  return { spanStart: x.at, spanEnd, spanSha256: sha(text.slice(x.at, spanEnd)) };
}

/** Content-keyed rows; identical (span, hash) pairs collapse, which is the point of content keys. */
function xrefRows(r: AgreementPipelineResult) {
  const seen = new Set<string>();
  const out: Array<ReturnType<typeof xrefSpanKey> & { x: CrossRef }> = [];
  for (const x of r.crossRefs) {
    const k = xrefSpanKey(r.tree.text, x);
    const id = `${k.spanStart}:${k.spanEnd}:${k.spanSha256}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ ...k, x });
  }
  return out;
}

async function countWhere(ex: SqlExecutor, table: string, h: string, pv: string): Promise<number> {
  return Number((await ex.execute(`SELECT count(*)::int AS n FROM ${table} WHERE "textSha256"=$1 AND "parserVersion"=$2`, [h, pv]))[0]?.n ?? -1);
}

/**
 * PUBLIC CORPUS ONLY (verified SEC / research texts). Writes tree nodes / content-keyed xrefs / checklist keyed by
 * textSha256 + parserVersion, verifies counts with SELECT, then writes the kf_tree_parses completion marker and the
 * pipeline result. Re-runs are no-ops. Customer uploads must use persistCustomerAgreementRun.
 */
export async function persistAgreementPipeline(ex: SqlExecutor, r: AgreementPipelineResult, meta: { sourceId: string; verification?: string | null }): Promise<{ nodes: number; xrefs: number; checklist: number }> {
  if (/^customer:|^cust-/i.test(meta.sourceId) || meta.verification === "CUSTOMER_UPLOAD") throw new Error("customer uploads must not be written to the shared kf_* corpus tables");
  const h = r.textSha256, pv = r.parserVersion;
  const nodes = r.tree.nodes.map((n) => [h, pv, n.id, n.parentId, n.kind, n.label, n.path, n.sectionNumber, n.title, n.level,
    n.start, n.headingEnd, n.end, n.depth, n.status, r.roles.get(n.id) ?? null, JSON.stringify(n.issues)]);
  const xr = xrefRows(r).map((k) => [h, pv, k.spanStart, k.spanEnd, k.spanSha256, k.x.fromNodeId, k.x.raw, k.x.target, k.x.status, k.x.targetNodeId]);
  const cl = r.checklist.map((c) => [h, pv, c.family, c.status, JSON.stringify(c.sectionPaths), JSON.stringify(c.parts), JSON.stringify(c.needsInputs), c.note]);
  await insertRows(ex, "kf_tree_nodes", ["textSha256","parserVersion","nodeId","parentId","kind","label","path","sectionNumber","title","level","start","headingEnd","end","depth","status","role","issues"], nodes, 100);
  await insertRows(ex, "kf_tree_xref_spans", ["textSha256","parserVersion","spanStart","spanEnd","spanSha256","fromNodeId","raw","target","status","targetNodeId"], xr);
  await insertRows(ex, "kf_tree_checklist", ["textSha256","parserVersion","family","status","sectionPaths","parts","needsInputs","note"], cl);
  const got = { nodes: await countWhere(ex, "kf_tree_nodes", h, pv), xrefs: await countWhere(ex, "kf_tree_xref_spans", h, pv), checklist: await countWhere(ex, "kf_tree_checklist", h, pv) };
  if (got.nodes !== nodes.length || got.xrefs !== xr.length || got.checklist !== cl.length) {
    throw new Error(`knowledge count mismatch for ${meta.sourceId}: nodes ${got.nodes}/${nodes.length} xrefs ${got.xrefs}/${xr.length} checklist ${got.checklist}/${cl.length}`);
  }
  await insertRows(ex, "kf_tree_parses", ["textSha256","parserVersion","sourceId","basis","verification","textLength","nodeCount","xrefCount","checklistCount"],
    [[h, pv, meta.sourceId, r.basis, meta.verification ?? null, r.textLength, nodes.length, xr.length, cl.length]]);
  await insertRows(ex, "kf_agreement_pipeline_results", ["textSha256","parserVersion","pipelineVersion","sourceId","companyId","documentId","stats","families"],
    [[h, pv, r.pipelineVersion, meta.sourceId, null, null, JSON.stringify(r.stats), JSON.stringify(r.families)]]);
  return got;
}

/** Minimal Prisma surface used for customer persistence (so tests can pass an in-memory fake). */
export interface CustomerStore {
  $transaction<T>(fn: (tx: CustomerStore) => Promise<T>): Promise<T>;
  customerAgreementRun: { create(args: { data: Record<string, unknown> }): Promise<{ id: string }> };
  customerTreeNode: { createMany(args: { data: Record<string, unknown>[] }): Promise<{ count: number }> };
  customerTreeXref: { createMany(args: { data: Record<string, unknown>[] }): Promise<{ count: number }> };
  customerTreeChecklist: { createMany(args: { data: Record<string, unknown>[] }): Promise<{ count: number }> };
}

export type CustomerRunOutcome =
  | { status: "OK"; runId: string; textSha256: string; stored: { nodes: number; xrefs: number; checklist: number } }
  | { status: "FAILED"; runId: string | null; error: string };

/**
 * Customer upload persistence. Isolation key = (companyId, documentId): every row hangs off a customer_agreement_runs
 * row for that company+document, so identical texts uploaded by two customers never collapse or cross. A pipeline
 * failure is recorded as a FAILED run with the error (visible), and is returned rather than thrown.
 */
export async function persistCustomerAgreementRun(
  db: CustomerStore,
  scope: { companyId: string; documentId: string; sourceId: string },
  run: () => AgreementPipelineResult | Promise<AgreementPipelineResult>,
): Promise<CustomerRunOutcome> {
  if (!scope.companyId || !scope.documentId) throw new Error("customer agreement runs require companyId and documentId");
  let r: AgreementPipelineResult;
  try {
    r = await run();
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    try {
      const row = await db.customerAgreementRun.create({ data: { ...scope, parserVersion: sectionTreeParserVersion(), pipelineVersion: PIPELINE_VERSION, status: "FAILED", error } });
      return { status: "FAILED", runId: row.id, error };
    } catch (err2) {
      return { status: "FAILED", runId: null, error: `${error}; failure record not written: ${err2 instanceof Error ? err2.message : String(err2)}` };
    }
  }
  try {
    return await db.$transaction(async (tx) => {
      const row = await tx.customerAgreementRun.create({ data: { ...scope, textSha256: r.textSha256, parserVersion: r.parserVersion, pipelineVersion: r.pipelineVersion, status: "OK", stats: r.stats, families: r.families } });
      const runId = row.id;
      const n = await tx.customerTreeNode.createMany({ data: r.tree.nodes.map((x) => ({ runId, nodeId: x.id, parentId: x.parentId, kind: x.kind, label: x.label, path: x.path, sectionNumber: x.sectionNumber, title: x.title, level: x.level, start: x.start, headingEnd: x.headingEnd, end: x.end, depth: x.depth, status: x.status, role: r.roles.get(x.id) ?? null, issues: x.issues })) });
      const xr = await tx.customerTreeXref.createMany({ data: xrefRows(r).map((k) => ({ runId, spanStart: k.spanStart, spanEnd: k.spanEnd, spanSha256: k.spanSha256, fromNodeId: k.x.fromNodeId, raw: k.x.raw, target: k.x.target, status: k.x.status, targetNodeId: k.x.targetNodeId })) });
      const cl = await tx.customerTreeChecklist.createMany({ data: r.checklist.map((c) => ({ runId, family: c.family, status: c.status, sectionPaths: c.sectionPaths, parts: c.parts, needsInputs: c.needsInputs, note: c.note })) });
      return { status: "OK" as const, runId, textSha256: r.textSha256, stored: { nodes: n.count, xrefs: xr.count, checklist: cl.count } };
    });
  } catch (err) {
    const error = `persist failed: ${err instanceof Error ? err.message : String(err)}`;
    try {
      const row = await db.customerAgreementRun.create({ data: { ...scope, textSha256: r.textSha256, parserVersion: r.parserVersion, pipelineVersion: r.pipelineVersion, status: "FAILED", error } });
      return { status: "FAILED", runId: row.id, error };
    } catch {
      return { status: "FAILED", runId: null, error };
    }
  }
}
