import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logger, serializeError } from "@/lib/observability/logger";
import { reportError } from "@/lib/observability/reportError";

let stdoutSpy: ReturnType<typeof vi.spyOn>;
let stderrSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(() => {
  stdoutSpy.mockRestore();
  stderrSpy.mockRestore();
  delete process.env.LOG_LEVEL;
});

function lastWritten(spy: ReturnType<typeof vi.spyOn>): unknown {
  const calls = spy.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  return JSON.parse(String(calls[calls.length - 1][0]));
}

describe("logger", () => {
  it("emits info on stdout with the expected envelope", () => {
    logger.info("hello", { route: "/x", userId: "u1" });
    const rec = lastWritten(stdoutSpy) as Record<string, unknown>;
    expect(rec.level).toBe("info");
    expect(rec.msg).toBe("hello");
    expect(rec.route).toBe("/x");
    expect(rec.userId).toBe("u1");
    expect(typeof rec.time).toBe("string");
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it("routes warn/error to stderr", () => {
    logger.warn("yikes");
    logger.error("bad");
    expect(stderrSpy.mock.calls.length).toBe(2);
    expect(stdoutSpy).not.toHaveBeenCalled();
  });

  it("respects LOG_LEVEL=warn by suppressing info/debug", () => {
    process.env.LOG_LEVEL = "warn";
    logger.debug("d");
    logger.info("i");
    logger.warn("w");
    expect(stdoutSpy).not.toHaveBeenCalled();
    expect(stderrSpy.mock.calls.length).toBe(1);
  });
});

describe("serializeError", () => {
  it("captures name, message, stack", () => {
    const e = new Error("boom");
    const s = serializeError(e) as Record<string, unknown>;
    expect(s.name).toBe("Error");
    expect(s.message).toBe("boom");
    expect(typeof s.stack).toBe("string");
  });

  it("walks the cause chain", () => {
    const root = new Error("root");
    const wrapped = new Error("wrap", { cause: root });
    const s = serializeError(wrapped) as Record<string, unknown>;
    const cause = s.cause as Record<string, unknown>;
    expect(cause.message).toBe("root");
  });

  it("falls back gracefully for non-Error values", () => {
    expect(serializeError("nope")).toEqual({ value: "nope" });
    expect(serializeError(42)).toEqual({ value: "42" });
    expect((serializeError({ a: 1 }) as Record<string, unknown>).value).toEqual({ a: 1 });
  });
});

describe("reportError", () => {
  it("emits an error log with serialized error and context", () => {
    reportError(new Error("kaboom"), { where: "test.case", route: "/api/x" });
    const rec = lastWritten(stderrSpy) as Record<string, unknown>;
    expect(rec.level).toBe("error");
    expect(rec.msg).toBe("[error] test.case");
    expect(rec.route).toBe("/api/x");
    const err = rec.err as Record<string, unknown>;
    expect(err.message).toBe("kaboom");
    expect(err.name).toBe("Error");
  });
});
