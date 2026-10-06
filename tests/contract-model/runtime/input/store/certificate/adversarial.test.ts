/**
 * NS-4 slice 2 — adversarial cases required by charter §3.8:
 * missing currency, duplicate identity, competing successors, carried-forward,
 * LLM-extracted without approval, PUBLIC_FILING_RECONSTRUCTION via explicit approve only.
 */
import { describe, expect, it } from "vitest";
import {
  InMemoryApprovedSnapshotStore,
  LedgerProposalRecorder,
  approveCertificateProposal,
  proposeFromCertificate,
} from "@/lib/contract-model/runtime/input/store";
import type { CertificateFactProposal, LedgerProposal, SyntheticCertificate } from "@/lib/contract-model/runtime/input/store/certificate";
import {
  CHEWY_FORM_INSPIRED_CERT,
  INVENTED_TABULAR_CERT,
} from "@/lib/contract-model/runtime/input/store/certificate/fixtures";

const CO = "adversarial-co";
const INST = "adv-instrument";

function baseCert(over: Partial<SyntheticCertificate> & { snapshotId: string; facts: CertificateFactProposal[] }): SyntheticCertificate {
  return {
    documentId: "synth-adv-doc",
    versionHash: "sha256:adv",
    companyId: CO,
    reportingPeriod: "FY2026-Q2",
    asOf: "2026-06-30",
    layoutId: "adversarial",
    proposer: { kind: "human", id: "adv-human" },
    proposalStatus: "DRAFT",
    version: "1",
    supersedesSnapshotId: null,
    basketUsageLines: [],
    ...over,
  };
}

function moneyFact(key: string, amount: string, currency: string | null, periodKey = "FY2026-Q2"): CertificateFactProposal {
  return {
    companyId: CO,
    scope: { kind: "INSTRUMENT_LEVEL", instrumentKey: INST },
    inputKind: "METRIC",
    key,
    identityStrength: "CONTRACT_NAME_ONLY",
    period: { kind: "VERBATIM_CONTRACT_PERIOD_KEY", key: periodKey },
    asOf: { kind: "EXACT_DATE", isoDate: "2026-06-30" },
    valueType: "MONEY",
    currency,
    value: currency
      ? { type: "MONEY", amount, currency }
      : ({ type: "MONEY", amount, currency: "" } as CertificateFactProposal["value"]),
    locator: { page: 1, row: key },
  };
}

describe("adversarial: missing currency → refuse", () => {
  it("refuses MONEY fact with null currency at proposal time (before store write)", () => {
    const store = new InMemoryApprovedSnapshotStore();
    const ledger = new LedgerProposalRecorder();
    const cert = baseCert({
      snapshotId: "adv-no-ccy",
      facts: [moneyFact("EBITDA", "100", null)],
    });
    // Force identity currency null and value without usable currency.
    cert.facts[0]!.currency = null;
    (cert.facts[0]!.value as { type: "MONEY"; amount: string; currency: string }).currency = "";

    const r = proposeFromCertificate(store, cert, ledger);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues.some((i) => i.code === "MONEY_WITHOUT_CURRENCY")).toBe(true);
    }
    expect(store.getSnapshot("adv-no-ccy")).toBeNull();
    expect(store.eventCount()).toBe(0);
    expect(ledger.count()).toBe(0);
  });

  it("refuses MONEY when identity currency is missing even if value has currency text", () => {
    const store = new InMemoryApprovedSnapshotStore();
    const ledger = new LedgerProposalRecorder();
    const fact = moneyFact("EBITDA", "100", "USD");
    fact.currency = null;
    const r = proposeFromCertificate(store, baseCert({ snapshotId: "adv-no-id-ccy", facts: [fact] }), ledger);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.map((i) => i.code)).toContain("MONEY_WITHOUT_CURRENCY");
    expect(store.eventCount()).toBe(0);
  });
});

describe("adversarial: duplicate identity → refuse", () => {
  it("refuses two facts with the same full identity inside one certificate", () => {
    const store = new InMemoryApprovedSnapshotStore();
    const ledger = new LedgerProposalRecorder();
    const a = moneyFact("EBITDA", "100", "USD");
    const b = moneyFact("EBITDA", "200", "USD");
    const r = proposeFromCertificate(store, baseCert({ snapshotId: "adv-dup", facts: [a, b] }), ledger);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.map((i) => i.code)).toContain("DUPLICATE_IDENTITY_IN_CERTIFICATE");
    expect(store.getSnapshot("adv-dup")).toBeNull();
  });
});

