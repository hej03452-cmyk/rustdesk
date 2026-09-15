import { bearerToken, tokenHash } from "@/lib/auth";
import { ensureSchema, pool } from "@/lib/db";

export async function POST(request: Request) {
  const token = bearerToken(request);
  if (token) {
    await ensureSchema();
    await pool.query("DELETE FROM sessions WHERE token_hash = $1", [tokenHash(token)]);
  }
  return Response.json({});
}
