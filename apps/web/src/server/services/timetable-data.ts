import { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  AcademicSubject,
  ClassSectionInfo,
  FacultyAssignment,
  ClassroomInfo,
  TimetablePeriodSlot,
  FacultyAvailabilitySlot,
  RoomAvailabilitySlot,
  TimetableGenerationConstraints,
  TimetableGenerationRequest,
  DEFAULT_TIMETABLE_CONSTRAINTS,
  TimetableGenerationConstraintsSchema,
  TimetableGenerationRequestSchema,
  DayOfWeek,
  RoomType,
} from "../../types/timetable";
import { validateGenerationConstraints } from "../../lib/timetable/timetable-validation";

export interface ServiceResult<T> {
  data: T | null;
  error: string | null;
  status: number;
}

export interface TimetableGenerationInputData {
  configuration: {
    id: string;
    name: string;
    description?: string | null;
    academic_year_id: string;
    semester_id: string;
    section_id: string;
    working_days: number;
    periods_per_day: number;
    period_duration_minutes: number;
    break_after_periods: any;
    generation_status: string;
    is_active: boolean;
  };
  section: ClassSectionInfo;
  subjects: AcademicSubject[];
  faculty_assignments: FacultyAssignment[];
  classrooms: ClassroomInfo[];
  periods: TimetablePeriodSlot[];
  faculty_availability: FacultyAvailabilitySlot[];
  classroom_availability: RoomAvailabilitySlot[];
  constraints: TimetableGenerationConstraints;
  request: TimetableGenerationRequest;
}

/**
 * Maps database error codes to safe HTTP status codes and client-friendly messages.
 */
function mapDatabaseError(error: any): { message: string; status: number } {
  const code = error?.code;
  const rawMsg = error?.message || "";

  if (code === "42501" || rawMsg.includes("not authorized") || rawMsg.includes("Authentication required")) {
    return { message: "You are not authorized to perform this timetable action", status: 403 };
  }
  if (code === "P0002" || rawMsg.includes("not found")) {
    return { message: "Requested timetable entity not found", status: 404 };
  }
  if (code === "23503") {
    return { message: "Referenced academic record or entity does not exist", status: 400 };
  }
  if (code === "23505") {
    return { message: "Duplicate entity or slot assignment detected", status: 400 };
  }
  if (code === "23514") {
    return { message: "Value violates database constraints (e.g. invalid capacity or period range)", status: 400 };
  }
  if (code === "22023" || code === "22P02" || code === "22003") {
    return { message: rawMsg || "Invalid payload format or out-of-range value", status: 400 };
  }

  return { message: "An unexpected database error occurred while processing timetable data", status: 500 };
}

