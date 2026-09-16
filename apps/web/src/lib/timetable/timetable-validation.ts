import {
  ScheduledTimetableEntry,
  FacultyAvailabilitySlot,
  ClassroomInfo,
  ClassSectionInfo,
  AcademicSubject,
  FacultyAssignment,
  TimetablePeriodSlot,
  TimetableConflict,
  TimetableGenerationConstraints,
  TimetableGenerationConstraintsSchema,
  DayOfWeek,
} from "../../types/timetable";

/**
 * Unique identifier generator for conflicts.
 */
function createConflictId(prefix: string, ...parts: Array<string | number | undefined>): string {
  const cleanParts = parts.filter((p) => p !== undefined).map(String);
  return `${prefix}_${cleanParts.join("_")}`;
}

// -----------------------------------------------------------------------------
// 1. FACULTY DOUBLE BOOKING
// -----------------------------------------------------------------------------
/**
 * Detects whenever a faculty member is assigned to two or more different
 * classes/sections/rooms in the exact same day of week and period slot.
 */
export function detectFacultyDoubleBooking(
  entries: ScheduledTimetableEntry[]
): TimetableConflict[] {
  const conflicts: TimetableConflict[] = [];
  const map = new Map<string, ScheduledTimetableEntry[]>();

  for (const entry of entries) {
    const key = `${entry.faculty_id}|${entry.day_of_week}|${entry.period_number}`;
    const existing = map.get(key) || [];
    existing.push(entry);
    map.set(key, existing);
  }

  for (const [key, grouped] of map.entries()) {
    if (grouped.length > 1) {
      // Distinct sections or rooms
      const sections = new Set(grouped.map((e) => e.section_id));
      const rooms = new Set(grouped.map((e) => e.classroom_id));
      if (sections.size > 1 || rooms.size > 1) {
        const [facultyId, day, period] = key.split("|");
        conflicts.push({
          id: createConflictId("faculty_double_booking", facultyId, day, period),
          type: "FACULTY_DOUBLE_BOOKING",
          severity: "HARD",
          message: `Faculty ${facultyId} is double-booked on day ${day}, period ${period} across ${grouped.length} slots`,
          entities: {
            faculty_id: facultyId,
            day_of_week: Number(day) as DayOfWeek,
            period_number: Number(period),
            conflicting_entry_ids: grouped.map((e) => e.id).filter(Boolean) as string[],
          },
        });
      }
    }
  }

  return conflicts;
}

// -----------------------------------------------------------------------------
// 2. CLASSROOM DOUBLE BOOKING
// -----------------------------------------------------------------------------
/**
 * Detects whenever a classroom is occupied by more than one class/section
 * in the same day and period slot.
 */
export function detectClassroomDoubleBooking(
  entries: ScheduledTimetableEntry[]
): TimetableConflict[] {
  const conflicts: TimetableConflict[] = [];
  const map = new Map<string, ScheduledTimetableEntry[]>();

  for (const entry of entries) {
    const key = `${entry.classroom_id}|${entry.day_of_week}|${entry.period_number}`;
    const existing = map.get(key) || [];
    existing.push(entry);
    map.set(key, existing);
  }

  for (const [key, grouped] of map.entries()) {
    if (grouped.length > 1) {
      const sections = new Set(grouped.map((e) => e.section_id));
      if (sections.size > 1) {
        const [classroomId, day, period] = key.split("|");
        conflicts.push({
          id: createConflictId("room_double_booking", classroomId, day, period),
          type: "CLASSROOM_DOUBLE_BOOKING",
          severity: "HARD",
          message: `Classroom ${classroomId} is double-booked on day ${day}, period ${period} for multiple sections`,
          entities: {
            classroom_id: classroomId,
            day_of_week: Number(day) as DayOfWeek,
            period_number: Number(period),
            conflicting_entry_ids: grouped.map((e) => e.id).filter(Boolean) as string[],
          },
        });
      }
    }
  }

  return conflicts;
}

// -----------------------------------------------------------------------------
// 3. SECTION PERIOD CLASHES
// -----------------------------------------------------------------------------
/**
 * Detects whenever a student section is scheduled for two or more different
 * subjects/rooms in the same day and period slot.
 */
