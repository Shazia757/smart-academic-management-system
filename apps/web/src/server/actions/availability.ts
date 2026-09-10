"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { hasAnyRole, ADMIN_ROLES } from "@/lib/auth/roles";
import {
  FacultyAvailabilitySchema,
  UpdateFacultyAvailabilitySchema,
  FacultyAvailabilityInput,
} from "@/server/validators/academic";
import { recordAuditLog } from "./audit";
import { ActionResult } from "./departments";
import { FacultyAvailability } from "@/types/database";

/**
 * Server Action: Creates or updates a weekly faculty availability slot.
 * Admins can configure for any faculty; Faculty members can ONLY configure for themselves.
 */
export async function saveFacultyAvailabilityAction(
  rawInput: FacultyAvailabilityInput
): Promise<ActionResult<FacultyAvailability>> {
  try {
    const caller = await requireUser();
    const validation = FacultyAvailabilitySchema.safeParse(rawInput);
    if (!validation.success) {
      return { success: false, error: validation.error.errors[0]?.message || "Invalid input" };
    }

    const input = validation.data;
    const supabase = await createServerSupabaseClient();
    const isAdmin = hasAnyRole(caller.role, ADMIN_ROLES);

    // Authorization verification:
    if (!isAdmin) {
      if (caller.role !== "faculty") {
        return { success: false, error: "Only teaching faculty and administrators can manage availability." };
      }

      // Verify the target faculty record belongs to the authenticated user
      const { data: ownFac } = await supabase
        .from("faculty")
        .select("id")
        .or(`profile_id.eq.${caller.id},id.eq.${caller.id}`)
        .eq("id", input.faculty_id)
        .maybeSingle();

      if (!ownFac) {
        return { success: false, error: "You are only permitted to configure your own weekly availability." };
      }
    }

    // Upsert availability record based on (faculty_id, day_of_week, period_slot)
    const { data: availability, error } = await supabase
      .from("faculty_availability")
      .upsert(
        {
          faculty_id: input.faculty_id,
          day_of_week: input.day_of_week,
          period_slot: input.period_slot,
          start_time: input.start_time || null,
          end_time: input.end_time || null,
          availability_status: input.availability_status,
          is_available: input.is_available,
          notes: input.notes?.trim() || null,
        },
        { onConflict: "faculty_id,day_of_week,period_slot" }
      )
      .select()
      .single();

    if (error || !availability) {
      return { success: false, error: error?.message || "Failed to save availability slot" };
    }

    await recordAuditLog({
      action: "SAVE_FACULTY_AVAILABILITY",
      entityName: "faculty_availability",
      entityId: availability.id,
      newValues: availability,
      userId: caller.id,
    });

    revalidatePath("/faculty/availability");
    return { success: true, data: availability as FacultyAvailability };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "An unexpected error occurred" };
  }
}

/**
 * Server Action: Removes an availability constraint or resets it to available.
 */
export async function deleteFacultyAvailabilityAction(
  id: string
): Promise<ActionResult> {
  try {
    const caller = await requireUser();
    const supabase = await createServerSupabaseClient();
    const isAdmin = hasAnyRole(caller.role, ADMIN_ROLES);

    // Fetch existing slot to check ownership
    const { data: existing } = await supabase
      .from("faculty_availability")
      .select("*, faculty:faculty(*)")
      .eq("id", id)
      .single();

    if (!existing) {
      return { success: false, error: "Availability slot not found." };
    }

    if (!isAdmin) {
      const fac = existing.faculty;
      const isOwner = fac?.profile_id === caller.id || fac?.id === caller.id;
      if (!isOwner) {
        return { success: false, error: "You cannot remove another faculty member's availability." };
      }
    }

    const { error } = await supabase.from("faculty_availability").delete().eq("id", id);
    if (error) return { success: false, error: error.message };

    await recordAuditLog({
      action: "DELETE_FACULTY_AVAILABILITY",
      entityName: "faculty_availability",
      entityId: id,
      oldValues: existing,
      userId: caller.id,
    });

    revalidatePath("/faculty/availability");
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "An unexpected error occurred" };
  }
}
