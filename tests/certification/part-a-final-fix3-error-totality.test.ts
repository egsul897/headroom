/**
 * HEADROOM - FINAL 3F.1 CLOSURE, Workstream FIX-3.
 *
 * Certifies that `classifyError` (and its two constituent helpers,
 * `safeErrorMessage`/`safeErrorClass`, exported from
 * lib/contract-model/analysis/orchestrator.ts for direct testability) is
 * genuinely total over ALL of `unknown` - the specific defect a prior
 * independent auditor proved in
 * tests/contract-model/part-b-terminal-recert-open6-independent.test.ts
 * (OPEN-6): the previous one-line implementation could itself throw from
 * inside a catch block that had nothing further to fall back to, producing a
 * fully silent, uncaught failure at the exact point meant to be this
 * system's failure-observability floor.
 *
 * This file is a pure unit-level adversarial matrix (no DB, no orchestrator
 * invocation) - the end-to-end failure-observability proof (forcing the
 * original operation, the durable failure-log write, AND the last-resort
 * console.error fallback to all fail simultaneously, with a hostile thrown
 * value) lives in
 * tests/certification/part-a-final-fix3-orchestrator-e2e-observability.test.ts.
 *
 * Required adversarial value matrix (exact list from the governing spec) -
 * every single one below MUST NOT throw when passed to classifyError,
 * safeErrorMessage, or safeErrorClass, and classifyError MUST always return
 * a { message: string; errorClass: string } pair.
 */
import { describe, expect, it } from "vitest";
import { classifyError, safeErrorClass, safeErrorMessage } from "../../lib/contract-model/analysis/orchestrator";

/** Asserts none of the three functions throw for `value`, and that
 * classifyError's return shape is always a well-formed string pair. */
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
  expect(typeof classified!.message, `classifyError.message not a string for: ${label}`).toBe("string");
  expect(typeof classified!.errorClass, `classifyError.errorClass not a string for: ${label}`).toBe("string");
  // classifyError must be internally consistent with the two standalone helpers.
  expect(classified!.message).toBe(message);
  expect(classified!.errorClass).toBe(errorClass);
}

class MyCustomError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "MyCustomError";
  }
}

function objectWithThrowingToString(): unknown {
  return {
    toString() {
      throw new Error("INJECTED: toString throws");
    },
  };
}

function objectWithThrowingSymbolToPrimitive(): unknown {
  return {
    [Symbol.toPrimitive]() {
      throw new Error("INJECTED: Symbol.toPrimitive throws");
    },
    // Also give it a toString/valueOf so a naive fallback that skips
    // Symbol.toPrimitive would otherwise silently "succeed" against the
    // wrong path - a real hostile object could poison all three at once,
    // but here only Symbol.toPrimitive is poisoned to isolate the case.
  };
}

function realErrorWithPoisonedMessageGetter(): unknown {
  const err = new Error("this message is never read");
  Object.defineProperty(err, "message", {
    get() {
      throw new Error("INJECTED: .message getter throws");
    },
    configurable: true,
  });
  return err;
}

function objectWithThrowingConstructorGetter(): unknown {
  const obj: Record<string, unknown> = { note: "otherwise ordinary object" };
  Object.defineProperty(obj, "constructor", {
    get() {
      throw new Error("INJECTED: .constructor getter throws");
    },
    configurable: true,
  });
  return obj;
}

function throwsOnAnyPropertyGetProxy(): unknown {
  return new Proxy(
    {},
    {
      get() {
        throw new Error("INJECTED: Proxy get trap throws for ANY property");
      },
      getPrototypeOf() {
        throw new Error("INJECTED: Proxy getPrototypeOf trap throws too (defeats instanceof)");
      },
    },
  );
}

function circularObject(): unknown {
  const o: Record<string, unknown> = {};
  o.self = o;
  return o;
}

function frozenObject(): unknown {
  return Object.freeze({ a: 1, b: "two" });
}

