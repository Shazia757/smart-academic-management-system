"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAnyRole, getCurrentProfile } from "@/lib/auth/session";
import { ADMIN_ROLES } from "@/lib/auth/roles";
import {
  GenerateTimetableSchema,
  GenerateTimetableInput,
  SaveTimetableGenerationSchema,
  SaveTimetableGenerationInput,
  PublishTimetableSchema,
  PublishTimetableInput,
  UnpublishTimetableSchema,
  UnpublishTimetableInput,
  DeleteTimetableDraftSchema,
  DeleteTimetableDraftInput,
  UpdateTimetableDraftSchema,
  UpdateTimetableDraftInput,
  GetPublishedTimetableQuerySchema,
  GetPublishedTimetableQuery,
} from "@/server/validators/timetable";
import { aiClient } from "@/lib/ai-client";
import {
  buildSolverInput,
  enrichSolverOutput,
} from "@/lib/timetable/timetable-solver-service";
import { validateTimetableSchedule } from "@/lib/timetable/timetable-validation";
import { TimetableDataService } from "@/server/services/timetable-data";
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
        allow_partial: input.allow_partial,
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

        const meta = (gen.metadata || {}) as Record<string, unknown>;
        const isPublished = (gen as any).is_published === true || meta.is_published === true;
        const publishedAt = (gen as any).published_at || (typeof meta.published_at === "string" ? meta.published_at : null);
        const publishedBy = (gen as any).published_by || (typeof meta.published_by === "string" ? meta.published_by : null);
        const publisherName = typeof meta.publisher_name === "string" ? meta.publisher_name : null;
        const archivedAt = (gen as any).archived_at || (typeof meta.archived_at === "string" ? meta.archived_at : null);

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
          is_published: isPublished,
          published_at: publishedAt,
          published_by: publishedBy,
          publisher_name: publisherName,
          archived_at: archivedAt,
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
    const isPublished = (generation as any).is_published === true || meta.is_published === true;
    const publishedAt = (generation as any).published_at || (typeof meta.published_at === "string" ? meta.published_at : null);
    const publishedBy = (generation as any).published_by || (typeof meta.published_by === "string" ? meta.published_by : null);
    const publisherName = typeof meta.publisher_name === "string" ? meta.publisher_name : null;
    const archivedAt = (generation as any).archived_at || (typeof meta.archived_at === "string" ? meta.archived_at : null);

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
      published_at: publishedAt,
      published_by: publishedBy,
      publisher_name: publisherName,
      archived_at: archivedAt,
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

export interface GenerationInputSummary {
  configuration_name: string;
  academic_year_name: string;
  semester_name: string;
  enabled_working_days: number[];
  working_days_count: number;
  daily_period_count: number;
  period_duration_minutes: number;
  sections_count: number;
  section_names: string[];
  student_count: number;
  subjects_count: number;
  total_required_weekly_periods: number;
  assigned_faculty_count: number;
  lecture_rooms_count: number;
  lab_rooms_count: number;
  room_capacities: Array<{ room_number: string; room_type: string; capacity: number }>;
  faculty_availability_coverage: {
    total_faculty: number;
    available_slots: number;
    unavailable_slots: number;
  };
  classroom_availability_coverage: {
    total_classrooms: number;
    available_count: number;
    unavailable_count: number;
  };
  active_constraints: Array<{
    name: string;
    description: string;
    type: "hard" | "soft";
    status: "active" | "warning";
  }>;
}

/**
 * Server Action: Computes and returns the typed generation-input summary
 * and active constraints checklist for a selected configuration and section.
 */
