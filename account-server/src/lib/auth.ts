import { createHash, pbkdf2, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { Pool, PoolClient } from "pg";
import { ensureSchema, pool } from "./db";

const pbkdf2Async = promisify(pbkdf2);
const iterations = 600_000;
const usernamePattern = /^[A-Za-z0-9_.@-]{3,64}$/;

export type AuthUser = {
  id: string;
  name: string;
  display_name: string;
  email: string | null;
  status: number;
  is_admin: boolean;
};

export type NewUser = {
  username?: unknown;
  password?: unknown;
  display_name?: unknown;
  email?: unknown;
  is_admin?: unknown;
};

type Queryable = Pool | PoolClient;

export function normalizedUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function validateNewUser(input: NewUser): string | null {
  if (typeof input.username !== "string" || !usernamePattern.test(input.username.trim())) {
    return "Username must be 3-64 characters and contain only letters, numbers, . _ @ or -";
  }
  if (typeof input.password !== "string" || input.password.length < 10) {
    return "Password must contain at least 10 characters";
  }
  if (Buffer.byteLength(input.password) > 1024) return "Password is too long";
  if (input.display_name !== undefined && typeof input.display_name !== "string") return "Invalid display name";
  if (typeof input.display_name === "string" && input.display_name.length > 128) return "Display name is too long";
  if (input.email !== undefined && input.email !== null && typeof input.email !== "string") return "Invalid email";
  if (typeof input.email === "string" && input.email.length > 254) return "Email is too long";
  return null;
}

export async function passwordDigest(password: string, salt?: Buffer) {
  const actualSalt = salt ?? randomBytes(16);
  const digest = (await pbkdf2Async(password, actualSalt, iterations, 32, "sha256")) as Buffer;
  return { salt: actualSalt.toString("base64"), digest: digest.toString("base64") };
}

export async function passwordMatches(password: string, salt: string, expected: string) {
  const decodedSalt = Buffer.from(salt, "base64");
  const actual = await passwordDigest(password, decodedSalt);
  const actualBuffer = Buffer.from(actual.digest);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export async function insertUser(input: NewUser, database: Queryable = pool) {
  const validationError = validateNewUser(input);
  if (validationError) throw new Error(validationError);
  const username = (input.username as string).trim();
  const password = input.password as string;
  const displayName = typeof input.display_name === "string" ? input.display_name.trim() : "";
  const email = typeof input.email === "string" ? input.email.trim() || null : null;
  const credentials = await passwordDigest(password);
  const result = await database.query<{ id: string }>(
    `INSERT INTO users
      (username, username_normalized, display_name, email, password_salt, password_hash, is_admin)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id::text`,
    [username, normalizedUsername(username), displayName, email, credentials.salt, credentials.digest, input.is_admin === true],
  );
  return { id: result.rows[0].id, name: username };
}

export function userPayload(user: AuthUser) {
  return {
    name: user.name,
    display_name: user.display_name,
    avatar: "",
    email: user.email,
    note: "",
    status: user.status,
    is_admin: user.is_admin,
    info: {},
  };
}

export function bearerToken(request: Request): string | null {
  const match = /^Bearer (.+)$/i.exec(request.headers.get("authorization") ?? "");
  return match?.[1] ?? null;
}

export function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function secretMatches(actual: string | null, expected: string): boolean {
  if (!actual || !expected) return false;
  const actualDigest = createHash("sha256").update(actual).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(actualDigest, expectedDigest);
}

export async function authenticatedUser(request: Request): Promise<AuthUser | null> {
  await ensureSchema();
  const token = bearerToken(request);
  if (!token) return null;
  const result = await pool.query<AuthUser>(
    `SELECT u.id::text, u.username AS name, u.display_name, u.email, u.status, u.is_admin
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > NOW() AND u.status = 1`,
    [tokenHash(token)],
  );
  return result.rows[0] ?? null;
}
