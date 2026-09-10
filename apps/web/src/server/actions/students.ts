"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAnyRole } from "@/lib/auth/session";
import { ADMIN_ROLES } from "@/lib/auth/roles";
import {
  StudentSchema,
  UpdateStudentSchema,
  StudentInput,
  UpdateStudentInput,
} from "@/server/validators/academic";
import { recordAuditLog } from "./audit";
import { ActionResult } from "./departments";
import { Student } from "@/types/database";

export async function createStudentAction(
  rawInput: StudentInput
): Promise<ActionResult<Student>> {
  try {
    const caller = await requireAnyRole(ADMIN_ROLES);
    const validation = StudentSchema.safeParse(rawInput);
    if (!validation.success) {
      return { success: false, error: validation.error.errors[0]?.message || "Invalid input" };
    }

    const input = validation.data;
    const supabase = await createServerSupabaseClient();

    // Check USN uniqueness
    const { data: existingUsn } = await supabase
      .from("students")
      .select("id")
      .eq("usn", input.usn.toUpperCase())
      .maybeSingle();

    if (existingUsn) {
      return { success: false, error: `Student with USN '${input.usn}' is already registered.` };
    }

    // Check Roll number uniqueness within department
    const { data: existingRoll } = await supabase
      .from("students")
      .select("id")
      .eq("department_id", input.department_id)
      .eq("roll_number", input.roll_number.trim())
      .maybeSingle();

    if (existingRoll) {
      return { success: false, error: `Roll number '${input.roll_number}' already exists in this department.` };
    }

    const { data: student, error } = await supabase
      .from("students")
      .insert({
        roll_number: input.roll_number.trim(),
        usn: input.usn.toUpperCase(),
        department_id: input.department_id,
        current_semester_id: input.current_semester_id,
        current_section_id: input.current_section_id,
        admission_year: input.admission_year,
        admission_date: input.admission_date,
        guardian_name: input.guardian_name?.trim() || null,
        guardian_contact: input.guardian_contact?.trim() || null,
        profile_id: input.profile_id || null,
        is_active: input.is_active ?? true,
      })
      .select()
      .single();

    if (error || !student) {
      return { success: false, error: error?.message || "Failed to register student" };
    }

    await recordAuditLog({
      action: "CREATE_STUDENT",
      entityName: "students",
      entityId: student.id,
      newValues: student,
      userId: caller.id,
    });

    revalidatePath("/students");
    return { success: true, data: student as Student };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "An unexpected error occurred" };
  }
}

export async function updateStudentAction(
  rawInput: UpdateStudentInput
): Promise<ActionResult<Student>> {
  try {
    const caller = await requireAnyRole(ADMIN_ROLES);
    const validation = UpdateStudentSchema.safeParse(rawInput);
    if (!validation.success) {
      return { success: false, error: validation.error.errors[0]?.message || "Invalid input" };
    }

    const { id, ...updates } = validation.data;
    const supabase = await createServerSupabaseClient();

    const { data: oldStudent } = await supabase.from("students").select("*").eq("id", id).single();
    if (!oldStudent) return { success: false, error: "Student record not found." };

    // Check USN clash
    if (updates.usn && updates.usn.toUpperCase() !== oldStudent.usn) {
      const { data: clash } = await supabase
        .from("students")
        .select("id")
        .eq("usn", updates.usn.toUpperCase())
        .neq("id", id)
        .maybeSingle();

      if (clash) return { success: false, error: `USN '${updates.usn}' is already in use.` };
    }

    const updatePayload: Record<string, unknown> = {};
    if (updates.roll_number !== undefined) updatePayload.roll_number = updates.roll_number.trim();
    if (updates.usn !== undefined) updatePayload.usn = updates.usn.toUpperCase();
    if (updates.department_id !== undefined) updatePayload.department_id = updates.department_id;
    if (updates.current_semester_id !== undefined) updatePayload.current_semester_id = updates.current_semester_id;
    if (updates.current_section_id !== undefined) updatePayload.current_section_id = updates.current_section_id;
    if (updates.admission_year !== undefined) updatePayload.admission_year = updates.admission_year;
    if (updates.admission_date !== undefined) updatePayload.admission_date = updates.admission_date;
    if (updates.guardian_name !== undefined) updatePayload.guardian_name = updates.guardian_name?.trim() || null;
    if (updates.guardian_contact !== undefined) updatePayload.guardian_contact = updates.guardian_contact?.trim() || null;
    if (updates.profile_id !== undefined) updatePayload.profile_id = updates.profile_id || null;
    if (updates.is_active !== undefined) updatePayload.is_active = updates.is_active;

    const { data: updated, error } = await supabase
      .from("students")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();

    if (error || !updated) {
      return { success: false, error: error?.message || "Failed to update student" };
    }

    await recordAuditLog({
      action: "UPDATE_STUDENT",
      entityName: "students",
      entityId: id,
      oldValues: oldStudent,
      newValues: updated,
      userId: caller.id,
    });

    revalidatePath("/students");
    return { success: true, data: updated as Student };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "An unexpected error occurred" };
  }
}

export async function toggleStudentActiveAction(id: string, isActive: boolean): Promise<ActionResult> {
  try {
    const caller = await requireAnyRole(ADMIN_ROLES);
    const supabase = await createServerSupabaseClient();

    const { error } = await supabase.from("students").update({ is_active: isActive }).eq("id", id);
    if (error) return { success: false, error: error.message };

    await recordAuditLog({
      action: isActive ? "ACTIVATE_STUDENT" : "DEACTIVATE_STUDENT",
      entityName: "students",
      entityId: id,
      newValues: { is_active: isActive },
      userId: caller.id,
    });

    revalidatePath("/students");
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "An unexpected error occurred" };
  }
}
