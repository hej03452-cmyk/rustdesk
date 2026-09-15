import type { PoolClient } from "pg";

function normalizedInfo(info: Record<string, unknown>): Record<string, unknown> {
  const result = { ...info };
  if (!result.device_name && typeof result.name === "string") result.device_name = result.name;
  return result;
}

export async function bindDevice(
  client: PoolClient,
  userId: string,
  rustdeskId: unknown,
  deviceUuid: unknown,
  info: unknown,
): Promise<string | null> {
  if (typeof rustdeskId !== "string" || typeof deviceUuid !== "string") return null;
  const id = rustdeskId.trim();
  const uuid = deviceUuid.trim();
  if (!id || !uuid) return null;
  if (id.length > 64 || uuid.length > 256) return "Invalid device identity";
  const deviceInfo = info !== null && typeof info === "object" && !Array.isArray(info)
    ? normalizedInfo(info as Record<string, unknown>)
    : {};
  const existing = await client.query<{ user_id: string; device_uuid: string }>(
    "SELECT user_id::text, device_uuid FROM devices WHERE rustdesk_id = $1 FOR UPDATE",
    [id],
  );
  if (existing.rowCount === 0) {
    await client.query(
      "INSERT INTO devices (rustdesk_id, device_uuid, user_id, info) VALUES ($1, $2, $3, $4)",
      [id, uuid, userId, JSON.stringify(deviceInfo)],
    );
    return null;
  }
  if (existing.rows[0].device_uuid !== uuid) return "Device ID is already bound to another device";
  if (Object.keys(deviceInfo).length > 0) {
    await client.query(
      `UPDATE devices SET user_id = $1, info = $2, last_seen_at = NOW(), updated_at = NOW()
       WHERE rustdesk_id = $3`,
      [userId, JSON.stringify(deviceInfo), id],
    );
  } else {
    await client.query(
      `UPDATE devices SET user_id = $1, last_seen_at = NOW(), updated_at = NOW()
       WHERE rustdesk_id = $2`,
      [userId, id],
    );
  }
  return null;
}
