import { SupabaseClient } from "@supabase/supabase-js";
import {
  SchedulingInput,
  SchedulingOutput,
  SolverPeriodSlotInput,
  SolverTimetableConfigInput,
  SolverSectionInput,
  SolverSubjectInput,
  SolverFacultyAssignmentInput,
  SolverFacultyAvailabilityInput,
  SolverClassroomInput,
  SolverSchedulingRequirementInput,
} from "@/lib/ai-client";
import {
  TimetableConfiguration,
  TimetablePeriod,
  ClassSection,
  Subject,
  Classroom,
  EnrichedScheduledEntry,
  GeneratedTimetableResult,
} from "@/types/database";

export interface BuildSolverInputOptions {
  timeout_seconds?: number;
  random_seed?: number;
}

export interface EntityMetadataMaps {
  configuration: TimetableConfiguration;
  section: ClassSection;
  subjectsMap: Map<string, { code: string; name: string }>;
  facultyMap: Map<string, { name: string; email?: string }>;
  classroomsMap: Map<string, { room_number: string; room_type: string }>;
  periodsMap: Map<string, { day_of_week: number; period_number: number; start_time: string; end_time: string }>;
}

export interface BuildSolverInputResult {
  problem: SchedulingInput;
  meta: EntityMetadataMaps;
}

/**
 * Loads and validates all prerequisite academic and scheduling records from Supabase
 * and builds the exact typed SchedulingInput contract expected by the FastAPI CP-SAT microservice.
 *
 * Enforces pre-solve validation:
 * - Configuration exists and is active
 * - Active period slots exist
 * - Section exists
 * - Active scheduling requirements exist
 * - All subjects are mapped to valid faculty assignments
 * - Classrooms exist
 */
