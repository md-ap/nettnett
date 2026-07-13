"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Turnstile from "./Turnstile";

const TURNSTILE_ENABLED = !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

export default function AuthForm() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  // Turnstile tokens are single-use: bump the key after a failed submit so
  // the widget remounts and issues a fresh token
  const [turnstileKey, setTurnstileKey] = useState(0);
  const [error, setError] = useState("");
  const [needsVerification, setNeedsVerification] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  function resetTurnstile() {
    if (!TURNSTILE_ENABLED) return;
    setTurnstileToken("");
    setTurnstileKey((k) => k + 1);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const endpoint = isLogin ? "/api/auth/login" : "/api/auth/register";
      const body = isLogin
        ? { email, password, turnstileToken }
        : { email, password, firstName, lastName, turnstileToken };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong");
        setNeedsVerification(!!data.needsVerification);
        resetTurnstile();
        return;
      }

      router.push("/dashboard");
    } catch {
      setError("Network error. Please try again.");
      resetTurnstile();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-8">
      <h1 className="mb-6 text-center text-2xl font-bold">
        {isLogin ? "Sign In" : "Create Account"}
      </h1>

      {error && (
        <div className="mb-4 rounded bg-red-500/10 p-3 text-sm text-red-400">
          {error}
          {needsVerification && (
            <p className="mt-2">
              <Link href="/verify-email" className="text-white underline">
                Resend confirmation email →
              </Link>
            </p>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {!isLogin && (
          <>
            <input
              type="text"
              placeholder="Nombre"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required={!isLogin}
              className="w-full rounded border border-white/20 bg-white/5 px-4 py-3 text-white placeholder-white/40 outline-none focus:border-white/50"
            />
            <input
              type="text"
              placeholder="Apellido"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required={!isLogin}
              className="w-full rounded border border-white/20 bg-white/5 px-4 py-3 text-white placeholder-white/40 outline-none focus:border-white/50"
            />
          </>
        )}
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full rounded border border-white/20 bg-white/5 px-4 py-3 text-white placeholder-white/40 outline-none focus:border-white/50"
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          className="w-full rounded border border-white/20 bg-white/5 px-4 py-3 text-white placeholder-white/40 outline-none focus:border-white/50"
        />
        <Turnstile key={turnstileKey} onToken={setTurnstileToken} />
        <button
          type="submit"
          disabled={loading || (TURNSTILE_ENABLED && !turnstileToken)}
          className="w-full rounded bg-white py-3 font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Loading..." : isLogin ? "Sign In" : "Register"}
        </button>
      </form>

      {isLogin && (
        <p className="mt-3 text-center text-sm">
          <Link href="/forgot-password" className="text-white/50 hover:text-white/80 transition-colors">
            Forgot your password?
          </Link>
        </p>
      )}

      <p className="mt-6 text-center text-sm text-white/60">
        {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
        <button
          onClick={() => {
            setIsLogin(!isLogin);
            setError("");
          }}
          className="text-white underline"
        >
          {isLogin ? "Register" : "Sign In"}
        </button>
      </p>
    </div>
  );
}
