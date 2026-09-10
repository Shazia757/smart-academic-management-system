"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAnyRole } from "@/lib/auth/session";
import { ADMIN_ROLES } from "@/lib/auth/roles";
import {
  StudentEnrollmentSchema,
  UpdateStudentEnrollmentSchema,
  StudentEnrollmentInput,
} from "@/server/validators/academic";
import { recordAuditLog } from "./audit";
import { ActionResult } from "./departments";
import { StudentEnrollment } from "@/types/database";

export async function enrollStudentAction(
  rawInput: StudentEnrollmentInput
): Promise<ActionResult<StudentEnrollment>> {
  try {
    const caller = await requireAnyRole(ADMIN_ROLES);
    const validation = StudentEnrollmentSchema.safeParse(rawInput);
    if (!validation.success) {
      return { success: false, error: validation.error.errors[0]?.message || "Invalid input" };
    }

    const input = validation.data;
    const supabase = await createServerSupabaseClient();

    // Check duplicate enrollment for (student_id, subject_id, semester_id)
    const { data: existing } = await supabase
      .from("student_enrollments")
      .select("id")
      .eq("student_id", input.student_id)
      .eq("subject_id", input.subject_id)
      .eq("semester_id", input.semester_id)
      .maybeSingle();

    if (existing) {
      return { success: false, error: "Student is already enrolled in this subject for this semester." };
    }

    const { data: enrollment, error } = await supabase
      .from("student_enrollments")
      .insert({
        student_id: input.student_id,
        subject_id: input.subject_id,
        section_id: input.section_id,
        semester_id: input.semester_id,
        academic_year_id: input.academic_year_id,
        is_active: input.is_active ?? true,
      })
      .select()
      .single();

    if (error || !enrollment) {
      return { success: false, error: error?.message || "Failed to enroll student" };
    }

    await recordAuditLog({
      action: "ENROLL_STUDENT",
      entityName: "student_enrollments",
      entityId: enrollment.id,
      newValues: enrollment,
      userId: caller.id,
    });

    revalidatePath("/enrollments");
    return { success: true, data: enrollment as StudentEnrollment };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "An unexpected error occurred" };
  }
}

export async function unenrollStudentAction(id: string): Promise<ActionResult> {
  try {
    const caller = await requireAnyRole(ADMIN_ROLES);
    const supabase = await createServerSupabaseClient();

    const { data: existing } = await supabase.from("student_enrollments").select("*").eq("id", id).single();
    if (!existing) return { success: false, error: "Enrollment record not found." };

    const { error } = await supabase.from("student_enrollments").delete().eq("id", id);
    if (error) return { success: false, error: error.message };

    await recordAuditLog({
      action: "UNENROLL_STUDENT",
      entityName: "student_enrollments",
      entityId: id,
      oldValues: existing,
      userId: caller.id,
    });

    revalidatePath("/enrollments");
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "An unexpected error occurred" };
  }
}

/**
 * Bulk enrolls all active students in a cohort class section into a curriculum subject.
 */
export async function bulkEnrollCohortAction(
  sectionId: string,
  subjectId: string,
  semesterId: string,
  academicYearId: string
): Promise<ActionResult<{ count: number }>> {
  try {
    const caller = await requireAnyRole(ADMIN_ROLES);
    const supabase = await createServerSupabaseClient();

    // Fetch all active students in this section
    const { data: students } = await supabase
      .from("students")
      .select("id")
      .eq("current_section_id", sectionId)
      .eq("is_active", true);

    if (!students || students.length === 0) {
      return { success: false, error: "No active students found in this section cohort." };
    }

    const payload = students.map((s) => ({
      student_id: s.id,
      subject_id: subjectId,
      section_id: sectionId,
      semester_id: semesterId,
      academic_year_id: academicYearId,
      is_active: true,
    }));

    const { data: enrolled, error } = await supabase
      .from("student_enrollments")
      .upsert(payload, { onConflict: "student_id,subject_id,semester_id" })
      .select("id");

    if (error) return { success: false, error: error.message };

    const count = enrolled?.length || 0;

    await recordAuditLog({
      action: "BULK_ENROLL_COHORT",
      entityName: "student_enrollments",
      newValues: { sectionId, subjectId, count },
      userId: caller.id,
    });

    revalidatePath("/enrollments");
    return { success: true, data: { count } };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "An unexpected error occurred" };
  }
}