export class TimetableDataService {
  /**
   * Fetch active academic subjects, optionally filtered by department, semester, or section.
   * If section_id is provided, subjects are enriched with subject_scheduling_requirements.
   */
  static async fetchSubjects(
    supabase: SupabaseClient,
    options?: {
      department_id?: string;
      semester_id?: string;
      section_id?: string;
      is_active?: boolean;
    }
  ): Promise<ServiceResult<AcademicSubject[]>> {
    try {
      let query = supabase.from("subjects").select("*");

      if (options?.is_active !== undefined) {
        query = query.eq("is_active", options.is_active);
      } else {
        query = query.eq("is_active", true);
      }

      if (options?.department_id) {
        query = query.eq("department_id", options.department_id);
      }
      if (options?.semester_id) {
        query = query.eq("semester_id", options.semester_id);
      }

      const { data: rawSubjects, error: subjectsErr } = await query;
      if (subjectsErr) {
        const mapped = mapDatabaseError(subjectsErr);
        return { data: null, error: mapped.message, status: mapped.status };
      }

      // If section_id is provided, load scheduling requirements to enrich subject metadata
      let reqsMap = new Map<string, any>();
      if (options?.section_id) {
        const { data: rawReqs } = await supabase
          .from("subject_scheduling_requirements")
          .select("*")
          .eq("section_id", options.section_id)
          .eq("is_active", true);

        if (rawReqs) {
          for (const req of rawReqs) {
            reqsMap.set(req.subject_id, req);
          }
        }
      }

      const subjects: AcademicSubject[] = (rawSubjects || []).map((s: any) => {
        const req = reqsMap.get(s.id);
        const weeklyPeriods = req?.weekly_periods ?? s.total_weekly_periods ?? s.lecture_hours_per_week ?? 3;
        const isLab = s.is_lab || s.subject_type === "LABORATORY" || s.subject_type === "PRACTICAL" || !!req?.requires_lab;
        const consecutivePeriods = req?.consecutive_periods ?? (isLab ? 2 : 1);
        const requiresConsecutiveSlots = req?.requires_consecutive_slots ?? (isLab && consecutivePeriods > 1);

        return {
          id: s.id,
          code: s.code,
          name: s.name,
          department_id: s.department_id,
          credits: s.credits,
          is_lab: isLab,
          weekly_periods: weeklyPeriods,
          requires_consecutive_slots: requiresConsecutiveSlots,
          consecutive_periods: consecutivePeriods,
          is_active: s.is_active ?? true,
        };
      });

      return { data: subjects, error: null, status: 200 };
    } catch {
      return { data: null, error: "Internal error retrieving academic subjects", status: 500 };
    }
  }

  /**
   * Fetch active class sections.
   */
  static async fetchSections(
    supabase: SupabaseClient,
    options?: {
      department_id?: string;
      semester_id?: string;
      academic_year_id?: string;
      section_id?: string;
      is_active?: boolean;
    }
  ): Promise<ServiceResult<ClassSectionInfo[]>> {
    try {
      let query = supabase.from("class_sections").select("*");

      if (options?.is_active !== undefined) {
        query = query.eq("is_active", options.is_active);
      } else {
        query = query.eq("is_active", true);
      }

      if (options?.section_id) {
        query = query.eq("id", options.section_id);
      }
      if (options?.department_id) {
        query = query.eq("department_id", options.department_id);
      }
      if (options?.semester_id) {
        query = query.eq("semester_id", options.semester_id);
      }
      if (options?.academic_year_id) {
        query = query.eq("academic_year_id", options.academic_year_id);
      }

      const { data: rawSections, error } = await query;
      if (error) {
        const mapped = mapDatabaseError(error);
        return { data: null, error: mapped.message, status: mapped.status };
      }

      const sections: ClassSectionInfo[] = (rawSections || []).map((sec: any) => ({
        id: sec.id,
        name: sec.name,
        code: sec.code,
        capacity: sec.capacity,
        department_id: sec.department_id,
        semester_id: sec.semester_id,
        academic_year_id: sec.academic_year_id,
        is_active: sec.is_active ?? true,
      }));

      return { data: sections, error: null, status: 200 };
    } catch {
      return { data: null, error: "Internal error retrieving class sections", status: 500 };
    }
  }

  /**
   * Fetch faculty-to-subject assignments for sections.
   */
  static async fetchFacultyAssignments(
    supabase: SupabaseClient,
    options?: {
      section_id?: string;
      subject_id?: string;
      academic_year_id?: string;
      faculty_id?: string;
    }
  ): Promise<ServiceResult<FacultyAssignment[]>> {
    try {
      let query = supabase.from("faculty_subjects").select("*");

      if (options?.section_id) {
        query = query.eq("section_id", options.section_id);
      }
      if (options?.subject_id) {
        query = query.eq("subject_id", options.subject_id);
      }
      if (options?.academic_year_id) {
        query = query.eq("academic_year_id", options.academic_year_id);
      }
      if (options?.faculty_id) {
        query = query.eq("faculty_id", options.faculty_id);
      }

      const { data: rawAssignments, error } = await query;
      if (error) {
        const mapped = mapDatabaseError(error);
        return { data: null, error: mapped.message, status: mapped.status };
      }

      const assignments: FacultyAssignment[] = (rawAssignments || []).map((a: any) => ({
        id: a.id,
        faculty_id: a.faculty_id,
        subject_id: a.subject_id,
        section_id: a.section_id,
        is_primary: a.is_primary ?? true,
      }));

      return { data: assignments, error: null, status: 200 };
    } catch {
      return { data: null, error: "Internal error retrieving faculty assignments", status: 500 };
    }
  }

