/**
 * Load / persist versioned learned-rules JSON under the repo + optional Neon.
 */

import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  AUTHORITY_STATUS,
  LEARNED_RULES_SCHEMA,
  emptyRuleSet,
  normalizeLearnedRuleSet,
  type LearnedRuleSet,
} from "./types";

export const DEFAULT_LEARNED_RULES_DIR = join(process.cwd(), "learned-rules");

export function learnedRulesPath(version: number, dir = DEFAULT_LEARNED_RULES_DIR): string {
  return join(dir, `v${version}.json`);
}

export function listLearnedRuleVersions(dir = DEFAULT_LEARNED_RULES_DIR): number[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .map((name) => {
      const m = /^v(\d+)\.json$/.exec(name);
      return m ? Number(m[1]) : null;
    })
    .filter((n): n is number => n != null && Number.isFinite(n))
    .sort((a, b) => a - b);
}

export function loadLatestLearnedRules(dir = DEFAULT_LEARNED_RULES_DIR): LearnedRuleSet {
  const versions = listLearnedRuleVersions(dir);
  if (versions.length === 0) {
    const bootstrap = emptyRuleSet(0);
    writeLearnedRules(bootstrap, dir);
    return bootstrap;
  }
  return loadLearnedRules(versions[versions.length - 1]!, dir);
}

export function loadLearnedRules(version: number, dir = DEFAULT_LEARNED_RULES_DIR): LearnedRuleSet {
  const path = learnedRulesPath(version, dir);
  const raw = JSON.parse(readFileSync(path, "utf8")) as LearnedRuleSet;
  if (raw.schemaVersion !== LEARNED_RULES_SCHEMA) {
    throw new Error(`unsupported learned-rules schema: ${String(raw.schemaVersion)}`);
  }
  if (raw.authorityStatus !== AUTHORITY_STATUS) {
    throw new Error("learned-rules must carry COMPUTED_NOT_CERTIFIED");
  }
  return normalizeLearnedRuleSet(raw);
}

export function writeLearnedRules(ruleset: LearnedRuleSet, dir = DEFAULT_LEARNED_RULES_DIR): string {
  mkdirSync(dir, { recursive: true });
  const path = learnedRulesPath(ruleset.rulesetVersion, dir);
  const payload: LearnedRuleSet = {
    ...ruleset,
    schemaVersion: LEARNED_RULES_SCHEMA,
    authorityStatus: AUTHORITY_STATUS,
    updatedAt: ruleset.updatedAt || new Date().toISOString(),
  };
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return path;
}

/** Merge newly mechanically-replayed rules into a next versioned file. */
export function bumpRuleSet(args: {
  previous: LearnedRuleSet;
  /** Rules that passed the mechanical replay gate (→ MECHANICALLY_REPLAYED). */
  accepted: LearnedRuleSet["rules"];
  rejectedIds: string[];
  epoch: number;
}): LearnedRuleSet {
  const nextVersion = args.previous.rulesetVersion + 1;
  const retained = args.previous.rules
    .filter((r) => {
      const s = r.state;
      return (
        (s === "MECHANICALLY_REPLAYED" ||
          s === "INDEPENDENTLY_VERIFIED" ||
          s === "ACCEPTED") &&
        !args.rejectedIds.includes(r.ruleId)
      );
    })
    .map((r) => ({ ...r, version: r.version }));
  const mechanicallyReplayed = args.accepted.map((r) => ({
    ...r,
    state: "MECHANICALLY_REPLAYED" as const,
    version: nextVersion,
    metrics: {
      errorsBefore: r.metrics?.errorsBefore ?? 0,
      errorsAfter: r.metrics?.errorsAfter ?? 0,
      sourcesReplayed: r.metrics?.sourcesReplayed ?? 0,
      goldenOk: r.metrics?.goldenOk ?? false,
      adjudicationClass: "MECHANICAL_REPLAY" as const,
    },
  }));
  const rejected = args.previous.rules
    .filter((r) => args.rejectedIds.includes(r.ruleId))
    .map((r) => ({ ...r, state: "REJECTED" as const }));
  // Keep rejected history for audit but mark superseded duplicates
  const byId = new Map<string, LearnedRuleSet["rules"][number]>();
  for (const r of [...retained, ...rejected, ...mechanicallyReplayed]) byId.set(r.ruleId, r);
  return {
    schemaVersion: LEARNED_RULES_SCHEMA,
    rulesetVersion: nextVersion,
    authorityStatus: AUTHORITY_STATUS,
    rules: [...byId.values()].sort((a, b) => a.ruleId.localeCompare(b.ruleId)),
    updatedAt: new Date().toISOString(),
    writtenFrom: {
      epoch: args.epoch,
      mechanicallyReplayedRuleIds: mechanicallyReplayed.map((r) => r.ruleId),
      acceptedRuleIds: mechanicallyReplayed.map((r) => r.ruleId),
      rejectedRuleIds: args.rejectedIds,
    },
  };
}
