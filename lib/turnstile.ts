// Cloudflare Turnstile server-side verification.
// Without TURNSTILE_SECRET_KEY the check is skipped ONLY outside production
// (local dev without keys keeps working); in production a missing secret
// rejects the request instead of silently disabling bot protection.

export async function verifyTurnstile(token: string | null | undefined): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("TURNSTILE_SECRET_KEY not set — skipping Turnstile verification");
      return true;
    }
    console.error("TURNSTILE_SECRET_KEY missing in production — rejecting request");
    return false;
  }
  if (!token) return false;

  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }),
    });
    const data = await res.json().catch(() => null);
    return data?.success === true;
  } catch (error) {
    console.error("Turnstile verification failed:", error);
    return false;
  }
}
