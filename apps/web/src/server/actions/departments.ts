"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAnyRole } from "@/lib/auth/session";
import { ADMIN_ROLES } from "@/lib/auth/roles";
import {
  DepartmentSchema,
  UpdateDepartmentSchema,
  DepartmentInput,
  UpdateDepartmentInput,
} from "@/server/validators/academic";
import { recordAuditLog } from "./audit";
import { Department } from "@/types/database";

export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Server Action: Creates a new academic department.
 * Restricted to Super Admin and College Admin.
 */
export async function createDepartmentAction(
  rawInput: DepartmentInput
): Promise<ActionResult<Department>> {
  try {
    const caller = await requireAnyRole(ADMIN_ROLES);

    const validation = DepartmentSchema.safeParse(rawInput);
    if (!validation.success) {
      return { success: false, error: validation.error.errors[0]?.message || "Invalid input" };
    }

    const input = validation.data;
    const supabase = await createServerSupabaseClient();

    // Check code uniqueness
    const { data: existing } = await supabase
      .from("departments")
      .select("id")
      .eq("code", input.code.toUpperCase())
      .maybeSingle();

    if (existing) {
      return { success: false, error: `Department with code '${input.code}' already exists.` };
    }

    const { data: department, error } = await supabase
      .from("departments")
      .insert({
        code: input.code.toUpperCase(),
        name: input.name,
        description: input.description || null,
        head_of_department_id: input.head_of_department_id || null,
        is_active: input.is_active ?? true,
      })
      .select()
      .single();

    if (error || !department) {
      return { success: false, error: error?.message || "Failed to create department" };
    }

    await recordAuditLog({
      action: "CREATE_DEPARTMENT",
      entityName: "departments",
      entityId: department.id,
      newValues: department,
      userId: caller.id,
    });

    revalidatePath("/departments");
    return { success: true, data: department as Department };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "An unexpected error occurred";
    return { success: false, error: message };
  }
}

/**
 * Server Action: Updates an existing academic department.
 * Restricted to Super Admin and College Admin.
 */
export async function updateDepartmentAction(
  rawInput: UpdateDepartmentInput
): Promise<ActionResult<Department>> {
  try {
    const caller = await requireAnyRole(ADMIN_ROLES);

    const validation = UpdateDepartmentSchema.safeParse(rawInput);
    if (!validation.success) {
      return { success: false, error: validation.error.errors[0]?.message || "Invalid input" };
    }

    const { id, ...updates } = validation.data;
    const supabase = await createServerSupabaseClient();

    // Fetch existing for audit
    const { data: oldDept } = await supabase.from("departments").select("*").eq("id", id).single();
    if (!oldDept) {
      return { success: false, error: "Department not found." };
    }

    // Check code uniqueness if changed
    if (updates.code && updates.code.toUpperCase() !== oldDept.code) {
      const { data: codeClash } = await supabase
        .from("departments")
        .select("id")
        .eq("code", updates.code.toUpperCase())
        .neq("id", id)
        .maybeSingle();

      if (codeClash) {
        return { success: false, error: `Department code '${updates.code}' is already in use.` };
      }
    }

    const updatePayload: Record<string, unknown> = {};
    if (updates.code !== undefined) updatePayload.code = updates.code.toUpperCase();
    if (updates.name !== undefined) updatePayload.name = updates.name;
    if (updates.description !== undefined) updatePayload.description = updates.description;
    if (updates.head_of_department_id !== undefined) updatePayload.head_of_department_id = updates.head_of_department_id;
    if (updates.is_active !== undefined) updatePayload.is_active = updates.is_active;

    const { data: updated, error } = await supabase
      .from("departments")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();

    if (error || !updated) {
      return { success: false, error: error?.message || "Failed to update department" };
    }

    await recordAuditLog({
      action: "UPDATE_DEPARTMENT",
      entityName: "departments",
      entityId: id,
      oldValues: oldDept,
      newValues: updated,
      userId: caller.id,
    });

    revalidatePath("/departments");
    return { success: true, data: updated as Department };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "An unexpected error occurred";
    return { success: false, error: message };
  }
}

/**
 * Server Action: Toggles active status of a department.
 * Prefer soft deactivation over hard deletion.
 */
export async function toggleDepartmentActiveAction(
  id: string,
  isActive: boolean
): Promise<ActionResult> {
  try {
    const caller = await requireAnyRole(ADMIN_ROLES);
    const supabase = await createServerSupabaseClient();

    const { error } = await supabase
      .from("departments")
      .update({ is_active: isActive })
      .eq("id", id);

    if (error) {
      return { success: false, error: error.message };
    }

    await recordAuditLog({
      action: isActive ? "ACTIVATE_DEPARTMENT" : "DEACTIVATE_DEPARTMENT",
      entityName: "departments",
      entityId: id,
      newValues: { is_active: isActive },
      userId: caller.id,
    });

    revalidatePath("/departments");
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "An unexpected error occurred";
    return { success: false, error: message };
  }
}
