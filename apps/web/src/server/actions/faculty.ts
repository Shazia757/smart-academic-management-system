"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAnyRole } from "@/lib/auth/session";
import { ADMIN_ROLES } from "@/lib/auth/roles";
import {
  FacultySchema,
  UpdateFacultySchema,
  FacultyInput,
  UpdateFacultyInput,
} from "@/server/validators/academic";
import { recordAuditLog } from "./audit";
import { ActionResult } from "./departments";
import { Faculty } from "@/types/database";

export async function createFacultyAction(
  rawInput: FacultyInput
): Promise<ActionResult<Faculty>> {
  try {
    const caller = await requireAnyRole(ADMIN_ROLES);
    const validation = FacultySchema.safeParse(rawInput);
    if (!validation.success) {
      return { success: false, error: validation.error.errors[0]?.message || "Invalid input" };
    }

    const input = validation.data;
    const supabase = await createServerSupabaseClient();

    // Check unique employee_id
    const { data: existing } = await supabase
      .from("faculty")
      .select("id")
      .eq("employee_id", input.employee_id.toUpperCase())
      .maybeSingle();

    if (existing) {
      return { success: false, error: `Employee ID '${input.employee_id}' is already registered.` };
    }

    const { data: faculty, error } = await supabase
      .from("faculty")
      .insert({
        employee_id: input.employee_id.toUpperCase(),
        department_id: input.department_id,
        designation: input.designation.trim(),
        qualification: input.qualification.trim(),
        specialization: input.specialization?.trim() || null,
        joining_date: input.joining_date || null,
        max_weekly_hours: input.max_weekly_hours,
        profile_id: input.profile_id || null,
        is_active: input.is_active ?? true,
      })
      .select()
      .single();

    if (error || !faculty) {
      return { success: false, error: error?.message || "Failed to register faculty member" };
    }

    await recordAuditLog({
      action: "CREATE_FACULTY",
      entityName: "faculty",
      entityId: faculty.id,
      newValues: faculty,
      userId: caller.id,
    });

    revalidatePath("/faculty");
    return { success: true, data: faculty as Faculty };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "An unexpected error occurred" };
  }
}

export async function updateFacultyAction(
  rawInput: UpdateFacultyInput
): Promise<ActionResult<Faculty>> {
  try {
    const caller = await requireAnyRole(ADMIN_ROLES);
    const validation = UpdateFacultySchema.safeParse(rawInput);
    if (!validation.success) {
      return { success: false, error: validation.error.errors[0]?.message || "Invalid input" };
    }

    const { id, ...updates } = validation.data;
    const supabase = await createServerSupabaseClient();

    const { data: oldFac } = await supabase.from("faculty").select("*").eq("id", id).single();
    if (!oldFac) return { success: false, error: "Faculty member not found." };

    // Check employee ID clash
    if (updates.employee_id && updates.employee_id.toUpperCase() !== oldFac.employee_id) {
      const { data: clash } = await supabase
        .from("faculty")
        .select("id")
        .eq("employee_id", updates.employee_id.toUpperCase())
        .neq("id", id)
        .maybeSingle();

      if (clash) {
        return { success: false, error: `Employee ID '${updates.employee_id}' is already registered to another faculty.` };
      }
    }

    const updatePayload: Record<string, unknown> = {};
    if (updates.employee_id !== undefined) updatePayload.employee_id = updates.employee_id.toUpperCase();
    if (updates.department_id !== undefined) updatePayload.department_id = updates.department_id;
    if (updates.designation !== undefined) updatePayload.designation = updates.designation.trim();
    if (updates.qualification !== undefined) updatePayload.qualification = updates.qualification.trim();
    if (updates.specialization !== undefined) updatePayload.specialization = updates.specialization?.trim() || null;
    if (updates.joining_date !== undefined) updatePayload.joining_date = updates.joining_date || null;
    if (updates.max_weekly_hours !== undefined) updatePayload.max_weekly_hours = updates.max_weekly_hours;
    if (updates.profile_id !== undefined) updatePayload.profile_id = updates.profile_id || null;
    if (updates.is_active !== undefined) updatePayload.is_active = updates.is_active;

    const { data: updated, error } = await supabase
      .from("faculty")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();

    if (error || !updated) {
      return { success: false, error: error?.message || "Failed to update faculty member" };
    }

    await recordAuditLog({
      action: "UPDATE_FACULTY",
      entityName: "faculty",
      entityId: id,
      oldValues: oldFac,
      newValues: updated,
      userId: caller.id,
    });

    revalidatePath("/faculty");
    return { success: true, data: updated as Faculty };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "An unexpected error occurred" };
  }
}

export async function toggleFacultyActiveAction(id: string, isActive: boolean): Promise<ActionResult> {
  try {
    const caller = await requireAnyRole(ADMIN_ROLES);
    const supabase = await createServerSupabaseClient();

    const { error } = await supabase.from("faculty").update({ is_active: isActive }).eq("id", id);
    if (error) return { success: false, error: error.message };

    await recordAuditLog({
      action: isActive ? "ACTIVATE_FACULTY" : "DEACTIVATE_FACULTY",
      entityName: "faculty",
      entityId: id,
      newValues: { is_active: isActive },
      userId: caller.id,
    });

    revalidatePath("/faculty");
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "An unexpected error occurred" };
  }
}
