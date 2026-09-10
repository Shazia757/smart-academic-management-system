"use server";

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LoginSchema, LoginInput } from "@/server/validators/auth";

export interface AuthActionResult {
  success: boolean;
  error?: string;
  redirectTo?: string;
}

/**
 * Server Action: Authenticates a user using Supabase Auth and validates profile status.
 */
export async function loginAction(data: LoginInput): Promise<AuthActionResult> {
  try {
    // 1. Validate inputs via Zod
    const validation = LoginSchema.safeParse(data);
    if (!validation.success) {
      const firstError = validation.error.errors[0]?.message || "Invalid credentials provided";
      return { success: false, error: firstError };
    }

    const { email, password } = validation.data;

    // Check if Supabase URL is an unconfigured placeholder
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    if (!supabaseUrl || supabaseUrl.includes("placeholder-project.supabase.co")) {
      console.warn("[AUTH] Login failed: NEXT_PUBLIC_SUPABASE_URL is unconfigured or using placeholder.");
      return {
        success: false,
        error: "Supabase connection is not configured. Please set a valid NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in apps/web/.env.local.",
      };
    }

    const supabase = await createServerSupabaseClient();

    // 2. Perform Supabase authentication
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError || !authData.user) {
      const isConnectionError =
        authError?.name === "AuthRetryableFetchError" ||
        authError?.message?.toLowerCase().includes("fetch");

      if (process.env.NODE_ENV === "development") {
        console.warn(`[AUTH] Supabase authentication failed for ${email}: ${authError?.name} - ${authError?.message}`);
      }

      return {
        success: false,
        error: isConnectionError
          ? "Unable to reach the Supabase authentication server. Please check your network connection and Supabase URL configuration."
          : authError?.message || "Invalid email address or password.",
      };
    }

    // 3. Check profile status in public.profiles
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, role, is_active")
      .eq("id", authData.user.id)
      .single();

    if (profileError || !profile) {
      // If user exists in Auth but profile not yet provisioned, sign out and error
      await supabase.auth.signOut();
      return {
        success: false,
        error: "User profile record not found. Please contact your system administrator.",
      };
    }

    if (!profile.is_active) {
      await supabase.auth.signOut();
      return {
        success: false,
        error: "Your academic account has been suspended. Please contact your administration.",
      };
    }

    return {
      success: true,
      redirectTo: "/",
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "An unexpected authentication error occurred.";
    return { success: false, error: message };
  }
}

/**
 * Server Action: Signs out the active user and clears session cookies.
 */
export async function logoutAction(): Promise<void> {
  try {
    const supabase = await createServerSupabaseClient();
    await supabase.auth.signOut();
  } catch (err) {
    console.error("Error during sign out:", err);
  }

  redirect("/login");
}
