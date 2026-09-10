import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Always refresh session cookies via Supabase helper
  const { supabaseResponse, user } = await updateSession(request);

  // 2. Define public routes
  const isAuthRoute = pathname.startsWith("/login");
  const isPublicApi = pathname.startsWith("/api/health");
  const isUnauthorizedPage = pathname.startsWith("/unauthorized");

  // If user is already authenticated and visits /login, redirect to dashboard
  if (isAuthRoute && user) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Allow public routes without session check
  if (isAuthRoute || isPublicApi || isUnauthorizedPage) {
    return supabaseResponse;
  }

  // 3. For all other protected routes, require an authenticated session
  if (!user) {
    const redirectUrl = new URL("/login", request.url);
    if (pathname !== "/") {
      redirectUrl.searchParams.set("redirect", pathname);
    }
    return NextResponse.redirect(redirectUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - image formats (.svg, .png, .jpg, .jpeg, .gif, .webp)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
