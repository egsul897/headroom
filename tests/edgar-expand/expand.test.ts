import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SecAccessCoordinator } from "../../lib/edgar-historical-backfill/sec-access";
import type { ExhibitRef, IssuerRef } from "../../lib/edgar-historical-backfill/types";
import { isReservedBlindIssuer } from "../../lib/edgar-expand/blind";
import { runEdgarExpand } from "../../lib/edgar-expand/run";
import { buildExpandTargets } from "../../lib/edgar-expand/targets";

const TEST_UA = "VitestEdgarExpand/1.0 (contact: vitest-edgar-expand@headroom.dev; research)";
const dirs: string[] = [];

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function exhibit(partial: Partial<ExhibitRef> & Pick<ExhibitRef, "accessionNumber" | "filename" | "documentKind">): ExhibitRef {
  return {
    cik: "0000000001",
    filingDate: "2020-06-01",
    form: "8-K",
    exhibitType: "EX-10.1",
    description: "Credit Agreement",
    relevanceScore: 10,
    isIncorporatedByReference: false,
    agreementIdentityKey: `${partial.accessionNumber}:${partial.filename}`,
    discoveryStatus: "DISCOVERED",
    sourceUri: `https://www.sec.gov/Archives/edgar/data/1/${partial.accessionNumber.replace(/-/g, "")}/${partial.filename}`,
    ...partial,
  };
}

describe("edgar expand targets", () => {
  it("fetches beyond the ranked queue and leaves unresolved rows without a URL", () => {
    const issuers: IssuerRef[] = [
      { cik: "0000000001", ticker: "ACME", title: "Acme Inc" },
      { cik: "0001955520", ticker: "KNF", title: "Knife River Corporation" },
    ];
    const targets = buildExpandTargets({
      universe: "pilot-100",
      issuers,
      exhibits: [
        exhibit({ accessionNumber: "0000000001-20-000001", filename: "low.htm", relevanceScore: 10, documentKind: "CREDIT_AGREEMENT" }),
        exhibit({
          accessionNumber: "0000000001-20-000002",
          filename: "ibr.htm",
          documentKind: "INDENTURE",
          isIncorporatedByReference: true,
          sourceUri: undefined,
          ibr: { rawText: "incorporated by reference", resolutionStatus: "UNRESOLVED" },
        }),
        exhibit({
          cik: "0001955520",
          accessionNumber: "0001955520-24-000010",
          filename: "knf.htm",
          documentKind: "CREDIT_AGREEMENT",
          description: "Knife River credit agreement",
        }),
        exhibit({ accessionNumber: "0000000001-20-000003", filename: "unk.htm", documentKind: "UNKNOWN" }),
      ],
    });
    expect(targets.find((t) => t.filename === "low.htm")?.disposition).toBe("FETCH");
    expect(targets.find((t) => t.filename === "ibr.htm")).toMatchObject({
      disposition: "UNRESOLVED",
      reason: "IBR_UNRESOLVED",
      url: null,
    });
    expect(targets.find((t) => t.filename === "knf.htm")).toMatchObject({
      disposition: "EXCLUDED_BLIND",
      reason: "KNIFE_RIVER_RESERVED_BLIND",
    });
    expect(targets.find((t) => t.filename === "unk.htm")).toBeUndefined();
  });

  it("sp1500 keeps EX-4/EX-10 credit agreements and indentures only", () => {
    const targets = buildExpandTargets({
      universe: "sp1500",
      issuers: [{ cik: "0000000004", ticker: "ZZ", title: "Zed" }],
      exhibits: [
        exhibit({
          cik: "0000000004",
          accessionNumber: "0000000004-21-000001",
          filename: "indenture.htm",
          exhibitType: "EX-4.1",
          documentKind: "INDENTURE",
          description: "Indenture",
        }),
        exhibit({
          cik: "0000000004",
          accessionNumber: "0000000004-21-000002",
          filename: "bylaws.htm",
          exhibitType: "EX-3.1",
          documentKind: "CREDIT_AGREEMENT",
        }),
        exhibit({
          cik: "0000000004",
          accessionNumber: "0000000004-21-000003",
          filename: "waiver.htm",
          exhibitType: "EX-10.2",
          documentKind: "WAIVER",
        }),
      ],
    });
    expect(targets.map((t) => t.filename)).toEqual(["indenture.htm"]);
  });

  it("recognizes the reserved blind issuer", () => {
    expect(isReservedBlindIssuer({ cik: "1955520", ticker: "KNF", title: "Knife River Corporation" })).toBe(true);
    expect(isReservedBlindIssuer({ ticker: "ACME", title: "Acme" })).toBe(false);
  });
});

