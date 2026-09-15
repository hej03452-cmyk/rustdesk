import { authenticatedUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { apiError } from "@/lib/http";

type PeerRow = { rustdesk_id: string; info: string; note: string; username: string };

export async function GET(request: Request) {
  const user = await authenticatedUser(request);
  if (!user) return apiError(401, "Invalid token");
  const result = await pool.query<PeerRow>(
    `SELECT d.rustdesk_id, d.info, d.note, u.username
     FROM devices d JOIN users u ON u.id = d.user_id
     WHERE d.user_id = $1 ORDER BY d.updated_at DESC`,
    [user.id],
  );
  const data = result.rows.map((row) => {
    let info: Record<string, unknown> = {};
    try { info = JSON.parse(row.info) as Record<string, unknown>; } catch {}
    return { id: row.rustdesk_id, info, status: 1, user: row.username, user_name: row.username, note: row.note };
  });
  return Response.json({ total: data.length, data });
}
