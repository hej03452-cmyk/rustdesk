import { ensureSchema, pool } from "@/lib/db";
import { apiError, jsonBody } from "@/lib/http";

export async function POST(request: Request) {
  const body = await jsonBody(request);
  if (!body || typeof body.id !== "string" || typeof body.uuid !== "string") return apiError(400, "Invalid device identity");
  await ensureSchema();
  await pool.query(
    "UPDATE devices SET last_seen_at = NOW() WHERE rustdesk_id = $1 AND device_uuid = $2",
    [body.id, body.uuid],
  );
  return Response.json({});
}
