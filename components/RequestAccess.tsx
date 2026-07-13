"use client";

import { useState } from "react";

// Shown in the dashboard to plain "user" accounts (no permissions yet):
// a notice + button that emails the admins requesting a role.
export default function RequestAccess({ firstName }: { firstName: string }) {
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleRequest() {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/request-access", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong");
        return;
      }
      setSent(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <div className="rounded-lg border border-white/10 bg-white/5 p-8 text-center">
        <p className="mb-2 text-2xl">📻</p>
        <h1 className="mb-3 text-xl font-semibold text-white">
          Hola {firstName}, tu cuenta está lista
        </h1>
        <p className="mb-6 text-sm leading-relaxed text-white/50">
          Por ahora puedes escuchar la radio. Si deseas tener permisos de
          NettNett — subir audio y materiales al archivo, o participar en la
          gestión de la radio — envíanos una solicitud y un admin te asignará
          un rol.
        </p>

        {sent ? (
          <div className="rounded bg-green-500/10 p-4 text-sm text-green-400">
            ✓ Solicitud enviada — un admin la revisará pronto.
          </div>
        ) : (
          <>
            {error && (
              <div className="mb-4 rounded bg-red-500/10 p-3 text-sm text-red-400">
                {error}
              </div>
            )}
            <button
              onClick={handleRequest}
              disabled={loading}
              className="rounded bg-white px-6 py-3 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Enviando..." : "Enviar solicitud"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
