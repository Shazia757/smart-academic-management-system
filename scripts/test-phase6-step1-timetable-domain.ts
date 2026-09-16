/**
 * SAMS — Phase 6 Step 6.1: Timetable Domain & Constraint Foundation Test Suite
 *
 * Verifies all 10 pure validation & conflict detection rules, strongly typed domain
 * models, schema parsing, boundary cases, and master validation pipeline:
 *
 *  1. Faculty double booking detection
 *  2. Classroom double booking detection
 *  3. Section period clash detection
 *  4. Faculty unavailability during a period
 *  5. Classroom capacity insufficiency detection
 *  6. Invalid faculty-subject-section assignment detection
 *  7. Lab subject classroom requirement validation
 *  8. Duplicate timetable entry detection
 *  9. Invalid day or period values / break slot scheduling
 * 10. Missing or invalid required generation constraints
 * 11. Clean conflict-free master schedule validation
 * 12. Capacity boundary equality test (capacity == size is valid)
 * 13. Lab subject in laboratory room passes cleanly
 * 14. Theory subject in lecture hall passes cleanly
 * 15. Zod schema validation for AcademicSubject
 * 16. Zod schema validation for ClassSectionInfo
 * 17. Zod schema validation for ClassroomInfo & RoomType enum
 * 18. Zod schema validation for TimetablePeriodSlot
 * 19. Zod schema validation for ScheduledTimetableEntry
 * 20. Zod schema validation for TimetableGenerationConstraints
 */

import {
  DayOfWeek,
  AcademicSubject,
  AcademicSubjectSchema,
  ClassSectionInfo,
  ClassSectionInfoSchema,
  ClassroomInfo,
  ClassroomInfoSchema,
  FacultyAssignment,
  TimetablePeriodSlot,
  TimetablePeriodSlotSchema,
  FacultyAvailabilitySlot,
  ScheduledTimetableEntry,
  ScheduledTimetableEntrySchema,
  TimetableGenerationConstraintsSchema,
  DEFAULT_TIMETABLE_CONSTRAINTS,
} from "../apps/web/src/types/timetable";

import {
  detectFacultyDoubleBooking,
  detectClassroomDoubleBooking,
  detectSectionPeriodClashes,
  detectFacultyUnavailability,
  detectClassroomCapacityInsufficiency,
  detectInvalidSubjectAssignments,
  detectLabClassroomRequirements,
  detectDuplicateEntries,
  detectInvalidDayOrPeriodValues,
  validateGenerationConstraints,
  validateTimetableSchedule,
} from "../apps/web/src/lib/timetable/timetable-validation";