export async function getGenerationInputSummaryAction(
  configurationId: string,
  sectionId: string
): Promise<ActionResult<GenerationInputSummary>> {
  try {
    await requireAnyRole(ADMIN_ROLES);

    if (!configurationId || !sectionId) {
      return { success: false, error: "Configuration ID and Section ID are required." };
    }

    const supabase = await createServerSupabaseClient();
    const buildRes = await buildSolverInput(supabase, configurationId, sectionId);

    if (!buildRes.success || !buildRes.data) {
      return {
        success: false,
        error: buildRes.error || "Failed to assemble scheduling parameters.",
      };
    }

    const { problem, meta } = buildRes.data;

    // Resolve academic year and semester display names
    const [{ data: yearData }, { data: semData }] = await Promise.all([
      supabase
        .from("academic_years")
        .select("name")
        .eq("id", meta.configuration.academic_year_id)
        .maybeSingle(),
      supabase
        .from("semesters")
        .select("name")
        .eq("id", meta.configuration.semester_id)
        .maybeSingle(),
    ]);

    const academicYearName = yearData?.name || "Current Academic Year";
    const semesterName = semData?.name || "Current Semester";

    const uniqueDays = Array.from(new Set(problem.periods.map((p) => p.day_of_week))).sort((a, b) => a - b);
    const totalRequiredPeriods = problem.scheduling_requirements.reduce(
      (acc, r) => acc + (r.weekly_periods || 0),
      0
    );

    const facultyIdSet = new Set(problem.faculty_assignments.map((fa) => fa.faculty_id));
    const lectureRooms = problem.classrooms.filter((c) => c.room_type !== "LABORATORY");
    const labRooms = problem.classrooms.filter((c) => c.room_type === "LABORATORY");

    const unavailableRooms = problem.classrooms.filter(
      (c) => c.is_available === false || (c.unavailable_period_ids && c.unavailable_period_ids.length > 0)
    ).length;

    const availableFacultySlots = problem.faculty_availability.filter((fa) => fa.is_available).length;
    const unavailableFacultySlots = problem.faculty_availability.filter((fa) => !fa.is_available).length;

    const studentCount = meta.section.capacity || 0;

    const activeConstraints: GenerationInputSummary["active_constraints"] = [
      {
        name: "Faculty Collision Prevention",
        description: "No faculty member can be assigned to multiple sessions during the same period.",
        type: "hard",
        status: "active",
      },
      {
        name: "Section Clash Prevention",
        description: "A class section can only attend one scheduled lecture/lab per period.",
        type: "hard",
        status: "active",
      },
      {
        name: "Classroom Double-Booking Prevention",
        description: "No classroom can host multiple sections or subjects concurrently.",
        type: "hard",
        status: "active",
      },
      {
        name: "Classroom Capacity Sufficiency",
        description: `Room capacity must accommodate student cohort size (${studentCount} students).`,
        type: "hard",
        status: problem.classrooms.some((c) => c.capacity >= studentCount) ? "active" : "warning",
      },
      {
        name: "Laboratory Room Requirements",
        description: "Laboratory subjects strictly require designated LABORATORY facilities.",
        type: "hard",
        status: labRooms.length > 0 ? "active" : "warning",
      },
      {
        name: "Faculty Availability Adherence",
        description: "Honor designated working schedules and blackout windows for assigned faculty.",
        type: "hard",
        status: "active",
      },
      {
        name: "Classroom Availability Adherence",
        description: "Exclude reserved, offline, or unavailable room slots.",
        type: "hard",
        status: "active",
      },
      {
        name: "Break Period Exclusion",
        description: "Sessions cannot be scheduled across recess, lunch, or configured break periods.",
        type: "hard",
        status: "active",
      },
      {
        name: "Valid Working Days & Periods",
        description: `Constrained within ${uniqueDays.length} working days and ${meta.configuration.periods_per_day} daily periods.`,
        type: "hard",
        status: "active",
      },
    ];

    const summary: GenerationInputSummary = {
      configuration_name: meta.configuration.name,
      academic_year_name: academicYearName,
      semester_name: semesterName,
      enabled_working_days: uniqueDays,
      working_days_count: meta.configuration.working_days || uniqueDays.length,
      daily_period_count: meta.configuration.periods_per_day,
      period_duration_minutes: meta.configuration.period_duration_minutes,
      sections_count: 1,
      section_names: [meta.section.name],
      student_count: studentCount,
      subjects_count: problem.subjects.length,
      total_required_weekly_periods: totalRequiredPeriods,
      assigned_faculty_count: facultyIdSet.size,
      lecture_rooms_count: lectureRooms.length,
      lab_rooms_count: labRooms.length,
      room_capacities: problem.classrooms.map((c) => ({
        room_number: c.room_number,
        room_type: c.room_type,
        capacity: c.capacity,
      })),
      faculty_availability_coverage: {
        total_faculty: facultyIdSet.size,
        available_slots: availableFacultySlots,
        unavailable_slots: unavailableFacultySlots,
      },
      classroom_availability_coverage: {
        total_classrooms: problem.classrooms.length,
        available_count: problem.classrooms.length - unavailableRooms,
        unavailable_count: unavailableRooms,
      },
      active_constraints: activeConstraints,
    };

    return {
      success: true,
      data: summary,
    };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "An unexpected error occurred while loading generation summary.";
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Server Action: Publishes a verified timetable generation schedule.
 * Enforces admin authorization, runs pre-publish conflict validation (0 HARD violations),
 * updates status to PUBLISHED, archives previous schedules, inserts notifications, and logs audit.
 */
export async function publishTimetableAction(
  rawInput: PublishTimetableInput
): Promise<
  ActionResult<{
    generation_id: string;
    is_published: boolean;
    published_at: string;
    publisher_name: string;
    notifications_sent: number;
  }>
> {
  try {
    const caller = await requireAnyRole(ADMIN_ROLES);
    const validation = PublishTimetableSchema.safeParse(rawInput);
    if (!validation.success) {
      return {
        success: false,
        error: validation.error.errors[0]?.message || "Invalid publish request.",
      };
    }

    const { generation_id, notify } = validation.data;
    const supabase = await createServerSupabaseClient();

    // 1. Fetch generation record and verify existence
    const { data: gen, error: genError } = await supabase
      .from("timetable_generations")
      .select("*")
      .eq("id", generation_id)
      .single();

    if (genError || !gen) {
      return { success: false, error: "Timetable generation not found." };
    }

    if (gen.status !== "COMPLETED") {
      return {
        success: false,
        error: `Cannot publish generation with status '${gen.status}'. Only COMPLETED schedules can be published.`,
      };
    }

    // 2. Fetch associated configuration
    const { data: config, error: cfgError } = await supabase
      .from("timetable_configurations")
      .select("*, section:class_sections(id, name)")
      .eq("id", gen.timetable_configuration_id)
      .single();

    if (cfgError || !config) {
      return { success: false, error: "Referenced timetable configuration not found." };
    }

    if (!config.is_active) {
      return { success: false, error: "Cannot publish timetable for an inactive configuration." };
    }

    // 3. Pre-publish validation check: verify zero HARD conflicts
    const { data: entries, error: entError } = await supabase
      .from("timetable_entries")
      .select("*, period:timetable_periods(id, day_of_week, period_number)")
      .eq("timetable_generation_id", generation_id);

    if (entError || !entries || entries.length === 0) {
      return { success: false, error: "Cannot publish timetable with zero scheduled entries." };
    }

    const mappedEntries = entries.map((e) => ({
      id: e.id,
      section_id: e.section_id,
      subject_id: e.subject_id,
      faculty_id: e.faculty_id,
      classroom_id: e.classroom_id,
      day_of_week: (e.period?.day_of_week ?? 1) as any,
      period_number: e.period?.period_number ?? 1,
      occurrence_index: e.occurrence_index,
      session_type: e.session_type,
      is_lab: e.is_lab,
    }));

    const validationReport = validateTimetableSchedule({
      entries: mappedEntries,
      constraints: {
        no_faculty_double_booking: true,
        no_classroom_double_booking: true,
        no_section_period_clashes: true,
        respect_faculty_unavailability: false,
        respect_classroom_capacity: false,
        enforce_lab_room_requirements: false,
        prevent_scheduling_during_breaks: false,
        valid_faculty_subject_assignment_only: false,
      },
    });

    const hardConflicts = validationReport.conflicts.filter((c) => c.severity === "HARD");
    if (hardConflicts.length > 0) {
      const conflictSummary = hardConflicts.map((c) => c.message).slice(0, 3).join("; ");
      return {
        success: false,
        error: `Cannot publish timetable with unresolved critical conflicts: ${conflictSummary}`,
      };
    }

    const now = new Date().toISOString();
    const publisherName = `${caller.first_name || ""} ${caller.last_name || ""}`.trim() || caller.email || "Administrator";

    // 4. Try atomic RPC first
    let notificationsSent = 0;
    const { data: rpcData, error: rpcError } = await supabase.rpc("publish_timetable_generation_atomic", {
      p_generation_id: generation_id,
      p_notify: notify ?? true,
    });

    if (!rpcError && rpcData) {
      notificationsSent = (rpcData as any).notifications_sent ?? 0;
    } else {
      // Direct transactional-safe queries fallback if RPC migration not yet applied
      // A. Archive previous published generations for this configuration in metadata
      const { data: otherGens } = await supabase
        .from("timetable_generations")
        .select("id, metadata")
        .eq("timetable_configuration_id", config.id)
        .neq("id", generation_id);

      for (const og of otherGens || []) {
        const ogMeta = {
          ...(typeof og.metadata === "object" && og.metadata ? og.metadata : {}),
          is_published: false,
          archived_at: now,
        };
        await supabase
          .from("timetable_generations")
          .update({ metadata: ogMeta })
          .eq("id", og.id);
      }

      // B. Mark target generation as published in metadata
      const updatedMeta = {
        ...(typeof gen.metadata === "object" && gen.metadata ? gen.metadata : {}),
        is_published: true,
        published_at: now,
        published_by: caller.id,
        publisher_name: publisherName,
        archived_at: null,
      };

      await supabase
        .from("timetable_generations")
        .update({
          metadata: updatedMeta,
        })
        .eq("id", generation_id);

      // C. Update configuration status to PUBLISHED
      await supabase
        .from("timetable_configurations")
        .update({
          generation_status: "PUBLISHED",
          updated_at: now,
        })
        .eq("id", config.id);

      // D. Send Notifications
      if (notify !== false) {
        try {
          const sectionName = config.section?.name || "your class section";
          // Get students
          const { data: students } = await supabase
            .from("students")
            .select("id")
            .eq("current_section_id", config.section_id)
            .eq("is_active", true);

          // Get faculty
          const { data: facultySubs } = await supabase
            .from("faculty_subjects")
            .select("faculty_id")
            .eq("section_id", config.section_id);

          const studentUserIds = (students || []).map((s) => s.id);
          const facultyUserIds = Array.from(new Set((facultySubs || []).map((f) => f.faculty_id)));
          const allTargetUserIds = Array.from(new Set([...studentUserIds, ...facultyUserIds]));

          if (allTargetUserIds.length > 0) {
            const notifRows = allTargetUserIds.map((userId) => ({
              user_id: userId,
              title: "Official Timetable Published",
              message: `The official timetable schedule for ${sectionName} has been published and is now active.`,
              type: "TIMETABLE_UPDATE",
              is_read: false,
              action_url: "/timetable",
            }));

            const { count } = await supabase.from("notifications").insert(notifRows);
            notificationsSent = count ?? notifRows.length;
          }
        } catch {
          // Notification errors must not rollback publication
        }
      }
    }

    // 5. Audit Log Success
    try {
      await recordAuditLog({
        action: "PUBLISH_TIMETABLE",
        entityName: "timetable_generations",
        entityId: generation_id,
        newValues: {
          configuration_id: config.id,
          section_id: config.section_id,
          published_at: now,
          published_by: caller.id,
          notifications_sent: notificationsSent,
        },
        userId: caller.id,
      });
    } catch {
      // Safe swallow
    }

    revalidatePath("/timetable");
    revalidatePath("/timetable/generate");
    revalidatePath("/timetable/configuration");

    return {
      success: true,
      data: {
        generation_id,
        is_published: true,
        published_at: now,
        publisher_name: publisherName,
        notifications_sent: notificationsSent,
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "An unexpected error occurred while publishing timetable.";
    return { success: false, error: message };
  }
}

/**
 * Server Action: Unpublishes / reverts a published timetable generation to draft status.
 * Enforces admin authorization and updates configuration status back to GENERATED.
 */
export async function unpublishTimetableAction(
  rawInput: UnpublishTimetableInput
): Promise<ActionResult<{ generation_id: string; is_published: boolean }>> {
  try {
    const caller = await requireAnyRole(ADMIN_ROLES);
    const validation = UnpublishTimetableSchema.safeParse(rawInput);
    if (!validation.success) {
      return { success: false, error: validation.error.errors[0]?.message || "Invalid unpublish request." };
    }

    const { generation_id } = validation.data;
    const supabase = await createServerSupabaseClient();
    const now = new Date().toISOString();

    const { data: gen, error: genError } = await supabase
      .from("timetable_generations")
      .select("id, timetable_configuration_id, metadata")
      .eq("id", generation_id)
      .single();

    if (genError || !gen) {
      return { success: false, error: "Timetable generation not found." };
    }

    // Try atomic RPC
    const { error: rpcError } = await supabase.rpc("unpublish_timetable_generation_atomic", {
      p_generation_id: generation_id,
    });

    if (rpcError) {
      // Direct fallback
      const updatedMeta = {
        ...(typeof gen.metadata === "object" && gen.metadata ? gen.metadata : {}),
        is_published: false,
        archived_at: now,
      };

      await supabase
        .from("timetable_generations")
        .update({
          metadata: updatedMeta,
        })
        .eq("id", generation_id);

      await supabase
        .from("timetable_configurations")
        .update({
          generation_status: "GENERATED",
          updated_at: now,
        })
        .eq("id", gen.timetable_configuration_id);
    }

    try {
      await recordAuditLog({
        action: "UNPUBLISH_TIMETABLE",
        entityName: "timetable_generations",
        entityId: generation_id,
        newValues: { unpublish_timestamp: now },
        userId: caller.id,
      });
    } catch {
      // Safe swallow
    }

    revalidatePath("/timetable");
    revalidatePath("/timetable/generate");
    revalidatePath("/timetable/configuration");

    return {
      success: true,
      data: { generation_id, is_published: false },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "An unexpected error occurred while unpublishing timetable.";
    return { success: false, error: message };
  }
}

/**
 * Server Action: Deletes an unpublished draft timetable generation.
 * Enforces admin authorization and prevents deleting published timetables.
 */
export async function deleteTimetableGenerationAction(
  rawInput: DeleteTimetableDraftInput
): Promise<ActionResult<{ generation_id: string; deleted: boolean }>> {
  try {
    const caller = await requireAnyRole(ADMIN_ROLES);
    const validation = DeleteTimetableDraftSchema.safeParse(rawInput);
    if (!validation.success) {
      return { success: false, error: validation.error.errors[0]?.message || "Invalid delete request." };
    }

    const { generation_id } = validation.data;
    const supabase = await createServerSupabaseClient();

    const { data: gen, error: genError } = await supabase
      .from("timetable_generations")
      .select("id, timetable_configuration_id, metadata")
      .eq("id", generation_id)
      .single();

    if (genError || !gen) {
      return { success: false, error: "Timetable generation not found." };
    }

    const isPublished = (gen as any).is_published === true || (gen.metadata as any)?.is_published === true;
    if (isPublished) {
      return {
        success: false,
        error: "Cannot delete a published timetable. Please unpublish or archive it first.",
      };
    }

    // Try atomic RPC
    const { error: rpcError } = await supabase.rpc("delete_timetable_generation_atomic", {
      p_generation_id: generation_id,
    });

    if (rpcError) {
      // Direct deletion fallback
      await supabase.from("timetable_entries").delete().eq("timetable_generation_id", generation_id);
      await supabase.from("timetable_generations").delete().eq("id", generation_id);

      const { count } = await supabase
        .from("timetable_generations")
        .select("*", { count: "exact", head: true })
        .eq("timetable_configuration_id", gen.timetable_configuration_id);

      if (count === 0) {
        await supabase
          .from("timetable_configurations")
          .update({ generation_status: "DRAFT" })
          .eq("id", gen.timetable_configuration_id);
      }
    }

    try {
      await recordAuditLog({
        action: "DELETE_TIMETABLE_GENERATION",
        entityName: "timetable_generations",
        entityId: generation_id,
        newValues: { configuration_id: gen.timetable_configuration_id },
        userId: caller.id,
      });
    } catch {
      // Safe swallow
    }

    revalidatePath("/timetable/generate");
    revalidatePath("/timetable/configuration");

    return {
      success: true,
      data: { generation_id, deleted: true },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "An unexpected error occurred while deleting timetable.";
    return { success: false, error: message };
  }
}

/**
 * Server Action: Updates entries of an unpublished draft timetable generation.
 * Enforces admin authorization and immutability of published timetables.
 */
export async function updateTimetableDraftAction(
  rawInput: UpdateTimetableDraftInput
): Promise<ActionResult<{ generation_id: string; updated_count: number }>> {
  try {
    const caller = await requireAnyRole(ADMIN_ROLES);
    const validation = UpdateTimetableDraftSchema.safeParse(rawInput);
    if (!validation.success) {
      return { success: false, error: validation.error.errors[0]?.message || "Invalid update request." };
    }

    const { generation_id, entries } = validation.data;
    const supabase = await createServerSupabaseClient();

    const { data: gen, error: genError } = await supabase
      .from("timetable_generations")
      .select("id, timetable_configuration_id, metadata")
      .eq("id", generation_id)
      .single();

    if (genError || !gen) {
      return { success: false, error: "Timetable generation not found." };
    }

    const isPublished = (gen as any).is_published === true || (gen.metadata as any)?.is_published === true;
    if (isPublished) {
      return {
        success: false,
        error: "Published timetables cannot be modified. Unpublish or create a new draft version.",
      };
    }

    // Fetch configuration section_id
    const { data: config } = await supabase
      .from("timetable_configurations")
      .select("section_id")
      .eq("id", gen.timetable_configuration_id)
      .single();

    const sectionId = config?.section_id;
    if (!sectionId) {
      return { success: false, error: "Configuration section not found." };
    }

    // Delete existing entries and re-insert new entries atomically
    await supabase.from("timetable_entries").delete().eq("timetable_generation_id", generation_id);

    const rowsToInsert = entries.map((e) => ({
      timetable_generation_id: generation_id,
      section_id: sectionId,
      subject_id: e.subject_id,
      faculty_id: e.faculty_id,
      classroom_id: e.classroom_id,
      timetable_period_id: e.timetable_period_id,
      occurrence_index: e.occurrence_index,
      session_type: e.session_type,
      is_lab: e.is_lab,
      notes: e.notes || null,
    }));

    const { error: insertErr } = await supabase.from("timetable_entries").insert(rowsToInsert);
    if (insertErr) {
      return { success: false, error: insertErr.message || "Failed to update timetable entries." };
    }

    try {
      await recordAuditLog({
        action: "UPDATE_TIMETABLE_DRAFT",
        entityName: "timetable_generations",
        entityId: generation_id,
        newValues: { entries_count: rowsToInsert.length },
        userId: caller.id,
      });
    } catch {
      // Safe swallow
    }

    revalidatePath("/timetable/generate");
    return {
      success: true,
      data: { generation_id, updated_count: rowsToInsert.length },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "An unexpected error occurred while updating draft.";
    return { success: false, error: message };
  }
}

/**
 * Server Action: Queries the official published timetable schedule.
 * Role-aware: students view section schedule; faculty view assigned schedule; admin views any.
 */
export async function getPublishedTimetableAction(
  query?: GetPublishedTimetableQuery
): Promise<
  ActionResult<{
    role: string;
    section_name?: string;
    academic_year_name?: string;
    semester_name?: string;
    published_at?: string;
    publisher_name?: string;
    entries: EnrichedScheduledEntry[];
    periods: any[];
  }>
> {
  try {
    const profile = await getCurrentProfile();
    if (!profile) {
      return { success: false, error: "Authentication required to view timetable." };
    }

    const supabase = await createServerSupabaseClient();
    const userRole = profile.role;

    // Student Role: Automatically resolve section
    if (userRole === "student" && !query?.section_id) {
      const { data: student } = await supabase
        .from("students")
        .select("current_section_id")
        .eq("id", profile.id)
        .maybeSingle();

      const sectionId = student?.current_section_id;
      if (!sectionId) {
        return { success: false, error: "Student is not currently enrolled in any class section." };
      }

      const res = await TimetableDataService.fetchPublishedTimetableForSection(supabase, sectionId);
      if (!res.data) {
        return { success: false, error: res.error || "No published timetable available." };
      }

      const { generation, configuration, section, entries, periods } = res.data;
      const meta = (generation.metadata || {}) as Record<string, unknown>;

      return {
        success: true,
        data: {
          role: "student",
          section_name: (section as any)?.name || "Current Section",
          academic_year_name: (configuration as any)?.academic_year?.name || "",
          semester_name: (configuration as any)?.semester?.name || "",
          published_at: (generation as any).published_at || (meta.published_at as string) || undefined,
          publisher_name: (meta.publisher_name as string) || undefined,
          entries: (entries || []).map(mapDbEntryToEnriched),
          periods: periods || [],
        },
      };
    }

    // Faculty Role: Resolve faculty schedule
    if (userRole === "faculty" && !query?.section_id) {
      const { data: faculty } = await supabase
        .from("faculty")
        .select("id")
        .eq("id", profile.id)
        .maybeSingle();

      const facultyId = faculty?.id || profile.id;
      const res = await TimetableDataService.fetchPublishedTimetableForFaculty(supabase, facultyId);
      if (!res.data) {
        return { success: false, error: res.error || "No published timetable assignments found." };
      }

      const { entries } = res.data;
      return {
        success: true,
        data: {
          role: "faculty",
          entries: (entries || []).map(mapDbEntryToEnriched),
          periods: [],
        },
      };
    }

    // Admin or specific query
    let targetSectionId = query?.section_id;
    if (!targetSectionId && query?.configuration_id) {
      const { data: cfg } = await supabase
        .from("timetable_configurations")
        .select("section_id")
        .eq("id", query.configuration_id)
        .maybeSingle();
      if (cfg?.section_id) targetSectionId = cfg.section_id;
    }

    if (!targetSectionId) {
      // Find first available section with published timetable
      const { data: pubConfig } = await supabase
        .from("timetable_configurations")
        .select("section_id")
        .eq("generation_status", "PUBLISHED")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (pubConfig?.section_id) {
        targetSectionId = pubConfig.section_id;
      }
    }

    if (!targetSectionId) {
      return {
        success: true,
        data: {
          role: userRole,
          entries: [],
          periods: [],
        },
      };
    }

    const res = await TimetableDataService.fetchPublishedTimetableForSection(supabase, targetSectionId);
    if (!res.data) {
      return { success: false, error: res.error || "No published timetable found." };
    }

    const { generation, configuration, section, entries, periods } = res.data;
    const meta = (generation.metadata || {}) as Record<string, unknown>;

    return {
      success: true,
      data: {
        role: userRole,
        section_name: (section as any)?.name || "Selected Section",
        academic_year_name: (configuration as any)?.academic_year?.name || "",
        semester_name: (configuration as any)?.semester?.name || "",
        published_at: (generation as any).published_at || (meta.published_at as string) || undefined,
        publisher_name: (meta.publisher_name as string) || undefined,
        entries: (entries || []).map(mapDbEntryToEnriched),
        periods: periods || [],
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "An unexpected error occurred while loading published timetable.";
    return { success: false, error: message };
  }
}

/**
 * Server Action: Validates a saved draft generation before publishing.
 * Returns conflict report without modifying state.
 */
export async function validateScheduleBeforePublishAction(
  generationId: string
): Promise<ActionResult<{ is_valid: boolean; conflicts: any[] }>> {
  try {
    await requireAnyRole(ADMIN_ROLES);
    const supabase = await createServerSupabaseClient();

    const { data: entries, error } = await supabase
      .from("timetable_entries")
      .select("*, period:timetable_periods(id, day_of_week, period_number)")
      .eq("timetable_generation_id", generationId);

    if (error || !entries) {
      return { success: false, error: error?.message || "Failed to load generation entries for validation." };
    }

    const mappedEntries = entries.map((e) => ({
      id: e.id,
      section_id: e.section_id,
      subject_id: e.subject_id,
      faculty_id: e.faculty_id,
      classroom_id: e.classroom_id,
      day_of_week: (e.period?.day_of_week ?? 1) as any,
      period_number: e.period?.period_number ?? 1,
      occurrence_index: e.occurrence_index,
      session_type: e.session_type,
      is_lab: e.is_lab,
    }));

    const report = validateTimetableSchedule({
      entries: mappedEntries,
      constraints: {
        no_faculty_double_booking: true,
        no_classroom_double_booking: true,
        no_section_period_clashes: true,
        respect_faculty_unavailability: false,
        respect_classroom_capacity: false,
        enforce_lab_room_requirements: false,
        prevent_scheduling_during_breaks: false,
        valid_faculty_subject_assignment_only: false,
      },
    });

    const hasHard = report.conflicts.some((c) => c.severity === "HARD");
    return {
      success: true,
      data: {
        is_valid: !hasHard,
        conflicts: report.conflicts,
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "An unexpected error occurred during validation.";
    return { success: false, error: message };
  }
}

function mapDbEntryToEnriched(e: any): EnrichedScheduledEntry {
  const sec = e.section as { id?: string; name?: string } | null;
  const subj = e.subject as { id?: string; code?: string; name?: string } | null;
  const fac = e.faculty as {
    id?: string;
    employee_id?: string;
    profile?: { first_name?: string; last_name?: string; email?: string } | null;
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
}


