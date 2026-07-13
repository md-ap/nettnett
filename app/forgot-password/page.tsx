"use client";

import { useState, FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import Turnstile from "@/components/Turnstile";

const TURNSTILE_ENABLED = !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, turnstileToken }),
      });
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
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Image src="/logo_nettnett.jpg" alt="NettNett" width={180} height={60} priority />
        </div>

        <div className="rounded-lg border border-white/10 bg-white/5 p-8">
          <h1 className="mb-2 text-center text-2xl font-bold">Reset password</h1>
          <p className="mb-6 text-center text-sm text-white/50">
            Enter your account email and we&apos;ll send you a reset link.
          </p>

          {sent ? (
            <div className="rounded bg-green-500/10 p-4 text-center text-sm text-green-400">
              If an account exists for that email, a reset link is on its way.
              Check your inbox (and spam folder).
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-4 rounded bg-red-500/10 p-3 text-sm text-red-400">
                  {error}
                </div>
              )}
              <form onSubmit={handleSubmit} className="space-y-4">
                <input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full rounded border border-white/20 bg-white/5 px-4 py-3 text-white placeholder-white/40 outline-none focus:border-white/50"
                />
                <Turnstile onToken={setTurnstileToken} />
                <button
                  type="submit"
                  disabled={loading || (TURNSTILE_ENABLED && !turnstileToken)}
                  className="w-full rounded bg-white py-3 font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {loading ? "Sending..." : "Send reset link"}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-white/40">
          <Link href="/login" className="hover:text-white/60 transition-colors">
            ← Back to Sign In
          </Link>
        </p>
      </div>
    </div>
  );
}
