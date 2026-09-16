import { z } from "zod";

// -----------------------------------------------------------------------------
// 1. WORKING DAYS & TIME ENUMS
// -----------------------------------------------------------------------------

/**
 * Standard ISO Day of the Week (1 = Monday, 6 = Saturday, 7 = Sunday).
 */
export type DayOfWeek = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const DayOfWeekSchema = z
  .number()
  .int()
  .min(1, "Day of week must be between 1 (Monday) and 7 (Sunday)")
  .max(7, "Day of week must be between 1 (Monday) and 7 (Sunday)");

export const DAY_OF_WEEK_NAMES: Record<DayOfWeek, string> = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
  7: "Sunday",
};

export interface WorkingDaysConfig {
  enabled_days: DayOfWeek[];
  total_working_days: number;
}

export const WorkingDaysConfigSchema = z.object({
  enabled_days: z.array(DayOfWeekSchema).min(1, "At least one working day must be enabled").max(7),
  total_working_days: z.number().int().min(1).max(7),
});

// -----------------------------------------------------------------------------
// 2. ROOM & SUBJECT TYPES
// -----------------------------------------------------------------------------

export type RoomType =
  | "LECTURE_HALL"
  | "LABORATORY"
  | "SEMINAR_HALL"
  | "WORKSHOP"
  | "AUDITORIUM";

export const RoomTypeSchema = z.enum([
  "LECTURE_HALL",
  "LABORATORY",
  "SEMINAR_HALL",
  "WORKSHOP",
  "AUDITORIUM",
]);

export interface AcademicSubject {
  id: string;
  code: string;
  name: string;
  department_id?: string | null;
  credits: number;
  is_lab: boolean;
  weekly_periods: number;
  consecutive_periods?: number;
  subject_type?: string;
  is_active?: boolean;
}

export const AcademicSubjectSchema = z.object({
  id: z.string().uuid("Invalid Subject ID"),
  code: z.string().min(1, "Subject code required"),
  name: z.string().min(1, "Subject name required"),
  department_id: z.string().uuid().optional().nullable(),
  credits: z.number().int().nonnegative(),
  is_lab: z.boolean().default(false),
  weekly_periods: z.number().int().positive("Weekly periods must be positive"),
  consecutive_periods: z.number().int().positive().optional().default(1),
  subject_type: z.string().optional(),
  is_active: z.boolean().optional().default(true),
});

export interface ClassSectionInfo {
  id: string;
  name: string;
  code?: string;
  capacity: number;
  department_id?: string | null;
  semester_id?: string | null;
  academic_year_id?: string | null;
  is_active?: boolean;
}

export const ClassSectionInfoSchema = z.object({
  id: z.string().uuid("Invalid Section ID"),
  name: z.string().min(1, "Section name required"),
  code: z.string().optional(),
  capacity: z.number().int().positive("Section capacity must be positive (> 0)"),
  department_id: z.string().uuid().optional().nullable(),
  semester_id: z.string().uuid().optional().nullable(),
  academic_year_id: z.string().uuid().optional().nullable(),
  is_active: z.boolean().optional().default(true),
});

export interface FacultyAssignment {
  id: string;
  faculty_id: string;
  subject_id: string;
  section_id: string;
  is_primary?: boolean;
  max_periods_per_week?: number;
}

export const FacultyAssignmentSchema = z.object({
  id: z.string().uuid("Invalid Assignment ID"),
  faculty_id: z.string().uuid("Invalid Faculty ID"),
  subject_id: z.string().uuid("Invalid Subject ID"),
  section_id: z.string().uuid("Invalid Section ID"),
  is_primary: z.boolean().optional().default(true),
  max_periods_per_week: z.number().int().positive().optional(),
});

export interface ClassroomInfo {
  id: string;
  room_number: string;
  building?: string | null;
  floor?: number | null;
  room_type: RoomType;
  capacity: number;
  is_available: boolean;
}

export const ClassroomInfoSchema = z.object({
  id: z.string().uuid("Invalid Classroom ID"),
  room_number: z.string().min(1, "Room number required"),
  building: z.string().optional().nullable(),
  floor: z.number().int().optional().nullable(),
  room_type: RoomTypeSchema.default("LECTURE_HALL"),
  capacity: z.number().int().positive("Classroom capacity must be positive (> 0)"),
  is_available: z.boolean().default(true),
});

// -----------------------------------------------------------------------------
// 3. PERIODS & AVAILABILITY
// -----------------------------------------------------------------------------

export interface TimetablePeriodSlot {
  id: string;
  timetable_configuration_id?: string;
  day_of_week: DayOfWeek;
  period_number: number;
  start_time: string; // HH:MM or HH:MM:SS
  end_time: string;   // HH:MM or HH:MM:SS
  is_break: boolean;
  is_active: boolean;
}

