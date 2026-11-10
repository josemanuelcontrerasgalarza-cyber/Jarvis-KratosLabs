import { db, type StoredMessage } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return Response.json({ error: "id inválido" }, { status: 400 });
  const sql = await db();
  const rows = (await sql`SELECT id, role, content, created_at FROM messages WHERE conversation_id = ${id} ORDER BY id`) as StoredMessage[];
  return Response.json(rows);
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return Response.json({ error: "id inválido" }, { status: 400 });
  const sql = await db();
  await sql`DELETE FROM conversations WHERE id = ${id}`;
  return Response.json({ ok: true });
}
