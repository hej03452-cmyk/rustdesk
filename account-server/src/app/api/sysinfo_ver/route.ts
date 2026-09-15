export async function POST() {
  return new Response("1", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
