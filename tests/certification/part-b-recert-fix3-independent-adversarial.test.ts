/**
 * HEADROOM - FINAL 3F.1 CLOSURE, Part B independent recertification of FIX-3
 * (total error classification).
 *
 * INDEPENDENT of the implementer's own adversarial matrix
 * (tests/certification/part-a-final-fix3-error-totality.test.ts /
 * part-a-final-fix3-orchestrator-e2e-observability.test.ts, both read but
 * NOT reused as sole evidence here). Every hostile value below was invented
 * fresh for this audit, deliberately targeting JS semantics distinct from
 * what the implementer's own matrix already covers - see this file's own
 * per-`it` comments for exactly which distinct mechanism each one exercises
 * and why it is not a duplicate of the implementer's coverage.
 *
 * Target: classifyError / safeErrorMessage / safeErrorClass in
 * lib/contract-model/analysis/orchestrator.ts (production code - NOT
 * modified by this audit).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { classifyError, safeErrorClass, safeErrorMessage, runContractAnalysis } from "../../lib/contract-model/analysis/orchestrator";
import { prisma } from "../../lib/prisma";
import { getAnalysisFailureLogsForCompany } from "../../lib/contract-model/analysis/service";

/** Asserts none of the three functions throw for `value`, the return values
 * are well-formed strings, and classifyError is internally consistent with
 * the two standalone helpers - same shape of assertion the implementer's own
 * matrix uses, applied here to a disjoint set of hostile values. */
function assertTotal(label: string, value: unknown): void {
  let message: string | undefined;
  let errorClass: string | undefined;
  expect(() => {
    message = safeErrorMessage(value);
  }, `safeErrorMessage threw for: ${label}`).not.toThrow();
  expect(() => {
    errorClass = safeErrorClass(value);
  }, `safeErrorClass threw for: ${label}`).not.toThrow();

  let classified: { message: string; errorClass: string } | undefined;
  expect(() => {
    classified = classifyError(value);
  }, `classifyError threw for: ${label}`).not.toThrow();

  expect(typeof message, `safeErrorMessage did not return a string for: ${label}`).toBe("string");
  expect(typeof errorClass, `safeErrorClass did not return a string for: ${label}`).toBe("string");
  expect(classified, `classifyError returned no value for: ${label}`).toBeDefined();
  expect(typeof classified!.message).toBe("string");
  expect(typeof classified!.errorClass).toBe("string");
  expect(classified!.message).toBe(message);
  expect(classified!.errorClass).toBe(errorClass);
}

