import { randomBytes } from "node:crypto";
import { normalizedUsername, passwordMatches, tokenHash, userPayload, type AuthUser } from "@/lib/auth";
import { ensureSchema, pool } from "@/lib/db";
import { bindDevice } from "@/lib/devices";
import { apiError, jsonBody } from "@/lib/http";
import { clearUserLoginFailures, loginLimit, recordLoginFailure } from "@/lib/rate-limit";

type LoginRow = AuthUser & { password_salt: string; password_hash: string };

export async function POST(request: Request) {
  const body = await jsonBody(request);
  if (!body || typeof body.username !== "string" || typeof body.password !== "string") {
    return apiError(400, "Username and password are required");
  }
  if (body.type !== undefined && body.type !== "account") return apiError(400, "Unsupported login type");
  const username = normalizedUsername(body.username);
  const limit = loginLimit(request, username);
  if (!limit.allowed) return apiError(429, "Too many login attempts; try again later");
  await ensureSchema();
  const result = await pool.query<LoginRow>(
    `SELECT id::text, username AS name, display_name, email, password_salt,
            password_hash, status, is_admin
     FROM users WHERE username_normalized = $1`,
    [username],
  );
  const user = result.rows[0];
  const passwordValid = user
    ? await passwordMatches(body.password, user.password_salt, user.password_hash)
    : await passwordMatches(
        body.password,
        "AAAAAAAAAAAAAAAAAAAAAA==",
        "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
      );
  if (!user || !passwordValid) {
    recordLoginFailure(limit.keys);
    return apiError(401, "Wrong username or password");
  }
  if (user.status !== 1) return apiError(403, "Account is disabled");
  clearUserLoginFailures(username);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const bindError = await bindDevice(client, user.id, body.id, body.uuid, body.deviceInfo);
    if (bindError) {
      await client.query("ROLLBACK");
      return apiError(409, bindError);
    }
    const token = randomBytes(32).toString("base64url");
    const requestedDays = body.autoLogin === false ? 1 : Number(process.env.ACCOUNT_SESSION_TTL_DAYS ?? "30");
    const sessionDays = Number.isFinite(requestedDays) ? Math.min(Math.max(requestedDays, 1), 365) : 30;
    await client.query(
      `INSERT INTO sessions (token_hash, user_id, rustdesk_id, device_uuid, expires_at)
       VALUES ($1, $2, $3, $4, NOW() + ($5 * INTERVAL '1 day'))`,
      [tokenHash(token), user.id, typeof body.id === "string" ? body.id : null, typeof body.uuid === "string" ? body.uuid : null, sessionDays],
    );
    await client.query("DELETE FROM sessions WHERE expires_at <= NOW()");
    await client.query("COMMIT");
    return Response.json({
      access_token: token,
      type: "access_token",
      user: userPayload(user),
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
