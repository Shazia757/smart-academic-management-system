"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAnyRole } from "@/lib/auth/session";
import { ADMIN_ROLES } from "@/lib/auth/roles";
import {
  ClassroomSchema,
  UpdateClassroomSchema,
  ClassroomInput,
  UpdateClassroomInput,
} from "@/server/validators/academic";
import { recordAuditLog } from "./audit";
import { ActionResult } from "./departments";
import { Classroom } from "@/types/database";

export async function createClassroomAction(
  rawInput: ClassroomInput
): Promise<ActionResult<Classroom>> {
  try {
    const caller = await requireAnyRole(ADMIN_ROLES);
    const validation = ClassroomSchema.safeParse(rawInput);
    if (!validation.success) {
      return { success: false, error: validation.error.errors[0]?.message || "Invalid input" };
    }

    const input = validation.data;
    const supabase = await createServerSupabaseClient();

    // Check room number uniqueness
    const { data: existing } = await supabase
      .from("classrooms")
      .select("id")
      .eq("room_number", input.room_number.trim())
      .maybeSingle();

    if (existing) {
      return { success: false, error: `Room '${input.room_number}' already exists.` };
    }

    const { data: classroom, error } = await supabase
      .from("classrooms")
      .insert({
        room_number: input.room_number.trim(),
        building: input.building.trim(),
        floor: input.floor,
        room_type: input.room_type,
        capacity: input.capacity,
        facilities: input.facilities || [],
        department_id: input.department_id || null,
        is_available: input.is_available ?? true,
        is_active: input.is_active ?? true,
      })
      .select()
      .single();

    if (error || !classroom) {
      return { success: false, error: error?.message || "Failed to create classroom" };
    }

    await recordAuditLog({
      action: "CREATE_CLASSROOM",
      entityName: "classrooms",
      entityId: classroom.id,
      newValues: classroom,
      userId: caller.id,
    });

    revalidatePath("/classrooms");
    return { success: true, data: classroom as Classroom };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "An unexpected error occurred" };
  }
}

export async function updateClassroomAction(
  rawInput: UpdateClassroomInput
): Promise<ActionResult<Classroom>> {
  try {
    const caller = await requireAnyRole(ADMIN_ROLES);
    const validation = UpdateClassroomSchema.safeParse(rawInput);
    if (!validation.success) {
      return { success: false, error: validation.error.errors[0]?.message || "Invalid input" };
    }

    const { id, ...updates } = validation.data;
    const supabase = await createServerSupabaseClient();

    const { data: oldRoom } = await supabase.from("classrooms").select("*").eq("id", id).single();
    if (!oldRoom) return { success: false, error: "Classroom not found." };

    if (updates.room_number && updates.room_number.trim() !== oldRoom.room_number) {
      const { data: clash } = await supabase
        .from("classrooms")
        .select("id")
        .eq("room_number", updates.room_number.trim())
        .neq("id", id)
        .maybeSingle();

      if (clash) {
        return { success: false, error: `Room number '${updates.room_number}' is already assigned.` };
      }
    }

    const updatePayload: Record<string, unknown> = {};
    if (updates.room_number !== undefined) updatePayload.room_number = updates.room_number.trim();
    if (updates.building !== undefined) updatePayload.building = updates.building.trim();
    if (updates.floor !== undefined) updatePayload.floor = updates.floor;
    if (updates.room_type !== undefined) updatePayload.room_type = updates.room_type;
    if (updates.capacity !== undefined) updatePayload.capacity = updates.capacity;
    if (updates.facilities !== undefined) updatePayload.facilities = updates.facilities;
    if (updates.department_id !== undefined) updatePayload.department_id = updates.department_id;
    if (updates.is_available !== undefined) updatePayload.is_available = updates.is_available;
    if (updates.is_active !== undefined) updatePayload.is_active = updates.is_active;

    const { data: updated, error } = await supabase
      .from("classrooms")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();

    if (error || !updated) {
      return { success: false, error: error?.message || "Failed to update classroom" };
    }

    await recordAuditLog({
      action: "UPDATE_CLASSROOM",
      entityName: "classrooms",
      entityId: id,
      oldValues: oldRoom,
      newValues: updated,
      userId: caller.id,
    });

    revalidatePath("/classrooms");
    return { success: true, data: updated as Classroom };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "An unexpected error occurred" };
  }
}

export async function toggleClassroomActiveAction(id: string, isActive: boolean): Promise<ActionResult> {
  try {
    const caller = await requireAnyRole(ADMIN_ROLES);
    const supabase = await createServerSupabaseClient();

    const { error } = await supabase
      .from("classrooms")
      .update({ is_active: isActive })
      .eq("id", id);

    if (error) return { success: false, error: error.message };

    await recordAuditLog({
      action: isActive ? "ACTIVATE_CLASSROOM" : "DEACTIVATE_CLASSROOM",
      entityName: "classrooms",
      entityId: id,
      newValues: { is_active: isActive },
      userId: caller.id,
    });

    revalidatePath("/classrooms");
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "An unexpected error occurred" };
  }
}
