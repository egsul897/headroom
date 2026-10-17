import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { runInBackground } from "@/lib/platform/background";

describe("runInBackground", () => {
  it("registers the task promise with waitUntil so the platform keeps the instance alive", async () => {
    const registered: Promise<unknown>[] = [];
    let ran = false;
    const p = runInBackground(
      async () => {
        await new Promise((r) => setTimeout(r, 5));
        ran = true;
      },
      { label: "t", waitUntil: (x) => registered.push(x) },
    );
    expect(registered).toHaveLength(1);
    expect(ran).toBe(false);
    await registered[0];
    await p;
    expect(ran).toBe(true);
  });

  it("calls onSuccess after the task resolves", async () => {
    const onSuccess = vi.fn();
    await runInBackground(async () => 1, { label: "t", waitUntil: () => {}, onSuccess });
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("never swallows a failure: onError receives it, the settled promise does not reject", async () => {
    const onError = vi.fn();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      runInBackground(async () => {
        throw new Error("boom");
      }, { label: "t", waitUntil: () => {}, onError }),
    ).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledTimes(1);
    expect((onError.mock.calls[0]![0] as Error).message).toBe("boom");
    spy.mockRestore();
  });

  it("a failing onError hook is logged, not rethrown", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      runInBackground(async () => {
        throw new Error("boom");
      }, { label: "t", waitUntil: () => {}, onError: () => { throw new Error("hook"); } }),
    ).resolves.toBeUndefined();
    spy.mockRestore();
  });

  it("a throwing waitUntil registration does not fail the caller and the task still runs", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    let ran = false;
    await runInBackground(async () => { ran = true; }, { label: "t", waitUntil: () => { throw new Error("no ctx"); } });
    expect(ran).toBe(true);
    spy.mockRestore();
  });
});

describe("upload action regression", () => {
  const src = readFileSync(path.resolve(__dirname, "../../app/[companyId]/onboarding/documents/actions.ts"), "utf8");
  it("deferred large-upload analysis is not a bare floating promise", () => {
    expect(src).not.toMatch(/void\s+reanalyzeCustomerDocumentFromStorage/);
    expect(src).toMatch(/runInBackground\(\(\) => reanalyzeCustomerDocumentFromStorage/);
  });
  it("deferred failure stamps FAILED_RETRYABLE", () => {
    const block = src.slice(src.indexOf("runInBackground("), src.indexOf("[uploadDocumentAction] deferred analysis"));
    expect(block).toMatch(/FAILED_RETRYABLE/);
  });
  it("the onboarding documents segment declares maxDuration for the deferred work", () => {
    const page = readFileSync(path.resolve(__dirname, "../../app/[companyId]/onboarding/documents/page.tsx"), "utf8");
    expect(page).toMatch(/export const maxDuration = \d+/);
  });
});
