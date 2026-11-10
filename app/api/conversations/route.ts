import { db, type Conversation } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sql = await db();
    const rows = (await sql`SELECT id, title, updated_at FROM conversations ORDER BY updated_at DESC LIMIT 100`) as Conversation[];
    return Response.json(rows);
  } catch (err: any) {
    return Response.json({ error: err?.message }, { status: 500 });
  }
}
