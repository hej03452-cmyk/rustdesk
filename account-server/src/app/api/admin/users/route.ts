import { timingSafeEqual } from "node:crypto";
import { authenticatedUser, insertUser, type NewUser } from "@/lib/auth";
import { ensureSchema, pool } from "@/lib/db";
import { apiError, jsonBody } from "@/lib/http";

type AdminUserRow = {
  id: string;
  name: string;
  display_name: string;
  email: string | null;
  status: number;
  is_admin: boolean;
  device_count: number;
};

export async function GET(request: Request) {
  const user = await authenticatedUser(request);
  if (!user?.is_admin) return apiError(403, "Admin required");
  const result = await pool.query<AdminUserRow>(
    `SELECT u.id::text, u.username AS name, u.display_name, u.email, u.status, u.is_admin,
            COUNT(d.rustdesk_id)::int AS device_count
     FROM users u LEFT JOIN devices d ON d.user_id = u.id
     GROUP BY u.id ORDER BY u.username_normalized`,
  );
  return Response.json({ total: result.rowCount, data: result.rows });
}

export async function POST(request: Request) {
  const body = await jsonBody(request);
  if (!body) return apiError(400, "Invalid request");
  await ensureSchema();
  const user = await authenticatedUser(request);
  let bootstrap = false;
  const client = await pool.connect();
  if (!user?.is_admin) {
    const supplied = request.headers.get("x-admin-token") ?? "";
    const expected = process.env.ACCOUNT_BOOTSTRAP_TOKEN ?? "";
    const suppliedBuffer = Buffer.from(supplied);
    const expectedBuffer = Buffer.from(expected);
    if (!supplied || !expected || suppliedBuffer.length !== expectedBuffer.length || !timingSafeEqual(suppliedBuffer, expectedBuffer)) {
      client.release();
      return apiError(403, "Admin required");
    }
  }
  try {
    await client.query("BEGIN");
    if (!user?.is_admin) {
      await client.query("SELECT pg_advisory_xact_lock(1381192003)");
      const count = await client.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM users");
      bootstrap = count.rows[0].count === "0";
      if (!bootstrap) {
        await client.query("ROLLBACK");
        return apiError(403, "Bootstrap token has already been used");
      }
    }
    const created = await insertUser({ ...body, is_admin: bootstrap || body.is_admin === true } as NewUser, client);
    await client.query("COMMIT");
    return Response.json(created, { status: 201 });
  } catch (error) {
    await client.query("ROLLBACK");
    const databaseError = error as { code?: string };
    if (databaseError.code === "23505") return apiError(409, "Username already exists");
    return apiError(400, error instanceof Error ? error.message : "Invalid request");
  } finally {
    client.release();
  }
}
