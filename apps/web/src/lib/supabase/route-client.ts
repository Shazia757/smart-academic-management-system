import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";

/**
 * Creates a Supabase client suitable for Next.js Route Handlers.
 *
 * Supports both:
 * 1. Bearer token in incoming Authorization header (e.g. API clients, testing suites, external callers).
 * 2. Cookie-based authentication sessions (e.g. browser frontend requests).
 */
export async function createRouteHandlerSupabaseClient(request?: Request) {
  const cookieStore = await cookies();
  const headerStore = await headers();

  const authHeader =
    request?.headers.get("authorization") || headerStore.get("authorization");

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder-project.supabase.co";
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: authHeader ? { Authorization: authHeader } : undefined,
    },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(
        cookiesToSet: {
          name: string;
          value: string;
          options?: Parameters<typeof cookieStore.set>[2];
        }[]
      ) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Ignored in route handler if response is not setting cookies
        }
      },
    },
  });
}