describe("adversarial: competing successors → refuse", () => {
  it("second certificate superseding the same predecessor is refused by store graph check", () => {
    const store = new InMemoryApprovedSnapshotStore();
    const ledger = new LedgerProposalRecorder();
    const base = baseCert({
      snapshotId: "adv-pred",
      facts: [moneyFact("EBITDA", "100", "USD")],
    });
    expect(proposeFromCertificate(store, base, ledger).ok).toBe(true);

    const s1 = baseCert({
      snapshotId: "adv-succ-1",
      supersedesSnapshotId: "adv-pred",
      facts: [moneyFact("EBITDA", "110", "USD")],
    });
    expect(proposeFromCertificate(store, s1, ledger).ok).toBe(true);

    const s2 = baseCert({
      snapshotId: "adv-succ-2",
      supersedesSnapshotId: "adv-pred",
      facts: [moneyFact("EBITDA", "120", "USD")],
    });
    const r = proposeFromCertificate(store, s2, ledger);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues.some((i) => i.code === "STORE_WRITE_REJECTED")).toBe(true);
      const storeCodes = r.issues.flatMap((i) => i.storeIssues?.map((s) => s.code) ?? []);
      expect(storeCodes).toContain("COMPETING_SUCCESSORS");
    }
    expect(store.getSnapshot("adv-succ-2")).toBeNull();
  });
});

describe("adversarial: carried-forward value must not silently fill from another period", () => {
  it("Q3 cert without EBITDA does not inherit Q2 EBITDA; missing stays missing", () => {
    const store = new InMemoryApprovedSnapshotStore();
    const ledger = new LedgerProposalRecorder();

    const q2 = baseCert({
      snapshotId: "adv-q2",
      reportingPeriod: "FY2026-Q2",
      asOf: "2026-06-30",
      facts: [moneyFact("EBITDA", "100000000", "USD", "FY2026-Q2")],
    });
    expect(proposeFromCertificate(store, q2, ledger).ok).toBe(true);

    // Q3 certificate deliberately omits EBITDA — pipeline must not carry forward from Q2.
    const q3 = baseCert({
      snapshotId: "adv-q3",
      reportingPeriod: "FY2026-Q3",
      asOf: "2026-09-30",
      facts: [
        {
          ...moneyFact("Cash", "50000000", "USD", "FY2026-Q3"),
          asOf: { kind: "EXACT_DATE", isoDate: "2026-09-30" },
        },
      ],
    });
    expect(proposeFromCertificate(store, q3, ledger).ok).toBe(true);

    const q3Snap = store.getSnapshot("adv-q3")!;
    expect(q3Snap.inputs.map((i) => i.identity.key)).toEqual(["Cash"]);
    expect(q3Snap.inputs.find((i) => i.identity.key === "EBITDA")).toBeUndefined();
    // Q2 fact remains only on Q2 snapshot.
    expect(store.getSnapshot("adv-q2")!.inputs.some((i) => i.identity.key === "EBITDA")).toBe(true);
  });
});

describe("adversarial: LLM-extracted value without approval stays DRAFT/REVIEW_REQUIRED", () => {
  it("extractor Chewy-form cert is REVIEW_REQUIRED and never auto-APPROVED", () => {
    const store = new InMemoryApprovedSnapshotStore();
    const ledger = new LedgerProposalRecorder();
    expect(CHEWY_FORM_INSPIRED_CERT.proposer.kind).toBe("extractor");
    expect(proposeFromCertificate(store, CHEWY_FORM_INSPIRED_CERT, ledger).ok).toBe(true);

    const snap = store.getSnapshot(CHEWY_FORM_INSPIRED_CERT.snapshotId)!;
    expect(snap.status).toBe("REVIEW_REQUIRED");
    expect(snap.review.approvalRef).toBeNull();
    expect(snap.status).not.toBe("APPROVED");

    // No approve call → still REVIEW_REQUIRED after subsequent unrelated proposes.
    const other = baseCert({
      snapshotId: "adv-other-co",
      companyId: "other-co",
      facts: [
        {
          ...moneyFact("X", "1", "USD"),
          companyId: "other-co",
        },
      ],
    });
    expect(proposeFromCertificate(store, other, ledger).ok).toBe(true);
    expect(store.getSnapshot(CHEWY_FORM_INSPIRED_CERT.snapshotId)!.status).toBe("REVIEW_REQUIRED");
  });
});

