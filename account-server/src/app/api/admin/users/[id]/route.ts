import { authenticatedUser, passwordDigest } from "@/lib/auth";
import { pool } from "@/lib/db";
import { apiError, jsonBody } from "@/lib/http";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const admin = await authenticatedUser(request);
  if (!admin?.is_admin) return apiError(403, "Admin required");
  const { id } = await context.params;
  if (!/^\d+$/.test(id)) return apiError(400, "Invalid user ID");
  const body = await jsonBody(request);
  if (!body) return apiError(400, "Invalid request");

  if (body.status !== undefined) {
    if (body.status !== 0 && body.status !== 1) return apiError(400, "Invalid account status");
    if (id === admin.id && body.status === 0) return apiError(400, "You cannot disable your own account");
    const result = await pool.query("UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2", [body.status, id]);
    if (result.rowCount === 0) return apiError(404, "User not found");
    if (body.status === 0) await pool.query("DELETE FROM sessions WHERE user_id = $1", [id]);
    return Response.json({});
  }

  if (typeof body.password === "string") {
    if (body.password.length < 10) return apiError(400, "Password must contain at least 10 characters");
    if (Buffer.byteLength(body.password) > 1024) return apiError(400, "Password is too long");
    const credentials = await passwordDigest(body.password);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `UPDATE users SET password_salt = $1, password_hash = $2, updated_at = NOW()
         WHERE id = $3`,
        [credentials.salt, credentials.digest, id],
      );
      if (result.rowCount === 0) {
        await client.query("ROLLBACK");
        return apiError(404, "User not found");
      }
      await client.query("DELETE FROM sessions WHERE user_id = $1", [id]);
      await client.query("COMMIT");
      return Response.json({});
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  return apiError(400, "No supported update was supplied");
}
