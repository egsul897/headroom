/**
 * Saved-scenario writes. The per-workspace cap is enforced ATOMICALLY: the count and the insert
 * run in one transaction holding a per-workspace advisory lock, so N concurrent saves at 99
 * cannot all pass the check (count-then-create without the lock lets them).
 */
import type { ScenarioBasis } from "./basis";
import { LIMITS, type ScenarioLine } from "./validate";

export type SavedScenarioRow = { id: string; name: string; savedAt: Date; lines: unknown } & ScenarioBasis;

export interface ScenarioTx {
  lockWorkspace(companyId: string): Promise<void>;
  count(companyId: string): Promise<number>;
  create(data: { companyId: string; createdBy: string; name: string; lines: ScenarioLine[] } & ScenarioBasis): Promise<SavedScenarioRow>;
}

export interface ScenarioStore {
  transaction<T>(fn: (tx: ScenarioTx) => Promise<T>): Promise<T>;
}

export type CreateResult = { ok: true; row: SavedScenarioRow } | { ok: false; error: "LIMIT_REACHED" };

export async function createScenarioWithinCap(
  store: ScenarioStore,
  input: { companyId: string; createdBy: string; name: string; lines: ScenarioLine[]; basis: ScenarioBasis },
  cap: number = LIMITS.perWorkspace,
): Promise<CreateResult> {
  return store.transaction(async (tx) => {
    await tx.lockWorkspace(input.companyId);
    if ((await tx.count(input.companyId)) >= cap) return { ok: false, error: "LIMIT_REACHED" } as const;
    const row = await tx.create({ companyId: input.companyId, createdBy: input.createdBy, name: input.name, lines: input.lines, ...input.basis });
    return { ok: true, row } as const;
  });
}

type PrismaLike = {
  $transaction<T>(fn: (tx: PrismaTxLike) => Promise<T>, opts?: { timeout?: number }): Promise<T>;
};
type PrismaTxLike = {
  $executeRaw(strings: TemplateStringsArray, ...values: unknown[]): Promise<number>;
  savedScenario: {
    count(args: { where: { companyId: string } }): Promise<number>;
    create(args: { data: Record<string, unknown> }): Promise<SavedScenarioRow>;
  };
};

export function createPrismaScenarioStore(db: PrismaLike): ScenarioStore {
  return {
    transaction: (fn) =>
      db.$transaction(
        (tx) =>
          fn({
            async lockWorkspace(companyId) {
              await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"saved-scenarios:" + companyId}, 0))`;
            },
            count: (companyId) => tx.savedScenario.count({ where: { companyId } }),
            create: (data) => tx.savedScenario.create({ data: { ...data, lines: data.lines as unknown as object } }),
          }),
        { timeout: 15000 },
      ),
  };
}
