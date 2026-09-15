import { authenticatedUser, userPayload } from "@/lib/auth";
import { pool } from "@/lib/db";
import { bindDevice } from "@/lib/devices";
import { apiError, jsonBody } from "@/lib/http";

export async function POST(request: Request) {
  const user = await authenticatedUser(request);
  if (!user) return apiError(401, "Invalid token");
  const body = (await jsonBody(request)) ?? {};
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const bindError = await bindDevice(client, user.id, body.id, body.uuid, {});
    if (bindError) {
      await client.query("ROLLBACK");
      return apiError(409, bindError);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return Response.json(userPayload(user));
}
