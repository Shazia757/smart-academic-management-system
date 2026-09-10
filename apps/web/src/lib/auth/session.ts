import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Profile, UserRole } from "@/types/database";
import { hasAnyRole } from "@/lib/auth/roles";

/**
 * Retrieves the raw authenticated user from the current Supabase session.
 * Returns null if the user is unauthenticated or session expired.
 */
export async function getCurrentUser() {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return null;
    }

    return user;
  } catch {
    return null;
  }
}

/**
 * Retrieves the full profile from public.profiles for the current authenticated user.
 * Returns null if unauthenticated or profile record not found.
 */
export async function getCurrentProfile(): Promise<Profile | null> {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return null;
    }

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (error || !profile) {
      return null;
    }

    return profile as Profile;
  } catch {
    return null;
  }
}

/**
 * Returns the active UserRole of the authenticated caller, or null.
 */
export async function getCurrentUserRole(): Promise<UserRole | null> {
  const profile = await getCurrentProfile();
  return profile?.role ?? null;
}

/**
 * Server-side guard requiring an authenticated active user.
 * Redirects to /login if unauthenticated.
 */
export async function requireUser(): Promise<Profile> {
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect("/login");
  }

  if (!profile.is_active) {
    redirect("/login?error=account_deactivated");
  }

  return profile;
}

/**
 * Server-side guard requiring a specific role.
 * Redirects to /unauthorized if the user does not possess the exact role.
 */
export async function requireRole(requiredRole: UserRole): Promise<Profile> {
  const profile = await requireUser();

  if (profile.role !== requiredRole) {
    redirect("/unauthorized");
  }

  return profile;
}

/**
 * Server-side guard requiring any of the specified roles.
 * Redirects to /unauthorized if the user does not possess an allowed role.
 */
export async function requireAnyRole(allowedRoles: UserRole[]): Promise<Profile> {
  const profile = await requireUser();

  if (!hasAnyRole(profile.role, allowedRoles)) {
    redirect("/unauthorized");
  }

  return profile;
}

/**
 * Resolves the authenticated user's linked academic faculty identity.
 * Handles both decoupled profile_id and fallback to id = auth.uid().
 */
export async function getCurrentFaculty() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "faculty") return null;

  try {
    const supabase = await createServerSupabaseClient();
    const { data: faculty } = await supabase
      .from("faculty")
      .select("*, department:departments(*)")
      .or(`profile_id.eq.${profile.id},id.eq.${profile.id}`)
      .eq("is_active", true)
      .maybeSingle();

    return faculty;
  } catch {
    return null;
  }
}

/**
 * Resolves the authenticated user's linked academic student identity.
 * Handles both decoupled profile_id and fallback to id = auth.uid().
 */
export async function getCurrentStudent() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "student") return null;

  try {
    const supabase = await createServerSupabaseClient();
    const { data: student } = await supabase
      .from("students")
      .select("*, department:departments(*), section:class_sections(*)")
      .or(`profile_id.eq.${profile.id},id.eq.${profile.id}`)
      .eq("is_active", true)
      .maybeSingle();

    return student;
  } catch {
    return null;
  }
}

