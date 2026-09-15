import { bearerToken, secretMatches, tokenHash } from "@/lib/auth";
import { ensureSchema, pool } from "@/lib/db";
import { apiError, jsonBody } from "@/lib/http";

type AuthorizationRow = {
  is_admin: boolean;
  owns_target: boolean;
};

export async function POST(request: Request) {
  const internalSecret = process.env.RENDEZVOUS_AUTH_SECRET ?? "";
  if (!secretMatches(bearerToken(request), internalSecret)) return apiError(401, "Unauthorized");

  const body = await jsonBody(request);
  if (!body || typeof body.token !== "string" || typeof body.target_id !== "string") {
    return apiError(400, "Token and target ID are required");
  }
  if (body.token.length > 1024 || body.target_id.length > 64) return apiError(400, "Invalid request");

  await ensureSchema();
  const result = await pool.query<AuthorizationRow>(
    `SELECT u.is_admin,
            EXISTS (
              SELECT 1 FROM devices d
              WHERE d.rustdesk_id = $2 AND d.user_id = s.user_id
            ) AS owns_target
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > NOW() AND u.status = 1`,
    [tokenHash(body.token), body.target_id],
  );
  const authorization = result.rows[0];
  if (!authorization) return Response.json({ allowed: false, reason: "Invalid or expired account session" });

  const policy = process.env.RENDEZVOUS_AUTH_POLICY ?? "same-account";
  if (policy === "same-account" && !authorization.owns_target && !authorization.is_admin) {
    return Response.json({ allowed: false, reason: "The target device is not in this account" });
  }
  if (policy !== "valid-session" && policy !== "same-account") {
    return apiError(500, "Invalid rendezvous authorization policy");
  }
  return Response.json({ allowed: true });
}