describe("FIX-3 independent Part B recertification: fresh adversarial matrix (disjoint from implementer's own test files)", () => {
  // ------------------------------------------------------------------
  // 1. Symbol.hasInstance interception. `instanceof` semantics: `err
  //    instanceof Error` invokes `Error[Symbol.hasInstance](err)`, NOT any
  //    Symbol.hasInstance on `err` itself - so the only way to attack this
  //    channel is to poison the global `Error` constructor's OWN
  //    Symbol.hasInstance, distinct from the implementer's own found bug
  //    (a Proxy's getPrototypeOf trap, which the code now guards). Scoped
  //    with a try/finally so no other test observes the mutated global.
  // ------------------------------------------------------------------
  describe("Symbol.hasInstance interception on the Error constructor itself", () => {
    /**
     * IMPORTANT METHODOLOGY NOTE (a genuine finding of this audit, not a
     * production defect): globally poisoning `Error[Symbol.hasInstance]`
     * breaks EVERY `x instanceof Error` check in the entire process for as
     * long as it is poisoned - including inside vitest/chai's OWN
     * `.toThrow()` matcher machinery, which itself performs an `instanceof
     * Error` check as part of its internal bookkeeping even when the
     * wrapped function completes normally. Confirmed by direct
     * reproduction: calling `expect(() => safeErrorMessage(value)).not
     * .toThrow()` while the global is poisoned reports a failure carrying
     * the INJECTED message, but a raw `try { safeErrorMessage(value) }
     * catch {}` around the exact same call, with console logging inside a
     * hand-inlined copy of the guard logic, shows the function's own
     * try/catch genuinely caught the poisoned instanceof and returned
     * normally - the second throw was vitest's own matcher, executed AFTER
     * our function had already returned, not a leak from
     * safeErrorMessage/safeErrorClass themselves. Any assertion against
     * this specific hostile value therefore uses a plain try/catch and
     * restores the global BEFORE invoking any assertion-library matcher,
     * never while it is still poisoned.
     */
    it("does not throw when Error[Symbol.hasInstance] is poisoned to throw", () => {
      const original = (Error as unknown as Record<symbol, unknown>)[Symbol.hasInstance];
      const hadOwn = Object.prototype.hasOwnProperty.call(Error, Symbol.hasInstance);
      const results: { label: string; message?: string; errorClass?: string; escaped: unknown }[] = [];
      function captureUnderPoison(label: string, value: unknown) {
        let message: string | undefined;
        let errorClass: string | undefined;
        let escaped: unknown = null;
        try {
          message = safeErrorMessage(value);
          errorClass = safeErrorClass(value);
        } catch (e) {
          escaped = e;
        }
        results.push({ label, message, errorClass, escaped });
      }
      try {
        Object.defineProperty(Error, Symbol.hasInstance, {
          value: function poisonedHasInstance() {
            throw new Error("INJECTED: Error[Symbol.hasInstance] itself throws");
          },
          configurable: true,
        });
        captureUnderPoison("plain object under poisoned Error[Symbol.hasInstance]", { note: "ordinary object" });
        captureUnderPoison("real Error under poisoned Error[Symbol.hasInstance]", new Error("still a real error"));
      } finally {
        if (hadOwn) {
          Object.defineProperty(Error, Symbol.hasInstance, { value: original, configurable: true });
        } else {
          delete (Error as unknown as Record<symbol, unknown>)[Symbol.hasInstance];
        }
      }
      // All assertions happen AFTER the global is restored, using plain
      // captured values only (never an assertion-library matcher invoked
      // while the global was still poisoned).
      for (const r of results) {
        expect(r.escaped, `${r.label}: safeErrorMessage/safeErrorClass leaked an exception past their own guards`).toBeNull();
        expect(typeof r.message, `${r.label}: message not a string`).toBe("string");
        expect(typeof r.errorClass, `${r.label}: errorClass not a string`).toBe("string");
      }
      // Sanity: confirm the global was genuinely restored, not left poisoned
      // for later tests/files in this same process.
      expect(() => ({} instanceof Error)).not.toThrow();
    });
  });

  // ------------------------------------------------------------------
  // 2. Proxy wrapping a REAL Error instance where ONLY the `has` trap (the
  //    `in` operator / `Reflect.has`) throws - every other trap passes
  //    through untouched. Distinct from the implementer's "throws on ANY
  //    get trap" Proxy: this isolates whether any `in` check (or
  //    Reflect.has) is used anywhere in the guarded path.
  // ------------------------------------------------------------------
  it("Proxy over a real Error where only the `has` trap throws", () => {
    const real = new Error("wrapped real error");
    const proxy = new Proxy(real, {
      has() {
        throw new Error("INJECTED: has trap throws");
      },
    });
    assertTotal("proxy-over-real-error, has-trap-only", proxy);
  });

  // ------------------------------------------------------------------
  // 3. Object.prototype.toString.call(err) vs err.toString() divergence -
  //    a custom Symbol.toStringTag with toString() itself throwing. Confirms
  //    the implementation does not silently fall back to the "safer"
  //    Object.prototype.toString.call tag path (which would NOT throw here)
  //    instead of genuinely guarding the toString()/ToPrimitive path it
  //    actually uses.
  // ------------------------------------------------------------------
  it("object with Symbol.toStringTag set but its own toString() throws", () => {
    const value = {
      [Symbol.toStringTag]: "TotallyCustomTag",
      toString() {
        throw new Error("INJECTED: toString throws despite a benign toStringTag");
      },
    };
    // Sanity check the divergence actually exists in this JS engine before
    // trusting the test's premise.
    expect(Object.prototype.toString.call(value)).toBe("[object TotallyCustomTag]");
    expect(() => value.toString()).toThrow();
    assertTotal("toStringTag-divergence, throwing toString", value);
  });

  // ------------------------------------------------------------------
  // 4. Proxy whose getOwnPropertyDescriptor trap throws - relevant only if
  //    any reflection (Object.getOwnPropertyDescriptor / Object.keys /
  //    JSON.stringify, which internally calls [[OwnPropertyKeys]] and
  //    [[GetOwnProperty]]) is used anywhere in the guarded path.
  // ------------------------------------------------------------------
  it("Proxy whose getOwnPropertyDescriptor trap throws (get/getPrototypeOf pass through)", () => {
    const target = { message: "hi", name: "X" };
    const proxy = new Proxy(target, {
      getOwnPropertyDescriptor() {
        throw new Error("INJECTED: getOwnPropertyDescriptor trap throws");
      },
    });
    assertTotal("proxy with throwing getOwnPropertyDescriptor only", proxy);
  });

  // ------------------------------------------------------------------
  // 5. Two-level getter poisoning on the CLASS side: `.constructor` read
  //    succeeds (returns a real function), but `.constructor.name` is
  //    itself a throwing getter defined directly on that constructor
  //    function - confirms safeErrorClass's SECOND access (`ctor.name`,
  //    not just `value.constructor`) is genuinely covered by the same
  //    try/catch, not merely the first.
  // ------------------------------------------------------------------
  it("real Error whose .constructor succeeds but .constructor.name is a throwing getter", () => {
    class NameTrapError extends Error {}
    Object.defineProperty(NameTrapError, "name", {
      get() {
        throw new Error("INJECTED: constructor.name getter throws (two-level poisoning)");
      },
      configurable: true,
    });
    const err = new NameTrapError("message body is fine");
    // Sanity: confirm .constructor itself does NOT throw, only .name does -
    // otherwise this wouldn't actually be testing two-level poisoning.
    expect(() => (err as unknown as { constructor: unknown }).constructor).not.toThrow();
    expect(() => (err.constructor as { name: string }).name).toThrow();
    assertTotal("two-level poisoning: constructor OK, constructor.name throws", err);
    const cls = safeErrorClass(err);
    expect(cls, "must degrade to the safe 'Error' fallback, not crash or silently return garbage").toBe("Error");
  });

  // ------------------------------------------------------------------
  // 6. Thenable / Promise-like object thrown as the error value (unusual
  //    but syntactically valid - `throw` accepts any value, and async code
  //    can genuinely `throw somePromiseLikeThing`). Confirms nothing
  //    accidentally treats it as awaitable/special and nothing about a
  //    `.then` property confuses the guarded path.
  // ------------------------------------------------------------------
  it("thenable/Promise-like object thrown as the error value", () => {
    const thenable = {
      then(resolve: (v: unknown) => void) {
        resolve(undefined);
      },
      state: "pending-ish",
    };
    assertTotal("thenable object", thenable);
    // Also the real, already-resolved Promise case.
    const realPromise = Promise.resolve("resolved value");
    assertTotal("real Promise instance", realPromise);
    void realPromise.catch(() => {}); // avoid an unhandled-rejection false alarm in the runner
  });

  // ------------------------------------------------------------------
  // 7. Callable Proxy (wraps a function target) whose get trap throws for
  //    ANY property - distinct target shape from the implementer's
  //    object-target Proxy: functions have their OWN default toString via
  //    Function.prototype.toString, reached only via a `get` for
  //    `.toString`, which this trap also intercepts.
  // ------------------------------------------------------------------
  it("callable Proxy (function target) with a throwing get trap", () => {
    const proxy = new Proxy(function irrelevant() {}, {
      get() {
        throw new Error("INJECTED: callable proxy get trap throws for ANY property");
      },
    });
    assertTotal("callable proxy, throwing get trap", proxy);
  });

  // ------------------------------------------------------------------
  // 8. Multi-level (3-hop) circular structure combined with a throwing
  //    toString AND a throwing toJSON on every node - confirms (a) no
  //    infinite loop/stack overflow from the cycle itself, and (b) toJSON
  //    genuinely is never invoked anywhere in the guarded path (there is no
  //    JSON.stringify of the raw value in classifyError/safeErrorMessage/
  //    safeErrorClass - if it were, this would surface as a DIFFERENT throw
  //    than the guarded toString path).
  // ------------------------------------------------------------------
  it("3-hop circular structure with throwing toString AND throwing toJSON on every node", () => {
    const a: Record<string, unknown> = {};
    const b: Record<string, unknown> = {};
    const c: Record<string, unknown> = {};
    a.next = b;
    b.next = c;
    c.next = a; // a -> b -> c -> a
    for (const node of [a, b, c]) {
      Object.defineProperty(node, "toString", { value: () => { throw new Error("INJECTED: cyclic node toString throws"); }, configurable: true });
      Object.defineProperty(node, "toJSON", { value: () => { throw new Error("INJECTED: cyclic node toJSON throws (must never be invoked here)"); }, configurable: true });
    }
    assertTotal("3-hop circular, throwing toString+toJSON", a);
  });

  // ------------------------------------------------------------------
  // 9. String() succeeds but returns an absurdly large string (not a
  //    throw) - confirms this is NOT a different failure mode downstream
  //    (no truncation-related throw, no length-limit assertion failure).
  //    Kept well under a size that would meaningfully slow the suite.
  // ------------------------------------------------------------------
  it("crafted toString returns an absurdly large string without throwing", () => {
    const HUGE = 2_000_000; // 2M chars - large enough to exercise the path without bloating CI time
    const value = {
      toString() {
        return "X".repeat(HUGE);
      },
    };
    let message: string | undefined;
    expect(() => { message = safeErrorMessage(value); }).not.toThrow();
    expect(typeof message).toBe("string");
    expect(message!.length).toBe(HUGE);
    const classified = classifyError(value);
    expect(classified.message.length).toBe(HUGE);
    expect(classified.errorClass).toBe("UnknownError");
  });

  // ------------------------------------------------------------------
  // 10. Object.freeze applied to a hostile Proxy (freezing the WRAPPER, a
  //     distinct construction from freezing a plain object as the
  //     implementer's matrix does) - confirms freezing the outer reference
  //     does not change trap behavior or somehow bypass the guards.
  // ------------------------------------------------------------------
  it("Object.freeze(Proxy(...)) where the proxy's own traps still throw", () => {
    const proxy = new Proxy(
      {},
      {
        get() {
          throw new Error("INJECTED: frozen proxy get trap throws");
        },
        getPrototypeOf() {
          throw new Error("INJECTED: frozen proxy getPrototypeOf trap throws");
        },
      },
    );
    const frozen = Object.freeze(proxy);
    assertTotal("Object.freeze(throwing Proxy)", frozen);
  });

  // ------------------------------------------------------------------
  // 11a. Re-attempt of the implementer's own found bug class, ISOLATED to
  //      ONLY the getPrototypeOf trap throwing (get trap passes through
  //      normally) - a different combination than their exact repro, which
  //      threw on BOTH get and getPrototypeOf together. Confirms the fix
  //      generalizes and was not a narrow patch keyed to their one specific
  //      combined-trap repro.
  // ------------------------------------------------------------------
  it("Proxy where ONLY getPrototypeOf throws (get trap passes through normally)", () => {
    const target = { message: "readable message", name: "ReadableName" };
    const proxy = new Proxy(target, {
      getPrototypeOf() {
        throw new Error("INJECTED: getPrototypeOf-only throw");
      },
      // no `get` trap override - Reflect default passthrough
    });
    assertTotal("proxy, getPrototypeOf-only throw, get passes through", proxy);
  });

  // ------------------------------------------------------------------
  // 11b. A REVOKED Proxy (Proxy.revocable, then revoke()) - the JS engine
  //      itself (not user-authored trap code) throws a TypeError on
  //      virtually every operation against a revoked proxy, including the
  //      internal [[GetPrototypeOf]] instanceof relies on and any [[Get]].
  //      This is mechanically distinct from a hand-written throwing trap
  //      and a genuinely different combination than anything in the
  //      implementer's own matrix.
  // ------------------------------------------------------------------
  it("revoked Proxy.revocable() - engine-level throws on every internal operation", () => {
    const { proxy, revoke } = Proxy.revocable({ message: "will never be reached" }, {});
    revoke();
    expect(() => (proxy as object) instanceof Error).toThrow();
    assertTotal("revoked Proxy.revocable()", proxy);
  });

  // ------------------------------------------------------------------
  // 12. Getter chain on the MESSAGE path: `.message` read succeeds (does
  //     not throw) and returns a non-string hostile object whose own
  //     toString/valueOf throw - exercises the nested
  //     `try { return String(msg) } catch {...}` branch specifically,
  //     distinct from a throwing `.message` getter itself (already covered
  //     by the implementer).
  // ------------------------------------------------------------------
  it("real Error whose .message getter succeeds but returns a hostile non-string object", () => {
    const err = new Error("placeholder");
    const hostileMessageValue = {
      toString() {
        throw new Error("INJECTED: non-string .message value's own toString throws");
      },
      valueOf() {
        throw new Error("INJECTED: non-string .message value's own valueOf throws");
      },
    };
    Object.defineProperty(err, "message", {
      get() {
        return hostileMessageValue; // returns successfully - just not a string
      },
      configurable: true,
    });
    assertTotal("Error, .message getter returns hostile non-string object", err);
    expect(safeErrorMessage(err)).toBe("[unreadable thrown value]");
  });

  // ------------------------------------------------------------------
  // 13. Boxed primitive wrapper object (`new Number(...)`) with poisoned
  //     valueOf AND toString - not a Proxy, not an Error, exercises the
  //     plain generic-object String(value) fallback path with the most
  //     "ordinary-looking" possible hostile shape.
  // ------------------------------------------------------------------
  it("boxed Number wrapper with poisoned valueOf and toString", () => {
    const boxed = new Number(42);
    Object.defineProperty(boxed, "valueOf", { value: () => { throw new Error("INJECTED: valueOf throws"); }, configurable: true });
    Object.defineProperty(boxed, "toString", { value: () => { throw new Error("INJECTED: toString throws"); }, configurable: true });
    assertTotal("boxed Number, poisoned valueOf+toString", boxed);
  });

  // ------------------------------------------------------------------
  // 14. Proxy over a real Error instance where ONLY the `constructor`
  //     property access throws (via a selective get trap using Reflect.get
  //     passthrough for everything else) - isolates safeErrorClass's own
  //     failure path from safeErrorMessage's, confirming EACH is
  //     independently resilient rather than one masking the other's true
  //     behavior.
  // ------------------------------------------------------------------
  it("Proxy over a real Error where get throws ONLY for 'constructor', all else passes through", () => {
    const real = new Error("readable via proxy passthrough");
    const proxy = new Proxy(real, {
      get(target, prop, receiver) {
        if (prop === "constructor") throw new Error("INJECTED: selective throw only for .constructor");
        return Reflect.get(target, prop, receiver);
      },
    });
    assertTotal("selective constructor-only throw via proxy", proxy);
    // The message channel must be UNAFFECTED by the constructor-only poison.
    expect(safeErrorMessage(proxy)).toBe("readable via proxy passthrough");
    expect(safeErrorClass(proxy)).toBe("Error"); // degrades safely, does not leak the throw
  });

  // ------------------------------------------------------------------
  // 15. Symbol.toPrimitive that violates its contract by returning a
  //     non-primitive (an object) instead of throwing directly - per spec
  //     this makes the ENGINE itself throw a TypeError ("Cannot convert
  //     object to primitive value") from within ToPrimitive, a mechanically
  //     different failure origin than a Symbol.toPrimitive that explicitly
  //     `throw`s (already in the implementer's matrix).
  // ------------------------------------------------------------------
  it("Symbol.toPrimitive returns a non-primitive (engine-level TypeError, not a user throw)", () => {
    const value = {
      [Symbol.toPrimitive]() {
        return { still: "an object" }; // spec violation - engine throws, not user code
      },
    };
    expect(() => String(value)).toThrow(TypeError);
    assertTotal("Symbol.toPrimitive returns non-primitive (engine TypeError)", value);
  });

  // ------------------------------------------------------------------
  // 16. Sanity/negative control: confirm safeErrorClass genuinely
  //     distinguishes "real Error, name unreadable" (-> "Error") from
  //     "not recognizably an Error at all" (-> "UnknownError") even under
  //     adversarial conditions, using a value that is NOT an Error but
  //     LOOKS like one (duck-typed, e.g. many userland "error-like" values
  //     from third-party libraries that aren't real Error instances).
  // ------------------------------------------------------------------
  it("duck-typed error-like object (message+stack, but NOT instanceof Error) with poisoned toString", () => {
    const duckError = {
      message: "looks like an error",
      stack: "fake stack trace",
      name: "DuckError",
      toString() {
        throw new Error("INJECTED: duck-typed object's toString throws");
      },
    };
    assertTotal("duck-typed error-like, not instanceof Error, poisoned toString", duckError);
    expect(safeErrorClass(duckError)).toBe("UnknownError");
    expect(safeErrorMessage(duckError)).toBe("[unreadable thrown value]");
  });
});

