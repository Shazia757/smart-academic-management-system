"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAnyRole } from "@/lib/auth/session";
import { ADMIN_ROLES } from "@/lib/auth/roles";
import {
  AcademicYearSchema,
  UpdateAcademicYearSchema,
  SemesterSchema,
  UpdateSemesterSchema,
  ClassSectionSchema,
  UpdateClassSectionSchema,
  AcademicYearInput,
  UpdateAcademicYearInput,
  SemesterInput,
  UpdateSemesterInput,
  ClassSectionInput,
  UpdateClassSectionInput,
} from "@/server/validators/academic";
import { recordAuditLog } from "./audit";
import { ActionResult } from "./departments";
import { AcademicYear, Semester, ClassSection } from "@/types/database";

// =============================================================================
// ACADEMIC YEARS ACTIONS
// =============================================================================

export async function createAcademicYearAction(
  rawInput: AcademicYearInput
): Promise<ActionResult<AcademicYear>> {
  try {
    const caller = await requireAnyRole(ADMIN_ROLES);
    const validation = AcademicYearSchema.safeParse(rawInput);
    if (!validation.success) {
      return { success: false, error: validation.error.errors[0]?.message || "Invalid input" };
    }

    const input = validation.data;
    const supabase = await createServerSupabaseClient();

    // If marked current, unset other current years first to honor single-current rule
    if (input.is_current) {
      await supabase.from("academic_years").update({ is_current: false }).eq("is_current", true);
    }

    const { data: academicYear, error } = await supabase
      .from("academic_years")
      .insert({
        name: input.name,
        start_date: input.start_date,
        end_date: input.end_date,
        is_current: input.is_current ?? false,
        is_active: input.is_active ?? true,
      })
      .select()
      .single();

    if (error || !academicYear) {
      return { success: false, error: error?.message || "Failed to create academic year" };
    }

    await recordAuditLog({
      action: "CREATE_ACADEMIC_YEAR",
      entityName: "academic_years",
      entityId: academicYear.id,
      newValues: academicYear,
      userId: caller.id,
    });

    revalidatePath("/academic-structure");
    return { success: true, data: academicYear as AcademicYear };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "An unexpected error occurred" };
  }
}

export async function updateAcademicYearAction(
  rawInput: UpdateAcademicYearInput
): Promise<ActionResult<AcademicYear>> {
  try {
    const caller = await requireAnyRole(ADMIN_ROLES);
    const validation = UpdateAcademicYearSchema.safeParse(rawInput);
    if (!validation.success) {
      return { success: false, error: validation.error.errors[0]?.message || "Invalid input" };
    }

    const { id, ...updates } = validation.data;
    const supabase = await createServerSupabaseClient();

    const { data: oldYear } = await supabase.from("academic_years").select("*").eq("id", id).single();
    if (!oldYear) return { success: false, error: "Academic year not found." };

    if (updates.is_current) {
      await supabase.from("academic_years").update({ is_current: false }).neq("id", id);
    }

    const { data: updated, error } = await supabase
      .from("academic_years")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error || !updated) {
      return { success: false, error: error?.message || "Failed to update academic year" };
    }

    await recordAuditLog({
      action: "UPDATE_ACADEMIC_YEAR",
      entityName: "academic_years",
      entityId: id,
      oldValues: oldYear,
      newValues: updated,
      userId: caller.id,
    });

    revalidatePath("/academic-structure");
    return { success: true, data: updated as AcademicYear };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "An unexpected error occurred" };
  }
}

export async function toggleAcademicYearActiveAction(id: string, isActive: boolean): Promise<ActionResult> {
  try {
    const caller = await requireAnyRole(ADMIN_ROLES);
    const supabase = await createServerSupabaseClient();

    const { error } = await supabase.from("academic_years").update({ is_active: isActive }).eq("id", id);
    if (error) return { success: false, error: error.message };

    await recordAuditLog({
      action: isActive ? "ACTIVATE_ACADEMIC_YEAR" : "DEACTIVATE_ACADEMIC_YEAR",
      entityName: "academic_years",
      entityId: id,
      newValues: { is_active: isActive },
      userId: caller.id,
    });

    revalidatePath("/academic-structure");
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "An unexpected error occurred" };
  }
}

// =============================================================================
// SEMESTERS ACTIONS
// =============================================================================

export async function createSemesterAction(rawInput: SemesterInput): Promise<ActionResult<Semester>> {
  try {
    const caller = await requireAnyRole(ADMIN_ROLES);
    const validation = SemesterSchema.safeParse(rawInput);
    if (!validation.success) {
      return { success: false, error: validation.error.errors[0]?.message || "Invalid input" };
    }

    const input = validation.data;
    const supabase = await createServerSupabaseClient();

    // Check duplicate semester number within same academic year
    const { data: existing } = await supabase
      .from("semesters")
      .select("id")
      .eq("academic_year_id", input.academic_year_id)
      .eq("semester_number", input.semester_number)
      .maybeSingle();

    if (existing) {
      return { success: false, error: `Semester ${input.semester_number} already exists for this academic year.` };
    }

    const { data: semester, error } = await supabase
      .from("semesters")
      .insert({
        academic_year_id: input.academic_year_id,
        name: input.name,
        semester_number: input.semester_number,
        term_type: input.term_type,
        start_date: input.start_date,
        end_date: input.end_date,
        is_active: input.is_active ?? true,
      })
      .select()
      .single();

    if (error || !semester) {
      return { success: false, error: error?.message || "Failed to create semester" };
    }

    await recordAuditLog({
      action: "CREATE_SEMESTER",
      entityName: "semesters",
      entityId: semester.id,
      newValues: semester,
      userId: caller.id,
    });

    revalidatePath("/academic-structure");
    return { success: true, data: semester as Semester };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "An unexpected error occurred" };
  }
}

