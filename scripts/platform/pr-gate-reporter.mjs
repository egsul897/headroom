/**
 * Vitest reporter for the PR gate.
 *
 * Vitest's JSON reporter drops many beforeAll/afterAll errors, so a suite
 * that never starts its tests looks like a skip. This reporter keeps those
 * hook errors next to the per-test results. The workflow points
 * PR_GATE_REPORT at the file to write.
 */
import fs from "node:fs";

function ancestorNames(task) {
  const names = [];
  let cur = task?.suite;
  while (cur) {
    if (cur.name) names.push(cur.name);
    cur = cur.suite;
  }
  names.reverse();
  return names;
}

function errorText(error) {
  if (!error) return "";
  if (typeof error === "string") return error;
  const message = error.message || error.stack || "";
  const stack = error.stack || "";
  if (stack && !String(message).includes(stack)) return String(message) + "\n" + stack;
  return String(message || stack);
}

function statusOf(task) {
  const state = task?.result?.state || task?.mode;
  if (state === "fail") return "failed";
  if (state === "pass") return "passed";
  if (state === "skip") return "skipped";
  if (state === "todo") return "todo";
  if (state === "only" || state === "run") return "pending";
  return "skipped";
}

export function collectReport(files) {
  const testResults = [];
  for (const file of files || []) {
    const assertionResults = [];
    const suiteMessages = [];
    const stack = [file];
    while (stack.length) {
      const task = stack.pop();
      for (const child of task.tasks || []) stack.push(child);
      const errors = task.result?.errors || [];
      const text = errors.map(errorText).filter(Boolean).join("\n");
      if (task.type === "test") {
        const names = ancestorNames(task);
        if (task.name) names.push(task.name);
        assertionResults.push({
          ancestorTitles: names.slice(0, -1),
          fullName: names.join(" "),
          title: task.name,
          status: statusOf(task),
          failureMessages: text ? [text] : [],
        });
      } else if (task.result?.state === "fail" && text) {
        suiteMessages.push(text);
      }
    }
    const failedAssertion = assertionResults.some((test) => test.status === "failed");
    testResults.push({
      name: file.filepath || file.name,
      status: file.result?.state === "fail" || failedAssertion ? "failed" : "passed",
      message: suiteMessages.join("\n\n"),
      assertionResults,
    });
  }
  return { testResults };
}

export default class PrGateReporter {
  onInit(ctx) {
    this.ctx = ctx;
  }

  onFinished(files = []) {
    const dest = process.env.PR_GATE_REPORT;
    if (!dest) throw new Error("PR_GATE_REPORT is not set");
    const report = collectReport(files?.length ? files : this.ctx?.state?.getFiles?.() || []);
    fs.writeFileSync(dest, JSON.stringify(report));
  }
}
