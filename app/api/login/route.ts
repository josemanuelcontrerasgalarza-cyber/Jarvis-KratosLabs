import { SESSION_COOKIE, safeEqual, sessionToken } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const key = process.env.JARVIS_ACCESS_KEY;
  const { password } = (await req.json().catch(() => ({}))) as { password?: string };
  if (!key) return Response.json({ ok: true });
  if (!password || !safeEqual(await sessionToken(password), await sessionToken(key))) {
    await new Promise((r) => setTimeout(r, 600));
    return Response.json({ error: "Clave incorrecta" }, { status: 401 });
  }
  const token = await sessionToken(key);
  const res = Response.json({ ok: true });
  res.headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}${
      process.env.NODE_ENV === "production" ? "; Secure" : ""
    }`,
  );
  return res;
}

export async function DELETE() {
  const res = Response.json({ ok: true });
  res.headers.append("Set-Cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  return res;
}
