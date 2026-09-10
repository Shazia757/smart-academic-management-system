"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAnyRole } from "@/lib/auth/session";
import { ADMIN_ROLES } from "@/lib/auth/roles";
import {
  TimetableConfigurationSchema,
  UpdateTimetableConfigurationSchema,
  GeneratePeriodsSchema,
  TimetableConfigurationInput,
  UpdateTimetableConfigurationInput,
  GeneratePeriodsInput,
  BreakSlotInput,
} from "@/server/validators/timetable";
import { recordAuditLog } from "./audit";
import { ActionResult } from "./departments";
import { TimetableConfiguration, TimetablePeriod } from "@/types/database";
import {
  computePeriodSlots,
  extractConfigMetadata,
} from "@/lib/timetable/period-utils";

// -----------------------------------------------------------------------------
// 1. CREATE TIMETABLE CONFIGURATION
// -----------------------------------------------------------------------------
export async function createTimetableConfigurationAction(
  rawInput: TimetableConfigurationInput
): Promise<ActionResult<TimetableConfiguration>> {
  try {
    const caller = await requireAnyRole(ADMIN_ROLES);
    const validation = TimetableConfigurationSchema.safeParse(rawInput);
    if (!validation.success) {
      return { success: false, error: validation.error.errors[0]?.message || "Invalid input" };
    }

    const input = validation.data;
    const supabase = await createServerSupabaseClient();

    // Context uniqueness check
    const { data: existing } = await supabase
      .from("timetable_configurations")
      .select("id")
      .eq("academic_year_id", input.academic_year_id)
      .eq("semester_id", input.semester_id)
      .eq("section_id", input.section_id)
      .eq("name", input.name)
      .maybeSingle();

    if (existing) {
      return {
        success: false,
        error: `A configuration named '${input.name}' already exists for this class section and semester.`,
      };
    }

    // Encapsulate breaks and scheduling parameters in metadata
    const metadataPayload = {
      breaks: input.breaks,
      enabled_days: input.enabled_days,
      start_time: input.start_time,
    };

    const { data: config, error: insertError } = await supabase
      .from("timetable_configurations")
      .insert({
        academic_year_id: input.academic_year_id,
        semester_id: input.semester_id,
        section_id: input.section_id,
        name: input.name,
        description: input.description || null,
        working_days: input.enabled_days.length,
        periods_per_day: input.periods_per_day,
        period_duration_minutes: input.period_duration_minutes,
        break_after_periods: metadataPayload,
        generation_status: "DRAFT",
        is_active: input.is_active ?? true,
        created_by: caller.id,
      })
      .select()
      .single();

    if (insertError || !config) {
      return { success: false, error: insertError?.message || "Failed to create configuration." };
    }

    // Automatically generate the initial period slots
    const slots = computePeriodSlots(
      config.id,
      input.enabled_days,
      input.periods_per_day,
      input.period_duration_minutes,
      input.start_time,
      input.breaks
    );

    if (slots.length > 0) {
      const { error: slotsError } = await supabase.from("timetable_periods").insert(slots);
      if (slotsError) {
        console.error("Warning: Initial period slot creation failed:", slotsError);
      }
    }

    await recordAuditLog({
      action: "CREATE_TIMETABLE_CONFIGURATION",
      entityName: "timetable_configurations",
      entityId: config.id,
      newValues: config,
      userId: caller.id,
    });

    revalidatePath("/timetable/configuration");
    return { success: true, data: config as TimetableConfiguration };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "An unexpected error occurred" };
  }
}

