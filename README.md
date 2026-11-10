# J.A.R.V.I.S. · KratosLabs

Asistente personal de IA que vive en la nube: **Mistral Large** como cerebro, **Neon Postgres** como memoria y **Vercel** como hogar. Interfaz HUD futurista con núcleo "arc reactor" animado, voz y modo móvil.

## Características

- 🧠 **Mistral Large** (`mistral-large-latest`) con respuestas en streaming.
- 🛠 **Agente con herramientas** (function calling, hasta 5 rondas por mensaje):
  - `get_datetime`: fecha y hora en cualquier zona horaria
  - `get_weather`: clima actual y pronóstico de 3 días (Open-Meteo, sin clave)
  - `calculate`: calculadora segura (sin `eval`)
  - `remember` / `forget` / `list_memories`: memoria a largo plazo
  - `fetch_url`: lee páginas web públicas
- 💾 **Neon**: conversaciones, mensajes y recuerdos persistentes. Las tablas se crean solas.
- 🎙 **Voz**: dictado por micrófono y respuestas habladas (Web Speech API; mejor en Chrome o Edge).
- 🔐 **Acceso protegido** con una clave (`JARVIS_ACCESS_KEY`) y cookie httpOnly.
- 📱 Diseño responsive con historial y panel de memoria.

## Puesta en marcha

### 1. Neon
1. Crea un proyecto en <https://console.neon.tech>.
2. Copia la cadena de conexión **pooled** (`...-pooler...`).
3. (Opcional) `DATABASE_URL=... npm run db:setup`. Si no, la app crea las tablas en la primera petición.

> También puedes añadir Neon desde Vercel: **Storage → Neon**, que crea `DATABASE_URL` automáticamente.

### 2. Mistral
Crea una API key en <https://console.mistral.ai/api-keys>.

### 3. Local
```bash
cp .env.example .env.local   # rellena las variables
npm install
npm run dev                  # http://localhost:3000
```

### 4. Vercel
1. Importa este repositorio en <https://vercel.com/new>.
2. Añade las variables de entorno:

| Variable | Obligatoria | Descripción |
|---|---|---|
| `MISTRAL_API_KEY` | ✅ | API key de Mistral |
| `DATABASE_URL` | ✅ | Cadena de conexión de Neon |
| `JARVIS_ACCESS_KEY` | ✅ en producción | Contraseña para entrar. **Sin ella la app queda abierta a cualquiera.** |
| `MISTRAL_MODEL` | – | Por defecto `mistral-large-latest` |
| `JARVIS_USER_NAME` | – | Cómo te llama Jarvis (por defecto "señor") |
| `JARVIS_TIMEZONE` | – | Zona IANA, p.ej. `Europe/Madrid` o `America/Mexico_City` |

3. Deploy. 🚀

## Estructura

```
app/
  page.tsx                  → interfaz principal
  login/page.tsx            → pantalla de acceso
  api/chat/route.ts         → bucle del agente + streaming NDJSON
  api/conversations/...     → historial
  api/memories/route.ts     → memoria a largo plazo
  api/login/route.ts        → login / logout
components/                 → Jarvis (chat), Orb (núcleo animado), Markdown
lib/
  mistral.ts                → cliente de Mistral con streaming y tool calls
  tools.ts                  → herramientas del agente
  persona.ts                → personalidad / system prompt
  db.ts                     → cliente Neon y auto-migración
middleware.ts               → protección por clave
sql/schema.sql              → esquema de la base de datos
```

## Añadir nuevas herramientas

1. Declara la herramienta en `toolDefinitions` (`lib/tools.ts`).
2. Implementa su lógica en el `switch` de `runTool`.
3. (Opcional) Añade una etiqueta en `TOOL_LABELS` para el indicador de la interfaz.
