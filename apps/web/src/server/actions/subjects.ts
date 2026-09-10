"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAnyRole } from "@/lib/auth/session";
import { ADMIN_ROLES } from "@/lib/auth/roles";
import {
  SubjectSchema,
  UpdateSubjectSchema,
  SubjectInput,
  UpdateSubjectInput,
} from "@/server/validators/academic";
import { recordAuditLog } from "./audit";
import { ActionResult } from "./departments";
import { Subject } from "@/types/database";

export async function createSubjectAction(
  rawInput: SubjectInput
): Promise<ActionResult<Subject>> {
  try {
    const caller = await requireAnyRole(ADMIN_ROLES);
    const validation = SubjectSchema.safeParse(rawInput);
    if (!validation.success) {
      return { success: false, error: validation.error.errors[0]?.message || "Invalid input" };
    }

    const input = validation.data;
    const supabase = await createServerSupabaseClient();

    // Check unique subject code
    const { data: existing } = await supabase
      .from("subjects")
      .select("id")
      .eq("code", input.code.toUpperCase())
      .maybeSingle();

    if (existing) {
      return { success: false, error: `Subject code '${input.code}' already exists.` };
    }

    const isLab = input.subject_type === "LABORATORY" || input.is_lab;

    const { data: subject, error } = await supabase
      .from("subjects")
      .insert({
        code: input.code.toUpperCase(),
        name: input.name.trim(),
        department_id: input.department_id,
        semester_id: input.semester_id,
        credits: input.credits,
        lecture_hours_per_week: input.lecture_hours_per_week,
        lab_hours_per_week: input.lab_hours_per_week,
        total_weekly_periods: input.total_weekly_periods,
        is_lab: isLab,
        subject_type: input.subject_type,
        is_active: input.is_active ?? true,
      })
      .select()
      .single();

    if (error || !subject) {
      return { success: false, error: error?.message || "Failed to create subject" };
    }

    await recordAuditLog({
      action: "CREATE_SUBJECT",
      entityName: "subjects",
      entityId: subject.id,
      newValues: subject,
      userId: caller.id,
    });

    revalidatePath("/subjects");
    return { success: true, data: subject as Subject };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "An unexpected error occurred" };
  }
}

export async function updateSubjectAction(
  rawInput: UpdateSubjectInput
): Promise<ActionResult<Subject>> {
  try {
    const caller = await requireAnyRole(ADMIN_ROLES);
    const validation = UpdateSubjectSchema.safeParse(rawInput);
    if (!validation.success) {
      return { success: false, error: validation.error.errors[0]?.message || "Invalid input" };
    }

    const { id, ...updates } = validation.data;
    const supabase = await createServerSupabaseClient();

    const { data: oldSub } = await supabase.from("subjects").select("*").eq("id", id).single();
    if (!oldSub) return { success: false, error: "Subject not found." };

    if (updates.code && updates.code.toUpperCase() !== oldSub.code) {
      const { data: clash } = await supabase
        .from("subjects")
        .select("id")
        .eq("code", updates.code.toUpperCase())
        .neq("id", id)
        .maybeSingle();

      if (clash) return { success: false, error: `Subject code '${updates.code}' is already registered.` };
    }

    const updatePayload: Record<string, unknown> = {};
    if (updates.code !== undefined) updatePayload.code = updates.code.toUpperCase();
    if (updates.name !== undefined) updatePayload.name = updates.name.trim();
    if (updates.department_id !== undefined) updatePayload.department_id = updates.department_id;
    if (updates.semester_id !== undefined) updatePayload.semester_id = updates.semester_id;
    if (updates.credits !== undefined) updatePayload.credits = updates.credits;
    if (updates.lecture_hours_per_week !== undefined) updatePayload.lecture_hours_per_week = updates.lecture_hours_per_week;
    if (updates.lab_hours_per_week !== undefined) updatePayload.lab_hours_per_week = updates.lab_hours_per_week;
    if (updates.total_weekly_periods !== undefined) updatePayload.total_weekly_periods = updates.total_weekly_periods;
    if (updates.subject_type !== undefined) {
      updatePayload.subject_type = updates.subject_type;
      updatePayload.is_lab = updates.subject_type === "LABORATORY";
    }
    if (updates.is_lab !== undefined && updates.subject_type === undefined) updatePayload.is_lab = updates.is_lab;
    if (updates.is_active !== undefined) updatePayload.is_active = updates.is_active;

    const { data: updated, error } = await supabase
      .from("subjects")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();

    if (error || !updated) {
      return { success: false, error: error?.message || "Failed to update subject" };
    }

    await recordAuditLog({
      action: "UPDATE_SUBJECT",
      entityName: "subjects",
      entityId: id,
      oldValues: oldSub,
      newValues: updated,
      userId: caller.id,
    });

    revalidatePath("/subjects");
    return { success: true, data: updated as Subject };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "An unexpected error occurred" };
  }
}

export async function toggleSubjectActiveAction(id: string, isActive: boolean): Promise<ActionResult> {
  try {
    const caller = await requireAnyRole(ADMIN_ROLES);
    const supabase = await createServerSupabaseClient();

    const { error } = await supabase.from("subjects").update({ is_active: isActive }).eq("id", id);
    if (error) return { success: false, error: error.message };

    await recordAuditLog({
      action: isActive ? "ACTIVATE_SUBJECT" : "DEACTIVATE_SUBJECT",
      entityName: "subjects",
      entityId: id,
      newValues: { is_active: isActive },
      userId: caller.id,
    });

    revalidatePath("/subjects");
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "An unexpected error occurred" };
  }
}
