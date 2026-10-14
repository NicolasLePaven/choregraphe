import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

export async function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;
  const { pathname } = request.nextUrl;
  const isAuthPage = pathname === "/connexion" || pathname === "/inscription";

  if (!session && !isAuthPage) {
    return NextResponse.redirect(new URL("/connexion", request.url));
  }
  if (session && isAuthPage) {
    return NextResponse.redirect(new URL("/choregraphies", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.svg$).*)"],
};
