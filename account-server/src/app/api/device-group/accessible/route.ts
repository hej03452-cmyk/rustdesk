import { authenticatedUser } from "@/lib/auth";
import { apiError } from "@/lib/http";

export async function GET(request: Request) {
  if (!(await authenticatedUser(request))) return apiError(401, "Invalid token");
  return Response.json({ total: 0, data: [] });
}
