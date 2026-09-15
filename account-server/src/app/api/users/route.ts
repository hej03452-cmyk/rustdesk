import { authenticatedUser, userPayload, type AuthUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { apiError } from "@/lib/http";

export async function GET(request: Request) {
  const user = await authenticatedUser(request);
  if (!user) return apiError(401, "Invalid token");
  const result = user.is_admin
    ? await pool.query<AuthUser>("SELECT id::text, username AS name, display_name, email, status, is_admin FROM users ORDER BY username_normalized")
    : await pool.query<AuthUser>("SELECT id::text, username AS name, display_name, email, status, is_admin FROM users WHERE id = $1", [user.id]);
  const data = result.rows.map(userPayload);
  return Response.json({ total: data.length, data });
}