describe("adversarial: PUBLIC_FILING_RECONSTRUCTION works only via explicit approve", () => {
  it("reconstruction proposal stays REVIEW_REQUIRED until approveCertificateProposal", () => {
    const store = new InMemoryApprovedSnapshotStore();
    const ledger = new LedgerProposalRecorder();
    expect(INVENTED_TABULAR_CERT.proposer.kind).toBe("PUBLIC_FILING_RECONSTRUCTION");

    expect(proposeFromCertificate(store, INVENTED_TABULAR_CERT, ledger).ok).toBe(true);
    expect(store.getSnapshot(INVENTED_TABULAR_CERT.snapshotId)!.status).toBe("REVIEW_REQUIRED");

    // Explicit approve is the only path to APPROVED.
    const approved = approveCertificateProposal(store, {
      snapshotId: INVENTED_TABULAR_CERT.snapshotId,
      reviewedBy: "recon-reviewer",
      reviewedAt: "2026-10-06T21:00:00Z",
      approvalRef: "apr-recon-1",
      sourceDocumentId: INVENTED_TABULAR_CERT.documentId,
      sourceVersionHash: INVENTED_TABULAR_CERT.versionHash,
      proposerKind: "PUBLIC_FILING_RECONSTRUCTION",
    });
    expect(approved.ok).toBe(true);
    const after = store.getSnapshot(INVENTED_TABULAR_CERT.snapshotId)!;
    expect(after.status).toBe("APPROVED");
    expect(after.review.approvalRef).toContain("proposer=PUBLIC_FILING_RECONSTRUCTION");
  });

  it("cannot sneak APPROVED via proposalStatus on a reconstruction cert", () => {
    const store = new InMemoryApprovedSnapshotStore();
    const ledger = new LedgerProposalRecorder();
    const sneaky: SyntheticCertificate = {
      ...INVENTED_TABULAR_CERT,
      snapshotId: "adv-recon-sneak",
      // Cast through unknown to simulate a hostile caller forcing APPROVED.
      proposalStatus: "APPROVED" as unknown as "DRAFT",
    };
    const r = proposeFromCertificate(store, sneaky, ledger);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.map((i) => i.code)).toContain("INVALID_PROPOSAL_STATUS");
    expect(store.getSnapshot("adv-recon-sneak")).toBeNull();
  });
});

describe("adversarial: LEDGER_USAGE must not enter snapshot facts", () => {
  it("refuses a fact with inputKind LEDGER_USAGE", () => {
    const store = new InMemoryApprovedSnapshotStore();
    const ledger = new LedgerProposalRecorder();
    const fact = moneyFact("SomeBasket", "10", "USD");
    fact.inputKind = "LEDGER_USAGE";
    const r = proposeFromCertificate(store, baseCert({ snapshotId: "adv-ledger-fact", facts: [fact] }), ledger);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.map((i) => i.code)).toContain("BASKET_LINE_MUST_NOT_BE_SNAPSHOT_FACT");
  });
});

describe("adversarial: LedgerProposalRecorder append-only public surface", () => {
  const SHRINK_NAMES = ["clear", "reset", "truncate", "empty", "wipe"] as const;

  it("clear/reset/truncate/empty/wipe absent on instance and prototype", () => {
    const recorder = new LedgerProposalRecorder();
    const proto = LedgerProposalRecorder.prototype as Record<string, unknown>;
    const instance = recorder as unknown as Record<string, unknown>;

    for (const name of SHRINK_NAMES) {
      expect(typeof instance[name]).toBe("undefined");
      expect(typeof proto[name]).toBe("undefined");
      expect(Object.prototype.hasOwnProperty.call(proto, name)).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(instance, name)).toBe(false);
      expect(name in recorder).toBe(false);
    }
  });

  it("apply still throws (soft-gate refusal); list returns frozen clones", () => {
    const recorder = new LedgerProposalRecorder();
    const line = {
      basketKey: "General Investments Basket",
      instrumentKey: INST,
      period: { kind: "VERBATIM_CONTRACT_PERIOD_KEY" as const, key: "FY2026-Q2" },
      asOf: { kind: "EXACT_DATE" as const, isoDate: "2026-06-30" },
      amount: "1000",
      currency: "USD",
      direction: "USAGE" as const,
      locator: { page: 1, row: "General Investments" },
    };
    const recorded = recorder.record({
      sourceDocumentId: "synth-adv-doc",
      sourceVersionHash: "sha256:adv",
      companyId: CO,
      line,
      proposer: { kind: "human", id: "adv-human" },
    });

    expect(() => recorder.apply(recorded.proposalId)).toThrow(/never applied/i);

    const listed = recorder.list();
    expect(Object.isFrozen(listed)).toBe(true);
    expect(listed).toHaveLength(1);
    expect(listed[0]).not.toBe(recorded);
    expect(listed[0]!.proposalId).toBe(recorded.proposalId);
    expect(listed[0]!.line).not.toBe(recorded.line);
    expect(listed[0]!.line.basketKey).toBe("General Investments Basket");

    // Mutating the returned list / clone must not shrink or alter the recorder.
    expect(() => {
      (listed as LedgerProposal[]).pop();
    }).toThrow();
    expect(recorder.count()).toBe(1);
    expect(recorder.list()).toHaveLength(1);
  });
});
