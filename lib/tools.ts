import { db, type Memory } from "@/lib/db";
import type { ToolDefinition } from "@/lib/mistral";

export const TOOL_LABELS: Record<string, string> = {
  get_datetime: "Consultando el reloj",
  get_weather: "Analizando el clima",
  calculate: "Calculando",
  remember: "Guardando en memoria",
  forget: "Borrando un recuerdo",
  list_memories: "Revisando memoria",
  fetch_url: "Leyendo una página web",
};

export const toolDefinitions: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "get_datetime",
      description: "Obtiene la fecha y hora actual en una zona horaria IANA.",
      parameters: {
        type: "object",
        properties: {
          timezone: { type: "string", description: "Zona horaria IANA, p.ej. 'America/Mexico_City'. Opcional." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_weather",
      description: "Obtiene el clima actual y el pronóstico de 3 días para una ciudad.",
      parameters: {
        type: "object",
        properties: { city: { type: "string", description: "Nombre de la ciudad" } },
        required: ["city"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calculate",
      description: "Evalúa una expresión matemática (+ - * / % ^ paréntesis, sqrt, sin, cos, tan, log, ln, pi, e).",
      parameters: {
        type: "object",
        properties: { expression: { type: "string" } },
        required: ["expression"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remember",
      description:
        "Guarda un dato importante y duradero sobre el usuario (preferencias, proyectos, personas, fechas) en la memoria a largo plazo.",
      parameters: {
        type: "object",
        properties: { fact: { type: "string", description: "El dato, redactado de forma breve y autocontenida." } },
        required: ["fact"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "forget",
      description: "Elimina un recuerdo de la memoria a largo plazo por su id.",
      parameters: {
        type: "object",
        properties: { memory_id: { type: "integer" } },
        required: ["memory_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_memories",
      description: "Lista todos los recuerdos guardados con su id.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "fetch_url",
      description: "Descarga una página web pública y devuelve su texto (truncado).",
      parameters: {
        type: "object",
        properties: { url: { type: "string", description: "URL http(s)" } },
        required: ["url"],
      },
    },
  },
];

export async function runTool(name: string, rawArgs: string): Promise<string> {
  let args: Record<string, any> = {};
  try {
    args = rawArgs ? JSON.parse(rawArgs) : {};
  } catch {
    return JSON.stringify({ error: "Argumentos JSON inválidos" });
  }
  try {
    switch (name) {
      case "get_datetime":
        return getDatetime(args.timezone);
      case "get_weather":
        return await getWeather(String(args.city ?? ""));
      case "calculate":
        return calculate(String(args.expression ?? ""));
      case "remember": {
        const sql = await db();
        const fact = String(args.fact ?? "").trim().slice(0, 1000);
        if (!fact) return JSON.stringify({ error: "Dato vacío" });
        const rows = await sql`INSERT INTO memories (content) VALUES (${fact}) RETURNING id`;
        return JSON.stringify({ ok: true, id: rows[0].id });
      }
      case "forget": {
        const sql = await db();
        const rows = await sql`DELETE FROM memories WHERE id = ${Number(args.memory_id)} RETURNING id`;
        return JSON.stringify({ ok: rows.length > 0 });
      }
      case "list_memories": {
        const sql = await db();
        const rows = (await sql`SELECT id, content FROM memories ORDER BY id`) as Memory[];
        return JSON.stringify(rows);
      }
      case "fetch_url":
        return await fetchUrl(String(args.url ?? ""));
      default:
        return JSON.stringify({ error: `Herramienta desconocida: ${name}` });
    }
  } catch (err: any) {
    return JSON.stringify({ error: err?.message ?? String(err) });
  }
}

function getDatetime(timezone?: string) {
  const tz = timezone || process.env.JARVIS_TIMEZONE || "UTC";
  const now = new Date();
  const formatted = new Intl.DateTimeFormat("es-ES", {
    dateStyle: "full",
    timeStyle: "long",
    timeZone: tz,
  }).format(now);
  return JSON.stringify({ timezone: tz, iso: now.toISOString(), formatted });
}

const WEATHER_CODES: Record<number, string> = {
  0: "despejado", 1: "mayormente despejado", 2: "parcialmente nublado", 3: "nublado",
  45: "niebla", 48: "niebla con escarcha", 51: "llovizna ligera", 53: "llovizna", 55: "llovizna intensa",
  61: "lluvia ligera", 63: "lluvia", 65: "lluvia intensa", 71: "nieve ligera", 73: "nieve", 75: "nieve intensa",
  80: "chubascos", 81: "chubascos fuertes", 82: "chubascos violentos", 95: "tormenta", 96: "tormenta con granizo", 99: "tormenta fuerte con granizo",
};

async function getWeather(city: string) {
  if (!city) return JSON.stringify({ error: "Ciudad requerida" });
  const geo = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=es`,
  ).then((r) => r.json());
  const place = geo?.results?.[0];
  if (!place) return JSON.stringify({ error: `No encontré la ciudad "${city}"` });
  const w = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
      `&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&forecast_days=3&timezone=auto`,
  ).then((r) => r.json());
  return JSON.stringify({
    lugar: `${place.name}, ${place.admin1 ?? ""} ${place.country ?? ""}`.trim(),
    actual: {
      temperatura_c: w.current?.temperature_2m,
      sensacion_c: w.current?.apparent_temperature,
      humedad: w.current?.relative_humidity_2m,
      viento_kmh: w.current?.wind_speed_10m,
      estado: WEATHER_CODES[w.current?.weather_code] ?? w.current?.weather_code,
    },
    pronostico: (w.daily?.time ?? []).map((d: string, i: number) => ({
      fecha: d,
      max_c: w.daily.temperature_2m_max[i],
      min_c: w.daily.temperature_2m_min[i],
      prob_lluvia: w.daily.precipitation_probability_max[i],
      estado: WEATHER_CODES[w.daily.weather_code[i]] ?? w.daily.weather_code[i],
    })),
  });
}

/** Evaluador matemático seguro (shunting-yard), sin eval. */
function calculate(expr: string) {
  const tokens = expr
    .toLowerCase()
    .replace(/\s+/g, "")
    .match(/\d+(\.\d+)?|[a-z]+|[+\-*/%^(),]/g);
  if (!tokens) return JSON.stringify({ error: "Expresión vacía" });

  const consts: Record<string, number> = { pi: Math.PI, e: Math.E };
  const fns: Record<string, (x: number) => number> = {
    sqrt: Math.sqrt, sin: Math.sin, cos: Math.cos, tan: Math.tan,
    log: Math.log10, ln: Math.log, abs: Math.abs, round: Math.round, floor: Math.floor, ceil: Math.ceil,
  };
  const prec: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2, "%": 2, "^": 4, "neg": 3 };
  const out: (number | string)[] = [];
  const ops: string[] = [];
  let prev: string | null = null;

  for (const t of tokens) {
    if (/^\d/.test(t)) out.push(parseFloat(t));
    else if (t in consts) out.push(consts[t]);
    else if (t in fns) ops.push(t);
    else if (t === "(") ops.push(t);
    else if (t === ")") {
      while (ops.length && ops[ops.length - 1] !== "(") out.push(ops.pop()!);
      if (!ops.length) throw new Error("Paréntesis desbalanceados");
      ops.pop();
      if (ops.length && ops[ops.length - 1] in fns) out.push(ops.pop()!);
    } else if (t in prec) {
      let op = t;
      if (t === "-" && (prev === null || prev in prec || prev === "(")) op = "neg";
      while (
        ops.length &&
        ops[ops.length - 1] !== "(" &&
        (prec[ops[ops.length - 1]] > prec[op] || (prec[ops[ops.length - 1]] === prec[op] && op !== "^" && op !== "neg"))
      ) out.push(ops.pop()!);
      ops.push(op);
    } else throw new Error(`Símbolo no permitido: ${t}`);
    prev = t;
  }
  while (ops.length) {
    const op = ops.pop()!;
    if (op === "(") throw new Error("Paréntesis desbalanceados");
    out.push(op);
  }

  const stack: number[] = [];
  for (const t of out) {
    if (typeof t === "number") stack.push(t);
    else if (t === "neg") stack.push(-stack.pop()!);
    else if (t in fns) stack.push(fns[t](stack.pop()!));
    else {
      const b = stack.pop()!, a = stack.pop()!;
      if (a === undefined || b === undefined) throw new Error("Expresión inválida");
      stack.push(t === "+" ? a + b : t === "-" ? a - b : t === "*" ? a * b : t === "/" ? a / b : t === "%" ? a % b : a ** b);
    }
  }
  if (stack.length !== 1 || Number.isNaN(stack[0])) throw new Error("Expresión inválida");
  return JSON.stringify({ expression: expr, result: stack[0] });
}

async function fetchUrl(url: string) {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return JSON.stringify({ error: "URL inválida" });
  }
  if (!/^https?:$/.test(u.protocol)) return JSON.stringify({ error: "Solo http(s)" });
  if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[?::1\]?$)/.test(u.hostname)) {
    return JSON.stringify({ error: "Host no permitido" });
  }
  const res = await fetch(u, {
    headers: { "User-Agent": "Mozilla/5.0 (JarvisBot)" },
    signal: AbortSignal.timeout(10000),
  });
  const html = await res.text();
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  return JSON.stringify({ status: res.status, url: u.toString(), text: text.slice(0, 8000) });
}