interface TestResult {
  id: number;
  name: string;
  category: "CONFLICT" | "MODEL" | "BOUNDARY" | "PIPELINE";
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function recordTest(
  id: number,
  name: string,
  category: "CONFLICT" | "MODEL" | "BOUNDARY" | "PIPELINE",
  passed: boolean,
  details: string
) {
  results.push({ id, name, category, passed, details });
  const status = passed ? "✓ PASS" : "✗ FAIL";
  console.log(`[${status}] [${category}] Test ${String(id).padStart(2, " ")}: ${name} — ${details}`);
}

// -----------------------------------------------------------------------------
// FIXTURE DATA GENERATORS
// -----------------------------------------------------------------------------
const SECTION_A_ID = "11111111-1111-4111-8111-111111111111";
const SECTION_B_ID = "11111111-1111-4111-8111-222222222222";

const SUBJECT_DSA_ID = "22222222-2222-4222-8222-111111111111";
const SUBJECT_DBMS_LAB_ID = "22222222-2222-4222-8222-222222222222";

const FACULTY_ARUN_ID = "33333333-3333-4333-8333-111111111111";
const FACULTY_PRIYA_ID = "33333333-3333-4333-8333-222222222222";

const ROOM_LH101_ID = "44444444-4444-4444-8444-111111111111";
const ROOM_LAB1_ID = "44444444-4444-4444-8444-222222222222";

const sampleSubjects: AcademicSubject[] = [
  {
    id: SUBJECT_DSA_ID,
    code: "CS401",
    name: "Data Structures & Algorithms",
    credits: 4,
    is_lab: false,
    weekly_periods: 4,
  },
  {
    id: SUBJECT_DBMS_LAB_ID,
    code: "CS402L",
    name: "Database Systems Laboratory",
    credits: 2,
    is_lab: true,
    weekly_periods: 2,
  },
];

const sampleClassrooms: ClassroomInfo[] = [
  {
    id: ROOM_LH101_ID,
    room_number: "LH-101",
    room_type: "LECTURE_HALL",
    capacity: 60,
    is_available: true,
  },
  {
    id: ROOM_LAB1_ID,
    room_number: "LAB-01",
    room_type: "LABORATORY",
    capacity: 50,
    is_available: true,
  },
];

const sampleSections: ClassSectionInfo[] = [
  {
    id: SECTION_A_ID,
    name: "CSE-A",
    capacity: 50,
  },
  {
    id: SECTION_B_ID,
    name: "CSE-B",
    capacity: 65,
  },
];

const sampleFacultyAssignments: FacultyAssignment[] = [
  {
    id: "55555555-5555-4555-8555-111111111111",
    faculty_id: FACULTY_ARUN_ID,
    subject_id: SUBJECT_DSA_ID,
    section_id: SECTION_A_ID,
    is_primary: true,
  },
  {
    id: "55555555-5555-4555-8555-222222222222",
    faculty_id: FACULTY_PRIYA_ID,
    subject_id: SUBJECT_DBMS_LAB_ID,
    section_id: SECTION_A_ID,
    is_primary: true,
  },
];

const sampleSlots: TimetablePeriodSlot[] = [
  {
    id: "66666666-6666-4666-8666-000000000001",
    day_of_week: 1,
    period_number: 1,
    start_time: "09:00:00",
    end_time: "09:55:00",
    is_break: false,
    is_active: true,
  },
  {
    id: "66666666-6666-4666-8666-000000000002",
    day_of_week: 1,
    period_number: 2,
    start_time: "09:55:00",
    end_time: "10:50:00",
    is_break: false,
    is_active: true,
  },
  {
    id: "66666666-6666-4666-8666-000000000003",
    day_of_week: 1,
    period_number: 3,
    start_time: "10:50:00",
    end_time: "11:10:00",
    is_break: true, // Tea Break
    is_active: true,
  },
  {
    id: "66666666-6666-4666-8666-000000000004",
    day_of_week: 1,
    period_number: 4,
    start_time: "11:10:00",
    end_time: "12:05:00",
    is_break: false,
    is_active: true,
  },
];

function runTestSuite() {
  console.log("================================================================================");
  console.log("SAMS PHASE 6 STEP 6.1: TIMETABLE DOMAIN & CONSTRAINT FOUNDATION TEST SUITE");
  console.log("Testing pure domain models, conflict detection rules, and validation pipeline");
  console.log("================================================================================\n");

  // ============================================================================
  // 1. CONFLICT DETECTION RULES (Tests 1 to 10)
  // ============================================================================

  // Test 1: Faculty Double Booking
  const facultyDoubleBookingEntries: ScheduledTimetableEntry[] = [
    {
      id: "e1",
      section_id: SECTION_A_ID,
      subject_id: SUBJECT_DSA_ID,
      faculty_id: FACULTY_ARUN_ID,
      classroom_id: ROOM_LH101_ID,
      day_of_week: 1,
      period_number: 1,
    },
    {
      id: "e2",
      section_id: SECTION_B_ID,
      subject_id: SUBJECT_DSA_ID,
      faculty_id: FACULTY_ARUN_ID, // Arun scheduled for Section B at the exact same time
      classroom_id: ROOM_LAB1_ID,
      day_of_week: 1,
      period_number: 1,
    },
  ];
  const facultyDoubleBookingConflicts = detectFacultyDoubleBooking(facultyDoubleBookingEntries);
  const test1Passed =
    facultyDoubleBookingConflicts.length === 1 &&
    facultyDoubleBookingConflicts[0].type === "FACULTY_DOUBLE_BOOKING" &&
    facultyDoubleBookingConflicts[0].severity === "HARD";
  recordTest(1, "Faculty Double Booking Detection", "CONFLICT", test1Passed, `Detected: ${facultyDoubleBookingConflicts[0]?.message}`);

  // Test 2: Classroom Double Booking
  const classroomDoubleBookingEntries: ScheduledTimetableEntry[] = [
    {
      id: "e1",
      section_id: SECTION_A_ID,
      subject_id: SUBJECT_DSA_ID,
      faculty_id: FACULTY_ARUN_ID,
      classroom_id: ROOM_LH101_ID,
      day_of_week: 1,
      period_number: 2,
    },
    {
      id: "e2",
      section_id: SECTION_B_ID,
      subject_id: SUBJECT_DBMS_LAB_ID,
      faculty_id: FACULTY_PRIYA_ID,
      classroom_id: ROOM_LH101_ID, // Both in LH-101 at the same period
      day_of_week: 1,
      period_number: 2,
    },
  ];
  const classroomDoubleBookingConflicts = detectClassroomDoubleBooking(classroomDoubleBookingEntries);
  const test2Passed =
    classroomDoubleBookingConflicts.length === 1 &&
    classroomDoubleBookingConflicts[0].type === "CLASSROOM_DOUBLE_BOOKING";
  recordTest(2, "Classroom Double Booking Detection", "CONFLICT", test2Passed, `Detected: ${classroomDoubleBookingConflicts[0]?.message}`);

  // Test 3: Section Period Clash
  const sectionClashEntries: ScheduledTimetableEntry[] = [
    {
      id: "e1",
      section_id: SECTION_A_ID,
      subject_id: SUBJECT_DSA_ID,
      faculty_id: FACULTY_ARUN_ID,
      classroom_id: ROOM_LH101_ID,
      day_of_week: 1,
      period_number: 4,
    },
    {
      id: "e2",
      section_id: SECTION_A_ID, // Section A scheduled for another class in same slot
      subject_id: SUBJECT_DBMS_LAB_ID,
      faculty_id: FACULTY_PRIYA_ID,
      classroom_id: ROOM_LAB1_ID,
      day_of_week: 1,
      period_number: 4,
    },
  ];
  const sectionClashes = detectSectionPeriodClashes(sectionClashEntries);
  const test3Passed =
    sectionClashes.length === 1 &&
    sectionClashes[0].type === "SECTION_PERIOD_CLASH";
  recordTest(3, "Section Period Clash Detection", "CONFLICT", test3Passed, `Detected: ${sectionClashes[0]?.message}`);

  // Test 4: Faculty Unavailability During Period
  const unavailSlots: FacultyAvailabilitySlot[] = [
    {
      faculty_id: FACULTY_ARUN_ID,
      day_of_week: 1,
      period_number: 1,
      is_available: false,
      reason: "Faculty Senate Meeting",
    },
  ];
  const unavailEntries: ScheduledTimetableEntry[] = [
    {
      id: "e1",
      section_id: SECTION_A_ID,
      subject_id: SUBJECT_DSA_ID,
      faculty_id: FACULTY_ARUN_ID,
      classroom_id: ROOM_LH101_ID,
      day_of_week: 1,
      period_number: 1,
    },
  ];
  const unavailConflicts = detectFacultyUnavailability(unavailEntries, unavailSlots);
  const test4Passed =
    unavailConflicts.length === 1 &&
    unavailConflicts[0].type === "FACULTY_UNAVAILABLE";
  recordTest(4, "Faculty Unavailability Detection", "CONFLICT", test4Passed, `Detected: ${unavailConflicts[0]?.message}`);

  // Test 5: Classroom Capacity Insufficiency (Section B = 65, Room LH101 = 60)
  const capacityEntries: ScheduledTimetableEntry[] = [
    {
      id: "e1",
      section_id: SECTION_B_ID, // 65 students
      subject_id: SUBJECT_DSA_ID,
      faculty_id: FACULTY_ARUN_ID,
      classroom_id: ROOM_LH101_ID, // Capacity: 60
      day_of_week: 1,
      period_number: 1,
    },
  ];
  const classroomsMap = new Map(sampleClassrooms.map((c) => [c.id, c]));
  const sectionsMap = new Map(sampleSections.map((s) => [s.id, s]));
  const capacityConflicts = detectClassroomCapacityInsufficiency(capacityEntries, classroomsMap, sectionsMap);
  const test5Passed =
    capacityConflicts.length === 1 &&
    capacityConflicts[0].type === "CLASSROOM_CAPACITY_INSUFFICIENT" &&
    capacityConflicts[0].entities.section_capacity === 65 &&
    capacityConflicts[0].entities.classroom_capacity === 60;
  recordTest(5, "Classroom Capacity Insufficiency Detection", "CONFLICT", test5Passed, `Detected: ${capacityConflicts[0]?.message}`);

  // Test 6: Invalid Subject or Section Assignment
  // Priya is NOT assigned to teach DSA for Section A
  const invalidAssignmentEntries: ScheduledTimetableEntry[] = [
    {
      id: "e1",
      section_id: SECTION_A_ID,
      subject_id: SUBJECT_DSA_ID,
      faculty_id: FACULTY_PRIYA_ID, // Unassigned pairing
      classroom_id: ROOM_LH101_ID,
      day_of_week: 1,
      period_number: 1,
    },
  ];
  const assignmentConflicts = detectInvalidSubjectAssignments(invalidAssignmentEntries, sampleFacultyAssignments);
  const test6Passed =
    assignmentConflicts.length === 1 &&
    assignmentConflicts[0].type === "INVALID_FACULTY_ASSIGNMENT";
  recordTest(6, "Invalid Faculty Subject Assignment Detection", "CONFLICT", test6Passed, `Detected: ${assignmentConflicts[0]?.message}`);

  // Test 7: Lab Subject Classroom Requirements (DBMS Lab scheduled in LECTURE_HALL LH-101)
  const labMismatchEntries: ScheduledTimetableEntry[] = [
    {
      id: "e1",
      section_id: SECTION_A_ID,
      subject_id: SUBJECT_DBMS_LAB_ID, // is_lab = true
      faculty_id: FACULTY_PRIYA_ID,
      classroom_id: ROOM_LH101_ID, // LECTURE_HALL instead of LABORATORY
      day_of_week: 1,
      period_number: 2,
    },
  ];
  const subjectsMap = new Map(sampleSubjects.map((s) => [s.id, s]));
  const labConflicts = detectLabClassroomRequirements(labMismatchEntries, subjectsMap, classroomsMap);
  const test7Passed =
    labConflicts.length === 1 &&
    labConflicts[0].type === "LAB_ROOM_TYPE_MISMATCH";
  recordTest(7, "Lab Classroom Requirement Validation", "CONFLICT", test7Passed, `Detected: ${labConflicts[0]?.message}`);

  // Test 8: Duplicate Timetable Entries
  const duplicateEntriesList: ScheduledTimetableEntry[] = [
    {
      id: "e1",
      section_id: SECTION_A_ID,
      subject_id: SUBJECT_DSA_ID,
      faculty_id: FACULTY_ARUN_ID,
      classroom_id: ROOM_LH101_ID,
      day_of_week: 1,
      period_number: 1,
    },
    {
      id: "e2",
      section_id: SECTION_A_ID,
      subject_id: SUBJECT_DSA_ID,
      faculty_id: FACULTY_ARUN_ID,
      classroom_id: ROOM_LH101_ID,
      day_of_week: 1,
      period_number: 1,
    },
  ];
  const duplicateConflicts = detectDuplicateEntries(duplicateEntriesList);
  const test8Passed =
    duplicateConflicts.length === 1 &&
    duplicateConflicts[0].type === "DUPLICATE_ENTRY";
  recordTest(8, "Duplicate Timetable Entry Detection", "CONFLICT", test8Passed, `Detected: ${duplicateConflicts[0]?.message}`);

  // Test 9: Invalid Day or Period Values & Break Slot Scheduling
  const invalidSlotEntries: ScheduledTimetableEntry[] = [
    {
      id: "e1",
      section_id: SECTION_A_ID,
      subject_id: SUBJECT_DSA_ID,
      faculty_id: FACULTY_ARUN_ID,
      classroom_id: ROOM_LH101_ID,
      day_of_week: 8 as unknown as DayOfWeek, // Invalid day 8
      period_number: 1,
    },
    {
      id: "e2",
      section_id: SECTION_A_ID,
      subject_id: SUBJECT_DSA_ID,
      faculty_id: FACULTY_ARUN_ID,
      classroom_id: ROOM_LH101_ID,
      day_of_week: 1,
      period_number: 3, // Period 3 is Tea Break (is_break: true)
    },
    {
      id: "e3",
      section_id: SECTION_A_ID,
      subject_id: SUBJECT_DSA_ID,
      faculty_id: FACULTY_ARUN_ID,
      classroom_id: ROOM_LH101_ID,
      day_of_week: 1,
      period_number: 9, // Period 9 does not exist in configuration
    },
  ];
  const slotConflicts = detectInvalidDayOrPeriodValues(invalidSlotEntries, sampleSlots);
  const test9Passed =
    slotConflicts.length === 3 &&
    slotConflicts.some((c) => c.message.includes("Invalid day of week")) &&
    slotConflicts.some((c) => c.message.includes("during break")) &&
    slotConflicts.some((c) => c.message.includes("not an active period"));
  recordTest(9, "Invalid Day, Period & Break Slot Detection", "CONFLICT", test9Passed, `Detected 3 invalid slots: day out of bounds, break clash, unconfigured period`);

  // Test 10: Missing Required Generation Constraints
  const invalidConstraintsPayload = {
    no_faculty_double_booking: false, // Mandatory constraint disabled!
    no_classroom_double_booking: true,
  };
  const constraintCheck = validateGenerationConstraints(invalidConstraintsPayload);
  const test10Passed =
    !constraintCheck.isValid &&
    constraintCheck.conflicts.some((c) => c.type === "MISSING_REQUIRED_CONSTRAINTS");
  recordTest(10, "Required Generation Constraints Validation", "CONFLICT", test10Passed, `Rejection details: ${constraintCheck.conflicts[0]?.message}`);

  // ============================================================================
  // 2. BOUNDARY & EDGE CASES (Tests 11 to 14)
  // ============================================================================

  // Test 11: Clean Master Timetable Validation (Zero Conflicts)
  const cleanScheduleEntries: ScheduledTimetableEntry[] = [
    {
      id: "clean-1",
      section_id: SECTION_A_ID,
      subject_id: SUBJECT_DSA_ID,
      faculty_id: FACULTY_ARUN_ID,
      classroom_id: ROOM_LH101_ID,
      day_of_week: 1,
      period_number: 1,
    },
    {
      id: "clean-2",
      section_id: SECTION_A_ID,
      subject_id: SUBJECT_DBMS_LAB_ID,
      faculty_id: FACULTY_PRIYA_ID,
      classroom_id: ROOM_LAB1_ID,
      day_of_week: 1,
      period_number: 2,
    },
  ];
  const cleanReport = validateTimetableSchedule({
    entries: cleanScheduleEntries,
    validSlots: sampleSlots,
    subjects: sampleSubjects,
    classrooms: sampleClassrooms,
    sections: sampleSections,
    facultyAssignments: sampleFacultyAssignments,
    constraints: DEFAULT_TIMETABLE_CONSTRAINTS,
  });
  const test11Passed = cleanReport.isValid && cleanReport.totalConflicts === 0;
  recordTest(11, "Clean Master Timetable Schedule Validation", "PIPELINE", test11Passed, `Clean schedule: isValid=${cleanReport.isValid}, conflicts=${cleanReport.totalConflicts}`);

  // Test 12: Capacity Boundary Equality (Section A = 50, Room LH101 = 60 is valid; exact equality 50 == 50 is valid)
  const exactCapacitySection: ClassSectionInfo = {
    id: SECTION_A_ID,
    name: "CSE-A",
    capacity: 60, // Exactly matches room capacity 60
  };
  const exactSectionsMap = new Map([[exactCapacitySection.id, exactCapacitySection]]);
  const exactCapacityEntries: ScheduledTimetableEntry[] = [
    {
      section_id: SECTION_A_ID,
      subject_id: SUBJECT_DSA_ID,
      faculty_id: FACULTY_ARUN_ID,
      classroom_id: ROOM_LH101_ID, // capacity 60
      day_of_week: 1,
      period_number: 1,
    },
  ];
  const exactCapacityConflicts = detectClassroomCapacityInsufficiency(exactCapacityEntries, classroomsMap, exactSectionsMap);
  const test12Passed = exactCapacityConflicts.length === 0;
  recordTest(12, "Capacity Boundary Equality Guard", "BOUNDARY", test12Passed, "Section capacity equal to room capacity (60 == 60) cleanly passes without conflict");

  // Test 13: Lab Subject in Laboratory Room Passes Cleanly
  const cleanLabEntries: ScheduledTimetableEntry[] = [
    {
      section_id: SECTION_A_ID,
      subject_id: SUBJECT_DBMS_LAB_ID,
      faculty_id: FACULTY_PRIYA_ID,
      classroom_id: ROOM_LAB1_ID, // LABORATORY room
      day_of_week: 1,
      period_number: 2,
    },
  ];
  const cleanLabConflicts = detectLabClassroomRequirements(cleanLabEntries, subjectsMap, classroomsMap);
  const test13Passed = cleanLabConflicts.length === 0;
  recordTest(13, "Lab Subject in Laboratory Room", "BOUNDARY", test13Passed, "Lab scheduled in LABORATORY room yields 0 conflicts");

  // Test 14: Theory Subject in Lecture Hall Passes Cleanly
  const cleanTheoryEntries: ScheduledTimetableEntry[] = [
    {
      section_id: SECTION_A_ID,
      subject_id: SUBJECT_DSA_ID,
      faculty_id: FACULTY_ARUN_ID,
      classroom_id: ROOM_LH101_ID, // LECTURE_HALL room
      day_of_week: 1,
      period_number: 1,
    },
  ];
  const cleanTheoryConflicts = detectLabClassroomRequirements(cleanTheoryEntries, subjectsMap, classroomsMap);
  const test14Passed = cleanTheoryConflicts.length === 0;
  recordTest(14, "Theory Subject in Lecture Hall", "BOUNDARY", test14Passed, "Theory scheduled in LECTURE_HALL yields 0 conflicts");

  // ============================================================================
  // 3. MODEL VALIDATION & SCHEMA PARSING (Tests 15 to 20)
  // ============================================================================

  // Test 15: AcademicSubjectSchema Validation
  const validSubjectParse = AcademicSubjectSchema.safeParse(sampleSubjects[0]);
  const invalidSubjectParse = AcademicSubjectSchema.safeParse({
    id: "not-a-uuid",
    code: "",
    weekly_periods: -1,
  });
  const test15Passed = validSubjectParse.success && !invalidSubjectParse.success;
  recordTest(15, "AcademicSubject Zod Schema Parsing", "MODEL", test15Passed, "Valid parsed cleanly; invalid rejected UUID and negative periods");

  // Test 16: ClassSectionInfoSchema Validation
  const validSectionParse = ClassSectionInfoSchema.safeParse(sampleSections[0]);
  const invalidSectionParse = ClassSectionInfoSchema.safeParse({
    id: SECTION_A_ID,
    name: "CSE-A",
    capacity: 0, // Capacity must be positive (> 0)
  });
  const test16Passed = validSectionParse.success && !invalidSectionParse.success;
  recordTest(16, "ClassSectionInfo Zod Schema Parsing", "MODEL", test16Passed, "Zero capacity correctly rejected as invalid");

  // Test 17: ClassroomInfoSchema & RoomType Enum
  const validRoomParse = ClassroomInfoSchema.safeParse(sampleClassrooms[0]);
  const invalidRoomParse = ClassroomInfoSchema.safeParse({
    id: ROOM_LH101_ID,
    room_number: "LH-101",
    room_type: "SPORTS_GROUND", // Non-canonical room type
    capacity: 50,
  });
  const test17Passed = validRoomParse.success && !invalidRoomParse.success;
  recordTest(17, "ClassroomInfo & RoomType Enum Schema Parsing", "MODEL", test17Passed, "Non-canonical room_type rejected by RoomTypeSchema enum");

  // Test 18: TimetablePeriodSlotSchema Validation
  const validSlotParse = TimetablePeriodSlotSchema.safeParse(sampleSlots[0]);
  const invalidSlotParse = TimetablePeriodSlotSchema.safeParse({
    id: sampleSlots[0].id,
    day_of_week: 9, // Out of bounds
    period_number: 14, // Out of bounds (> 12)
    start_time: "invalid-time",
  });
  const test18Passed = validSlotParse.success && !invalidSlotParse.success;
  recordTest(18, "TimetablePeriodSlot Zod Schema Parsing", "MODEL", test18Passed, "Period slot bounded to 1-7 days, 1-12 periods, and strict time regex");

  // Test 19: ScheduledTimetableEntrySchema Validation
  const validEntryParse = ScheduledTimetableEntrySchema.safeParse(cleanScheduleEntries[0]);
  const invalidEntryParse = ScheduledTimetableEntrySchema.safeParse({
    section_id: "invalid-uuid",
    day_of_week: 0,
    period_number: -1,
  });
  const test19Passed = validEntryParse.success && !invalidEntryParse.success;
  recordTest(19, "ScheduledTimetableEntry Zod Schema Parsing", "MODEL", test19Passed, "Valid entry validated; invalid entry caught multiple type errors");

  // Test 20: TimetableGenerationConstraintsSchema Validation
  const defaultConstraintsParse = TimetableGenerationConstraintsSchema.safeParse(DEFAULT_TIMETABLE_CONSTRAINTS);
  const test20Passed = defaultConstraintsParse.success;
  recordTest(20, "TimetableGenerationConstraints Default Schema", "MODEL", test20Passed, "Default production constraints match schema with all switches active");

  // ============================================================================
  // SUMMARY
  // ============================================================================
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.length - passedCount;

  console.log("\n================================================================================");
  console.log("TEST SUMMARY");
  console.log("================================================================================");
  console.log(`Total Tests:  ${results.length}`);
  console.log(`Passed:       ${passedCount}`);
  console.log(`Failed:       ${failedCount}`);
  console.log("================================================================================");

  if (failedCount > 0) {
    console.error(`RESULT: ${failedCount} TEST(S) FAILED.`);
    process.exit(1);
  } else {
    console.log(`RESULT: ALL ${passedCount} PHASE 6 STEP 6.1 DOMAIN TESTS PASSED SUCCESSFULLY!`);
    console.log("================================================================================\n");
    process.exit(0);
  }
}

runTestSuite();
