import { describe, expect, it } from "vitest";
import { hashPassword, isPasswordHash, normalizeEmail, validatePassword, verifyLegacyPassword, verifyPassword } from "./security.js";
import { signupSchema } from "./validation.js";

describe("Stage 1 credential security", () => {
  it("hashes passwords and verifies without storing plaintext", async () => {
    const password = "A-Strong-Password-2026";
    const hash = await hashPassword(password);
    expect(hash).not.toContain(password);
    expect(isPasswordHash(hash)).toBe(true);
    await expect(verifyPassword(password, hash)).resolves.toBe(true);
    await expect(verifyPassword("wrong", hash)).resolves.toBe(false);
  });

  it("does not accept legacy plaintext as a password hash", async () => {
    await expect(verifyPassword("password", "password")).resolves.toBe(false);
  });

  it("compares a legacy password only through the explicit migration path", () => {
    expect(verifyLegacyPassword("password", "password")).toBe(true);
    expect(verifyLegacyPassword("wrong", "password")).toBe(false);
    expect(verifyLegacyPassword("password", "scrypt$salt$hash")).toBe(false);
  });

  it("normalizes email and rejects weak/admin public signup input", () => {
    expect(normalizeEmail("  USER@Example.COM ")).toBe("user@example.com");
    expect(validatePassword("password")).toBeTruthy();
    expect(signupSchema.safeParse({ name: "Admin", email: "a@example.com", password: "A-Strong-Password-2026", role: "admin" }).success).toBe(false);
    const weakPassword = signupSchema.safeParse({ name: "Person", email: "a@example.com", password: "short", role: "participant" });
    expect(weakPassword.success).toBe(false);
    if (!weakPassword.success) expect(weakPassword.error.issues[0]?.message).toBe("Password must be 12 to 128 characters.");
  });
});
