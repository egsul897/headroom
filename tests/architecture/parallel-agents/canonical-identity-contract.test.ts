import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MockSecRequestScheduler } from "../../../scripts/parallel-agents/mocks/sec-scheduler-mock";

const REQUIRED_LOGICAL_IDS = [
  "issuer_id",
  "filing_id",
  "source_document_id",
  "instrument_id",
  "document_version_id",
  "structural_provision_id",
  "covenant_candidate_id",
  "definition_id",
  "dependency_edge_id",
  "amendment_event_id",
  "precedent_pattern_id",
  "semantic_representation_id",
  "verification_record_id",
] as const;

describe("canonical identity contract", () => {
  const contract = JSON.parse(
    readFileSync(
      resolve(process.cwd(), "docs/architecture/parallel-agents/04-canonical-identity-contract.json"),
      "utf8",
    ),
  ) as {
    artifact: string;
    identities: Array<{ logicalId: string; mapsTo: unknown[] }>;
    antiPatterns: string[];
  };

  it("covers every required logical identity", () => {
    expect(contract.artifact).toBe("canonical-covenant-knowledge-identity-contract");
    const ids = contract.identities.map((i) => i.logicalId);
    for (const required of REQUIRED_LOGICAL_IDS) {
      expect(ids).toContain(required);
    }
  });

  it("maps core document identities onto existing schema paths", () => {
    const byId = Object.fromEntries(contract.identities.map((i) => [i.logicalId, i]));
    expect(JSON.stringify(byId.source_document_id.mapsTo)).toContain("Document.id");
    expect(JSON.stringify(byId.structural_provision_id.mapsTo)).toContain("DocumentNode");
    expect(JSON.stringify(byId.definition_id.mapsTo)).toContain("DefinedTermNode");
    expect(JSON.stringify(byId.instrument_id.mapsTo)).toContain("DebtInstrument");
  });

  it("lists anti-patterns blocking incompatible replacements", () => {
    expect(contract.antiPatterns.length).toBeGreaterThan(3);
  });
});

describe("dataset delivery + integration queue contracts", () => {
  it("requires ten dataset delivery fields", () => {
    const delivery = JSON.parse(
      readFileSync(
        resolve(process.cwd(), "docs/architecture/parallel-agents/06-dataset-delivery-contract.json"),
        "utf8",
      ),
    ) as { requiredFieldsPerImportableDataset: unknown[] };
    expect(delivery.requiredFieldsPerImportableDataset).toHaveLength(10);
  });

  it("tracks core workstreams in the integration queue", () => {
    const queue = JSON.parse(
      readFileSync(
        resolve(process.cwd(), "docs/architecture/parallel-agents/08-integration-queue.json"),
        "utf8",
      ),
    ) as { items: Array<{ workstreamId: string }> };
    const ids = queue.items.map((i) => i.workstreamId);
    expect(ids).toEqual(
      expect.arrayContaining(["WS-PAR", "WS-CKF", "WS-VIC", "WS-CCA", "WS-GIB", "WS-EHB"]),
    );
  });

  it("publishes a shared corpus manifest covering all 13 identities", () => {
    const manifest = JSON.parse(
      readFileSync(
        resolve(process.cwd(), "docs/architecture/parallel-agents/13-shared-corpus-manifest.json"),
        "utf8",
      ),
    ) as {
      requiredLogicalIdentities: string[];
      requiredDatasetFields: string[];
      secAccessPolicy: { singleSchedulerOwner: string };
    };
    expect(manifest.requiredLogicalIdentities).toHaveLength(13);
    expect(manifest.requiredDatasetFields).toHaveLength(10);
    expect(manifest.secAccessPolicy.singleSchedulerOwner).toBe("WS-CKF");
  });

  it("publishes a daily integration summary with required headline fields", () => {
    const daily = JSON.parse(
      readFileSync(
        resolve(
          process.cwd(),
          "docs/architecture/parallel-agents/daily/2026-10-08-integration-summary.json",
        ),
        "utf8",
      ),
    ) as {
      cloudCostsUsd: number;
      corpusGrowth: unknown;
      verifiedKnowledgeGrowth: { verificationStatusVerifiedCount: number };
      highRiskDefects: unknown[];
      conflicts: unknown[];
      ci: unknown;
    };
    expect(daily.cloudCostsUsd).toBe(0);
    expect(daily.verifiedKnowledgeGrowth.verificationStatusVerifiedCount).toBe(0);
    expect(daily.highRiskDefects.length).toBeGreaterThan(0);
    expect(daily.conflicts.length).toBeGreaterThan(0);
    expect(daily.ci).toBeTruthy();
    expect(daily.corpusGrowth).toBeTruthy();
  });
});

describe("MockSecRequestScheduler", () => {
  it("serves deterministic fixture responses without network I/O", async () => {
    const sched = new MockSecRequestScheduler();
    const result = await sched.fetch({
      kind: "SUBMISSIONS",
      url: "https://data.sec.gov/submissions/CIK0000000000.json",
      workstreamId: "WS-EHB",
      priority: "backfill",
      dedupeKey: "submissions:0000000000",
    });
    expect(result.status).toBe(200);
    expect(result.fromCache).toBe(false);
    expect(JSON.parse(result.body.toString("utf8")).mock).toBe(true);
  });

  it("dedupes identical pending requests and eventually exhausts budget", async () => {
    const sched = new MockSecRequestScheduler();
    const a = await sched.enqueue({
      kind: "TICKERS",
      url: "https://www.sec.gov/files/company_tickers.json",
      workstreamId: "WS-CKF",
      priority: "interactive",
      dedupeKey: "tickers",
    });
    const b = await sched.enqueue({
      kind: "TICKERS",
      url: "https://www.sec.gov/files/company_tickers.json",
      workstreamId: "WS-CKF",
      priority: "interactive",
      dedupeKey: "tickers",
    });
    expect(a.requestId).toBe(b.requestId);

    for (let i = 0; i < 20; i += 1) {
      try {
        await sched.enqueue({
          kind: "OTHER_SEC_JSON",
          url: `https://example.invalid/${i}`,
          workstreamId: "WS-EHB",
          priority: "backfill",
          dedupeKey: `x-${i}`,
        });
      } catch (err) {
        expect(String(err)).toMatch(/budget exhausted/);
        return;
      }
    }
    throw new Error("expected budget exhaustion");
  });
});