describe("FIX-3: classifyError / safeErrorMessage / safeErrorClass total-over-unknown certification", () => {
  it("undefined", () => assertTotal("undefined", undefined));
  it("null", () => assertTotal("null", null));
  it("plain string", () => assertTotal("plain string", "just a string, not an Error"));
  it("number", () => assertTotal("number", 42));
  it("bigint", () => assertTotal("bigint", 9007199254740993n));
  it("symbol", () => assertTotal("symbol", Symbol("test symbol")));
  it("ordinary Error", () => assertTotal("ordinary Error", new Error("ordinary error message")));
  it("Error subclass", () => assertTotal("Error subclass (MyCustomError)", new MyCustomError("custom error message")));
  it("object with a toString that throws", () => assertTotal("throwing toString", objectWithThrowingToString()));
  it("object with a Symbol.toPrimitive that throws", () => assertTotal("throwing Symbol.toPrimitive", objectWithThrowingSymbolToPrimitive()));
  it("real Error instance whose .message is a throwing getter", () => assertTotal("poisoned .message getter Error", realErrorWithPoisonedMessageGetter()));
  it("object whose .constructor property is a throwing getter", () => assertTotal("poisoned .constructor getter", objectWithThrowingConstructorGetter()));
  it("Proxy that throws on ANY property get trap access", () => assertTotal("throws-on-any-get Proxy", throwsOnAnyPropertyGetProxy()));
  it("circular object", () => assertTotal("circular object", circularObject()));
  it("frozen object", () => assertTotal("frozen object", frozenObject()));

  it("plain array and empty object (sanity, not in the required list but cheap to cover)", () => {
    assertTotal("plain array", [1, 2, 3]);
    assertTotal("empty object", {});
    assertTotal("function", function namedFn() {});
    assertTotal("class (uncalled constructor)", MyCustomError);
    assertTotal("NaN", NaN);
    assertTotal("negative zero", -0);
    assertTotal("Infinity", Infinity);
  });

  describe("fuzz loop: nested Proxies, throwing valueOf, arrays with throwing elements, other unusual JS values", () => {
    function throwingValueOfObject(seed: number): unknown {
      return {
        valueOf() {
          throw new Error(`INJECTED: valueOf throws (fuzz seed ${seed})`);
        },
      };
    }

    function nestedProxy(depth: number): unknown {
      let target: unknown = { leaf: true };
      for (let i = 0; i < depth; i++) {
        target = new Proxy(target as object, {
          get(t, prop) {
            if (i % 2 === 0) throw new Error(`INJECTED: nested proxy layer ${i} throws on get`);
            return Reflect.get(t, prop);
          },
        });
      }
      return target;
    }

    function arrayWithThrowingElement(seed: number): unknown {
      const arr: unknown[] = [1, 2, 3];
      Object.defineProperty(arr, "2", {
        get() {
          throw new Error(`INJECTED: array element getter throws (fuzz seed ${seed})`);
        },
        configurable: true,
      });
      // toString on an array reads its elements via join(), which reads
      // index getters - this is the realistic path that would surface the
      // poisoned element.
      return arr;
    }

    function errorWithPoisonedToStringAndMessage(seed: number): unknown {
      const err = new Error(`base message ${seed}`);
      Object.defineProperty(err, "message", {
        get() {
          throw new Error(`INJECTED: doubly-poisoned .message (fuzz seed ${seed})`);
        },
        configurable: true,
      });
      err.toString = () => {
        throw new Error(`INJECTED: doubly-poisoned toString (fuzz seed ${seed})`);
      };
      return err;
    }

    function deepFrozenCircularProxy(seed: number): unknown {
      const o: Record<string, unknown> = { seed };
      o.self = o;
      const frozen = Object.freeze(o);
      return new Proxy(frozen, {
        get(t, prop) {
          if (prop === "self") throw new Error(`INJECTED: proxy over frozen circular object throws on 'self' (seed ${seed})`);
          return Reflect.get(t, prop);
        },
      });
    }

    const N = 200;
    it(`zero throws across ${N} fuzz iterations of unusual/hostile values`, () => {
      const generators: ((seed: number) => unknown)[] = [
        throwingValueOfObject,
        nestedProxy,
        arrayWithThrowingElement,
        errorWithPoisonedToStringAndMessage,
        deepFrozenCircularProxy,
        (seed) => seed % 2 === 0 ? null : undefined,
        (seed) => BigInt(seed) * 1000000000000000000n,
        (seed) => Symbol(`fuzz-${seed}`),
        (seed) => new WeakMap().set({}, seed), // WeakMap has no useful toString - exercises default coercion
        (seed) => new Date(seed),
        (seed) => new RegExp(`fuzz-${seed}`, "g"),
        (seed) => [new Error(`nested-${seed}`), throwingValueOfObject(seed)],
      ];

      for (let i = 0; i < N; i++) {
        const gen = generators[i % generators.length]!;
        const value = gen(i);
        assertTotal(`fuzz[${i}] via ${gen.name || "anonymous"}`, value);
      }
    });
  });
});
