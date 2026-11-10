export const SESSION_COOKIE = "jarvis_session";

/** Token derivado de la clave de acceso (SHA-256). Funciona en Edge y Node. */
export async function sessionToken(key: string): Promise<string> {
  const data = new TextEncoder().encode(`jarvis:${key}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Comparación en tiempo constante. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