export function detectSectionPeriodClashes(
  entries: ScheduledTimetableEntry[]
): TimetableConflict[] {
  const conflicts: TimetableConflict[] = [];
  const map = new Map<string, ScheduledTimetableEntry[]>();

  for (const entry of entries) {
    const key = `${entry.section_id}|${entry.day_of_week}|${entry.period_number}`;
    const existing = map.get(key) || [];
    existing.push(entry);
    map.set(key, existing);
  }

  for (const [key, grouped] of map.entries()) {
    if (grouped.length > 1) {
      const subjects = new Set(grouped.map((e) => e.subject_id));
      const rooms = new Set(grouped.map((e) => e.classroom_id));
      if (subjects.size > 1 || rooms.size > 1) {
        const [sectionId, day, period] = key.split("|");
        conflicts.push({
          id: createConflictId("section_clash", sectionId, day, period),
          type: "SECTION_PERIOD_CLASH",
          severity: "HARD",
          message: `Section ${sectionId} has a schedule clash on day ${day}, period ${period} across ${grouped.length} subjects/rooms`,
          entities: {
            section_id: sectionId,
            day_of_week: Number(day) as DayOfWeek,
            period_number: Number(period),
            conflicting_entry_ids: grouped.map((e) => e.id).filter(Boolean) as string[],
          },
        });
      }
    }
  }

  return conflicts;
}

// -----------------------------------------------------------------------------
// 4. FACULTY UNAVAILABLE DURING PERIOD
// -----------------------------------------------------------------------------
/**
 * Detects whenever an entry is scheduled during a slot where the assigned
 * faculty has explicitly marked unavailability (is_available = false).
 */
export function detectFacultyUnavailability(
  entries: ScheduledTimetableEntry[],
  availabilities: FacultyAvailabilitySlot[]
): TimetableConflict[] {
  const conflicts: TimetableConflict[] = [];
  const unavailSet = new Set<string>();

  for (const slot of availabilities) {
    if (!slot.is_available) {
      unavailSet.add(`${slot.faculty_id}|${slot.day_of_week}|${slot.period_number}`);
    }
  }

  for (const entry of entries) {
    const key = `${entry.faculty_id}|${entry.day_of_week}|${entry.period_number}`;
    if (unavailSet.has(key)) {
      conflicts.push({
        id: createConflictId("faculty_unavail", entry.faculty_id, entry.day_of_week, entry.period_number),
        type: "FACULTY_UNAVAILABLE",
        severity: "HARD",
        message: `Faculty ${entry.faculty_id} is unavailable on day ${entry.day_of_week}, period ${entry.period_number}`,
        entities: {
          faculty_id: entry.faculty_id,
          day_of_week: entry.day_of_week,
          period_number: entry.period_number,
          conflicting_entry_ids: entry.id ? [entry.id] : undefined,
        },
      });
    }
  }

  return conflicts;
}

// -----------------------------------------------------------------------------
// 5. CLASSROOM CAPACITY INSUFFICIENCY
// -----------------------------------------------------------------------------
/**
 * Detects whenever a section's student strength exceeds the capacity of the
 * assigned classroom (section.capacity > classroom.capacity).
 */
export function detectClassroomCapacityInsufficiency(
  entries: ScheduledTimetableEntry[],
  classrooms: Map<string, ClassroomInfo>,
  sections: Map<string, ClassSectionInfo>
): TimetableConflict[] {
  const conflicts: TimetableConflict[] = [];

  for (const entry of entries) {
    const room = classrooms.get(entry.classroom_id);
    const section = sections.get(entry.section_id);

    if (room && section) {
      if (section.capacity > room.capacity) {
        conflicts.push({
          id: createConflictId("capacity_insufficient", entry.classroom_id, entry.section_id, entry.day_of_week, entry.period_number),
          type: "CLASSROOM_CAPACITY_INSUFFICIENT",
          severity: "HARD",
          message: `Classroom ${room.room_number} (capacity: ${room.capacity}) is insufficient for section ${section.name} (students: ${section.capacity})`,
          entities: {
            classroom_id: entry.classroom_id,
            section_id: entry.section_id,
            classroom_capacity: room.capacity,
            section_capacity: section.capacity,
            day_of_week: entry.day_of_week,
            period_number: entry.period_number,
            conflicting_entry_ids: entry.id ? [entry.id] : undefined,
          },
        });
      }
    }
  }

  return conflicts;
}

// -----------------------------------------------------------------------------
// 6. INVALID SUBJECT OR SECTION ASSIGNMENT
// -----------------------------------------------------------------------------
/**
 * Validates that each scheduled entry pairs a faculty member with a subject and
 * section they are officially authorized/assigned to teach.
 */