// ========================================================================
// Part 2: end-to-end quadruple-degradation re-proof with FRESH hostile
// values (not the implementer's poisonedNonErrorValue/PoisonedMessageError/
// etc.) - confirms the totality fix generalizes all the way through the
// real runContractAnalysis PRE_RUN_IDENTITY failure path, not merely at the
// classifyError unit level.
// ========================================================================
const COMPANY_ID = "fix3-partb-independent-fresh-e2e-test";
const COMPANY_NAME = "FIX-3 Part B independent fresh e2e test co";

const originalDocumentFindMany = prisma.document.findMany.bind(prisma.document);
const originalAnalysisFailureLogCreate = prisma.analysisFailureLog.create.bind(prisma.analysisFailureLog);

async function ensureCompanyExists() {
  await prisma.company.upsert({
    where: { id: COMPANY_ID },
    create: { id: COMPANY_ID, name: COMPANY_NAME, onboardingStatus: "ONBOARDING" },
    update: {},
  });
}

async function cleanupChildRows() {
  await prisma.analysisFailureLog.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.analysisRun.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.document.deleteMany({ where: { companyId: COMPANY_ID } });
}

afterEach(async () => {
  vi.restoreAllMocks();
  if (typeof prisma.document.findMany !== "function") prisma.document.findMany = originalDocumentFindMany as typeof prisma.document.findMany;
  if (typeof prisma.analysisFailureLog.create !== "function") prisma.analysisFailureLog.create = originalAnalysisFailureLogCreate as typeof prisma.analysisFailureLog.create;
  await cleanupChildRows();
});

