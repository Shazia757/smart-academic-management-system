"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAnyRole } from "@/lib/auth/session";
import { ADMIN_ROLES } from "@/lib/auth/roles";
import {
  GenerateTimetableSchema,
  GenerateTimetableInput,
  SaveTimetableGenerationSchema,
  SaveTimetableGenerationInput,
} from "@/server/validators/timetable";
import { aiClient } from "@/lib/ai-client";
import {
  buildSolverInput,
  enrichSolverOutput,
} from "@/lib/timetable/timetable-solver-service";
import { recordAuditLog } from "@/server/actions/audit";
import { ActionResult } from "@/server/actions/departments";
import {
  GeneratedTimetableResult,
  TimetableGenerationHistoryItem,
  EnrichedScheduledEntry,
} from "@/types/database";

/**
 * Server Action: Generates a conflict-free timetable schedule for a section using
 * Google OR-Tools CP-SAT via the decoupled FastAPI AI Optimization microservice.
 *
 * Scope locks:
 * - Operates in-memory; does NOT write to timetable_entries or timetable_generations
 * - Enforces ADMIN_ROLES authorization
 * - Validates prerequisite domain entities before invoking solver
 * - Returns enriched, serializable schedule preview for client review
 */
export async function generateTimetableAction(
  rawInput: GenerateTimetableInput
): Promise<ActionResult<GeneratedTimetableResult>> {
  try {
    // 1. Authorization Guard
    const caller = await requireAnyRole(ADMIN_ROLES);

    // 2. Request Validation
    const validation = GenerateTimetableSchema.safeParse(rawInput);
    if (!validation.success) {
      return {
        success: false,
        error: validation.error.errors[0]?.message || "Invalid timetable generation request.",
      };
    }

    const input = validation.data;
    const supabase = await createServerSupabaseClient();

    // 3. Assemble and validate solver problem data from Supabase
    const buildRes = await buildSolverInput(
      supabase,
      input.configuration_id,
      input.section_id,
      {
        timeout_seconds: input.timeout_seconds,
        random_seed: input.random_seed,
      }
    );

    if (!buildRes.success || !buildRes.data) {
      // Safe audit failure log
      try {
        await recordAuditLog({
          action: "TIMETABLE_GENERATION_FAILED",
          entityName: "timetable_configuration",
          entityId: input.configuration_id,
          newValues: {
            reason: buildRes.error,
            section_id: input.section_id,
          },
          userId: caller.id,
        });
      } catch {
        // Audit log failures must not mask domain errors
      }

      return {
        success: false,
        error: buildRes.error || "Failed to assemble scheduling data.",
      };
    }

    const { problem, meta } = buildRes.data;

    // 4. Invoke AI Solver microservice with configured timeout (+5s buffer)
    const timeoutMs = (input.timeout_seconds + 5) * 1000;
    const solveRes = await aiClient.solveTimetable(problem, timeoutMs);

    if (!solveRes.success || !solveRes.data) {
      try {
        await recordAuditLog({
          action: "TIMETABLE_GENERATION_FAILED",
          entityName: "timetable_configuration",
          entityId: input.configuration_id,
          newValues: {
            reason: solveRes.error,
            section_id: input.section_id,
          },
          userId: caller.id,
        });
      } catch {
        // Safe swallow
      }

      return {
        success: false,
        error: solveRes.error || "Failed to solve timetable.",
      };
    }

    const solverOutput = solveRes.data;

    // 5. Transform and enrich solver result
    const enrichedResult = enrichSolverOutput(solverOutput, meta);

    // 6. Record Audit Log based on solver outcome
    try {
      if (solverOutput.status === "OPTIMAL" || solverOutput.status === "FEASIBLE") {
        await recordAuditLog({
          action: "TIMETABLE_GENERATED",
          entityName: "timetable_configuration",
          entityId: input.configuration_id,
          newValues: {
            status: solverOutput.status,
            entries_count: enrichedResult.entries.length,
            solve_duration_ms: solverOutput.solve_duration_ms,
            section_id: input.section_id,
          },
          userId: caller.id,
        });
      } else {
        await recordAuditLog({
          action: "TIMETABLE_GENERATION_INFEASIBLE",
          entityName: "timetable_configuration",
          entityId: input.configuration_id,
          newValues: {
            status: solverOutput.status,
            diagnostics: solverOutput.diagnostics,
            section_id: input.section_id,
          },
          userId: caller.id,
        });
      }
    } catch {
      // Audit failure must never fail the returned result
    }

    return {
      success: true,
      data: enrichedResult,
    };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "An unexpected server error occurred during timetable generation.";
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Server Action: Atomically persists a generated timetable schedule as an unpublished draft
 * via the database RPC function `save_timetable_generation_atomic`.
 *
 * Scope locks:
 * - Enforces ADMIN_ROLES
 * - Calculates next generation number atomically via FOR UPDATE lock
 * - Status is saved as 'COMPLETED' with metadata.is_published = false (draft)
 * - Updates configuration generation_status to 'GENERATED'
 * - Records audit log TIMETABLE_SAVED / TIMETABLE_SAVE_FAILED
 * - Never does partial inserts; rolls back completely on any error
 */
export async function saveTimetableGenerationAction(
  rawInput: SaveTimetableGenerationInput
): Promise<
  ActionResult<{
    generation_id: string;
    generation_number: number;
    entries_count: number;
  }>
> {
  try {
    // 1. Authorization Guard
    const caller = await requireAnyRole(ADMIN_ROLES);

    // 2. Request Validation
    const validation = SaveTimetableGenerationSchema.safeParse(rawInput);
    if (!validation.success) {
      return {
        success: false,
        error: validation.error.errors[0]?.message || "Invalid timetable persistence request.",
      };
    }

    const input = validation.data;
    const supabase = await createServerSupabaseClient();

    // 3. Pre-save integrity check: verify active configuration & matching section
    const { data: config, error: configError } = await supabase
      .from("timetable_configurations")
      .select("id, section_id, is_active, generation_status")
      .eq("id", input.configuration_id)
      .single();

    if (configError || !config) {
      return {
        success: false,
        error: "Referenced timetable configuration does not exist.",
      };
    }

    if (!config.is_active) {
      return {
        success: false,
        error: "Cannot persist schedule to an inactive configuration.",
      };
    }

    if (config.section_id !== input.section_id) {
      return {
        success: false,
        error: "Configuration section mismatch.",
      };
    }

    // 4. Call atomic database RPC
    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      "save_timetable_generation_atomic",
      {
        p_configuration_id: input.configuration_id,
        p_section_id: input.section_id,
        p_solver_name: input.solver_metrics.solver_name,
        p_solver_version: input.solver_metrics.solver_version,
        p_objective_score: input.solver_metrics.objective_score ?? null,
        p_hard_violations: input.solver_metrics.hard_constraint_violations,
        p_soft_violations: input.solver_metrics.soft_constraint_violations,
        p_solve_duration_ms: input.solver_metrics.solve_duration_ms,
        p_diagnostics: input.solver_metrics.diagnostics,
        p_entries: input.entries,
      }
    );

    if (rpcError) {
      try {
        await recordAuditLog({
          action: "TIMETABLE_SAVE_FAILED",
          entityName: "timetable_generation",
          entityId: input.configuration_id,
          newValues: {
            reason: rpcError.message,
            section_id: input.section_id,
          },
          userId: caller.id,
        });
      } catch {
        // Safe swallow
      }

      return {
        success: false,
        error: rpcError.message || "Failed to persist timetable generation.",
      };
    }

    const typedResult = rpcResult as {
      generation_id: string;
      generation_number: number;
      inserted_entry_count: number;
    };

    // 5. Audit Log Success
    try {
      await recordAuditLog({
        action: "TIMETABLE_SAVED",
        entityName: "timetable_generation",
        entityId: typedResult.generation_id,
        newValues: {
          generation_number: typedResult.generation_number,
          configuration_id: input.configuration_id,
          section_id: input.section_id,
          entries_count: typedResult.inserted_entry_count,
        },
        userId: caller.id,
      });
    } catch {
      // Safe swallow
    }

    return {
      success: true,
      data: {
        generation_id: typedResult.generation_id,
        generation_number: typedResult.generation_number,
        entries_count: typedResult.inserted_entry_count,
      },
    };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "An unexpected server error occurred while saving timetable.";
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Server Action: Fetches generation history for a specific configuration.
 * Returns newest generations first with entry count and metadata.
 */
export async function getGenerationHistoryAction(
  configurationId: string
): Promise<ActionResult<TimetableGenerationHistoryItem[]>> {
  try {
    await requireAnyRole(ADMIN_ROLES);

    if (!configurationId) {
      return {
        success: false,
        error: "Configuration ID is required to fetch generation history.",
      };
    }

    const supabase = await createServerSupabaseClient();

    const { data: generations, error: genError } = await supabase
      .from("timetable_generations")
      .select(`
        id,
        timetable_configuration_id,
        generation_number,
        status,
        solver_name,
        solver_version,
        objective_score,
        hard_constraint_violations,
        soft_constraint_violations,
        generation_completed_at,
        generated_by,
        metadata,
        created_at,
        author:profiles!generated_by(first_name, last_name, email)
      `)
      .eq("timetable_configuration_id", configurationId)
      .order("generation_number", { ascending: false });

    if (genError) {
      return {
        success: false,
        error: genError.message || "Failed to fetch timetable generation history.",
      };
    }

    const historyItems: TimetableGenerationHistoryItem[] = await Promise.all(
      (generations || []).map(async (gen) => {
        const { count } = await supabase
          .from("timetable_entries")
          .select("*", { count: "exact", head: true })
          .eq("timetable_generation_id", gen.id);

        const author = gen.author as { first_name?: string; last_name?: string; email?: string } | null;
        const authorName = author
          ? `${author.first_name || ""} ${author.last_name || ""}`.trim() || author.email || "Administrator"
          : "Administrator";

        return {
          id: gen.id,
          timetable_configuration_id: gen.timetable_configuration_id,
          generation_number: gen.generation_number,
          status: gen.status,
          solver_name: gen.solver_name,
          solver_version: gen.solver_version,
          objective_score: gen.objective_score,
          hard_constraint_violations: gen.hard_constraint_violations,
          soft_constraint_violations: gen.soft_constraint_violations,
          generation_completed_at: gen.generation_completed_at,
          generated_by: gen.generated_by,
          author_name: authorName,
          metadata: gen.metadata as any,
          entries_count: count ?? 0,
          created_at: gen.created_at,
        };
      })
    );

    return {
      success: true,
      data: historyItems,
    };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "An unexpected server error occurred while retrieving history.";
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Server Action: Loads a specific saved generation and its enriched entries
 * so it can be previewed in the weekly grid and diagnostics view.
 */
export async function getTimetableGenerationAction(
  generationId: string
): Promise<ActionResult<GeneratedTimetableResult>> {
  try {
    await requireAnyRole(ADMIN_ROLES);

    if (!generationId) {
      return {
        success: false,
        error: "Generation ID is required.",
      };
    }

    const supabase = await createServerSupabaseClient();

    // 1. Fetch generation record
    const { data: generation, error: genError } = await supabase
      .from("timetable_generations")
      .select("*")
      .eq("id", generationId)
      .single();

    if (genError || !generation) {
      return {
        success: false,
        error: genError?.message || "Generation not found.",
      };
    }

    // 2. Fetch configuration for section_id
    const { data: config, error: cfgError } = await supabase
      .from("timetable_configurations")
      .select("id, section_id")
      .eq("id", generation.timetable_configuration_id)
      .single();

    if (cfgError || !config) {
      return {
        success: false,
        error: "Referenced configuration not found.",
      };
    }

    // 3. Fetch entries with joined relations
    const { data: entries, error: entriesError } = await supabase
      .from("timetable_entries")
      .select(`
        id,
        section_id,
        subject_id,
        faculty_id,
        classroom_id,
        timetable_period_id,
        occurrence_index,
        session_type,
        is_lab,
        notes,
        section:class_sections(id, name),
        subject:subjects(id, code, name),
        faculty:faculty(id, employee_id, profile:profiles(first_name, last_name, email)),
        classroom:classrooms(id, room_number, room_type),
        period:timetable_periods(id, day_of_week, period_number, start_time, end_time)
      `)
      .eq("timetable_generation_id", generationId)
      .order("occurrence_index", { ascending: true });

    if (entriesError) {
      return {
        success: false,
        error: entriesError.message || "Failed to load generation entries.",
      };
    }

    // 4. Map entries to EnrichedScheduledEntry
    const enrichedEntries: EnrichedScheduledEntry[] = (entries || []).map((e) => {
      const sec = e.section as { id?: string; name?: string } | null;
      const subj = e.subject as { id?: string; code?: string; name?: string } | null;
      const fac = e.faculty as {
        id?: string;
        employee_id?: string;
        profile?: {
          first_name?: string;
          last_name?: string;
          email?: string;
        } | null;
      } | null;
      const room = e.classroom as { id?: string; room_number?: string; room_type?: string } | null;
      const per = e.period as {
        id?: string;
        day_of_week?: number;
        period_number?: number;
        start_time?: string;
        end_time?: string;
      } | null;

      const facultyFullName = fac?.profile
        ? `${fac.profile.first_name || ""} ${fac.profile.last_name || ""}`.trim()
        : fac?.employee_id || "Assigned Faculty";

      return {
        id: e.id,
        section_id: e.section_id,
        section_code: sec?.name || "",
        section_name: sec?.name || "",
        subject_id: e.subject_id,
        subject_code: subj?.code || "",
        subject_name: subj?.name || "",
        faculty_id: e.faculty_id,
        faculty_name: facultyFullName || "Assigned Faculty",
        faculty_email: fac?.profile?.email || undefined,
        classroom_id: e.classroom_id,
        room_number: room?.room_number || "",
        room_type: room?.room_type || "LECTURE_HALL",
        timetable_period_id: e.timetable_period_id,
        day_of_week: per?.day_of_week ?? 1,
        period_number: per?.period_number ?? 1,
        period_start_time: per?.start_time || "09:00:00",
        period_end_time: per?.end_time || "09:55:00",
        occurrence_index: e.occurrence_index,
        session_type: e.session_type,
        is_lab: e.is_lab,
        notes: e.notes,
      };
    });

    const meta = (generation.metadata || {}) as Record<string, unknown>;
    const solveDuration = typeof meta.solve_duration_ms === "number" ? meta.solve_duration_ms : 0;
    const diagnostics = Array.isArray(meta.diagnostics) ? (meta.diagnostics as string[]) : [];
    const isPublished = meta.is_published === true;

    const result: GeneratedTimetableResult = {
      status: "OPTIMAL",
      solver_name: generation.solver_name,
      solver_version: generation.solver_version || "9.15.6755",
      solve_duration_ms: solveDuration,
      hard_constraint_violations: generation.hard_constraint_violations,
      soft_constraint_violations: generation.soft_constraint_violations,
      entries: enrichedEntries,
      diagnostics: diagnostics,
      configuration_id: generation.timetable_configuration_id,
      section_id: config.section_id,
      generation_id: generation.id,
      generation_number: generation.generation_number,
      is_published: isPublished,
    };

    return {
      success: true,
      data: result,
    };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "An unexpected error occurred while loading the generation.";
    return {
      success: false,
      error: message,
    };
  }
}
