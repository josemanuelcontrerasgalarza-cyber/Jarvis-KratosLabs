"use client";

import { useState } from "react";
import { Orb } from "@/components/Orb";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) window.location.href = "/";
    else {
      setError("Acceso denegado. Clave incorrecta.");
      setLoading(false);
    }
  };

  return (
    <div className="login">
      <div className="bg-grid" aria-hidden />
      <div className="bg-glow" aria-hidden />
      <form className="login__card" onSubmit={submit}>
        <Orb size={150} state={loading ? "thinking" : "idle"} />
        <h1>J.A.R.V.I.S.</h1>
        <p>Verificación de identidad requerida</p>
        <input
          type="password"
          autoFocus
          placeholder="Clave de acceso"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <div className="login__error">{error}</div>}
        <button type="submit" disabled={loading || !password}>
          {loading ? "Verificando…" : "Iniciar sistema"}
        </button>
      </form>
    </div>
  );
}
