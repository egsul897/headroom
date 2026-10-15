import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { canAccessTenant, tenantGate, type SessionUser } from "@/lib/auth/tenant";
import { validateProvisionInput } from "@/lib/auth/provision-input";

function user(companyId: string): SessionUser {
  return { id: "u1", email: "cfo@apex.example", companyId, role: "USER" };
}

describe("password hashing (standard scrypt, no home-rolled crypto)", () => {
  it("verifies the correct password and rejects a wrong one", () => {
    const hash = hashPassword("correct-horse-9");
    expect(verifyPassword("correct-horse-9", hash)).toBe(true);
    expect(verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("rejects a tampered hash", () => {
    const hash = hashPassword("correct-horse-9");
    const tampered = hash.slice(0, -2) + "ff";
    expect(verifyPassword("correct-horse-9", tampered)).toBe(false);
  });

  it("rejects empty passwords", () => {
    expect(() => hashPassword("")).toThrow();
    expect(() => hashPassword("short")).toThrow();
  });

  it("salts hashes so the same password hashes differently", () => {
    expect(hashPassword("same-password-1")).not.toBe(hashPassword("same-password-1"));
  });
});

describe("tenant isolation (fail-closed)", () => {
  it("allows a user to access their own company", () => {
    expect(canAccessTenant(user("company-a"), "company-a")).toBe(true);
  });

  it("denies cross-tenant access", () => {
    expect(canAccessTenant(user("company-a"), "company-b")).toBe(false);
  });

  it("denies access with no session", () => {
    expect(canAccessTenant(null, "company-a")).toBe(false);
  });

  it("denies cross-tenant access even for admin-role users (admins provision via script, never via another tenant's dashboard)", () => {
    const admin: SessionUser = { ...user("company-a"), role: "ADMIN" };
    expect(canAccessTenant(admin, "company-b")).toBe(false);
  });

  it("tenantGate redirects to the caller's own dashboard on cross-tenant attempt, and to /login with no session", () => {
    expect(tenantGate(user("company-a"), "company-b")).toEqual({ ok: false, redirect: "/company-a/dashboard" });
    expect(tenantGate(null, "company-a")).toEqual({ ok: false, redirect: "/login" });
    expect(tenantGate(user("company-a"), "company-a")).toEqual({ ok: true, user: user("company-a") });
  });
});

describe("admin provisioning input validation", () => {
  it("accepts a valid provision request", () => {
    expect(
      validateProvisionInput({ email: "cfo@apex.example", password: "correct-horse-9", companyName: "Apex Manufacturing" }),
    ).toEqual({ ok: true });
  });

  it("rejects bad email, short password, and missing company", () => {
    expect(validateProvisionInput({ email: "not-an-email", password: "correct-horse-9", companyName: "Apex" }).ok).toBe(false);
    expect(validateProvisionInput({ email: "cfo@apex.example", password: "short", companyName: "Apex" }).ok).toBe(false);
    expect(validateProvisionInput({ email: "cfo@apex.example", password: "correct-horse-9", companyName: "" }).ok).toBe(false);
    expect(
      validateProvisionInput({ email: "cfo@apex.example", password: "correct-horse-9", companyId: "", companyName: "" }).ok,
    ).toBe(false);
  });
});
