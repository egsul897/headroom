import { describe, expect, it } from "vitest";
import { pgVitestConfigSource, templateDatabaseName, withDatabase, workerDatabaseName, workerDatabaseUrl } from "../../scripts/platform/pg-workers.mjs";

const T = "postgresql://ci:ci@localhost:5432/hr_head";

describe("one Postgres database per vitest worker", () => {
  it("names each worker's clone after the template and the 1-based pool id", () => {
    expect(workerDatabaseName("hr_head", 1)).toBe("hr_head_w1");
    expect(workerDatabaseName("hr_head", "12")).toBe("hr_head_w12");
    for (const bad of [0, -1, 1.5, "x", 999]) expect(() => workerDatabaseName("hr_head", bad)).toThrow();
    for (const bad of ['a"b', "Upper", "drop table", ""]) expect(() => workerDatabaseName(bad, 1)).toThrow();
  });
  it("keeps server, credentials and query, swaps only the database", () => {
    expect(withDatabase(`${T}?sslmode=disable`, "hr_head_w3")).toBe("postgresql://ci:ci@localhost:5432/hr_head_w3?sslmode=disable");
    expect(templateDatabaseName(T)).toBe("hr_head");
  });
  it("is off unless the gate sets the template URL; distinct workers never share a database", () => {
    expect(workerDatabaseUrl({ VITEST_POOL_ID: "1" })).toBeNull();
    const a = workerDatabaseUrl({ HEADROOM_TEST_PG_TEMPLATE_URL: T, VITEST_POOL_ID: "1" });
    const b = workerDatabaseUrl({ HEADROOM_TEST_PG_TEMPLATE_URL: T, VITEST_POOL_ID: "2" });
    expect(a).toBe("postgresql://ci:ci@localhost:5432/hr_head_w1");
    expect(b).toBe("postgresql://ci:ci@localhost:5432/hr_head_w2");
    expect(() => workerDatabaseUrl({ HEADROOM_TEST_PG_TEMPLATE_URL: T })).toThrow(/VITEST_POOL_ID/);
  });
  it("the wrapper config extends the repo config and loads setup from the gate's tool dir", () => {
    const src = pgVitestConfigSource("/runner/temp/gate");
    expect(src).toContain('import base from "../../vitest.config";');
    expect(src).toContain('"/runner/temp/gate/vitest-pg-global-setup.mjs"');
    expect(src).toContain('"/runner/temp/gate/vitest-pg-worker-setup.mjs"');
  });
});
