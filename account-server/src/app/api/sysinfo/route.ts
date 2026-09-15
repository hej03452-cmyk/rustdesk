import { ensureSchema, pool } from "@/lib/db";
import { apiError, jsonBody } from "@/lib/http";

export async function POST(request: Request) {
  const body = await jsonBody(request);
  if (!body || typeof body.id !== "string" || typeof body.uuid !== "string") return apiError(400, "Invalid device identity");
  const { id, uuid, ...info } = body;
  if (!info.device_name && typeof info.hostname === "string") info.device_name = info.hostname;
  await ensureSchema();
  const result = await pool.query(
    `UPDATE devices SET info = $1, last_seen_at = NOW(), updated_at = NOW()
     WHERE rustdesk_id = $2 AND device_uuid = $3`,
    [JSON.stringify(info), id, uuid],
  );
  return new Response(result.rowCount === 1 ? "SYSINFO_UPDATED" : "ID_NOT_FOUND", {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
