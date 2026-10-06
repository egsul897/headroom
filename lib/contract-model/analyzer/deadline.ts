/**
 * One deadline per candidate, propagated as an AbortSignal to every provider request the candidate
 * makes (inventory, semantic compile, every shard, every refinement, verifier, classifier). When it
 * fires, the SDK aborts the HTTP request: nothing keeps running after the caller stops waiting.
 */
export interface Deadline {
  readonly signal: AbortSignal;
  readonly deadlineAt: number;
  timeLeftMs(): number;
  /** Cancel early (e.g. the run is stopping). Idempotent. */
  cancel(reason?: string): void;
  /** Release the timer once the work completed normally. */
  dispose(): void;
}

export class DeadlineExceededError extends Error {
  constructor(readonly deadlineMs: number, readonly stage: string | null) {
    super(`deadline of ${deadlineMs}ms exceeded${stage ? ` during ${stage}` : ""}`);
    this.name = "DeadlineExceededError";
  }
}

export function createDeadline(ms: number, parent?: AbortSignal): Deadline {
  const controller = new AbortController();
  const deadlineAt = Date.now() + ms;
  const timer = setTimeout(() => controller.abort(new DeadlineExceededError(ms, null)), ms);
  const onParent = () => controller.abort(parent?.reason ?? new Error("parent aborted"));
  if (parent) { if (parent.aborted) onParent(); else parent.addEventListener("abort", onParent, { once: true }); }
  return {
    signal: controller.signal,
    deadlineAt,
    timeLeftMs: () => Math.max(0, deadlineAt - Date.now()),
    cancel: (reason) => { if (!controller.signal.aborted) controller.abort(new Error(reason ?? "cancelled")); },
    dispose: () => { clearTimeout(timer); parent?.removeEventListener("abort", onParent); },
  };
}

export function throwIfAborted(signal: AbortSignal | undefined, stage: string): void {
  if (signal?.aborted) {
    const reason = signal.reason;
    if (reason instanceof DeadlineExceededError) throw new DeadlineExceededError(reason.deadlineMs, stage);
    throw reason instanceof Error ? reason : new Error(`aborted before ${stage}`);
  }
}

/** Await a promise but reject as soon as the signal fires (the underlying work must ALSO observe the signal; this only shortens the wait). */
export function raceWithSignal<T>(p: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return p;
  if (signal.aborted) return Promise.reject(signal.reason ?? new Error("aborted"));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason ?? new Error("aborted"));
    signal.addEventListener("abort", onAbort, { once: true });
    p.then((v) => { signal.removeEventListener("abort", onAbort); resolve(v); }, (e) => { signal.removeEventListener("abort", onAbort); reject(e); });
  });
}
