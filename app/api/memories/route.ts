import { db, type Memory } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const sql = await db();
  const rows = (await sql`SELECT id, content, created_at FROM memories ORDER BY id DESC`) as Memory[];
  return Response.json(rows);
}

export async function DELETE(req: Request) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id)) return Response.json({ error: "id inválido" }, { status: 400 });
  const sql = await db();
  await sql`DELETE FROM memories WHERE id = ${id}`;
  return Response.json({ ok: true });
}