export const TimetablePeriodSlotSchema = z.object({
  id: z.string().uuid("Invalid Period Slot ID"),
  timetable_configuration_id: z.string().uuid().optional(),
  day_of_week: DayOfWeekSchema as unknown as z.ZodType<DayOfWeek>,
  period_number: z.number().int().min(1).max(12),
  start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Invalid start_time format"),
  end_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Invalid end_time format"),
  is_break: z.boolean().default(false),
  is_active: z.boolean().default(true),
});

export interface FacultyAvailabilitySlot {
  faculty_id: string;
  day_of_week: DayOfWeek;
  period_number: number;
  is_available: boolean;
  reason?: string | null;
}

export const FacultyAvailabilitySlotSchema = z.object({
  faculty_id: z.string().uuid("Invalid Faculty ID"),
  day_of_week: DayOfWeekSchema as unknown as z.ZodType<DayOfWeek>,
  period_number: z.number().int().min(1).max(12),
  is_available: z.boolean(),
  reason: z.string().optional().nullable(),
});

export interface RoomAvailabilitySlot {
  classroom_id: string;
  day_of_week: DayOfWeek;
  period_number: number;
  is_available: boolean;
  reason?: string | null;
}

export const RoomAvailabilitySlotSchema = z.object({
  classroom_id: z.string().uuid("Invalid Classroom ID"),
  day_of_week: DayOfWeekSchema as unknown as z.ZodType<DayOfWeek>,
  period_number: z.number().int().min(1).max(12),
  is_available: z.boolean(),
  reason: z.string().optional().nullable(),
});

// -----------------------------------------------------------------------------
// 4. SCHEDULED TIMETABLE ENTRY
// -----------------------------------------------------------------------------

export interface ScheduledTimetableEntry {
  id?: string;
  section_id: string;
  subject_id: string;
  faculty_id: string;
  classroom_id: string;
  day_of_week: DayOfWeek;
  period_number: number;
  occurrence_index?: number;
  session_type?: "THEORY" | "LABORATORY" | "PRACTICAL" | "SEMINAR";
  is_lab?: boolean;
  notes?: string | null;
}

export const ScheduledTimetableEntrySchema = z.object({
  id: z.string().optional(),
  section_id: z.string().uuid("Invalid Section ID"),
  subject_id: z.string().uuid("Invalid Subject ID"),
  faculty_id: z.string().uuid("Invalid Faculty ID"),
  classroom_id: z.string().uuid("Invalid Classroom ID"),
  day_of_week: DayOfWeekSchema as unknown as z.ZodType<DayOfWeek>,
  period_number: z.number().int().min(1).max(12),
  occurrence_index: z.number().int().positive().optional().default(1),
  session_type: z.enum(["THEORY", "LABORATORY", "PRACTICAL", "SEMINAR"]).optional().default("THEORY"),
  is_lab: z.boolean().optional().default(false),
  notes: z.string().optional().nullable(),
});

// -----------------------------------------------------------------------------
// 5. TIMETABLE GENERATION CONSTRAINTS
// -----------------------------------------------------------------------------

export interface TimetableGenerationConstraints {
  // Hard constraints (must not be violated)
  no_faculty_double_booking: boolean;
  no_classroom_double_booking: boolean;
  no_section_period_clashes: boolean;
  respect_faculty_unavailability: boolean;
  respect_classroom_capacity: boolean;
  enforce_lab_room_requirements: boolean;
  prevent_scheduling_during_breaks: boolean;
  valid_faculty_subject_assignment_only: boolean;

  // Soft constraints / preferences (optimized by solver)
  max_periods_per_day_per_subject?: number;
  consecutive_lab_periods?: boolean;
  distribute_faculty_load_evenly?: boolean;
  minimize_isolated_periods?: boolean;
  preferred_room_types?: Record<string, RoomType>;
}

export const TimetableGenerationConstraintsSchema = z.object({
  no_faculty_double_booking: z.boolean().default(true),
  no_classroom_double_booking: z.boolean().default(true),
  no_section_period_clashes: z.boolean().default(true),
  respect_faculty_unavailability: z.boolean().default(true),
  respect_classroom_capacity: z.boolean().default(true),
  enforce_lab_room_requirements: z.boolean().default(true),
  prevent_scheduling_during_breaks: z.boolean().default(true),
  valid_faculty_subject_assignment_only: z.boolean().default(true),
  max_periods_per_day_per_subject: z.number().int().positive().optional().default(2),
  consecutive_lab_periods: z.boolean().optional().default(true),
  distribute_faculty_load_evenly: z.boolean().optional().default(true),
  minimize_isolated_periods: z.boolean().optional().default(true),
  preferred_room_types: z.record(z.string(), RoomTypeSchema).optional(),
});

