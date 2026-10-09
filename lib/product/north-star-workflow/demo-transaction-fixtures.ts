/**
 * SYNTHETIC demo transaction scenarios for Intelligence / regression tests.
 * Not customer financial facts. Not certified Phase 4E paths.
 */
export type DemoTransactionKind =
  | "SECURED_DEBT"
  | "RESTRICTED_PAYMENT"
  | "ACQUISITION"
  | "INVESTMENT";

export interface DemoTransactionFixture {
  fixtureId: string;
  label: string;
  amountMillions: number;
  kind: DemoTransactionKind;
  secured: boolean;
  ask: string;
  /** Authority reminder — never present these as certified 4E. */
  authorityNote: string;
}

/** Default dashboard demo set — moved out of debt-intelligence customer path. */
export const DEMO_TRANSACTION_FIXTURES: readonly DemoTransactionFixture[] = [
  {
    fixtureId: "demo.secured.100",
    label: "$100M secured debt incurrence",
    amountMillions: 100,
    kind: "SECURED_DEBT",
    secured: true,
    ask: "Can we incur $100 million of additional secured debt on 2026-08-01?",
    authorityNote: "SYNTHETIC demo · LEGACY_ENGINE_MULTIPATH · NOT_CERTIFIED_4E until VerifiedExecutionPackage exists",
  },
  {
    fixtureId: "demo.rp.75",
    label: "$75M restricted payment",
    amountMillions: 75,
    kind: "RESTRICTED_PAYMENT",
    secured: false,
    ask: "Can we make a $75 million restricted payment on 2026-08-01?",
    authorityNote: "SYNTHETIC demo · LEGACY_ENGINE_MULTIPATH · NOT_CERTIFIED_4E until VerifiedExecutionPackage exists",
  },
  {
    fixtureId: "demo.acquisition.150",
    label: "$150M acquisition (debt + investment + lien)",
    amountMillions: 150,
    kind: "ACQUISITION",
    secured: true,
    ask: "Can we finance a $150 million acquisition on 2026-08-01?",
    authorityNote: "SYNTHETIC demo · LEGACY_ENGINE_MULTIPATH · NOT_CERTIFIED_4E until VerifiedExecutionPackage exists",
  },
] as const;

export function listDemoTransactionFixtures(): DemoTransactionFixture[] {
  return DEMO_TRANSACTION_FIXTURES.map((f) => ({ ...f }));
}
