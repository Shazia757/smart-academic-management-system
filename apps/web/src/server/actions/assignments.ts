"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAnyRole } from "@/lib/auth/session";
import { ADMIN_ROLES } from "@/lib/auth/roles";
import {
  FacultySubjectSchema,
  UpdateFacultySubjectSchema,
  FacultySubjectInput,
  UpdateFacultySubjectInput,
} from "@/server/validators/academic";
import { recordAuditLog } from "./audit";
import { ActionResult } from "./departments";
import { FacultySubject } from "@/types/database";

export async function assignFacultySubjectAction(
  rawInput: FacultySubjectInput
): Promise<ActionResult<FacultySubject>> {
  try {
    const caller = await requireAnyRole(ADMIN_ROLES);
    const validation = FacultySubjectSchema.safeParse(rawInput);
    if (!validation.success) {
      return { success: false, error: validation.error.errors[0]?.message || "Invalid input" };
    }

    const input = validation.data;
    const supabase = await createServerSupabaseClient();

    // Prevent duplicate assignment for same faculty, subject, section, year
    const { data: existing } = await supabase
      .from("faculty_subjects")
      .select("id")
      .eq("faculty_id", input.faculty_id)
      .eq("subject_id", input.subject_id)
      .eq("section_id", input.section_id)
      .eq("academic_year_id", input.academic_year_id)
      .maybeSingle();

    if (existing) {
      return { success: false, error: "This faculty member is already assigned to this subject and section." };
    }

    const { data: assignment, error } = await supabase
      .from("faculty_subjects")
      .insert({
        faculty_id: input.faculty_id,
        subject_id: input.subject_id,
        section_id: input.section_id,
        academic_year_id: input.academic_year_id,
        semester_id: input.semester_id,
        is_primary: input.is_primary,
        status: input.status || "ASSIGNED",
      })
      .select()
      .single();

    if (error || !assignment) {
      return { success: false, error: error?.message || "Failed to create assignment" };
    }

    await recordAuditLog({
      action: "ASSIGN_FACULTY_SUBJECT",
      entityName: "faculty_subjects",
      entityId: assignment.id,
      newValues: assignment,
      userId: caller.id,
    });

    revalidatePath("/assignments");
    return { success: true, data: assignment as FacultySubject };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "An unexpected error occurred" };
  }
}

export async function updateFacultyAssignmentAction(
  rawInput: UpdateFacultySubjectInput
): Promise<ActionResult<FacultySubject>> {
  try {
    const caller = await requireAnyRole(ADMIN_ROLES);
    const validation = UpdateFacultySubjectSchema.safeParse(rawInput);
    if (!validation.success) {
      return { success: false, error: validation.error.errors[0]?.message || "Invalid input" };
    }

    const { id, ...updates } = validation.data;
    const supabase = await createServerSupabaseClient();

    const { data: oldAssignment } = await supabase.from("faculty_subjects").select("*").eq("id", id).single();
    if (!oldAssignment) return { success: false, error: "Assignment record not found." };

    const { data: updated, error } = await supabase
      .from("faculty_subjects")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error || !updated) {
      return { success: false, error: error?.message || "Failed to update assignment" };
    }

    await recordAuditLog({
      action: "UPDATE_FACULTY_ASSIGNMENT",
      entityName: "faculty_subjects",
      entityId: id,
      oldValues: oldAssignment,
      newValues: updated,
      userId: caller.id,
    });

    revalidatePath("/assignments");
    return { success: true, data: updated as FacultySubject };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "An unexpected error occurred" };
  }
}

export async function revokeFacultyAssignmentAction(id: string): Promise<ActionResult> {
  try {
    const caller = await requireAnyRole(ADMIN_ROLES);
    const supabase = await createServerSupabaseClient();

    const { data: existing } = await supabase.from("faculty_subjects").select("*").eq("id", id).single();
    if (!existing) return { success: false, error: "Assignment not found." };

    const { error } = await supabase.from("faculty_subjects").delete().eq("id", id);
    if (error) return { success: false, error: error.message };

    await recordAuditLog({
      action: "REVOKE_FACULTY_ASSIGNMENT",
      entityName: "faculty_subjects",
      entityId: id,
      oldValues: existing,
      userId: caller.id,
    });

    revalidatePath("/assignments");
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "An unexpected error occurred" };
  }
}