describe("FIX-3 Part B independent re-proof: runContractAnalysis under fresh hostile values + all fallback tiers destroyed", () => {
  async function runScenario(label: string, hostileValue: unknown) {
    await ensureCompanyExists();
    await cleanupChildRows();
    vi.spyOn(prisma.document, "findMany").mockImplementationOnce((async () => {
      throw hostileValue;
    }) as unknown as typeof prisma.document.findMany);
    vi.spyOn(prisma.analysisFailureLog, "create").mockRejectedValueOnce(new Error(`INJECTED (independent e2e): durable failure-log write fails (${label})`));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {
      throw new Error(`INJECTED (independent e2e): console.error fallback itself throws (${label})`);
    });

    let thrown: unknown = null;
    let result: Awaited<ReturnType<typeof runContractAnalysis>> | null = null;
    try {
      result = await runContractAnalysis({ companyId: COMPANY_ID, triggeringDocumentId: `doc-${label}` });
    } catch (err) {
      thrown = err;
    }

    expect(thrown, `[independent] runContractAnalysis threw uncaught for: ${label}`).toBeNull();
    expect(result, `[independent] no result returned for: ${label}`).not.toBeNull();
    expect(result!.outcome).toBe("FAILED");
    expect(result!.status).toBeNull();
    expect(result!.fatalError).not.toBeNull();
    expect(typeof result!.fatalError!.message).toBe("string");
    expect(typeof result!.fatalError!.errorClass).toBe("string");
    expect(result!.failureRecordPersisted).toBe(false);
    expect(result!.failureRecordFallbackLogged).toBe(false);
    expect(consoleErrorSpy).toHaveBeenCalled();

    const logs = await getAnalysisFailureLogsForCompany(COMPANY_ID);
    expect(logs.length).toBe(0);
    const runs = await prisma.analysisRun.count({ where: { companyId: COMPANY_ID } });
    expect(runs).toBe(0);
  }

  it("fresh: revoked Proxy.revocable() as the original thrown value", async () => {
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();
    await runScenario("revoked-proxy", proxy);
  });

  it("fresh: two-level constructor.name poisoning Error subclass as the original thrown value", async () => {
    class NameTrapError2 extends Error {}
    Object.defineProperty(NameTrapError2, "name", {
      get() {
        throw new Error("INJECTED: constructor.name throws (e2e)");
      },
      configurable: true,
    });
    await runScenario("nametrap-error-subclass", new NameTrapError2("e2e nametrap"));
  });

  it("fresh: Error[Symbol.hasInstance]-poisoning combined with a duck-typed error-like thrown value", async () => {
    // Same methodology caveat as the unit-level Symbol.hasInstance test
    // above: the global is poisoned only around the awaited
    // runContractAnalysis call itself, restored in `finally` BEFORE any
    // `expect(...)` assertion runs, since vitest's own matchers perform
    // `instanceof Error` checks internally that would otherwise be broken
    // by this same global poisoning (a test-framework artifact, not a
    // production defect - see the unit test's comment for the full
    // reproduction).
    const original = (Error as unknown as Record<symbol, unknown>)[Symbol.hasInstance];
    const hadOwn = Object.prototype.hasOwnProperty.call(Error, Symbol.hasInstance);
    let escaped: unknown = null;
    let result: Awaited<ReturnType<typeof runContractAnalysis>> | null = null;
    await ensureCompanyExists();
    await cleanupChildRows();
    vi.spyOn(prisma.document, "findMany").mockImplementationOnce((async () => {
      throw { message: "duck typed", name: "DuckError" };
    }) as unknown as typeof prisma.document.findMany);
    vi.spyOn(prisma.analysisFailureLog, "create").mockRejectedValueOnce(new Error("INJECTED (independent e2e): durable failure-log write fails (hasinstance-poisoned)"));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {
      throw new Error("INJECTED (independent e2e): console.error fallback itself throws (hasinstance-poisoned)");
    });
    try {
      Object.defineProperty(Error, Symbol.hasInstance, {
        value: () => {
          throw new Error("INJECTED: Error[Symbol.hasInstance] throws (e2e)");
        },
        configurable: true,
      });
      try {
        result = await runContractAnalysis({ companyId: COMPANY_ID, triggeringDocumentId: "doc-hasinstance-poisoned" });
      } catch (err) {
        escaped = err;
      }
    } finally {
      if (hadOwn) {
        Object.defineProperty(Error, Symbol.hasInstance, { value: original, configurable: true });
      } else {
        delete (Error as unknown as Record<symbol, unknown>)[Symbol.hasInstance];
      }
    }
    // All assertions below run only AFTER the global is restored.
    expect(escaped, "runContractAnalysis threw uncaught under a globally-poisoned Error[Symbol.hasInstance]").toBeNull();
    expect(result).not.toBeNull();
    expect(result!.outcome).toBe("FAILED");
    expect(result!.status).toBeNull();
    expect(result!.fatalError).not.toBeNull();
    expect(typeof result!.fatalError!.message).toBe("string");
    expect(typeof result!.fatalError!.errorClass).toBe("string");
    expect(result!.failureRecordPersisted).toBe(false);
    expect(result!.failureRecordFallbackLogged).toBe(false);
    expect(consoleErrorSpy).toHaveBeenCalled();
    const logs = await getAnalysisFailureLogsForCompany(COMPANY_ID);
    expect(logs.length).toBe(0);
    const runs = await prisma.analysisRun.count({ where: { companyId: COMPANY_ID } });
    expect(runs).toBe(0);
  });
});
