"use client";

import { useState, FormEvent, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong");
        return;
      }
      setDone(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="rounded bg-red-500/10 p-4 text-center text-sm text-red-400">
        This reset link is invalid — request a new one from the{" "}
        <Link href="/forgot-password" className="underline">
          reset page
        </Link>
        .
      </div>
    );
  }

  if (done) {
    return (
      <div className="space-y-4 text-center">
        <div className="rounded bg-green-500/10 p-4 text-sm text-green-400">
          Your password was updated successfully.
        </div>
        <Link
          href="/login"
          className="inline-block w-full rounded bg-white py-3 font-semibold text-black transition-opacity hover:opacity-90"
        >
          Sign In
        </Link>
      </div>
    );
  }

  return (
    <>
      {error && (
        <div className="mb-4 rounded bg-red-500/10 p-3 text-sm text-red-400">{error}</div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="password"
          placeholder="New password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          className="w-full rounded border border-white/20 bg-white/5 px-4 py-3 text-white placeholder-white/40 outline-none focus:border-white/50"
        />
        <input
          type="password"
          placeholder="Confirm new password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          minLength={6}
          className="w-full rounded border border-white/20 bg-white/5 px-4 py-3 text-white placeholder-white/40 outline-none focus:border-white/50"
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-white py-3 font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Updating..." : "Update password"}
        </button>
      </form>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Image src="/logo_nettnett.jpg" alt="NettNett" width={180} height={60} priority />
        </div>

        <div className="rounded-lg border border-white/10 bg-white/5 p-8">
          <h1 className="mb-6 text-center text-2xl font-bold">New password</h1>
          <Suspense fallback={<p className="text-center text-sm text-white/40">Loading...</p>}>
            <ResetPasswordForm />
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