export function detectInvalidSubjectAssignments(
  entries: ScheduledTimetableEntry[],
  validAssignments: FacultyAssignment[]
): TimetableConflict[] {
  const conflicts: TimetableConflict[] = [];
  const assignmentSet = new Set<string>();

  for (const a of validAssignments) {
    assignmentSet.add(`${a.faculty_id}|${a.subject_id}|${a.section_id}`);
  }

  for (const entry of entries) {
    const key = `${entry.faculty_id}|${entry.subject_id}|${entry.section_id}`;
    if (!assignmentSet.has(key)) {
      conflicts.push({
        id: createConflictId("invalid_assignment", entry.faculty_id, entry.subject_id, entry.section_id),
        type: "INVALID_FACULTY_ASSIGNMENT",
        severity: "HARD",
        message: `Faculty ${entry.faculty_id} is not assigned to teach subject ${entry.subject_id} for section ${entry.section_id}`,
        entities: {
          faculty_id: entry.faculty_id,
          subject_id: entry.subject_id,
          section_id: entry.section_id,
          day_of_week: entry.day_of_week,
          period_number: entry.period_number,
          conflicting_entry_ids: entry.id ? [entry.id] : undefined,
        },
      });
    }
  }

  return conflicts;
}

// -----------------------------------------------------------------------------
// 7. LAB SUBJECT CLASSROOM REQUIREMENTS
// -----------------------------------------------------------------------------
/**
 * Detects whenever a practical or laboratory subject (is_lab = true or room_type = LABORATORY)
 * is scheduled in a standard classroom or lecture hall instead of a laboratory.
 */
export function detectLabClassroomRequirements(
  entries: ScheduledTimetableEntry[],
  subjects: Map<string, AcademicSubject>,
  classrooms: Map<string, ClassroomInfo>
): TimetableConflict[] {
  const conflicts: TimetableConflict[] = [];

  for (const entry of entries) {
    const subject = subjects.get(entry.subject_id);
    const room = classrooms.get(entry.classroom_id);

    const isLabRequired = Boolean(
      entry.is_lab ||
      subject?.is_lab ||
      entry.session_type === "LABORATORY" ||
      entry.session_type === "PRACTICAL" ||
      subject?.subject_type?.toUpperCase().includes("LAB")
    );

    if (isLabRequired && room) {
      if (room.room_type !== "LABORATORY" && room.room_type !== "WORKSHOP") {
        conflicts.push({
          id: createConflictId("lab_room_mismatch", entry.subject_id, entry.classroom_id, entry.day_of_week, entry.period_number),
          type: "LAB_ROOM_TYPE_MISMATCH",
          severity: "HARD",
          message: `Laboratory subject ${subject?.code || entry.subject_id} is scheduled in room ${room.room_number} of type ${room.room_type} (expected LABORATORY or WORKSHOP)`,
          entities: {
            subject_id: entry.subject_id,
            classroom_id: entry.classroom_id,
            day_of_week: entry.day_of_week,
            period_number: entry.period_number,
            conflicting_entry_ids: entry.id ? [entry.id] : undefined,
          },
        });
      }
    }
  }

  return conflicts;
}

// -----------------------------------------------------------------------------
// 8. DUPLICATE TIMETABLE ENTRIES
// -----------------------------------------------------------------------------
/**
 * Detects duplicate identical entries with the same section, subject, faculty,
 * classroom, day, and period number.
 */
export function detectDuplicateEntries(
  entries: ScheduledTimetableEntry[]
): TimetableConflict[] {
  const conflicts: TimetableConflict[] = [];
  const map = new Map<string, ScheduledTimetableEntry[]>();

  for (const entry of entries) {
    const key = `${entry.section_id}|${entry.subject_id}|${entry.faculty_id}|${entry.classroom_id}|${entry.day_of_week}|${entry.period_number}`;
    const group = map.get(key) || [];
    group.push(entry);
    map.set(key, group);
  }

  for (const [key, group] of map.entries()) {
    if (group.length > 1) {
      const [sectionId, subjectId, facultyId, roomId, day, period] = key.split("|");
      conflicts.push({
        id: createConflictId("duplicate_entry", sectionId, subjectId, day, period),
        type: "DUPLICATE_ENTRY",
        severity: "HARD",
        message: `Duplicate timetable entry found (${group.length} occurrences) for subject ${subjectId} on day ${day}, period ${period}`,
        entities: {
          section_id: sectionId,
          subject_id: subjectId,
          faculty_id: facultyId,
          classroom_id: roomId,
          day_of_week: Number(day) as DayOfWeek,
          period_number: Number(period),
          conflicting_entry_ids: group.map((e) => e.id).filter(Boolean) as string[],
        },
      });
    }
  }

  return conflicts;
}

