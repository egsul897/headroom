/**
 * Neon source-of-record for learned rulesets.
 * Repo learned-rules/vN.json is an optional export only.
 */

import { createHash } from "node:crypto";
import type { NeonHttpsExecutor } from "../covenant-learning-factory/store/neon-transport";
import type { PartialAcceptRecord } from "../covenant-learning-factory/learned-rules/partial";
import {
  AUTHORITY_STATUS,
  LEARNED_RULES_SCHEMA,
  emptyRuleSet,
  type LearnedRuleSet,
} from "../covenant-learning-factory/learned-rules/types";
import { writeLearnedRules } from "../covenant-learning-factory/learned-rules/load";

function id(parts: string[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 24);
}

export async function loadLatestRulesetFromNeon(
  executor: NeonHttpsExecutor,
): Promise<LearnedRuleSet> {
  const rows = await executor.execute(
    `SELECT "payloadJson" FROM learning_rulesets ORDER BY "rulesetVersion" DESC LIMIT 1`,
  );
  const payload = rows[0]?.payloadJson ?? rows[0]?.payloadjson;
  if (!payload) {
    const bootstrap = emptyRuleSet(0);
    await saveRulesetToNeon(executor, bootstrap);
    return bootstrap;
  }
  const raw = (typeof payload === "string" ? JSON.parse(payload) : payload) as LearnedRuleSet;
  if (raw.schemaVersion !== LEARNED_RULES_SCHEMA) {
    throw new Error(`unsupported learned-rules schema in Neon: ${String(raw.schemaVersion)}`);
  }
  if (raw.authorityStatus !== AUTHORITY_STATUS) {
    throw new Error("Neon ruleset must carry COMPUTED_NOT_CERTIFIED");
  }
  return raw;
}

export async function saveRulesetToNeon(
  executor: NeonHttpsExecutor,
  ruleset: LearnedRuleSet,
  opts?: { exportToRepo?: boolean; rulesDir?: string },
): Promise<void> {
  const acceptedCount = ruleset.rules.filter((r) => r.state === "ACCEPTED").length;
  const now = new Date();
  await executor.execute(
    `INSERT INTO learning_rulesets
       (id, "rulesetVersion", "authorityStatus", "schemaVersion", "payloadJson",
        "acceptedCount", "writtenFromEpoch", "createdAt", "updatedAt")
     VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9)
     ON CONFLICT ("rulesetVersion") DO UPDATE SET
       "payloadJson" = EXCLUDED."payloadJson",
       "acceptedCount" = EXCLUDED."acceptedCount",
       "writtenFromEpoch" = EXCLUDED."writtenFromEpoch",
       "updatedAt" = EXCLUDED."updatedAt"`,
    [
      id(["ruleset", String(ruleset.rulesetVersion)]),
      ruleset.rulesetVersion,
      AUTHORITY_STATUS,
      LEARNED_RULES_SCHEMA,
      JSON.stringify(ruleset),
      acceptedCount,
      ruleset.writtenFrom?.epoch ?? null,
      now,
      now,
    ],
  );
  if (opts?.exportToRepo) {
    writeLearnedRules(ruleset, opts.rulesDir);
  }
}

export async function appendPartialAcceptToNeon(
  executor: NeonHttpsExecutor,
  targetVersion: number,
  record: PartialAcceptRecord,
): Promise<void> {
  await executor.execute(
    `INSERT INTO learning_ruleset_partial_accepts
       (id, "targetRulesetVersion", "ruleId", "candidateIndex", epoch, "epochRunId", "payloadJson", "createdAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)
     ON CONFLICT ("targetRulesetVersion", "ruleId") DO UPDATE SET
       "candidateIndex" = EXCLUDED."candidateIndex",
       "payloadJson" = EXCLUDED."payloadJson"`,
    [
      id(["partial", String(targetVersion), record.rule.ruleId]),
      targetVersion,
      record.rule.ruleId,
      record.candidateIndex,
      record.epoch,
      record.epochRunId,
      JSON.stringify(record),
      new Date(record.acceptedAt),
    ],
  );
}

export async function loadPartialAcceptsFromNeon(
  executor: NeonHttpsExecutor,
  targetVersion: number,
): Promise<PartialAcceptRecord[]> {
  const rows = await executor.execute(
    `SELECT "payloadJson" FROM learning_ruleset_partial_accepts
     WHERE "targetRulesetVersion" = $1
     ORDER BY "candidateIndex" ASC`,
    [targetVersion],
  );
  return rows.map((r) => {
    const p = r.payloadJson ?? r.payloadjson;
    return (typeof p === "string" ? JSON.parse(p) : p) as PartialAcceptRecord;
  });
}

export async function clearPartialAcceptsFromNeon(
  executor: NeonHttpsExecutor,
  targetVersion: number,
): Promise<void> {
  await executor.execute(
    `DELETE FROM learning_ruleset_partial_accepts WHERE "targetRulesetVersion" = $1`,
    [targetVersion],
  );
}

/** Rules store adapter injected into clf:sweep for serverless. */
export function createNeonRulesStore(executor: NeonHttpsExecutor, opts?: { exportToRepo?: boolean; rulesDir?: string }) {
  return {
    async loadLatest(): Promise<LearnedRuleSet> {
      return loadLatestRulesetFromNeon(executor);
    },
    async save(ruleset: LearnedRuleSet): Promise<void> {
      await saveRulesetToNeon(executor, ruleset, opts);
    },
    async appendPartial(version: number, record: PartialAcceptRecord): Promise<void> {
      await appendPartialAcceptToNeon(executor, version, record);
    },
    async loadPartials(version: number): Promise<PartialAcceptRecord[]> {
      return loadPartialAcceptsFromNeon(executor, version);
    },
    async clearPartials(version: number): Promise<void> {
      await clearPartialAcceptsFromNeon(executor, version);
    },
  };
}

export type NeonRulesStore = ReturnType<typeof createNeonRulesStore>;