  /**
   * Fetch available classrooms.
   */
  static async fetchClassrooms(
    supabase: SupabaseClient,
    options?: {
      is_available?: boolean;
      room_type?: string;
    }
  ): Promise<ServiceResult<ClassroomInfo[]>> {
    try {
      let query = supabase.from("classrooms").select("*");

      if (options?.is_available !== undefined) {
        query = query.eq("is_available", options.is_available);
      } else {
        query = query.eq("is_available", true);
      }

      if (options?.room_type) {
        query = query.eq("room_type", options.room_type);
      }

      const { data: rawClassrooms, error } = await query;
      if (error) {
        const mapped = mapDatabaseError(error);
        return { data: null, error: mapped.message, status: mapped.status };
      }

      const classrooms: ClassroomInfo[] = (rawClassrooms || []).map((c: any) => ({
        id: c.id,
        room_number: c.room_number,
        building: c.building,
        floor: c.floor,
        room_type: (c.room_type || "LECTURE_HALL") as RoomType,
        capacity: c.capacity,
        is_available: c.is_available ?? true,
      }));

      return { data: classrooms, error: null, status: 200 };
    } catch {
      return { data: null, error: "Internal error retrieving classrooms", status: 500 };
    }
  }

  /**
   * Fetch timetable discrete period slots for a specific configuration.
   */
  static async fetchPeriods(
    supabase: SupabaseClient,
    configurationId: string
  ): Promise<ServiceResult<TimetablePeriodSlot[]>> {
    try {
      if (!configurationId) {
        return { data: null, error: "Configuration ID is required", status: 400 };
      }

      const { data: rawPeriods, error } = await supabase
        .from("timetable_periods")
        .select("*")
        .eq("timetable_configuration_id", configurationId)
        .eq("is_active", true)
        .order("day_of_week", { ascending: true })
        .order("period_number", { ascending: true });

      if (error) {
        const mapped = mapDatabaseError(error);
        return { data: null, error: mapped.message, status: mapped.status };
      }

      const periods: TimetablePeriodSlot[] = (rawPeriods || []).map((p: any) => ({
        id: p.id,
        timetable_configuration_id: p.timetable_configuration_id,
        day_of_week: p.day_of_week as DayOfWeek,
        period_number: p.period_number,
        start_time: p.start_time,
        end_time: p.end_time,
        is_break: p.is_break ?? false,
        is_active: p.is_active ?? true,
      }));

      return { data: periods, error: null, status: 200 };
    } catch {
      return { data: null, error: "Internal error retrieving timetable periods", status: 500 };
    }
  }

  /**
   * Fetch faculty availability slots, normalizing database period_slot to period_number.
   */
  static async fetchFacultyAvailability(
    supabase: SupabaseClient,
    facultyIds?: string[]
  ): Promise<ServiceResult<FacultyAvailabilitySlot[]>> {
    try {
      let query = supabase.from("faculty_availability").select("*");

      if (facultyIds && facultyIds.length > 0) {
        query = query.in("faculty_id", facultyIds);
      }

      const { data: rawAvail, error } = await query;
      if (error) {
        const mapped = mapDatabaseError(error);
        return { data: null, error: mapped.message, status: mapped.status };
      }

      const availability: FacultyAvailabilitySlot[] = (rawAvail || []).map((a: any) => ({
        faculty_id: a.faculty_id,
        day_of_week: a.day_of_week as DayOfWeek,
        period_number: a.period_slot ?? a.period_number,
        is_available: a.is_available ?? (a.availability_status !== "UNAVAILABLE"),
        reason: a.notes,
      }));

      return { data: availability, error: null, status: 200 };
    } catch {
      return { data: null, error: "Internal error retrieving faculty availability", status: 500 };
    }
  }

