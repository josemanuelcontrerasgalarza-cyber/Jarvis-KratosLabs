import { db, type Memory, type StoredMessage } from "@/lib/db";
import { completeChat, streamChat, type ChatMessage } from "@/lib/mistral";
import { systemPrompt } from "@/lib/persona";
import { runTool, toolDefinitions, TOOL_LABELS } from "@/lib/tools";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_TOOL_ROUNDS = 5;
const HISTORY_LIMIT = 40;

export async function POST(req: Request) {
  let body: { conversationId?: string; message?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }
  const message = (body.message ?? "").trim();
  if (!message) return Response.json({ error: "Mensaje vacío" }, { status: 400 });
  if (message.length > 20000) return Response.json({ error: "Mensaje demasiado largo" }, { status: 413 });

  const sql = await db();

  let conversationId = body.conversationId;
  let isNew = false;
  if (conversationId) {
    const exists = await sql`SELECT 1 FROM conversations WHERE id = ${conversationId}`;
    if (!exists.length) conversationId = undefined;
  }
  if (!conversationId) {
    const rows = await sql`INSERT INTO conversations (title) VALUES (${message.slice(0, 60)}) RETURNING id`;
    conversationId = rows[0].id as string;
    isNew = true;
  }

  const [history, memories] = await Promise.all([
    sql`SELECT * FROM (
          SELECT id, role, content, created_at FROM messages
          WHERE conversation_id = ${conversationId} ORDER BY id DESC LIMIT ${HISTORY_LIMIT}
        ) t ORDER BY id ASC` as unknown as Promise<StoredMessage[]>,
    sql`SELECT id, content, created_at FROM memories ORDER BY id` as unknown as Promise<Memory[]>,
  ]);

  await sql`INSERT INTO messages (conversation_id, role, content) VALUES (${conversationId}, 'user', ${message})`;

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt(memories) },
    ...history.map((m) => ({ role: m.role, content: m.content }) as ChatMessage),
    { role: "user", content: message },
  ];

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      send({ type: "meta", conversationId, isNew });

      let finalText = "";
      try {
        for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
          const result = await streamChat({
            messages,
            tools: round < MAX_TOOL_ROUNDS ? toolDefinitions : undefined,
            onToken: (t) => {
              finalText += t;
              send({ type: "token", value: t });
            },
            signal: req.signal,
          });

          if (!result.toolCalls.length) break;

          messages.push({ role: "assistant", content: result.content, tool_calls: result.toolCalls });
          for (const call of result.toolCalls) {
            send({ type: "tool", name: call.function.name, label: TOOL_LABELS[call.function.name] ?? call.function.name });
            const output = await runTool(call.function.name, call.function.arguments);
            messages.push({ role: "tool", name: call.function.name, tool_call_id: call.id, content: output });
          }
        }

        if (finalText.trim()) {
          await sql`INSERT INTO messages (conversation_id, role, content) VALUES (${conversationId}, 'assistant', ${finalText})`;
        }
        await sql`UPDATE conversations SET updated_at = now() WHERE id = ${conversationId}`;

        if (isNew) {
          try {
            const title = await completeChat([
              {
                role: "system",
                content:
                  "Genera un título de 2 a 5 palabras para esta conversación, en el idioma del usuario. Responde solo con el título, sin comillas ni punto final.",
              },
              { role: "user", content: message.slice(0, 1000) },
            ]);
            const clean = title.replace(/^["'«]|["'»]$/g, "").slice(0, 80);
            if (clean) {
              await sql`UPDATE conversations SET title = ${clean} WHERE id = ${conversationId}`;
              send({ type: "title", value: clean });
            }
          } catch {
            /* el título es opcional */
          }
        }
        send({ type: "done" });
      } catch (err: any) {
        if (finalText.trim()) {
          await sql`INSERT INTO messages (conversation_id, role, content) VALUES (${conversationId}, 'assistant', ${finalText})`.catch(() => {});
        }
        send({ type: "error", message: err?.message ?? "Error desconocido" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
