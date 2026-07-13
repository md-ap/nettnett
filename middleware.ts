import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const token = request.cookies.get("nettnett_session")?.value;
  const isLoginPage = request.nextUrl.pathname === "/login";
  const isUpload = request.nextUrl.pathname.startsWith("/upload");
  const isManagement = request.nextUrl.pathname.startsWith("/management");
  const isAdmin = request.nextUrl.pathname.startsWith("/admin");
  const isAccount = request.nextUrl.pathname.startsWith("/account");

  // Logged-in users visiting /login → redirect to /upload
  if (isLoginPage && token) {
    return NextResponse.redirect(new URL("/upload", request.url));
  }

  // Unauthenticated users visiting protected routes → redirect to /login
  if ((isUpload || isManagement || isAdmin || isAccount) && !token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/login", "/upload/:path*", "/management/:path*", "/admin/:path*", "/account/:path*"],
};