  /**
   * Fetch classroom availability slots.
   */
  static async fetchClassroomAvailability(
    supabase: SupabaseClient,
    classroomIds?: string[]
  ): Promise<ServiceResult<RoomAvailabilitySlot[]>> {
    try {
      let query = supabase.from("classroom_availability").select("*");

      if (classroomIds && classroomIds.length > 0) {
        query = query.in("classroom_id", classroomIds);
      }

      const { data: rawAvail, error } = await query;
      if (error) {
        // If table is newly created or empty, handle gracefully
        if (error.code === "PGRST205" || error.message?.includes("Could not find the table")) {
          return { data: [], error: null, status: 200 };
        }
        const mapped = mapDatabaseError(error);
        return { data: null, error: mapped.message, status: mapped.status };
      }

      const availability: RoomAvailabilitySlot[] = (rawAvail || []).map((a: any) => ({
        classroom_id: a.classroom_id,
        day_of_week: a.day_of_week as DayOfWeek,
        period_number: a.period_number,
        is_available: a.is_available ?? true,
        reason: a.reason,
      }));

      return { data: availability, error: null, status: 200 };
    } catch {
      return { data: null, error: "Internal error retrieving classroom availability", status: 500 };
    }
  }

  /**
   * Fetch active timetable configuration by ID.
   */
  static async fetchActiveTimetableConfiguration(
    supabase: SupabaseClient,
    configurationId: string
  ): Promise<ServiceResult<any>> {
    try {
      if (!configurationId) {
        return { data: null, error: "Configuration ID is required", status: 400 };
      }

      const { data: config, error } = await supabase
        .from("timetable_configurations")
        .select("*, academic_year:academic_years(*), semester:semesters(*), section:class_sections(*)")
        .eq("id", configurationId)
        .maybeSingle();

      if (error) {
        const mapped = mapDatabaseError(error);
        return { data: null, error: mapped.message, status: mapped.status };
      }

      if (!config) {
        return { data: null, error: "Timetable configuration not found", status: 404 };
      }

      if (!config.is_active) {
        return { data: null, error: "Selected timetable configuration is inactive", status: 400 };
      }

      return { data: config, error: null, status: 200 };
    } catch {
      return { data: null, error: "Internal error retrieving timetable configuration", status: 500 };
    }
  }

