import { createClient } from "@supabase/supabase-js";

/**
 * Service-role admin client.
 * WARNING: NEVER import or execute this file in client-side code!
 */
export function createAdminSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder-project.supabase.co";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    console.warn(
      "SUPABASE_SERVICE_ROLE_KEY is not defined in environment. Admin operations will be disabled."
    );
  }

  return createClient(supabaseUrl, serviceRoleKey || "placeholder-service-key", {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
