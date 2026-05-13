import { describe, expect, it } from "vitest";
import { validateEnvObject } from "@/lib/env";

const PROD_BASE: NodeJS.ProcessEnv = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  AUTH_SECRET: "x".repeat(32),
  MOBILE_TOKEN_SECRET: "y".repeat(32),
  NEXT_PUBLIC_APP_URL: "https://example.com",
  ADMIN_PHONES: "+15555551212",
  CRON_SECRET: "cron-secret",
  RESEND_API_KEY: "re_xxx",
  EMAIL_FROM: "Studio <bookings@example.com>",
  TWILIO_ACCOUNT_SID: "AC_xxx",
  TWILIO_AUTH_TOKEN: "tok_xxx",
  TWILIO_VERIFY_SERVICE_SID: "VA_xxx",
  TWILIO_MESSAGING_SERVICE_SID: "MG_xxx",
};

describe("validateEnvObject", () => {
  it("accepts a fully populated production env", () => {
    const r = validateEnvObject(PROD_BASE);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.env.NODE_ENV).toBe("production");
      expect(r.env.ADMIN_PHONES).toEqual(["+15555551212"]);
      expect(r.warnings).toEqual([]);
    }
  });

  it("accepts NEXTAUTH_SECRET as the Auth.js secret", () => {
    const r = validateEnvObject({
      ...PROD_BASE,
      AUTH_SECRET: undefined,
      NEXTAUTH_SECRET: "z".repeat(32),
    });
    expect(r.ok).toBe(true);
  });

  it("accepts TWILIO_FROM_NUMBER as a substitute for the messaging service", () => {
    const r = validateEnvObject({
      ...PROD_BASE,
      TWILIO_MESSAGING_SERVICE_SID: undefined,
      TWILIO_FROM_NUMBER: "+15555550100",
    });
    expect(r.ok).toBe(true);
  });

  it("rejects production env missing many required vars and lists all of them", () => {
    const r = validateEnvObject({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://u:p@localhost/db",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      // Spot-check that we collected several problems, not just the first one.
      const joined = r.errors.join("\n");
      expect(joined).toMatch(/AUTH_SECRET/);
      expect(joined).toMatch(/MOBILE_TOKEN_SECRET/);
      expect(joined).toMatch(/NEXT_PUBLIC_APP_URL/);
      expect(joined).toMatch(/ADMIN_PHONES/);
      expect(joined).toMatch(/CRON_SECRET/);
      expect(joined).toMatch(/RESEND_API_KEY/);
      expect(joined).toMatch(/TWILIO_ACCOUNT_SID/);
      expect(joined).toMatch(/TWILIO_VERIFY_SERVICE_SID/);
      expect(joined).toMatch(/Messaging Service|FROM_NUMBER/);
    }
  });

  it("rejects when DATABASE_URL is missing entirely", () => {
    const r = validateEnvObject({ NODE_ENV: "development" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join("\n")).toMatch(/DATABASE_URL/);
  });

  it("rejects malformed ADMIN_PHONES", () => {
    const r = validateEnvObject({
      ...PROD_BASE,
      ADMIN_PHONES: "not-a-phone, also-bad",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join("\n")).toMatch(/E\.164/);
  });

  it("rejects malformed NEXT_PUBLIC_APP_URL", () => {
    const r = validateEnvObject({
      ...PROD_BASE,
      NEXT_PUBLIC_APP_URL: "notaurl",
    });
    expect(r.ok).toBe(false);
  });

  it("treats dev as lenient: missing integration creds become warnings, not errors", () => {
    const r = validateEnvObject({
      NODE_ENV: "development",
      DATABASE_URL: "postgresql://u:p@localhost/db",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.warnings.length).toBeGreaterThan(0);
      expect(r.warnings.join("\n")).toMatch(/RESEND_API_KEY/);
    }
  });

  it("treats test as silent: no warnings for missing integration creds", () => {
    const r = validateEnvObject({
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://u:p@localhost/db",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings).toEqual([]);
  });
});
