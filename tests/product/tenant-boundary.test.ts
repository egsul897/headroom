/**
 * Tenant boundary (lib/auth/tenant-boundary.ts): deny by default, membership-bound when a principal
 * exists, existence-neutral denials, fail closed on identity or lookup failure, and structural
 * coverage of every company-scoped entry point.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  TENANT_ACCESS_DENIED_MESSAGE,
  TenantAccessDeniedError,
  authorizeCompanyAccess,
  decideCompanyAccess,
  requireCompanyAccess,
  resolveRequestPrincipal,
  resolveTenantBoundaryMode,
} from "../../lib/auth/tenant-boundary";

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), findUnique: vi.fn() }));
vi.mock("../../lib/prisma", () => ({
  prisma: { knowledgeSource: { findMany: mocks.findMany }, company: { findUnique: mocks.findUnique }, $disconnect: vi.fn() },
}));

const DENY = "DENY_CUSTOMER_WITHOUT_PRINCIPAL" as const;
const OPEN = "UNAUTHENTICATED_EVALUATION_INSTANCE" as const;
const member = { subject: "user-1", companyIds: ["acme"] };

describe("decideCompanyAccess (pure)", () => {
  it("authenticated member of the company is allowed", () => {
    expect(decideCompanyAccess({ companyId: "acme", tenantKind: "CUSTOMER", principal: member, mode: DENY })).toMatchObject({ allowed: true, reason: "PRINCIPAL_MEMBER" });
  });
  it("unauthenticated access to a CUSTOMER tenant is denied by default", () => {
    expect(decideCompanyAccess({ companyId: "acme", tenantKind: "CUSTOMER", principal: null, mode: DENY })).toMatchObject({ allowed: false, reason: "NO_PRINCIPAL_FOR_CUSTOMER_TENANT" });
  });
  it("authenticated but wrong company is denied, even on an acknowledged open instance", () => {
    expect(decideCompanyAccess({ companyId: "other-co", tenantKind: "CUSTOMER", principal: member, mode: DENY })).toMatchObject({ allowed: false, reason: "PRINCIPAL_NOT_MEMBER" });
    expect(decideCompanyAccess({ companyId: "other-co", tenantKind: "EVALUATION", principal: member, mode: OPEN })).toMatchObject({ allowed: false, reason: "PRINCIPAL_NOT_MEMBER" });
  });
  it("a forged or unknown company id is denied", () => {
    expect(decideCompanyAccess({ companyId: "does-not-exist", tenantKind: null, principal: null, mode: OPEN })).toMatchObject({ allowed: false, reason: "COMPANY_NOT_FOUND" });
    expect(decideCompanyAccess({ companyId: "../etc", tenantKind: "CUSTOMER", principal: member, mode: OPEN })).toMatchObject({ allowed: false, reason: "INVALID_COMPANY_ID" });
  });
  it("a principal with no membership record is denied everywhere", () => {
    const noMembership = { subject: "user-2", companyIds: [] };
    expect(decideCompanyAccess({ companyId: "acme", tenantKind: "CUSTOMER", principal: noMembership, mode: DENY }).allowed).toBe(false);
    expect(decideCompanyAccess({ companyId: "eval-co", tenantKind: "EVALUATION", principal: noMembership, mode: DENY }).allowed).toBe(false);
  });
  it("EVALUATION tenants stay reachable without a principal; CUSTOMER tenants only on an acknowledged instance", () => {
    expect(decideCompanyAccess({ companyId: "eval-co", tenantKind: "EVALUATION", principal: null, mode: DENY })).toMatchObject({ allowed: true, reason: "EVALUATION_TENANT_OPEN" });
    expect(decideCompanyAccess({ companyId: "acme", tenantKind: "CUSTOMER", principal: null, mode: OPEN })).toMatchObject({ allowed: true, reason: "OPERATOR_ACKNOWLEDGED_UNAUTHENTICATED_INSTANCE" });
  });
});

describe("authorizeCompanyAccess (resolution + fail-closed)", () => {
  it("defaults to deny mode and only the exact token opens the instance", () => {
    expect(resolveTenantBoundaryMode({})).toBe(DENY);
    expect(resolveTenantBoundaryMode({ HEADROOM_TENANT_BOUNDARY: "true" })).toBe(DENY);
    expect(resolveTenantBoundaryMode({ HEADROOM_TENANT_BOUNDARY: "unauthenticated_evaluation_instance" })).toBe(DENY);
    expect(resolveTenantBoundaryMode({ HEADROOM_TENANT_BOUNDARY: "UNAUTHENTICATED_EVALUATION_INSTANCE" })).toBe(OPEN);
  });
  it("no identity provider is integrated: the default principal is null, never derived from input", async () => {
    expect(await resolveRequestPrincipal()).toBeNull();
  });
  it("fails closed when the identity provider throws", async () => {
    const d = await authorizeCompanyAccess("acme", { resolvePrincipal: async () => { throw new Error("idp down"); }, loadTenantKind: async () => "EVALUATION", env: {} });
    expect(d).toMatchObject({ allowed: false, reason: "PRINCIPAL_RESOLUTION_FAILED" });
  });
  it("fails closed when the company lookup throws", async () => {
    const d = await authorizeCompanyAccess("acme", { resolvePrincipal: async () => null, loadTenantKind: async () => { throw new Error("db down"); }, env: {} });
    expect(d).toMatchObject({ allowed: false, reason: "COMPANY_LOOKUP_FAILED" });
  });
  it("denies a CUSTOMER tenant without a principal in the default mode and the denial is existence-neutral", async () => {
    const d = await authorizeCompanyAccess("acme", { resolvePrincipal: async () => null, loadTenantKind: async () => "CUSTOMER", env: {} });
    expect(d.allowed).toBe(false);
    await expect(requireCompanyAccess("acme", { resolvePrincipal: async () => null, loadTenantKind: async () => "CUSTOMER", env: {} })).rejects.toThrow(TENANT_ACCESS_DENIED_MESSAGE);
    await expect(requireCompanyAccess("ghost", { resolvePrincipal: async () => null, loadTenantKind: async () => null, env: {} })).rejects.toThrow(TENANT_ACCESS_DENIED_MESSAGE);
    try { await requireCompanyAccess("acme", { resolvePrincipal: async () => null, loadTenantKind: async () => "CUSTOMER", env: {} }); } catch (e) { expect(e).toBeInstanceOf(TenantAccessDeniedError); expect((e as Error).message).not.toMatch(/acme|CUSTOMER|exist/); }
  });
  it("allows a member through the database-backed loader", async () => {
    mocks.findUnique.mockResolvedValueOnce({ tenantKind: "CUSTOMER" });
    const d = await authorizeCompanyAccess("acme", { resolvePrincipal: async () => member, env: {} });
    expect(d).toMatchObject({ allowed: true, reason: "PRINCIPAL_MEMBER", principalPresent: true });
    expect(mocks.findUnique).toHaveBeenCalledWith({ where: { id: "acme" }, select: { tenantKind: true } });
  });
});

describe("retrieval and cache isolation", () => {
  it("corpus retrieval for a company is scoped to that company in the query and never mixes the public corpus", async () => {
    mocks.findMany.mockResolvedValueOnce([
      { sourceId: "s-a", companyId: "acme", metadata: null, filingDate: new Date() },
      { sourceId: "s-b", companyId: "other-co", metadata: null, filingDate: new Date() },
    ]);
    const { answerFromCorpus } = await import("../../lib/product/covenant-intelligence/ask-retrieve");
    const out = await answerFromCorpus({ question: "What liens are permitted?", companyId: "acme" });
    const where = mocks.findMany.mock.calls.at(-1)![0].where;
    expect(where.companyId).toBe("acme");
    expect(out.citations.every((c) => c.sourceId !== "s-b")).toBe(true);
  });
  it("no company-scoped product module uses a cross-request cache", () => {
    const roots = ["lib/product", "lib/ask", "lib/dashboard-service.ts", "lib/auth"];
    const files: string[] = [];
    const walk = (p: string) => { const st = statSync(p); if (st.isDirectory()) for (const f of readdirSync(p)) walk(path.join(p, f)); else if (/\.tsx?$/.test(p)) files.push(p); };
    roots.forEach(walk);
    for (const f of files) expect(readFileSync(f, "utf8"), f).not.toMatch(/unstable_cache|revalidateTag\(|from "next\/cache"/);
  });
});

describe("structural coverage of company-scoped entry points", () => {
  const read = (p: string) => readFileSync(p, "utf8");
  it("every exported company-scoped server action authorizes before any work (uploads, mutations, downloads)", () => {
    const actionFiles: string[] = [];
    const walk = (p: string) => { for (const f of readdirSync(p)) { const q = path.join(p, f); if (statSync(q).isDirectory()) walk(q); else if (f === "actions.ts") actionFiles.push(q); } };
    walk("app/[companyId]");
    expect(actionFiles.length).toBeGreaterThanOrEqual(8);
    for (const file of actionFiles) {
      const src = read(file);
      const exported = [...src.matchAll(/export async function (\w+)\(companyId: string[^)]*\)\s*\{\n([^\n]*)\n/g)];
      expect(exported.length, file).toBeGreaterThan(0);
      for (const m of exported) expect(m[2], `${file}:${m[1]}`).toMatch(/await requireCompanyAccess\(companyId\);/);
    }
  });
  it("the company layout, the document source page, the delete action and the Ask API are gated", () => {
    const layout = read("app/[companyId]/layout.tsx");
    expect(layout.indexOf("authorizeCompanyAccess(companyId)")).toBeGreaterThan(0);
    expect(layout.indexOf("authorizeCompanyAccess(companyId)")).toBeLessThan(layout.indexOf("getCompanySummary(companyId)"));
    const page = read("app/[companyId]/documents/[documentId]/page.tsx");
    expect(page.indexOf("authorizeCompanyAccess(companyId)")).toBeGreaterThan(0);
    expect(page.indexOf("authorizeCompanyAccess(companyId)")).toBeLessThan(page.indexOf("prisma.document.findFirst"));
    expect(read("app/companies/[companyId]/delete/actions.ts")).toMatch(/await requireCompanyAccess\(companyId\);/);
    const route = read("app/api/ask/route.ts");
    expect(route).toMatch(/authorizeCompanyAccess\(body\.companyId\)/);
    expect(route.indexOf("authorizeCompanyAccess")).toBeLessThan(route.indexOf("answerAsk({"));
    expect(route).toMatch(/status: 403/);
  });
  it("object-level mutations bind the object to the authorized company", () => {
    expect(read("app/[companyId]/feeds/actions.ts")).not.toMatch(/findUniqueOrThrow\(\{ where: \{ id \} \}\)/);
    expect(read("app/[companyId]/ledger/actions.ts")).toMatch(/findFirstOrThrow\(\{ where: \{ id, companyId \} \}\)/);
    expect(read("app/[companyId]/onboarding/sources/actions.ts")).toMatch(/where: \{ id: sourceConnectionId, companyId \}/);
  });
});