export async function updateSemesterAction(rawInput: UpdateSemesterInput): Promise<ActionResult<Semester>> {
  try {
    const caller = await requireAnyRole(ADMIN_ROLES);
    const validation = UpdateSemesterSchema.safeParse(rawInput);
    if (!validation.success) {
      return { success: false, error: validation.error.errors[0]?.message || "Invalid input" };
    }

    const { id, ...updates } = validation.data;
    const supabase = await createServerSupabaseClient();

    const { data: oldSem } = await supabase.from("semesters").select("*").eq("id", id).single();
    if (!oldSem) return { success: false, error: "Semester not found." };

    const { data: updated, error } = await supabase
      .from("semesters")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error || !updated) {
      return { success: false, error: error?.message || "Failed to update semester" };
    }

    await recordAuditLog({
      action: "UPDATE_SEMESTER",
      entityName: "semesters",
      entityId: id,
      oldValues: oldSem,
      newValues: updated,
      userId: caller.id,
    });

    revalidatePath("/academic-structure");
    return { success: true, data: updated as Semester };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "An unexpected error occurred" };
  }
}

export async function toggleSemesterActiveAction(id: string, isActive: boolean): Promise<ActionResult> {
  try {
    const caller = await requireAnyRole(ADMIN_ROLES);
    const supabase = await createServerSupabaseClient();

    const { error } = await supabase.from("semesters").update({ is_active: isActive }).eq("id", id);
    if (error) return { success: false, error: error.message };

    await recordAuditLog({
      action: isActive ? "ACTIVATE_SEMESTER" : "DEACTIVATE_SEMESTER",
      entityName: "semesters",
      entityId: id,
      newValues: { is_active: isActive },
      userId: caller.id,
    });

    revalidatePath("/academic-structure");
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "An unexpected error occurred" };
  }
}

// =============================================================================
// CLASS SECTIONS ACTIONS
// =============================================================================

export async function createClassSectionAction(rawInput: ClassSectionInput): Promise<ActionResult<ClassSection>> {
  try {
    const caller = await requireAnyRole(ADMIN_ROLES);
    const validation = ClassSectionSchema.safeParse(rawInput);
    if (!validation.success) {
      return { success: false, error: validation.error.errors[0]?.message || "Invalid input" };
    }

    const input = validation.data;
    const supabase = await createServerSupabaseClient();

    // Check duplicate section within same department, academic year, semester, and name
    const { data: existing } = await supabase
      .from("class_sections")
      .select("id")
      .eq("department_id", input.department_id)
      .eq("academic_year_id", input.academic_year_id)
      .eq("semester_id", input.semester_id)
      .eq("name", input.name.trim())
      .maybeSingle();

    if (existing) {
      return {
        success: false,
        error: `Section '${input.name}' already exists in this department for the selected semester.`,
      };
    }

    const { data: section, error } = await supabase
      .from("class_sections")
      .insert({
        department_id: input.department_id,
        academic_year_id: input.academic_year_id,
        semester_id: input.semester_id,
        name: input.name.trim(),
        code: input.code.trim().toUpperCase(),
        capacity: input.capacity,
        is_active: input.is_active ?? true,
      })
      .select()
      .single();

    if (error || !section) {
      return { success: false, error: error?.message || "Failed to create class section" };
    }

    await recordAuditLog({
      action: "CREATE_CLASS_SECTION",
      entityName: "class_sections",
      entityId: section.id,
      newValues: section,
      userId: caller.id,
    });

    revalidatePath("/academic-structure");
    return { success: true, data: section as ClassSection };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "An unexpected error occurred" };
  }
}

export async function updateClassSectionAction(rawInput: UpdateClassSectionInput): Promise<ActionResult<ClassSection>> {
  try {
    const caller = await requireAnyRole(ADMIN_ROLES);
    const validation = UpdateClassSectionSchema.safeParse(rawInput);
    if (!validation.success) {
      return { success: false, error: validation.error.errors[0]?.message || "Invalid input" };
    }

    const { id, ...updates } = validation.data;
    const supabase = await createServerSupabaseClient();

    const { data: oldSec } = await supabase.from("class_sections").select("*").eq("id", id).single();
    if (!oldSec) return { success: false, error: "Class section not found." };

    const { data: updated, error } = await supabase
      .from("class_sections")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error || !updated) {
      return { success: false, error: error?.message || "Failed to update class section" };
    }

    await recordAuditLog({
      action: "UPDATE_CLASS_SECTION",
      entityName: "class_sections",
      entityId: id,
      oldValues: oldSec,
      newValues: updated,
      userId: caller.id,
    });

    revalidatePath("/academic-structure");
    return { success: true, data: updated as ClassSection };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "An unexpected error occurred" };
  }
}

export async function toggleClassSectionActiveAction(id: string, isActive: boolean): Promise<ActionResult> {
  try {
    const caller = await requireAnyRole(ADMIN_ROLES);
    const supabase = await createServerSupabaseClient();

    const { error } = await supabase.from("class_sections").update({ is_active: isActive }).eq("id", id);
    if (error) return { success: false, error: error.message };

    await recordAuditLog({
      action: isActive ? "ACTIVATE_CLASS_SECTION" : "DEACTIVATE_CLASS_SECTION",
      entityName: "class_sections",
      entityId: id,
      newValues: { is_active: isActive },
      userId: caller.id,
    });

    revalidatePath("/academic-structure");
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "An unexpected error occurred" };
  }
}
