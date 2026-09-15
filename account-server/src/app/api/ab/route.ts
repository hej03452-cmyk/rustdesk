import { authenticatedUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { apiError, jsonBody } from "@/lib/http";

const maxAddressBookBytes = 10 * 1024 * 1024;

export async function GET(request: Request) {
  const user = await authenticatedUser(request);
  if (!user) return apiError(401, "Invalid token");
  const result = await pool.query<{ data: string }>("SELECT data FROM address_books WHERE user_id = $1", [user.id]);
  return result.rowCount === 0
    ? Response.json(null)
    : Response.json({ data: result.rows[0].data, licensed_devices: 0 });
}

export async function POST(request: Request) {
  const user = await authenticatedUser(request);
  if (!user) return apiError(401, "Invalid token");
  const body = await jsonBody(request);
  if (!body || typeof body.data !== "string") return apiError(400, "Address book data is required");
  if (Buffer.byteLength(body.data) > maxAddressBookBytes) return apiError(413, "Address book is too large");
  try {
    const parsed: unknown = JSON.parse(body.data);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
  } catch {
    return apiError(400, "Address book must be a JSON object");
  }
  await pool.query(
    `INSERT INTO address_books (user_id, data) VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
    [user.id, body.data],
  );
  return Response.json(null);
}
