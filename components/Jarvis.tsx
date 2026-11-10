"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Orb, type OrbState } from "@/components/Orb";
import { Markdown } from "@/components/Markdown";

type Msg = { role: "user" | "assistant"; content: string; tools?: string[]; error?: boolean };
type Conversation = { id: string; title: string; updated_at: string };
type Memory = { id: number; content: string; created_at: string };

const SUGGESTIONS = [
  { icon: "☀", text: "¿Qué clima hará mañana en Madrid?" },
  { icon: "◎", text: "Ayúdame a planificar mi día de forma productiva" },
  { icon: "∑", text: "Calcula el 18% de 2.450 más IVA del 21%" },
  { icon: "✦", text: "Recuerda que mi proyecto principal es KratosLabs" },
];

function greeting() {
  const h = new Date().getHours();
  if (h < 6) return "Trabajando hasta tarde";
  if (h < 13) return "Buenos días";
  if (h < 20) return "Buenas tardes";
  return "Buenas noches";
}

function plainText(md: string) {
  return md
    .replace(/```[\s\S]*?```/g, " bloque de código. ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[#*_>~|-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export default function Jarvis({ userName }: { userName: string }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [toolLabel, setToolLabel] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tab, setTab] = useState<"chats" | "memory">("chats");
  const [memories, setMemories] = useState<Memory[]>([]);
  const [clock, setClock] = useState("");
  const [hello, setHello] = useState("Hola");

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recogRef = useRef<any>(null);

  const orbState: OrbState = listening ? "listening" : speaking ? "speaking" : busy ? "thinking" : "idle";

  // Reloj HUD
  useEffect(() => {
    setHello(greeting());
    const tick = () =>
      setClock(new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    tick();
    const t = setInterval(tick, 1000);
    try {
      setVoiceOn(localStorage.getItem("jarvis_voice") === "1");
    } catch {}
    return () => clearInterval(t);
  }, []);

  const loadConversations = useCallback(async () => {
    const res = await fetch("/api/conversations");
    if (res.ok) setConversations(await res.json());
  }, []);

  const loadMemories = useCallback(async () => {
    const res = await fetch("/api/memories");
    if (res.ok) setMemories(await res.json());
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (tab === "memory") loadMemories();
  }, [tab, loadMemories]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, toolLabel]);

  // Auto-altura del textarea
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [input]);

  const speak = useCallback(
    (text: string) => {
      if (!voiceOn || typeof window === "undefined" || !("speechSynthesis" in window)) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(plainText(text).slice(0, 1500));
      const voices = window.speechSynthesis.getVoices();
      const voice =
        voices.find((v) => v.lang.startsWith("es") && /male|jorge|pablo|diego|google/i.test(v.name)) ??
        voices.find((v) => v.lang.startsWith("es"));
      if (voice) u.voice = voice;
      u.lang = voice?.lang ?? "es-ES";
      u.rate = 1.03;
      u.pitch = 0.9;
      u.onstart = () => setSpeaking(true);
      u.onend = () => setSpeaking(false);
      u.onerror = () => setSpeaking(false);
      window.speechSynthesis.speak(u);
    },
    [voiceOn],
  );

  const openConversation = async (id: string) => {
    if (busy) return;
    setActiveId(id);
    setSidebarOpen(false);
    setMessages([]);
    const res = await fetch(`/api/conversations/${id}`);
    if (res.ok) {
      const rows = (await res.json()) as { role: "user" | "assistant"; content: string }[];
      setMessages(rows.map((r) => ({ role: r.role, content: r.content })));
    }
  };

  const newChat = () => {
    abortRef.current?.abort();
    setActiveId(null);
    setMessages([]);
    setSidebarOpen(false);
    inputRef.current?.focus();
  };

  const deleteConversation = async (id: string) => {
    await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    if (id === activeId) newChat();
    loadConversations();
  };

  const deleteMemory = async (id: number) => {
    await fetch(`/api/memories?id=${id}`, { method: "DELETE" });
    loadMemories();
  };

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || busy) return;
    setInput("");
    setBusy(true);
    setToolLabel(null);
    window.speechSynthesis?.cancel();
    setMessages((m) => [...m, { role: "user", content }, { role: "assistant", content: "", tools: [] }]);

    const update = (fn: (msg: Msg) => Msg) =>
      setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = fn(copy[copy.length - 1]);
        return copy;
      });

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let full = "";

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: activeId, message: content }),
        signal: ctrl.signal,
      });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Error ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf("\n")) !== -1) {
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          if (!line) continue;
          const ev = JSON.parse(line);
          if (ev.type === "meta") {
            setActiveId(ev.conversationId);
            if (ev.isNew) loadConversations();
          } else if (ev.type === "token") {
            full += ev.value;
            setToolLabel(null);
            update((m) => ({ ...m, content: m.content + ev.value }));
          } else if (ev.type === "tool") {
            setToolLabel(ev.label);
            update((m) => ({ ...m, tools: [...(m.tools ?? []), ev.label] }));
            if (ev.name === "remember" || ev.name === "forget") setTimeout(loadMemories, 800);
          } else if (ev.type === "title") {
            loadConversations();
          } else if (ev.type === "error") {
            throw new Error(ev.message);
          }
        }
      }
      speak(full);
      loadConversations();
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        update((m) => ({
          ...m,
          error: true,
          content: (m.content ? m.content + "\n\n" : "") + `⚠ ${err?.message ?? "Error de conexión"}`,
        }));
      }
    } finally {
      setBusy(false);
      setToolLabel(null);
      abortRef.current = null;
    }
  };

  const toggleListen = () => {
    if (listening) {
      recogRef.current?.stop();
      return;
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      alert("Tu navegador no soporta reconocimiento de voz. Prueba con Chrome o Edge.");
      return;
    }
    const r = new SR();
    r.lang = "es-ES";
    r.interimResults = true;
    r.continuous = false;
    let finalText = "";
    r.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t;
        else interim += t;
      }
      setInput(finalText + interim);
    };
    r.onend = () => {
      setListening(false);
      if (finalText.trim()) send(finalText);
    };
    r.onerror = () => setListening(false);
    recogRef.current = r;
    window.speechSynthesis?.cancel();
    setListening(true);
    r.start();
  };

  const toggleVoice = () => {
    const v = !voiceOn;
    setVoiceOn(v);
    if (!v) window.speechSynthesis?.cancel();
    try {
      localStorage.setItem("jarvis_voice", v ? "1" : "0");
    } catch {}
  };

  const logout = async () => {
    await fetch("/api/login", { method: "DELETE" });
    window.location.href = "/login";
  };

  const statusText = listening
    ? "ESCUCHANDO"
    : speaking
      ? "HABLANDO"
      : toolLabel
        ? toolLabel.toUpperCase()
        : busy
          ? "PROCESANDO"
          : "EN LÍNEA";

  return (
    <div className="shell">
      <div className="bg-grid" aria-hidden />
      <div className="bg-glow" aria-hidden />

      {/* ───────────── Sidebar ───────────── */}
      <aside className={`sidebar ${sidebarOpen ? "sidebar--open" : ""}`}>
        <div className="brand">
          <Orb size={38} state={orbState} />
          <div>
            <div className="brand__name">J.A.R.V.I.S.</div>
            <div className="brand__sub">KratosLabs · Mistral Large</div>
          </div>
        </div>

        <button className="btn-new" onClick={newChat}>
          <span>＋</span> Nueva conversación
        </button>

        <div className="tabs">
          <button className={tab === "chats" ? "active" : ""} onClick={() => setTab("chats")}>Historial</button>
          <button className={tab === "memory" ? "active" : ""} onClick={() => setTab("memory")}>Memoria</button>
        </div>

        <div className="side-list">
          {tab === "chats" ? (
            conversations.length ? (
              conversations.map((c) => (
                <div
                  key={c.id}
                  className={`side-item ${c.id === activeId ? "side-item--active" : ""}`}
                  onClick={() => openConversation(c.id)}
                >
                  <span className="side-item__title">{c.title}</span>
                  <button
                    className="side-item__del"
                    title="Eliminar"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteConversation(c.id);
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))
            ) : (
              <p className="side-empty">Aún no hay conversaciones.</p>
            )
          ) : memories.length ? (
            memories.map((m) => (
              <div key={m.id} className="side-item side-item--memory">
                <span className="side-item__title">{m.content}</span>
                <button className="side-item__del" title="Olvidar" onClick={() => deleteMemory(m.id)}>
                  ✕
                </button>
              </div>
            ))
          ) : (
            <p className="side-empty">
              Jarvis guardará aquí lo que aprenda de ti. Prueba: “Recuerda que prefiero respuestas breves”.
            </p>
          )}
        </div>

        <div className="side-footer">
          <button className="btn-ghost" onClick={logout}>⏻ Cerrar sesión</button>
        </div>
      </aside>
      {sidebarOpen && <div className="scrim" onClick={() => setSidebarOpen(false)} />}

      {/* ───────────── Main ───────────── */}
      <main className="main">
        <header className="hud">
          <button className="hud__menu" onClick={() => setSidebarOpen(true)} aria-label="Menú">☰</button>
          <div className="hud__status">
            <span className={`dot dot--${orbState}`} />
            {statusText}
          </div>
          <div className="hud__right">
            <span className="hud__clock">{clock}</span>
            <button
              className={`icon-btn ${voiceOn ? "icon-btn--on" : ""}`}
              onClick={toggleVoice}
              title={voiceOn ? "Voz activada" : "Voz desactivada"}
            >
              {voiceOn ? "🔊" : "🔈"}
            </button>
          </div>
        </header>

        <div className="scroll" ref={scrollRef}>
          {messages.length === 0 ? (
            <section className="welcome">
              <Orb size={240} state={orbState} />
              <h1>
                {hello}, <span className="accent">{userName}</span>.
              </h1>
              <p>Todos los sistemas operativos. ¿En qué puedo ayudarle hoy?</p>
              <div className="suggestions">
                {SUGGESTIONS.map((s) => (
                  <button key={s.text} className="chip" onClick={() => send(s.text)}>
                    <span className="chip__icon">{s.icon}</span>
                    {s.text}
                  </button>
                ))}
              </div>
            </section>
          ) : (
            <div className="thread">
              {messages.map((m, i) => (
                <div key={i} className={`msg msg--${m.role} ${m.error ? "msg--error" : ""}`}>
                  {m.role === "assistant" && (
                    <div className="msg__avatar">
                      <Orb size={30} state={i === messages.length - 1 ? orbState : "idle"} />
                    </div>
                  )}
                  <div className="msg__body">
                    {m.tools && m.tools.length > 0 && (
                      <div className="tools">
                        {m.tools.map((t, j) => (
                          <span key={j} className="tool-pill">⚙ {t}</span>
                        ))}
                      </div>
                    )}
                    {m.role === "assistant" ? (
                      m.content ? (
                        <Markdown>{m.content}</Markdown>
                      ) : (
                        <div className="typing"><span /><span /><span /></div>
                      )
                    ) : (
                      <p className="msg__text">{m.content}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <footer className="composer-wrap">
          <form
            className="composer"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <button
              type="button"
              className={`icon-btn mic ${listening ? "mic--on" : ""}`}
              onClick={toggleListen}
              title="Hablar"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <rect x="9" y="2" width="6" height="12" rx="3" />
                <path d="M5 10a7 7 0 0 0 14 0M12 17v5" />
              </svg>
            </button>
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              placeholder={listening ? "Escuchando…" : "Escriba un comando o pregunta…"}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            {busy ? (
              <button type="button" className="send send--stop" onClick={() => abortRef.current?.abort()} title="Detener">
                ■
              </button>
            ) : (
              <button type="submit" className="send" disabled={!input.trim()} title="Enviar">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                  <path d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12.6 2-12.6 2z" />
                </svg>
              </button>
            )}
          </form>
          <p className="hint">Mistral Large · Memoria persistente en Neon · Desplegado en Vercel</p>
        </footer>
      </main>
    </div>
  );
}