export const DEFAULT_TIMETABLE_CONSTRAINTS: TimetableGenerationConstraints = {
  no_faculty_double_booking: true,
  no_classroom_double_booking: true,
  no_section_period_clashes: true,
  respect_faculty_unavailability: true,
  respect_classroom_capacity: true,
  enforce_lab_room_requirements: true,
  prevent_scheduling_during_breaks: true,
  valid_faculty_subject_assignment_only: true,
  max_periods_per_day_per_subject: 2,
  consecutive_lab_periods: true,
  distribute_faculty_load_evenly: true,
  minimize_isolated_periods: true,
};

// -----------------------------------------------------------------------------
// 6. GENERATION REQUEST & RESULT CONTRACTS
// -----------------------------------------------------------------------------

export interface TimetableGenerationRequest {
  configuration_id: string;
  section_id: string;
  academic_year_id: string;
  constraints?: Partial<TimetableGenerationConstraints>;
  timeout_seconds?: number;
  random_seed?: number;
}

export const TimetableGenerationRequestSchema = z.object({
  configuration_id: z.string().uuid("Configuration ID must be a valid UUID"),
  section_id: z.string().uuid("Section ID must be a valid UUID"),
  academic_year_id: z.string().uuid("Academic Year ID must be a valid UUID"),
  constraints: TimetableGenerationConstraintsSchema.partial().optional(),
  timeout_seconds: z.number().int().min(1).max(300).default(30),
  random_seed: z.number().int().default(42),
});

export type TimetableGenerationStatus =
  | "OPTIMAL"
  | "FEASIBLE"
  | "INFEASIBLE"
  | "TIMEOUT"
  | "PARTIAL"
  | "ERROR";

export interface TimetableGenerationResult {
  status: TimetableGenerationStatus;
  section_id: string;
  configuration_id: string;
  entries: ScheduledTimetableEntry[];
  conflicts: TimetableConflict[];
  metrics: {
    solve_duration_ms: number;
    hard_constraint_violations: number;
    soft_constraint_violations: number;
    total_slots_allocated: number;
    total_slots_required: number;
    objective_score?: number | null;
  };
}

// -----------------------------------------------------------------------------
// 7. TIMETABLE CONFLICT MODEL
// -----------------------------------------------------------------------------

export type TimetableConflictType =
  | "FACULTY_DOUBLE_BOOKING"
  | "CLASSROOM_DOUBLE_BOOKING"
  | "SECTION_PERIOD_CLASH"
  | "FACULTY_UNAVAILABLE"
  | "CLASSROOM_CAPACITY_INSUFFICIENT"
  | "INVALID_FACULTY_ASSIGNMENT"
  | "LAB_ROOM_TYPE_MISMATCH"
  | "DUPLICATE_ENTRY"
  | "INVALID_DAY_OR_PERIOD"
  | "MISSING_REQUIRED_CONSTRAINTS";

export type ConflictSeverity = "HARD" | "SOFT";

export interface TimetableConflict {
  id: string;
  type: TimetableConflictType;
  severity: ConflictSeverity;
  message: string;
  entities: {
    day_of_week?: DayOfWeek;
    period_number?: number;
    faculty_id?: string;
    classroom_id?: string;
    section_id?: string;
    subject_id?: string;
    section_capacity?: number;
    classroom_capacity?: number;
    conflicting_entry_ids?: string[];
  };
}

export const TimetableConflictSchema = z.object({
  id: z.string(),
  type: z.enum([
    "FACULTY_DOUBLE_BOOKING",
    "CLASSROOM_DOUBLE_BOOKING",
    "SECTION_PERIOD_CLASH",
    "FACULTY_UNAVAILABLE",
    "CLASSROOM_CAPACITY_INSUFFICIENT",
    "INVALID_FACULTY_ASSIGNMENT",
    "LAB_ROOM_TYPE_MISMATCH",
    "DUPLICATE_ENTRY",
    "INVALID_DAY_OR_PERIOD",
    "MISSING_REQUIRED_CONSTRAINTS",
  ]),
  severity: z.enum(["HARD", "SOFT"]),
  message: z.string().min(1),
  entities: z.object({
    day_of_week: DayOfWeekSchema.optional(),
    period_number: z.number().int().optional(),
    faculty_id: z.string().uuid().optional(),
    classroom_id: z.string().uuid().optional(),
    section_id: z.string().uuid().optional(),
    subject_id: z.string().uuid().optional(),
    section_capacity: z.number().int().optional(),
    classroom_capacity: z.number().int().optional(),
    conflicting_entry_ids: z.array(z.string()).optional(),
  }),
});