// -----------------------------------------------------------------------------
// 9. INVALID DAY OR PERIOD VALUES
// -----------------------------------------------------------------------------
/**
 * Detects entries assigned to:
 * - Days of the week outside the range 1–7.
 * - Non-existent or inactive periods.
 * - Periods designated as breaks (is_break = true).
 */
export function detectInvalidDayOrPeriodValues(
  entries: ScheduledTimetableEntry[],
  validSlots: TimetablePeriodSlot[]
): TimetableConflict[] {
  const conflicts: TimetableConflict[] = [];
  const validSlotMap = new Map<string, TimetablePeriodSlot>();

  for (const slot of validSlots) {
    if (slot.is_active) {
      validSlotMap.set(`${slot.day_of_week}|${slot.period_number}`, slot);
    }
  }

  for (const entry of entries) {
    // 1. Day of week range check
    if (entry.day_of_week < 1 || entry.day_of_week > 7) {
      conflicts.push({
        id: createConflictId("invalid_day", entry.day_of_week, entry.period_number),
        type: "INVALID_DAY_OR_PERIOD",
        severity: "HARD",
        message: `Invalid day of week '${entry.day_of_week}'. Must be between 1 (Monday) and 7 (Sunday)`,
        entities: {
          day_of_week: entry.day_of_week,
          period_number: entry.period_number,
          conflicting_entry_ids: entry.id ? [entry.id] : undefined,
        },
      });
      continue;
    }

    // 2. Period slot existence & break check
    const slotKey = `${entry.day_of_week}|${entry.period_number}`;
    const slot = validSlotMap.get(slotKey);

    if (!slot) {
      conflicts.push({
        id: createConflictId("unconfigured_period", entry.day_of_week, entry.period_number),
        type: "INVALID_DAY_OR_PERIOD",
        severity: "HARD",
        message: `Day ${entry.day_of_week}, period ${entry.period_number} is not an active period in configuration`,
        entities: {
          day_of_week: entry.day_of_week,
          period_number: entry.period_number,
          conflicting_entry_ids: entry.id ? [entry.id] : undefined,
        },
      });
    } else if (slot.is_break) {
      conflicts.push({
        id: createConflictId("scheduled_during_break", entry.day_of_week, entry.period_number),
        type: "INVALID_DAY_OR_PERIOD",
        severity: "HARD",
        message: `Class scheduled during break on day ${entry.day_of_week}, period ${entry.period_number}`,
        entities: {
          day_of_week: entry.day_of_week,
          period_number: entry.period_number,
          conflicting_entry_ids: entry.id ? [entry.id] : undefined,
        },
      });
    }
  }

  return conflicts;
}

// -----------------------------------------------------------------------------
// 10. MISSING REQUIRED GENERATION CONSTRAINTS
// -----------------------------------------------------------------------------
/**
 * Validates that timetable generation constraints are provided, structurally sound,
 * and contain all mandatory boolean hard constraint switches.
 */
export function validateGenerationConstraints(
  rawConstraints: unknown
): {
  isValid: boolean;
  conflicts: TimetableConflict[];
  validatedConstraints?: TimetableGenerationConstraints;
} {
  const conflicts: TimetableConflict[] = [];

  if (!rawConstraints || typeof rawConstraints !== "object") {
    conflicts.push({
      id: "missing_constraints_payload",
      type: "MISSING_REQUIRED_CONSTRAINTS",
      severity: "HARD",
      message: "Timetable generation constraints configuration object is missing or null",
      entities: {},
    });
    return { isValid: false, conflicts };
  }

  const parsed = TimetableGenerationConstraintsSchema.safeParse(rawConstraints);
  if (!parsed.success) {
    for (const err of parsed.error.errors) {
      conflicts.push({
        id: createConflictId("constraint_validation", err.path.join(".")),
        type: "MISSING_REQUIRED_CONSTRAINTS",
        severity: "HARD",
        message: `Constraint error at '${err.path.join(".")}': ${err.message}`,
        entities: {},
      });
    }
    return { isValid: false, conflicts };
  }

  const c = parsed.data;

  // Mandatory hard constraints: double booking flags must be enabled
  const requiredHardSwitches: Array<keyof TimetableGenerationConstraints> = [
    "no_faculty_double_booking",
    "no_classroom_double_booking",
    "no_section_period_clashes",
    "respect_faculty_unavailability",
    "respect_classroom_capacity",
  ];

  for (const switchKey of requiredHardSwitches) {
    if (c[switchKey] !== true) {
      conflicts.push({
        id: createConflictId("disabled_hard_constraint", switchKey),
        type: "MISSING_REQUIRED_CONSTRAINTS",
        severity: "HARD",
        message: `Mandatory hard constraint '${switchKey}' cannot be disabled for production timetable generation`,
        entities: {},
      });
    }
  }

  return {
    isValid: conflicts.length === 0,
    conflicts,
    validatedConstraints: parsed.data as TimetableGenerationConstraints,
  };
}

