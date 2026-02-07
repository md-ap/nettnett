import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const token = request.cookies.get("nettnett_session")?.value;
  const isLoginPage = request.nextUrl.pathname === "/login";
  const isDashboard = request.nextUrl.pathname.startsWith("/dashboard");
  const isManagement = request.nextUrl.pathname.startsWith("/management");
  const isAdmin = request.nextUrl.pathname.startsWith("/admin");

  // Logged-in users visiting /login → redirect to /dashboard
  if (isLoginPage && token) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Unauthenticated users visiting protected routes → redirect to /login
  if ((isDashboard || isManagement || isAdmin) && !token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/login", "/dashboard/:path*", "/management/:path*", "/admin/:path*"],
};
