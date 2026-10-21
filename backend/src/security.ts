import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function validatePassword(password: string) {
  if (password.length < 12 || password.length > 128) return "Password must be 12 to 128 characters.";
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    return "Password must include uppercase, lowercase, and numeric characters.";
  }
  return null;
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  return `scrypt$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export function isPasswordHash(value: string) {
  return value.startsWith("scrypt$") && value.split("$").length === 3;
}

export async function verifyPassword(password: string, encoded: string) {
  if (!isPasswordHash(encoded)) return false;
  const [, saltText, hashText] = encoded.split("$");
  const expected = Buffer.from(hashText, "base64url");
  const actual = (await scrypt(password, Buffer.from(saltText, "base64url"), expected.length)) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function createOpaqueToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("base64url");
}

export function createTicketCode() {
  return `VRY-${randomBytes(6).toString("hex").toUpperCase()}`;
}
