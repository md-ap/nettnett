import { NextRequest } from "next/server";

// Trusted base URL for links we email out (verification, password reset,
// admin notifications). Never derived from the Host header in production —
// a spoofed Host would point a valid single-use token at an attacker's
// domain. Set APP_URL in the environment (e.g. https://nettnett.vercel.app).
export function getAppUrl(request: NextRequest): string {
  const configured = process.env.APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  if (process.env.NODE_ENV !== "production") {
    return new URL(request.url).origin;
  }

  // Vercel sets this automatically for production deployments
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;

  throw new Error("APP_URL is not configured");
}
