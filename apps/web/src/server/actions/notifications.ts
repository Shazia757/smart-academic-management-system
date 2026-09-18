"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export interface SystemNotification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type:
    | "TIMETABLE_UPDATE"
    | "ROOM_CHANGE"
    | "CLASS_CANCELLED"
    | "ATTENDANCE_WARNING"
    | "ACADEMIC_ANNOUNCEMENT"
    | "SYSTEM";
  is_read: boolean;
  action_url: string | null;
  created_at: string;
}

/**
 * Retrieves notifications for the currently authenticated user.
 */
export async function getNotificationsAction(limit: number = 50): Promise<{
  success: boolean;
  data: SystemNotification[];
  unreadCount: number;
  error?: string;
}> {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return { success: false, data: [], unreadCount: 0, error: "Unauthorized" };
    }

    const { data: notifications, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[NOTIFICATIONS] Error fetching notifications:", error);
      return { success: false, data: [], unreadCount: 0, error: error.message };
    }

    const items = (notifications || []) as SystemNotification[];
    const unreadCount = items.filter((n) => !n.is_read).length;

    return {
      success: true,
      data: items,
      unreadCount,
    };
  } catch (err: any) {
    console.error("[NOTIFICATIONS] Unexpected error in getNotificationsAction:", err);
    return { success: false, data: [], unreadCount: 0, error: err?.message || "Internal error" };
  }
}

/**
 * Retrieves the count of unread notifications for the currently authenticated user.
 */
export async function getUnreadNotificationCountAction(): Promise<number> {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return 0;

    const { count, error } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_read", false);

    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Marks a specific notification as read.
 */
export async function markNotificationAsReadAction(notificationId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", notificationId)
      .eq("user_id", user.id);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath("/notifications");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || "Internal error" };
  }
}

/**
 * Marks all notifications as read for the current user.
 */
export async function markAllNotificationsAsReadAction(): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("is_read", false);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath("/notifications");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || "Internal error" };
  }
}