  /**
   * Assemble and validate all prerequisite records from Supabase into a complete,
   * validated TimetableGenerationInputData dataset ready for the solver.
   */
  static async buildValidatedGenerationInput(
    supabase: SupabaseClient,
    input: {
      configuration_id: string;
      section_id: string;
      constraints?: Partial<TimetableGenerationConstraints>;
      timeout_seconds?: number;
      random_seed?: number;
    }
  ): Promise<ServiceResult<TimetableGenerationInputData>> {
    try {
      // 1. Validate IDs
      const uuidCheck = z.object({
        configuration_id: z.string().uuid("Invalid configuration ID: must be a valid UUID"),
        section_id: z.string().uuid("Invalid section ID: must be a valid UUID"),
      });
      const parsedIds = uuidCheck.safeParse(input);
      if (!parsedIds.success) {
        return {
          data: null,
          error: parsedIds.error.errors[0]?.message || "Invalid configuration or section ID",
          status: 400,
        };
      }

      // 2. Fetch Active Configuration
      const configRes = await this.fetchActiveTimetableConfiguration(supabase, input.configuration_id);
      if (!configRes.data || configRes.error) {
        return { data: null, error: configRes.error || "Configuration not found", status: configRes.status };
      }
      const config = configRes.data;

      // Section check
      if (config.section_id !== input.section_id) {
        return {
          data: null,
          error: `Section mismatch: Configuration is configured for section '${config.section_id}', but section '${input.section_id}' was requested.`,
          status: 400,
        };
      }

      // 3. Fetch Section Info
      const sectionRes = await this.fetchSections(supabase, { section_id: input.section_id });
      if (!sectionRes.data || sectionRes.data.length === 0) {
        return { data: null, error: "Target class section not found", status: 404 };
      }
      const section = sectionRes.data[0];

      // 4. Fetch Periods for Configuration
      const periodsRes = await this.fetchPeriods(supabase, input.configuration_id);
      if (!periodsRes.data || periodsRes.data.length === 0) {
        return {
          data: null,
          error: "No active periods configured for this timetable configuration. Please generate periods first.",
          status: 400,
        };
      }
      const periods = periodsRes.data;

      // 5. Fetch Subjects (enriched with section scheduling requirements)
      const subjectsRes = await this.fetchSubjects(supabase, {
        section_id: input.section_id,
        semester_id: config.semester_id,
        is_active: true,
      });
      if (!subjectsRes.data || subjectsRes.data.length === 0) {
        return {
          data: null,
          error: "No subjects found for this section. Please configure academic curriculum or subject scheduling requirements first.",
          status: 400,
        };
      }
      const subjects = subjectsRes.data;

      // 6. Fetch Faculty Assignments for Section
      const assignRes = await this.fetchFacultyAssignments(supabase, {
        section_id: input.section_id,
        academic_year_id: config.academic_year_id,
      });
      if (!assignRes.data) {
        return { data: null, error: assignRes.error || "Failed to load faculty assignments", status: assignRes.status };
      }
      const assignments = assignRes.data;

      // Ensure every subject has at least one faculty assignment for this section
      const assignedSubjectIds = new Set(assignments.map((a) => a.subject_id));
      const unassignedSubjects = subjects.filter((s) => !assignedSubjectIds.has(s.id));
      if (unassignedSubjects.length > 0) {
        const missingNames = unassignedSubjects.map((s) => `${s.code} (${s.name})`).join(", ");
        return {
          data: null,
          error: `Missing faculty assignments for required subjects: ${missingNames}. Every subject must have an assigned instructor before timetable generation.`,
          status: 400,
        };
      }

      // 7. Fetch Classrooms
      const classRes = await this.fetchClassrooms(supabase, { is_available: true });
      if (!classRes.data || classRes.data.length === 0) {
        return {
          data: null,
          error: "No available classrooms found in the institutional master data.",
          status: 400,
        };
      }
      const classrooms = classRes.data;

      // Check for lab subject classroom requirement compatibility
      const hasLabSubject = subjects.some((s) => s.is_lab);
      const hasLabClassroom = classrooms.some((c) => c.room_type === "LABORATORY" || c.room_type === "WORKSHOP");
      if (hasLabSubject && !hasLabClassroom) {
        return {
          data: null,
          error: "Curriculum contains laboratory/practical subjects, but no available laboratory classrooms exist in master data.",
          status: 400,
        };
      }

      // 8. Fetch Faculty Availability for assigned faculty
      const assignedFacultyIds = Array.from(new Set(assignments.map((a) => a.faculty_id)));
      const facultyAvailRes = await this.fetchFacultyAvailability(supabase, assignedFacultyIds);
      const facultyAvailability = facultyAvailRes.data || [];

      // 9. Fetch Classroom Availability
      const classroomIds = classrooms.map((c) => c.id);
      const roomAvailRes = await this.fetchClassroomAvailability(supabase, classroomIds);
      const classroomAvailability = roomAvailRes.data || [];

      // 10. Merge and validate constraints
      const mergedConstraints: TimetableGenerationConstraints = {
        ...DEFAULT_TIMETABLE_CONSTRAINTS,
        ...(input.constraints || {}),
      };

      const constraintValidation = validateGenerationConstraints(mergedConstraints);
      if (!constraintValidation.isValid) {
        return {
          data: null,
          error: `Invalid generation constraints: ${constraintValidation.conflicts.map((c) => c.message).join("; ")}`,
          status: 400,
        };
      }

      // 11. Assemble TimetableGenerationRequest contract
      const request: TimetableGenerationRequest = {
        configuration_id: input.configuration_id,
        section_id: input.section_id,
        academic_year_id: config.academic_year_id,
        constraints: mergedConstraints,
        timeout_seconds: input.timeout_seconds ?? 30,
        random_seed: input.random_seed ?? 42,
      };

      const fullData: TimetableGenerationInputData = {
        configuration: {
          id: config.id,
          name: config.name,
          description: config.description,
          academic_year_id: config.academic_year_id,
          semester_id: config.semester_id,
          section_id: config.section_id,
          working_days: config.working_days,
          periods_per_day: config.periods_per_day,
          period_duration_minutes: config.period_duration_minutes,
          break_after_periods: config.break_after_periods,
          generation_status: config.generation_status,
          is_active: config.is_active,
        },
        section,
        subjects,
        faculty_assignments: assignments,
        classrooms,
        periods,
        faculty_availability: facultyAvailability,
        classroom_availability: classroomAvailability,
        constraints: mergedConstraints,
        request,
      };

      return { data: fullData, error: null, status: 200 };
    } catch {
      return { data: null, error: "Internal error assembling timetable generation input", status: 500 };
    }
  }

