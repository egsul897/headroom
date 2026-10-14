/**
 * Hard gate: flywheel cron / sweep / ingest modules must stay ZERO-AI.
 * Fails if any banned SDK import, model host fetch target, or AI API key env read appears.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertFlywheelDeterministic,
  FLYWHEEL_BANNED_AI_ENV_VARS,
  FLYWHEEL_BANNED_AI_PACKAGES,
  FLYWHEEL_BANNED_MODEL_HOST_FRAGMENTS,
  FLYWHEEL_PAID_INFERENCE,
} from "@/lib/flywheel/deterministic-guard";

const ROOT = process.cwd();

const SCOPES = [
  "app/api/flywheel",
  "lib/flywheel",
  "lib/covenant-learning-factory/sweep",
  "lib/covenant-learning-factory/learned-rules",
  "lib/neon-https",
  "scripts/flywheel",
  "scripts/covenant-learning-factory/sweep.ts",
];

function listTsFiles(path: string): string[] {
  const abs = join(ROOT, path);
  try {
    const st = statSync(abs);
    if (st.isFile()) return abs.endsWith(".ts") || abs.endsWith(".tsx") ? [abs] : [];
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const name of readdirSync(abs)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    out.push(...listTsFiles(join(path, name)));
  }
  return out;
}

function importLines(src: string): string[] {
  return src
    .split("\n")
    .map((l) => l.trim())
    .filter(
      (l) =>
        /^(import|export)\s/.test(l) ||
        /^const\s+.+=\s+require\(/.test(l) ||
        /await\s+import\(/.test(l) ||
        /\bimport\(/.test(l),
    );
}

describe("flywheel ZERO-AI hard guard", () => {
  it("exports paidInferenceUsed=false and refuses FLYWHEEL_ALLOW_AI", () => {
    expect(FLYWHEEL_PAID_INFERENCE).toBe(false);
    expect(() => assertFlywheelDeterministic({ FLYWHEEL_ALLOW_AI: "1" })).toThrow(/ZERO AI/);
    expect(() => assertFlywheelDeterministic({})).not.toThrow();
  });

  it("scoped source has no AI SDK imports, model hosts, or AI API key reads", () => {
    const files = SCOPES.flatMap(listTsFiles);
    expect(files.length).toBeGreaterThan(10);

    const violations: string[] = [];
    for (const file of files) {
      const rel = relative(ROOT, file).replace(/\\/g, "/");
      if (rel.endsWith("lib/flywheel/deterministic-guard.ts")) continue;

      const src = readFileSync(file, "utf8");
      const imports = importLines(src).join("\n");

      for (const pkg of FLYWHEEL_BANNED_AI_PACKAGES) {
        if (imports.includes(`"${pkg}"`) || imports.includes(`'${pkg}'`)) {
          violations.push(`${rel}: banned package import "${pkg}"`);
        }
      }
      if (/llm-caller|semantic\/caller|RealSemanticCaller|getSemanticCaller|getStageCaller/.test(imports)) {
        violations.push(`${rel}: banned LLM caller import`);
      }
      for (const host of FLYWHEEL_BANNED_MODEL_HOST_FRAGMENTS) {
        if (src.includes(host)) {
          violations.push(`${rel}: banned model host "${host}"`);
        }
      }
      for (const envName of FLYWHEEL_BANNED_AI_ENV_VARS) {
        if (src.includes(`process.env.${envName}`) || new RegExp(`\\benv\\.${envName}\\b`).test(src)) {
          violations.push(`${rel}: reads banned AI env "${envName}"`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
