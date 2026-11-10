const MISTRAL_URL = "https://api.mistral.ai/v1/chat/completions";

export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string; tool_calls?: ToolCall[] }
  | { role: "tool"; content: string; name: string; tool_call_id: string };

export type ToolDefinition = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

export type StreamResult = { content: string; toolCalls: ToolCall[] };

/**
 * Llama a Mistral en modo streaming. Emite cada fragmento de texto con `onToken`
 * y devuelve el texto completo + las llamadas a herramientas solicitadas.
 */
export async function streamChat(opts: {
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  onToken: (t: string) => void;
  signal?: AbortSignal;
}): Promise<StreamResult> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) throw new Error("MISTRAL_API_KEY no está configurada");

  const res = await fetch(MISTRAL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.MISTRAL_MODEL || "mistral-large-latest",
      messages: opts.messages,
      tools: opts.tools?.length ? opts.tools : undefined,
      tool_choice: opts.tools?.length ? "auto" : undefined,
      temperature: 0.6,
      stream: true,
    }),
    signal: opts.signal,
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`Mistral respondió ${res.status}: ${text.slice(0, 300)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  const calls = new Map<string, ToolCall>();

  const handleData = (data: string) => {
    if (data === "[DONE]") return;
    let json: any;
    try {
      json = JSON.parse(data);
    } catch {
      return;
    }
    const delta = json?.choices?.[0]?.delta;
    if (!delta) return;
    if (typeof delta.content === "string" && delta.content) {
      content += delta.content;
      opts.onToken(delta.content);
    }
    if (Array.isArray(delta.tool_calls)) {
      for (const [i, tc] of delta.tool_calls.entries()) {
        const key = String(tc.index ?? tc.id ?? i);
        const prev = calls.get(key);
        if (prev) {
          prev.function.arguments += tc.function?.arguments ?? "";
          if (tc.id) prev.id = tc.id;
        } else {
          calls.set(key, {
            id: tc.id ?? `call_${key}`,
            type: "function",
            function: { name: tc.function?.name ?? "", arguments: tc.function?.arguments ?? "" },
          });
        }
      }
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (line.startsWith("data:")) handleData(line.slice(5).trim());
    }
  }
  if (buffer.trim().startsWith("data:")) handleData(buffer.trim().slice(5).trim());

  return { content, toolCalls: [...calls.values()].filter((c) => c.function.name) };
}

/** Llamada corta, sin streaming (para títulos, etc). */
export async function completeChat(messages: ChatMessage[], maxTokens = 40): Promise<string> {
  const res = await fetch(MISTRAL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.MISTRAL_MODEL || "mistral-large-latest",
      messages,
      max_tokens: maxTokens,
      temperature: 0.3,
    }),
  });
  if (!res.ok) throw new Error(`Mistral respondió ${res.status}`);
  const json = await res.json();
  return String(json?.choices?.[0]?.message?.content ?? "").trim();
}
