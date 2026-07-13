"use client";

import { useState, useEffect, FormEvent, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import Turnstile from "@/components/Turnstile";

const TURNSTILE_ENABLED = !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

// With a token in the URL: verify it automatically.
// Without one (or if it expired): form to resend the confirmation link.
function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [state, setState] = useState<"verifying" | "success" | "failed" | "resend">(
    token ? "verifying" : "resend"
  );
  const [error, setError] = useState("");

  // Resend form
  const [email, setEmail] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Verification failed");
          setState("failed");
          return;
        }
        setState("success");
      } catch {
        setError("Network error. Please try again.");
        setState("failed");
      }
    })();
  }, [token]);

  async function handleResend(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/resend-verification", {
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

  if (state === "verifying") {
    return (
      <div className="flex items-center justify-center gap-3 py-6">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
        <p className="text-sm text-white/50">Verifying your email...</p>
      </div>
    );
  }

  if (state === "success") {
    return (
      <div className="space-y-4 text-center">
        <div className="rounded bg-green-500/10 p-4 text-sm text-green-400">
          ✓ Your email is verified — your account is fully active.
        </div>
        <Link
          href="/dashboard"
          className="inline-block w-full rounded bg-white py-3 font-semibold text-black transition-opacity hover:opacity-90"
        >
          Go to my dashboard
        </Link>
      </div>
    );
  }

  // failed → show error + resend form; resend → just the form
  return (
    <>
      {state === "failed" && error && (
        <div className="mb-4 rounded bg-red-500/10 p-3 text-sm text-red-400">{error}</div>
      )}

      {sent ? (
        <div className="rounded bg-green-500/10 p-4 text-center text-sm text-green-400">
          If an unverified account exists for that email, a confirmation link is on its
          way. Check your inbox (and spam folder).
        </div>
      ) : (
        <>
          <p className="mb-4 text-center text-sm text-white/50">
            Enter your account email and we&apos;ll send you a new confirmation link.
          </p>
          {state === "resend" && error && (
            <div className="mb-4 rounded bg-red-500/10 p-3 text-sm text-red-400">
              {error}
            </div>
          )}
          <form onSubmit={handleResend} className="space-y-4">
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
              {loading ? "Sending..." : "Send confirmation link"}
            </button>
          </form>
        </>
      )}
    </>
  );
}

export default function VerifyEmailPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Image src="/logo_nettnett.jpg" alt="NettNett" width={180} height={60} priority />
        </div>

        <div className="rounded-lg border border-white/10 bg-white/5 p-8">
          <h1 className="mb-6 text-center text-2xl font-bold">Verify email</h1>
          <Suspense fallback={<p className="text-center text-sm text-white/40">Loading...</p>}>
            <VerifyEmailContent />
          </Suspense>
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