  // ---------------------------------------------------------------------------
  // 10. FETCH PUBLISHED TIMETABLE FOR SECTION
  // ---------------------------------------------------------------------------
  static async fetchPublishedTimetableForSection(
    supabase: SupabaseClient,
    sectionId: string
  ): Promise<ServiceResult<{
    generation: Record<string, unknown>;
    configuration: Record<string, unknown>;
    section: Record<string, unknown>;
    entries: any[];
    periods: any[];
  }>> {
    try {
      if (!sectionId) {
        return { data: null, error: "Section ID is required", status: 400 };
      }

      // Find published configuration for this section
      const { data: config, error: cfgErr } = await supabase
        .from("timetable_configurations")
        .select("*, academic_year:academic_years(name), semester:semesters(name)")
        .eq("section_id", sectionId)
        .eq("generation_status", "PUBLISHED")
        .eq("is_active", true)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cfgErr) {
        return { data: null, error: cfgErr.message, status: 500 };
      }

      // If no config has status PUBLISHED, check for active configs with published generations
      let targetConfig = config;
      if (!targetConfig) {
        const { data: altConfig } = await supabase
          .from("timetable_configurations")
          .select("*, academic_year:academic_years(name), semester:semesters(name)")
          .eq("section_id", sectionId)
          .eq("is_active", true)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (altConfig) targetConfig = altConfig;
      }

      if (!targetConfig) {
        return { data: null, error: "No active timetable found for this section", status: 404 };
      }

      // Find the published generation for this configuration
      let { data: generation, error: genErr } = await supabase
        .from("timetable_generations")
        .select("*, author:profiles!generated_by(first_name, last_name, email)")
        .eq("timetable_configuration_id", targetConfig.id)
        .eq("status", "COMPLETED")
        .order("generation_number", { ascending: false });

      if (genErr) {
        return { data: null, error: genErr.message, status: 500 };
      }

      // Filter for published generation
      const pubGen = (generation || []).find((g: any) => {
        return g.is_published === true || (g.metadata && g.metadata.is_published === true);
      }) || generation?.[0]; // Fallback if configuration is published

      if (!pubGen) {
        return { data: null, error: "No published timetable generation exists for this section", status: 404 };
      }

      // Fetch entries
      const { data: entries, error: entErr } = await supabase
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
        .eq("timetable_generation_id", pubGen.id)
        .order("occurrence_index", { ascending: true });

      if (entErr) {
        return { data: null, error: entErr.message, status: 500 };
      }

      // Fetch periods for the configuration
      const { data: periods } = await supabase
        .from("timetable_periods")
        .select("*")
        .eq("timetable_configuration_id", targetConfig.id)
        .eq("is_active", true)
        .order("period_number", { ascending: true });

      // Fetch section details
      const { data: section } = await supabase
        .from("class_sections")
        .select("*, department:departments(name)")
        .eq("id", sectionId)
        .maybeSingle();

      return {
        data: {
          generation: pubGen,
          configuration: targetConfig,
          section: section || {},
          entries: entries || [],
          periods: periods || [],
        },
        error: null,
        status: 200,
      };
    } catch {
      return { data: null, error: "Failed to fetch published timetable for section", status: 500 };
    }
  }

  // ---------------------------------------------------------------------------
  // 11. FETCH PUBLISHED TIMETABLE FOR FACULTY
  // ---------------------------------------------------------------------------
  static async fetchPublishedTimetableForFaculty(
    supabase: SupabaseClient,
    facultyId: string
  ): Promise<ServiceResult<{
    faculty: Record<string, unknown>;
    entries: any[];
    periods: any[];
  }>> {
    try {
      if (!facultyId) {
        return { data: null, error: "Faculty ID is required", status: 400 };
      }

      // Fetch faculty details
      const { data: faculty, error: facErr } = await supabase
        .from("faculty")
        .select("id, employee_id, department_id, profile:profiles(first_name, last_name, email)")
        .eq("id", facultyId)
        .maybeSingle();

      if (facErr || !faculty) {
        return { data: null, error: "Faculty member not found", status: 404 };
      }

      // Fetch all entries for this faculty where the generation is published
      const { data: entries, error: entErr } = await supabase
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
          generation:timetable_generations!inner(
            id,
            metadata,
            configuration:timetable_configurations!inner(
              id,
              name,
              generation_status
            )
          ),
          section:class_sections(id, name),
          subject:subjects(id, code, name),
          classroom:classrooms(id, room_number, room_type),
          period:timetable_periods(id, day_of_week, period_number, start_time, end_time)
        `)
        .eq("faculty_id", facultyId);

      if (entErr) {
        return { data: null, error: entErr.message, status: 500 };
      }

      // Filter entries to only include those from published generations
      const publishedEntries = (entries || []).filter((e: any) => {
        const gen = e.generation;
        if (!gen) return false;
        const isPubGen = gen.is_published === true || (gen.metadata && gen.metadata.is_published === true);
        const isPubConfig = gen.configuration && gen.configuration.generation_status === "PUBLISHED";
        return isPubGen || isPubConfig;
      });

      return {
        data: {
          faculty,
          entries: publishedEntries,
          periods: [],
        },
        error: null,
        status: 200,
      };
    } catch {
      return { data: null, error: "Failed to fetch published timetable for faculty", status: 500 };
    }
  }

  // ---------------------------------------------------------------------------
  // 12. FETCH TIMETABLE DRAFTS
  // ---------------------------------------------------------------------------
  static async fetchTimetableDrafts(
    supabase: SupabaseClient,
    configurationId?: string
  ): Promise<ServiceResult<any[]>> {
    try {
      let query = supabase
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
          is_published,
          published_at,
          published_by,
          archived_at,
          metadata,
          created_at,
          configuration:timetable_configurations(
            id,
            name,
            generation_status,
            section_id,
            section:class_sections(id, name)
          ),
          author:profiles!generated_by(first_name, last_name, email)
        `)
        .order("created_at", { ascending: false });

      if (configurationId) {
        query = query.eq("timetable_configuration_id", configurationId);
      }

      const { data, error } = await query;
      if (error) {
        return { data: null, error: error.message, status: 500 };
      }

      return { data: data || [], error: null, status: 200 };
    } catch {
      return { data: null, error: "Failed to list timetable drafts", status: 500 };
    }
  }
}

