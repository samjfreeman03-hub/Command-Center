import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

async function expectedToken(): Promise<string> {
  const pw = process.env.ADMIN_PASSWORD ?? "";
  const data = new TextEncoder().encode(pw + "cc_session_v1");
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/s/") ||
    pathname.startsWith("/api/debug-pw") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const session = request.cookies.get("cc_session");
  if (session?.value && session.value === (await expectedToken())) {
    return NextResponse.next();
  }

  // API routes with a share token are validated inside the route handler
  if (pathname.startsWith("/api/") && request.headers.get("x-share-token")) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|_next/webpack-hmr|favicon.ico).*)"],
};