describe("edgar expand fetch", () => {
  it("writes real bytes, logs UNRESOLVED, skips Knife River, and resumes", async () => {
    const repo = mkdtempSync(path.join(tmpdir(), "edgar-exp-"));
    dirs.push(repo);
    const outDir = path.join(repo, ".local-knowledge-corpus/edgar-expand");
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      calls.push(String(url));
      if (String(url).includes("missing")) return new Response("nope", { status: 404 });
      if (String(url).includes("1955520")) return new Response("SHOULD-NOT-FETCH", { status: 200 });
      return new Response("<html>authentic exhibit</html>", { status: 200 });
    }) as unknown as typeof fetch;
    const sec = new SecAccessCoordinator({
      userAgent: TEST_UA,
      fetchImpl,
      cacheDir: null,
      maxRequestsPerSecond: 100,
      bypassFleetPolicyForTests: true,
      sleep: async () => {},
    });
    const issuers: IssuerRef[] = [
      { cik: "0000000009", ticker: "OK", title: "Ok Corp" },
      { cik: "0001955520", ticker: "KNF", title: "Knife River Corporation" },
    ];
    const exhibits: ExhibitRef[] = [
      exhibit({
        cik: "0000000009",
        accessionNumber: "0000000009-22-000001",
        filename: "ca.htm",
        documentKind: "CREDIT_AGREEMENT",
        sourceUri: "https://www.sec.gov/Archives/edgar/data/9/000000000922000001/ca.htm",
      }),
      exhibit({
        cik: "0000000009",
        accessionNumber: "0000000009-22-000002",
        filename: "missing.htm",
        documentKind: "INDENTURE",
        description: "Indenture",
        sourceUri: "https://www.sec.gov/Archives/edgar/data/9/000000000922000002/missing.htm",
      }),
      exhibit({
        cik: "0001955520",
        accessionNumber: "0001955520-22-000003",
        filename: "blind.htm",
        documentKind: "CREDIT_AGREEMENT",
        sourceUri: "https://www.sec.gov/Archives/edgar/data/1955520/000195552022000003/blind.htm",
      }),
    ];

    const first = await runEdgarExpand({
      repoRoot: repo,
      outDir,
      universe: "pilot-100",
      sec,
      loadExhibits: async () => ({ exhibits, issuers }),
    });
    expect(first.fetched).toBe(1);
    expect(first.excludedBlind).toBe(1);
    expect(first.countsByReason.HTTP_404).toBe(1);
    expect(calls.some((u) => u.includes("1955520"))).toBe(false);
    const manifest = readFileSync(path.join(outDir, "manifest.jsonl"), "utf8").trim().split("\n");
    expect(manifest).toHaveLength(1);
    const row = JSON.parse(manifest[0]!) as { sha256: string; localPath: string; byteSize: number };
    const abs = path.join(repo, row.localPath);
    expect(existsSync(abs)).toBe(true);
    const bytes = readFileSync(abs);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(row.sha256);
    expect(bytes.toString()).toContain("authentic exhibit");
    const unresolved = readFileSync(path.join(outDir, "unresolved.jsonl"), "utf8");
    expect(unresolved).toContain("UNRESOLVED");
    expect(unresolved).toContain("HTTP_404");
    expect(unresolved).toContain("KNIFE_RIVER_RESERVED_BLIND");
    expect(readdirSync(path.join(outDir, "bytes")).join(" ")).not.toContain("1955520");

    const callsAfter = calls.length;
    const second = await runEdgarExpand({
      repoRoot: repo,
      outDir,
      universe: "pilot-100",
      resume: true,
      sec,
      loadExhibits: async () => ({ exhibits, issuers }),
    });
    expect(second.resumedSkipped).toBe(first.distinctTargets);
    expect(calls.length).toBe(callsAfter);
    expect(second.fetched).toBe(1);
  });

  it("refuses a request rate above the SEC ceiling", async () => {
    await expect(runEdgarExpand({ maxRequestsPerSecond: 11, loadExhibits: async () => ({ exhibits: [], issuers: [] }) })).rejects.toThrow(
      /10/,
    );
  });
});
