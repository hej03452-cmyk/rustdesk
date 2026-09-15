import { insertUser, type NewUser } from "@/lib/auth";
import { ensureSchema } from "@/lib/db";
import { apiError, jsonBody } from "@/lib/http";

export async function POST(request: Request) {
  if (!/^(1|true|yes)$/i.test(process.env.ACCOUNT_ALLOW_REGISTRATION ?? "false")) {
    return apiError(403, "Registration is disabled");
  }
  const body = await jsonBody(request);
  if (!body) return apiError(400, "Invalid request");
  await ensureSchema();
  try {
    return Response.json(await insertUser({ ...body, is_admin: false } as NewUser), { status: 201 });
  } catch (error) {
    const databaseError = error as { code?: string };
    if (databaseError.code === "23505") return apiError(409, "Username already exists");
    return apiError(400, error instanceof Error ? error.message : "Invalid request");
  }
}