export async function buildSolverInput(
  supabase: SupabaseClient,
  configurationId: string,
  sectionId: string,
  options?: BuildSolverInputOptions
): Promise<{ success: boolean; data?: BuildSolverInputResult; error?: string }> {
  try {
    // 1. Fetch Configuration
    const { data: config, error: configErr } = await supabase
      .from("timetable_configurations")
      .select("*")
      .eq("id", configurationId)
      .maybeSingle();

    if (configErr || !config) {
      return { success: false, error: "Timetable configuration not found." };
    }

    if (!config.is_active) {
      return {
        success: false,
        error: "Selected timetable configuration is inactive. Please activate it before solving.",
      };
    }

    if (config.section_id !== sectionId) {
      return {
        success: false,
        error: "Configuration does not match the targeted class section.",
      };
    }

    // 2. Fetch Class Section
    const { data: section, error: sectionErr } = await supabase
      .from("class_sections")
      .select("*, department:departments(*)")
      .eq("id", sectionId)
      .maybeSingle();

    if (sectionErr || !section) {
      return { success: false, error: "Target class section not found." };
    }

    // 3. Fetch Active Periods
    const { data: rawPeriods, error: periodsErr } = await supabase
      .from("timetable_periods")
      .select("*")
      .eq("timetable_configuration_id", configurationId)
      .eq("is_active", true)
      .order("day_of_week", { ascending: true })
      .order("period_number", { ascending: true });

    if (periodsErr || !rawPeriods || rawPeriods.length === 0) {
      return {
        success: false,
        error:
          "No active period slots found for this configuration. Please generate period slots in Timetable Configuration first.",
      };
    }

    // 4. Fetch Scheduling Requirements
    const { data: rawReqs, error: reqsErr } = await supabase
      .from("subject_scheduling_requirements")
      .select("*, subject:subjects(*)")
      .eq("section_id", sectionId)
      .eq("is_active", true);

    if (reqsErr || !rawReqs || rawReqs.length === 0) {
      return {
        success: false,
        error:
          "No active subject scheduling requirements configured for this section. Please configure requirements first.",
      };
    }

    // 5. Fetch Faculty Subject Assignments
    const { data: rawAssignments, error: assignErr } = await supabase
      .from("faculty_subjects")
      .select("*, faculty:faculty(*, profile:profiles(*))")
      .eq("section_id", sectionId)
      .eq("academic_year_id", config.academic_year_id);

    if (assignErr) {
      return { success: false, error: `Failed to load faculty assignments: ${assignErr.message}` };
    }

    // Index assignments by subject_id and by id
    const assignmentsBySubject = new Map<string, any>();
    const assignmentsById = new Map<string, any>();
    for (const a of rawAssignments || []) {
      assignmentsById.set(a.id, a);
      if (a.subject_id) {
        assignmentsBySubject.set(a.subject_id, a);
      }
    }

    // 6. Fetch Available Classrooms
    const { data: rawClassrooms, error: classErr } = await supabase
      .from("classrooms")
      .select("*")
      .eq("is_available", true);

    if (classErr || !rawClassrooms || rawClassrooms.length === 0) {
      return {
        success: false,
        error: "No available classrooms found in the institutional master data.",
      };
    }

    // 7. Verify Faculty Mappings for all Requirements
    const missingFacultySubjects: string[] = [];
    const facultyIds = new Set<string>();
    const subjectsMap = new Map<string, { code: string; name: string }>();
    const facultyMap = new Map<string, { name: string; email?: string }>();

    for (const req of rawReqs) {
      if (!req.subject) {
        return {
          success: false,
          error: `Requirement '${req.id}' references a subject that no longer exists.`,
        };
      }

      subjectsMap.set(req.subject_id, {
        code: req.subject.code || "UNKNOWN",
        name: req.subject.name || "Unknown Subject",
      });

      // Match via faculty_subject_assignment_id or by subject_id
      let assignment = req.faculty_subject_assignment_id
        ? assignmentsById.get(req.faculty_subject_assignment_id)
        : null;

      if (!assignment) {
        assignment = assignmentsBySubject.get(req.subject_id);
      }

      if (!assignment || !assignment.faculty_id) {
        missingFacultySubjects.push(`${req.subject.code} (${req.subject.name})`);
      } else {
        facultyIds.add(assignment.faculty_id);
        const profile = assignment.faculty?.profile;
        const facultyName = profile
          ? `${profile.first_name || ""} ${profile.last_name || ""}`.trim() || "Faculty"
          : "Faculty";
        facultyMap.set(assignment.faculty_id, {
          name: facultyName,
          email: profile?.email || undefined,
        });
      }
    }

    if (missingFacultySubjects.length > 0) {
      return {
        success: false,
        error: `Missing faculty assignment for subjects: ${missingFacultySubjects.join(
          ", "
        )}. Every subject requirement must have an assigned faculty member.`,
      };
    }

    // 8. Fetch Faculty Availability for assigned faculty
    let rawAvail: any[] = [];
    if (facultyIds.size > 0) {
      const { data: availData } = await supabase
        .from("faculty_availability")
        .select("*")
        .in("faculty_id", Array.from(facultyIds));
      rawAvail = availData || [];
    }

    // 9. Build Metadata Maps for result enrichment
    const classroomsMap = new Map<string, { room_number: string; room_type: string }>();
    for (const c of rawClassrooms) {
      classroomsMap.set(c.id, {
        room_number: c.room_number,
        room_type: c.room_type || "LECTURE_HALL",
      });
    }

    const periodsMap = new Map<
      string,
      { day_of_week: number; period_number: number; start_time: string; end_time: string }
    >();
    for (const p of rawPeriods) {
      periodsMap.set(p.id, {
        day_of_week: p.day_of_week,
        period_number: p.period_number,
        start_time: p.start_time,
        end_time: p.end_time,
      });
    }

    // 10. Assemble SchedulingInput contract
    const configInput: SolverTimetableConfigInput = {
      id: config.id,
      academic_year_id: config.academic_year_id,
      semester_id: config.semester_id,
      section_id: config.section_id,
      name: config.name,
      working_days: config.working_days || 6,
      periods_per_day: config.periods_per_day || 7,
      period_duration_minutes: config.period_duration_minutes || 55,
      break_after_periods: Array.isArray(config.break_after_periods)
        ? config.break_after_periods
        : null,
    };

    const periodsInput: SolverPeriodSlotInput[] = rawPeriods.map((p) => ({
      id: p.id,
      day_of_week: p.day_of_week,
      period_number: p.period_number,
      start_time: p.start_time,
      end_time: p.end_time,
      is_break: Boolean(p.is_break),
      is_active: Boolean(p.is_active),
    }));

    const sectionsInput: SolverSectionInput[] = [
      {
        id: section.id,
        code: section.name,
        name: section.name,
        capacity: section.capacity || 60,
      },
    ];

    const subjectsInput: SolverSubjectInput[] = rawReqs.map((r) => ({
      id: r.subject.id,
      code: r.subject.code,
      name: r.subject.name,
      credits: r.subject.credits || 3,
      is_lab: Boolean(r.requires_lab || r.subject.subject_type === "LAB" || r.subject.subject_type === "LABORATORY"),
      subject_type: r.requires_lab || r.subject.subject_type === "LAB" || r.subject.subject_type === "LABORATORY" ? "LAB" : "THEORY",
      weekly_periods: r.weekly_periods,
    }));

    const facultyAssignmentsInput: SolverFacultyAssignmentInput[] = [];
    for (const a of rawAssignments || []) {
      if (a.faculty_id && a.subject_id) {
        facultyAssignmentsInput.push({
          id: a.id,
          faculty_id: a.faculty_id,
          subject_id: a.subject_id,
          section_id: a.section_id,
          is_primary: a.is_primary ?? true,
        });
      }
    }

    const facultyAvailabilityInput: SolverFacultyAvailabilityInput[] = rawAvail.map((av) => ({
      faculty_id: av.faculty_id,
      day_of_week: av.day_of_week,
      period_slot: av.period_slot,
      period_number: av.period_slot,
      is_available: Boolean(av.is_available),
      availability_status: av.is_available ? "AVAILABLE" : "UNAVAILABLE",
    }));

    const classroomsInput: SolverClassroomInput[] = rawClassrooms.map((c) => ({
      id: c.id,
      room_number: c.room_number,
      room_type: c.room_type || "LECTURE_HALL",
      capacity: c.capacity,
      is_available: Boolean(c.is_available),
      unavailable_period_ids: [],
    }));

    const reqsInput: SolverSchedulingRequirementInput[] = rawReqs.map((r) => {
      let resolvedFacId: string | null = null;
      let assignment = r.faculty_subject_assignment_id
        ? assignmentsById.get(r.faculty_subject_assignment_id)
        : null;
      if (!assignment) {
        assignment = assignmentsBySubject.get(r.subject_id);
      }
      if (assignment) {
        resolvedFacId = assignment.faculty_id;
      }

      return {
        id: r.id,
        section_id: r.section_id,
        subject_id: r.subject_id,
        faculty_id: resolvedFacId,
        faculty_subject_assignment_id: r.faculty_subject_assignment_id || undefined,
        weekly_periods: r.weekly_periods,
        consecutive_periods: r.consecutive_periods || 1,
        room_type: r.room_type || (r.requires_lab ? "LABORATORY" : "LECTURE_HALL"),
        preferred_capacity: r.preferred_capacity || section.capacity || 60,
        requires_lab: Boolean(r.requires_lab),
        requires_consecutive_slots: Boolean(r.requires_consecutive_slots),
        preferred_days: r.preferred_days || null,
        max_periods_per_day: r.max_periods_per_day || 2,
        min_period_gap: r.min_period_gap || 0,
        is_active: Boolean(r.is_active),
      };
    });

    const timeoutSec = options?.timeout_seconds || 30;
    const randomSeed = options?.random_seed ?? 42;

    const problem: SchedulingInput = {
      configuration: configInput,
      periods: periodsInput,
      sections: sectionsInput,
      subjects: subjectsInput,
      faculty_assignments: facultyAssignmentsInput,
      faculty_availability: facultyAvailabilityInput,
      classrooms: classroomsInput,
      scheduling_requirements: reqsInput,
      solver_timeout_seconds: timeoutSec,
      solver_config: {
        max_solve_time_seconds: timeoutSec,
        random_seed: randomSeed,
        num_workers: 1, // Single worker for reproducible deterministic output
        log_search_progress: false,
      },
    };

    return {
      success: true,
      data: {
        problem,
        meta: {
          configuration: config,
          section,
          subjectsMap,
          facultyMap,
          classroomsMap,
          periodsMap,
        },
      },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to assemble scheduling problem.";
    return { success: false, error: msg };
  }
}

/**
 * Transforms raw solver output entries into enriched client-facing timetable records
 * with human-readable subject, faculty, classroom, and period timing labels.
 */
export function enrichSolverOutput(
  output: SchedulingOutput,
  meta: EntityMetadataMaps
): GeneratedTimetableResult {
  const enrichedEntries: EnrichedScheduledEntry[] = (output.entries || []).map((entry) => {
    const subject = meta.subjectsMap.get(entry.subject_id);
    const faculty = meta.facultyMap.get(entry.faculty_id);
    const room = meta.classroomsMap.get(entry.classroom_id);
    const period = meta.periodsMap.get(entry.timetable_period_id);

    return {
      id: `${entry.section_id}-${entry.timetable_period_id}-${entry.occurrence_index}`,
      section_id: entry.section_id,
      section_code: meta.section.name,
      section_name: meta.section.name,
      subject_id: entry.subject_id,
      subject_code: subject?.code || "SUB",
      subject_name: subject?.name || "Subject",
      faculty_id: entry.faculty_id,
      faculty_name: faculty?.name || "Faculty",
      faculty_email: faculty?.email,
      classroom_id: entry.classroom_id,
      room_number: room?.room_number || "Room",
      room_type: room?.room_type || "LECTURE_HALL",
      timetable_period_id: entry.timetable_period_id,
      day_of_week: period?.day_of_week || 1,
      period_number: period?.period_number || 1,
      period_start_time: period?.start_time || "09:00:00",
      period_end_time: period?.end_time || "10:00:00",
      occurrence_index: entry.occurrence_index || 1,
      session_type: entry.session_type || "THEORY",
      is_lab: Boolean(entry.is_lab),
      notes: entry.notes || null,
    };
  });

  return {
    status: output.status,
    solver_name: output.solver_name || "OR-Tools CP-SAT",
    solver_version: output.solver_version || "9.15.6755",
    solve_duration_ms: output.solve_duration_ms || 0,
    hard_constraint_violations: output.hard_constraint_violations || 0,
    soft_constraint_violations: output.soft_constraint_violations || 0,
    entries: enrichedEntries,
    diagnostics: output.diagnostics || [],
    error_message: output.error_message || null,
    configuration_id: meta.configuration.id,
    section_id: meta.section.id,
  };
}
