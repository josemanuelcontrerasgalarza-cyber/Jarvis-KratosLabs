/**
 * Proveedor del modelo. Si existe NVIDIA_API_KEY se usa NVIDIA NIM
 * (Mistral Large 4 alojado por NVIDIA); si no, la API oficial de Mistral.
 */
function provider() {
  if (process.env.NVIDIA_API_KEY) {
    return {
      name: "nvidia" as const,
      url: "https://integrate.api.nvidia.com/v1/chat/completions",
      key: process.env.NVIDIA_API_KEY,
      model: process.env.NVIDIA_MODEL || "mistralai/mistral-large-4-1t-a52b",
    };
  }
  if (process.env.MISTRAL_API_KEY) {
    return {
      name: "mistral" as const,
      url: "https://api.mistral.ai/v1/chat/completions",
      key: process.env.MISTRAL_API_KEY,
      model: process.env.MISTRAL_MODEL || "mistral-large-latest",
    };
  }
  throw new Error("Configura NVIDIA_API_KEY o MISTRAL_API_KEY");
}

function extraParams(name: "nvidia" | "mistral") {
  return name === "nvidia"
    ? { top_p: 1, max_tokens: 4096, reasoning_effort: process.env.NVIDIA_REASONING_EFFORT || "medium" }
    : {};
}

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
  const p = provider();
  const request = (withTools: boolean) =>
    fetch(p.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        Authorization: `Bearer ${p.key}`,
      },
      body: JSON.stringify({
        model: p.model,
        messages: opts.messages,
        tools: withTools ? opts.tools : undefined,
        tool_choice: withTools ? "auto" : undefined,
        temperature: 0.6,
        stream: true,
        ...extraParams(p.name),
      }),
      signal: opts.signal,
    });

  const wantsTools = !!opts.tools?.length;
  let res = await request(wantsTools);
  // Si el proveedor rechaza las herramientas, responde sin ellas en lugar de fallar.
  if (wantsTools && (res.status === 400 || res.status === 422)) {
    const errText = await res.text().catch(() => "");
    console.warn(`[jarvis] ${p.name} rechazó tools (${res.status}): ${errText.slice(0, 200)}`);
    res = await request(false);
  }

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`${p.name} respondió ${res.status}: ${text.slice(0, 300)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let raw = "";
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
      // Oculta el razonamiento interno (<think>…</think>) si el modelo lo emite en el contenido.
      raw += delta.content;
      const visible = visibleText(raw);
      if (visible.length > content.length) {
        opts.onToken(visible.slice(content.length));
        content = visible;
      }
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

function visibleText(raw: string): string {
  let out = raw.replace(/<think>[\s\S]*?<\/think>\s*/g, "");
  const open = out.indexOf("<think>");
  if (open !== -1) out = out.slice(0, open);
  // No emitir un posible "<thi..." parcial al final.
  const partial = out.match(/<\/?t?h?i?n?k?$/);
  if (partial && partial[0].length > 0 && "<think>".startsWith(partial[0])) out = out.slice(0, -partial[0].length);
  return out.replace(/^\s+/, "");
}

export function providerInfo() {
  try {
    const p = provider();
    return { provider: p.name, model: p.model };
  } catch {
    return { provider: null, model: null };
  }
}

/** Llamada corta, sin streaming (para títulos, etc). */
export async function completeChat(messages: ChatMessage[], maxTokens = 40): Promise<string> {
  const p = provider();
  const res = await fetch(p.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${p.key}`,
    },
    body: JSON.stringify({
      model: p.model,
      messages,
      max_tokens: p.name === "nvidia" ? Math.max(maxTokens, 1024) : maxTokens,
      temperature: 0.3,
      ...(p.name === "nvidia" ? { reasoning_effort: "low" } : {}),
    }),
  });
  if (!res.ok) throw new Error(`${p.name} respondió ${res.status}`);
  const json = await res.json();
  return String(json?.choices?.[0]?.message?.content ?? "")
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .trim();
}