// -----------------------------------------------------------------------------
// 11. MASTER SCHEDULE VALIDATION PIPELINE
// -----------------------------------------------------------------------------

export interface TimetableValidationContext {
  entries: ScheduledTimetableEntry[];
  validSlots?: TimetablePeriodSlot[];
  subjects?: Map<string, AcademicSubject> | AcademicSubject[];
  classrooms?: Map<string, ClassroomInfo> | ClassroomInfo[];
  sections?: Map<string, ClassSectionInfo> | ClassSectionInfo[];
  facultyAssignments?: FacultyAssignment[];
  facultyAvailabilities?: FacultyAvailabilitySlot[];
  constraints?: unknown;
}

export interface TimetableValidationReport {
  isValid: boolean;
  totalConflicts: number;
  hardConflictCount: number;
  softConflictCount: number;
  conflicts: TimetableConflict[];
  conflictsByType: Record<string, number>;
}

/**
 * Executes all 10 pure validation & conflict detection rules over a candidate
 * timetable schedule and returns a comprehensive conflict report.
 */
export function validateTimetableSchedule(
  context: TimetableValidationContext
): TimetableValidationReport {
  const conflicts: TimetableConflict[] = [];
  const entries = context.entries || [];

  // Normalize array/map structures for fast lookup
  const subjectsMap = context.subjects instanceof Map
    ? context.subjects
    : new Map((context.subjects || []).map((s) => [s.id, s]));

  const classroomsMap = context.classrooms instanceof Map
    ? context.classrooms
    : new Map((context.classrooms || []).map((c) => [c.id, c]));

  const sectionsMap = context.sections instanceof Map
    ? context.sections
    : new Map((context.sections || []).map((s) => [s.id, s]));

  // 1. Faculty Double Booking
  conflicts.push(...detectFacultyDoubleBooking(entries));

  // 2. Classroom Double Booking
  conflicts.push(...detectClassroomDoubleBooking(entries));

  // 3. Section Period Clashes
  conflicts.push(...detectSectionPeriodClashes(entries));

  // 4. Faculty Unavailability
  if (context.facultyAvailabilities && context.facultyAvailabilities.length > 0) {
    conflicts.push(...detectFacultyUnavailability(entries, context.facultyAvailabilities));
  }

  // 5. Classroom Capacity Insufficiency
  if (classroomsMap.size > 0 && sectionsMap.size > 0) {
    conflicts.push(...detectClassroomCapacityInsufficiency(entries, classroomsMap, sectionsMap));
  }

  // 6. Invalid Faculty Subject Assignments
  if (context.facultyAssignments && context.facultyAssignments.length > 0) {
    conflicts.push(...detectInvalidSubjectAssignments(entries, context.facultyAssignments));
  }

  // 7. Lab Classroom Requirements
  if (subjectsMap.size > 0 && classroomsMap.size > 0) {
    conflicts.push(...detectLabClassroomRequirements(entries, subjectsMap, classroomsMap));
  }

  // 8. Duplicate Entries
  conflicts.push(...detectDuplicateEntries(entries));

  // 9. Invalid Day or Period Values
  if (context.validSlots && context.validSlots.length > 0) {
    conflicts.push(...detectInvalidDayOrPeriodValues(entries, context.validSlots));
  }

  // 10. Generation Constraints Check
  if (context.constraints !== undefined) {
    const constraintCheck = validateGenerationConstraints(context.constraints);
    if (!constraintCheck.isValid) {
      conflicts.push(...constraintCheck.conflicts);
    }
  }

  const conflictsByType: Record<string, number> = {};
  let hardCount = 0;
  let softCount = 0;

  for (const c of conflicts) {
    conflictsByType[c.type] = (conflictsByType[c.type] || 0) + 1;
    if (c.severity === "HARD") hardCount++;
    else softCount++;
  }

  return {
    isValid: hardCount === 0,
    totalConflicts: conflicts.length,
    hardConflictCount: hardCount,
    softConflictCount: softCount,
    conflicts,
    conflictsByType,
  };
}