// -----------------------------------------------------------------------------
// 2. UPDATE TIMETABLE CONFIGURATION
// -----------------------------------------------------------------------------
export async function updateTimetableConfigurationAction(
  rawInput: UpdateTimetableConfigurationInput
): Promise<ActionResult<TimetableConfiguration>> {
  try {
    const caller = await requireAnyRole(ADMIN_ROLES);
    const validation = UpdateTimetableConfigurationSchema.safeParse(rawInput);
    if (!validation.success) {
      return { success: false, error: validation.error.errors[0]?.message || "Invalid input" };
    }

    const { id, ...updates } = validation.data;
    const supabase = await createServerSupabaseClient();

    const { data: existing, error: fetchErr } = await supabase
      .from("timetable_configurations")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchErr || !existing) {
      return { success: false, error: "Timetable configuration not found." };
    }

    const currentMeta = extractConfigMetadata(existing.break_after_periods);

    const newEnabledDays = updates.enabled_days || currentMeta.enabled_days;
    const newStartTime = updates.start_time || currentMeta.start_time;
    const newBreaks = updates.breaks !== undefined ? updates.breaks : currentMeta.breaks;

    const newMetadataPayload = {
      breaks: newBreaks,
      enabled_days: newEnabledDays,
      start_time: newStartTime,
    };

    const updatePayload: Record<string, unknown> = {
      break_after_periods: newMetadataPayload,
      working_days: newEnabledDays.length,
    };

    if (updates.name !== undefined) updatePayload.name = updates.name;
    if (updates.description !== undefined) updatePayload.description = updates.description;
    if (updates.periods_per_day !== undefined) updatePayload.periods_per_day = updates.periods_per_day;
    if (updates.period_duration_minutes !== undefined) updatePayload.period_duration_minutes = updates.period_duration_minutes;
    if (updates.is_active !== undefined) updatePayload.is_active = updates.is_active;

    const { data: updated, error: updateErr } = await supabase
      .from("timetable_configurations")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();

    if (updateErr || !updated) {
      return { success: false, error: updateErr?.message || "Failed to update configuration." };
    }

    await recordAuditLog({
      action: "UPDATE_TIMETABLE_CONFIGURATION",
      entityName: "timetable_configurations",
      entityId: id,
      oldValues: existing,
      newValues: updated,
      userId: caller.id,
    });

    revalidatePath("/timetable/configuration");
    return { success: true, data: updated as TimetableConfiguration };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "An unexpected error occurred" };
  }
}

// -----------------------------------------------------------------------------
// 3. TOGGLE CONFIGURATION STATUS (SOFT DEACTIVATION)
// -----------------------------------------------------------------------------
export async function toggleConfigurationStatusAction(
  id: string,
  isActive: boolean
): Promise<ActionResult<{ id: string; is_active: boolean }>> {
  try {
    const caller = await requireAnyRole(ADMIN_ROLES);
    const supabase = await createServerSupabaseClient();

    const { data: updated, error } = await supabase
      .from("timetable_configurations")
      .update({ is_active: isActive })
      .eq("id", id)
      .select("id, is_active")
      .single();

    if (error || !updated) {
      return { success: false, error: error?.message || "Failed to update status." };
    }

    await recordAuditLog({
      action: isActive ? "ACTIVATE_TIMETABLE_CONFIGURATION" : "DEACTIVATE_TIMETABLE_CONFIGURATION",
      entityName: "timetable_configurations",
      entityId: id,
      newValues: { is_active: isActive },
      userId: caller.id,
    });

    revalidatePath("/timetable/configuration");
    return { success: true, data: updated };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "An unexpected error occurred" };
  }
}

// -----------------------------------------------------------------------------
// 4. GENERATE / REGENERATE PERIOD SLOTS
// Strictly blocks regeneration if timetable generations or entries exist.
// -----------------------------------------------------------------------------
export async function generatePeriodSlotsAction(
  rawInput: GeneratePeriodsInput,
  overrideClient?: any
): Promise<ActionResult<{ generated_count: number; slots: TimetablePeriod[] }>> {
  try {
    let supabase = overrideClient;
    let callerId: string | null = null;

    if (!supabase) {
      const caller = await requireAnyRole(ADMIN_ROLES);
      callerId = caller.id;
      supabase = await createServerSupabaseClient();
    }

    const validation = GeneratePeriodsSchema.safeParse(rawInput);
    if (!validation.success) {
      return { success: false, error: validation.error.errors[0]?.message || "Invalid input" };
    }

    const { configuration_id } = validation.data;

    // 1. Fetch configuration
    const { data: config, error: cfgErr } = await supabase
      .from("timetable_configurations")
      .select("*")
      .eq("id", configuration_id)
      .single();

    if (cfgErr || !config) {
      return { success: false, error: "Configuration not found." };
    }

    // 2. HISTORICAL RECORD LOCK: Prevent destructive regeneration if generations or entries exist
    const { count: genCount, error: genCheckErr } = await supabase
      .from("timetable_generations")
      .select("*", { count: "exact", head: true })
      .eq("timetable_configuration_id", configuration_id);

    if (genCheckErr) {
      return { success: false, error: `Failed to verify timetable history: ${genCheckErr.message}` };
    }

    if (genCount && genCount > 0) {
      return {
        success: false,
        error:
          "Cannot regenerate period slots: This configuration has existing timetable generations. Period slots are locked to protect historical academic records. Please create a new configuration instead.",
      };
    }

    // Check if any existing periods for this configuration are referenced by timetable entries
    const { data: existingPeriods } = await supabase
      .from("timetable_periods")
      .select("id")
      .eq("timetable_configuration_id", configuration_id);

    if (existingPeriods && existingPeriods.length > 0) {
      const periodIds = existingPeriods.map((p: { id: string }) => p.id);
      const { count: entryCount, error: entryCheckErr } = await supabase
        .from("timetable_entries")
        .select("*", { count: "exact", head: true })
        .in("timetable_period_id", periodIds);

      if (!entryCheckErr && entryCount && entryCount > 0) {
        return {
          success: false,
          error:
            "Cannot regenerate period slots: Existing timetable entries reference these period slots. Regeneration is blocked to protect historical timetable data.",
        };
      }
    }

    // 3. Compute deterministic slots
    const meta = extractConfigMetadata(config.break_after_periods);
    const slots = computePeriodSlots(
      configuration_id,
      meta.enabled_days,
      config.periods_per_day,
      config.period_duration_minutes,
      meta.start_time,
      meta.breaks
    );

    if (slots.length === 0) {
      return { success: false, error: "No period slots could be computed from the configuration." };
    }

    // 4. Safely replace existing periods for this configuration
    const { error: delErr } = await supabase
      .from("timetable_periods")
      .delete()
      .eq("timetable_configuration_id", configuration_id);

    if (delErr) {
      return { success: false, error: `Failed to clear existing periods: ${delErr.message}` };
    }

    const { data: insertedSlots, error: insErr } = await supabase
      .from("timetable_periods")
      .insert(slots)
      .select();

    if (insErr || !insertedSlots) {
      return { success: false, error: `Failed to insert period slots: ${insErr?.message}` };
    }

    // Update configuration status to DRAFT
    await supabase
      .from("timetable_configurations")
      .update({ generation_status: "DRAFT" })
      .eq("id", configuration_id);

    await recordAuditLog({
      action: "GENERATE_TIMETABLE_PERIODS",
      entityName: "timetable_periods",
      entityId: configuration_id,
      newValues: { generated_slots_count: insertedSlots.length },
      userId: callerId || null,
    });

    revalidatePath("/timetable/configuration");
    return {
      success: true,
      data: {
        generated_count: insertedSlots.length,
        slots: insertedSlots as TimetablePeriod[],
      },
    };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "An unexpected error occurred" };
  }
}

