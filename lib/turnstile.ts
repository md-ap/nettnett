// Cloudflare Turnstile server-side verification.
// If TURNSTILE_SECRET_KEY is not configured (e.g. local dev without keys),
// verification is skipped so the auth flows keep working.

export async function verifyTurnstile(token: string | null | undefined): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    console.warn("TURNSTILE_SECRET_KEY not set — skipping Turnstile verification");
    return true;
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
