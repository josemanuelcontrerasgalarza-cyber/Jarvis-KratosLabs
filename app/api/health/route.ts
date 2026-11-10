import { safeEqual } from "@/lib/auth";
import { db } from "@/lib/db";
import { completeChat, providerInfo } from "@/lib/mistral";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Diagnóstico: /api/health?key=<JARVIS_ACCESS_KEY>[&ping=1] */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const access = process.env.JARVIS_ACCESS_KEY;
  if (access && !safeEqual(url.searchParams.get("key") ?? "", access)) {
    return Response.json({ ok: true }); // sin clave: no revela nada
  }

  const result: Record<string, unknown> = { ...providerInfo(), database: "sin configurar" };

  if (process.env.DATABASE_URL) {
    try {
      const sql = await db();
      await sql`SELECT 1`;
      result.database = "ok";
    } catch (err: any) {
      result.database = `error: ${err?.message}`;
    }
  }

  if (url.searchParams.get("ping") === "1") {
    try {
      const t = Date.now();
      result.reply = await completeChat([{ role: "user", content: "Responde solo: 'Sistemas en línea.'" }], 30);
      result.latency_ms = Date.now() - t;
    } catch (err: any) {
      result.model_error = err?.message;
    }
  }
  return Response.json(result);
}