// -----------------------------------------------------------------------------
// 5. INTERNAL DELETION HELPER
// Strictly for automated tests and maintenance. NOT exposed in UI.
// -----------------------------------------------------------------------------
export async function deleteTimetableConfigurationInternal(
  id: string,
  overrideClient?: any
): Promise<ActionResult<{ deleted: boolean }>> {
  try {
    let supabase = overrideClient;
    let callerId: string | null = null;

    if (!supabase) {
      const caller = await requireAnyRole(ADMIN_ROLES);
      callerId = caller.id;
      supabase = await createServerSupabaseClient();
    }

    // 1. Verify zero timetable generations exist
    const { count: genCount, error: genErr } = await supabase
      .from("timetable_generations")
      .select("*", { count: "exact", head: true })
      .eq("timetable_configuration_id", id);

    if (genErr) {
      return { success: false, error: `Failed to verify timetable generations: ${genErr.message}` };
    }

    if (genCount && genCount > 0) {
      return {
        success: false,
        error: "Cannot delete configuration: Historical timetable generations exist.",
      };
    }

    // 2. Verify zero timetable entries reference this configuration's periods
    const { data: existingPeriods } = await supabase
      .from("timetable_periods")
      .select("id")
      .eq("timetable_configuration_id", id);

    if (existingPeriods && existingPeriods.length > 0) {
      const periodIds = existingPeriods.map((p: { id: string }) => p.id);
      const { count: entryCount, error: entryErr } = await supabase
        .from("timetable_entries")
        .select("*", { count: "exact", head: true })
        .in("timetable_period_id", periodIds);

      if (entryErr) {
        return { success: false, error: `Failed to verify timetable entries: ${entryErr.message}` };
      }

      if (entryCount && entryCount > 0) {
        return {
          success: false,
          error: "Cannot delete configuration: Historical timetable entries reference this configuration's periods.",
        };
      }
    }

    // 3. Safely delete dependent periods first
    const { error: periodDelErr } = await supabase
      .from("timetable_periods")
      .delete()
      .eq("timetable_configuration_id", id);

    if (periodDelErr) {
      return { success: false, error: `Failed to remove timetable periods: ${periodDelErr.message}` };
    }

    // 4. Delete configuration
    const { error: configDelErr } = await supabase
      .from("timetable_configurations")
      .delete()
      .eq("id", id);

    if (configDelErr) {
      return { success: false, error: `Failed to delete configuration: ${configDelErr.message}` };
    }

    await recordAuditLog({
      action: "DELETE_TIMETABLE_CONFIGURATION_INTERNAL",
      entityName: "timetable_configurations",
      entityId: id,
      userId: callerId || null,
    });

    revalidatePath("/timetable/configuration");
    return { success: true, data: { deleted: true } };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "An unexpected error occurred" };
  }
}
