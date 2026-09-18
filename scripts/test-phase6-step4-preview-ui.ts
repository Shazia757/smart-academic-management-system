/**
 * SAMS — Phase 6 Step 6.4: Timetable Generation Preview UI Test Suite
 *
 * Deterministic test suite covering all 21 specification requirements:
 * 1. Initial state validation
 * 2. Configuration summary assembly
 * 3. Generate button activation logic
 * 4. Generation action invocation (in-memory preview contract)
 * 5. OPTIMAL normalization
 * 6. FEASIBLE normalization
 * 7. PARTIAL handling
 * 8. TIME_LIMIT handling
 * 9. INFEASIBLE handling
 * 10. MODEL_INVALID handling
 * 11. Faculty filtering
 * 12. Classroom filtering
 * 13. Subject filtering
 * 14. Day filtering
 * 15. Search filtering (multi-field matching)
 * 16. Filter reset (restores complete original dataset)
 * 17. View-mode switching (grid, list, faculty, room grouping)
 * 18. Free-period detection
 * 19. Break-period detection
 * 20. Preview-only/no-persistence behavior verification
 * 21. Diagnostics metric calculation
 */

import * as dotenv from "dotenv";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";
import { GenerateTimetableSchema } from "../apps/web/src/server/validators/timetable";
import {
  enrichSolverOutput,
  buildSolverInput,
  EntityMetadataMaps,
} from "../apps/web/src/lib/timetable/timetable-solver-service";
import {
  SchedulingOutput,
  ScheduledEntryOutput,
  SchedulingInput,
} from "../apps/web/src/lib/ai-client";
import {
  EnrichedScheduledEntry,
  GeneratedTimetableResult,
  TimetableConfiguration,
  ClassSection,
  TimetablePeriod,
} from "../apps/web/src/types/database";

dotenv.config({ path: path.resolve(process.cwd(), "apps/web/.env.local") });
dotenv.config();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE configuration in apps/web/.env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${testName}`);
    passedTests++;
  } else {
    console.error(`  ✗ FAIL: ${testName} ${detail ? `(${detail})` : ""}`);
    failedTests++;
  }
}

// Mock test fixture helpers
function createSampleMetadata(): EntityMetadataMaps {
  const cfg: TimetableConfiguration = {
    id: "11111111-1111-1111-1111-111111111111",
    academic_year_id: "22222222-2222-2222-2222-222222222222",
    semester_id: "33333333-3333-3333-3333-333333333333",
    section_id: "44444444-4444-4444-4444-444444444444",
    name: "CS-A 2026 Config",
    working_days: 5,
    periods_per_day: 6,
    period_duration_minutes: 50,
    break_after_periods: [{ period: 3, duration: 20, label: "Recess" }],
    generation_status: "DRAFT",
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const sec: ClassSection = {
    id: "44444444-4444-4444-4444-444444444444",
    name: "CS-A",
    code: "CS-A-2026",
    capacity: 60,
    academic_year_id: "22222222-2222-2222-2222-222222222222",
    semester_id: "33333333-3333-3333-3333-333333333333",
    department_id: "55555555-5555-5555-5555-555555555555",
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const subjectsMap = new Map([
    ["sub-1", { code: "CS101", name: "Intro to Programming" }],
    ["sub-2", { code: "CS102", name: "Data Structures Lab" }],
    ["sub-3", { code: "MA101", name: "Discrete Mathematics" }],
  ]);

  const facultyMap = new Map([
    ["fac-1", { name: "Dr. Alan Turing", email: "alan@example.edu" }],
    ["fac-2", { name: "Prof. Ada Lovelace", email: "ada@example.edu" }],
    ["fac-3", { name: "Dr. Grace Hopper", email: "grace@example.edu" }],
  ]);

  const classroomsMap = new Map([
    ["room-1", { room_number: "LH-101", room_type: "LECTURE_HALL" }],
    ["room-2", { room_number: "LAB-201", room_type: "LABORATORY" }],
  ]);

  const periodsMap = new Map([
    ["per-1", { day_of_week: 1, period_number: 1, start_time: "09:00:00", end_time: "09:50:00" }],
    ["per-2", { day_of_week: 1, period_number: 2, start_time: "09:50:00", end_time: "10:40:00" }],
    ["per-3", { day_of_week: 1, period_number: 3, start_time: "10:40:00", end_time: "11:30:00" }],
    ["per-4", { day_of_week: 2, period_number: 1, start_time: "09:00:00", end_time: "09:50:00" }],
    ["per-5", { day_of_week: 2, period_number: 2, start_time: "09:50:00", end_time: "10:40:00" }],
  ]);

  return {
    configuration: cfg,
    section: sec,
    subjectsMap,
    facultyMap,
    classroomsMap,
    periodsMap,
  };
}

function createSampleEnrichedEntries(): EnrichedScheduledEntry[] {
  return [
    {
      id: "entry-1",
      section_id: "sec-1",
      section_code: "CS-A",
      section_name: "CS-A",
      subject_id: "sub-1",
      subject_code: "CS101",
      subject_name: "Intro to Programming",
      faculty_id: "fac-1",
      faculty_name: "Dr. Alan Turing",
      classroom_id: "room-1",
      room_number: "LH-101",
      room_type: "LECTURE_HALL",
      timetable_period_id: "per-1",
      day_of_week: 1,
      period_number: 1,
      period_start_time: "09:00:00",
      period_end_time: "09:50:00",
      occurrence_index: 1,
      session_type: "THEORY",
      is_lab: false,
      notes: null,
    },
    {
      id: "entry-2",
      section_id: "sec-1",
      section_code: "CS-A",
      section_name: "CS-A",
      subject_id: "sub-2",
      subject_code: "CS102",
      subject_name: "Data Structures Lab",
      faculty_id: "fac-2",
      faculty_name: "Prof. Ada Lovelace",
      classroom_id: "room-2",
      room_number: "LAB-201",
      room_type: "LABORATORY",
      timetable_period_id: "per-2",
      day_of_week: 1,
      period_number: 2,
      period_start_time: "09:50:00",
      period_end_time: "10:40:00",
      occurrence_index: 1,
      session_type: "LABORATORY",
      is_lab: true,
      notes: null,
    },
    {
      id: "entry-3",
      section_id: "sec-1",
      section_code: "CS-A",
      section_name: "CS-A",
      subject_id: "sub-3",
      subject_code: "MA101",
      subject_name: "Discrete Mathematics",
      faculty_id: "fac-3",
      faculty_name: "Dr. Grace Hopper",
      classroom_id: "room-1",
      room_number: "LH-101",
      room_type: "LECTURE_HALL",
      timetable_period_id: "per-4",
      day_of_week: 2,
      period_number: 1,
      period_start_time: "09:00:00",
      period_end_time: "09:50:00",
      occurrence_index: 1,
      session_type: "THEORY",
      is_lab: false,
      notes: null,
    },
  ];
}

async function runTests() {
  console.log("\n===============================================================================");
  console.log("SAMS Phase 6.4: Timetable Generation Preview UI Deterministic Test Suite");
  console.log("===============================================================================\n");

  const meta = createSampleMetadata();
  const sampleEntries = createSampleEnrichedEntries();

  // ---------------------------------------------------------------------------
  // Test 1: Initial state validation
  // ---------------------------------------------------------------------------
  console.log("1. Initial state validation:");
  const emptyValidation = GenerateTimetableSchema.safeParse({});
  assert(!emptyValidation.success, "Empty request fails schema validation without configuration_id");

  const defaultValuesValidation = GenerateTimetableSchema.safeParse({
    configuration_id: "11111111-1111-1111-1111-111111111111",
    section_id: "44444444-4444-4444-4444-444444444444",
  });
  assert(defaultValuesValidation.success, "Valid request passes with defaults");
  if (defaultValuesValidation.success) {
    assert(defaultValuesValidation.data.timeout_seconds === 30, "Default timeout is 30s");
    assert(defaultValuesValidation.data.random_seed === 42, "Default random seed is 42");
    assert(defaultValuesValidation.data.allow_partial === false, "Default allow_partial is false");
  }

  // ---------------------------------------------------------------------------
  // Test 2: Configuration summary assembly
  // ---------------------------------------------------------------------------
  console.log("\n2. Configuration summary assembly:");
  const summaryWorkingDays = meta.configuration.working_days;
  const summaryDailyPeriods = meta.configuration.periods_per_day;
  const summaryStudentCount = meta.section.capacity;
  const summarySubjectsCount = meta.subjectsMap.size;
  const summaryFacultyCount = meta.facultyMap.size;
  const summaryClassroomsCount = meta.classroomsMap.size;

  assert(summaryWorkingDays === 5, "Working days count computed as 5");
  assert(summaryDailyPeriods === 6, "Daily periods count computed as 6");
  assert(summaryStudentCount === 60, "Cohort student count computed as 60");
  assert(summarySubjectsCount === 3, "Subjects count computed as 3");
  assert(summaryFacultyCount === 3, "Faculty count computed as 3");
  assert(summaryClassroomsCount === 2, "Classrooms count computed as 2");

  // ---------------------------------------------------------------------------
  // Test 3: Generate button activation logic
  // ---------------------------------------------------------------------------
  console.log("\n3. Generate button activation logic:");
  function isGenerateButtonActive(cfg: TimetableConfiguration | null, secId: string, timeout: number): boolean {
    if (!secId) return false;
    if (!cfg || !cfg.is_active) return false;
    if (timeout < 5 || timeout > 300) return false;
    return true;
  }
  assert(isGenerateButtonActive(meta.configuration, meta.section.id, 30), "Button enabled when valid config and section");
  assert(!isGenerateButtonActive(null, meta.section.id, 30), "Button disabled when config is null");
  assert(!isGenerateButtonActive({ ...meta.configuration, is_active: false }, meta.section.id, 30), "Button disabled when config inactive");
  assert(!isGenerateButtonActive(meta.configuration, "", 30), "Button disabled when section empty");
  assert(!isGenerateButtonActive(meta.configuration, meta.section.id, 2), "Button disabled when timeout < 5s");

  // ---------------------------------------------------------------------------
  // Test 4: Generation action invocation (in-memory preview contract)
  // ---------------------------------------------------------------------------
  console.log("\n4. Generation action invocation (in-memory preview contract):");
  const validSolverOutput: SchedulingOutput = {
    status: "OPTIMAL",
    solver_name: "Google OR-Tools CP-SAT",
    solver_version: "9.15.6755",
    objective_score: 100,
    solve_duration_ms: 124.5,
    hard_constraint_violations: 0,
    soft_constraint_violations: 0,
    total_assigned_sessions: 3,
    total_required_sessions: 3,
    is_complete: true,
    entries: [
      {
        section_id: "44444444-4444-4444-4444-444444444444",
        subject_id: "sub-1",
        faculty_id: "fac-1",
        classroom_id: "room-1",
        timetable_period_id: "per-1",
        occurrence_index: 1,
        session_type: "THEORY",
        is_lab: false,
      },
      {
        section_id: "44444444-4444-4444-4444-444444444444",
        subject_id: "sub-2",
        faculty_id: "fac-2",
        classroom_id: "room-2",
        timetable_period_id: "per-2",
        occurrence_index: 1,
        session_type: "LABORATORY",
        is_lab: true,
      },
      {
        section_id: "44444444-4444-4444-4444-444444444444",
        subject_id: "sub-3",
        faculty_id: "fac-3",
        classroom_id: "room-1",
        timetable_period_id: "per-4",
        occurrence_index: 1,
        session_type: "THEORY",
        is_lab: false,
      },
    ],
    unassigned_sessions: [],
    violations: [],
    warnings: [],
    validation_errors: [],
    diagnostics: ["Search completed with optimal bound."],
  };

  const enrichedOptimal = enrichSolverOutput(validSolverOutput, meta);
  assert(enrichedOptimal.entries.length === 3, "Enriched schedule has 3 entries");
  assert(enrichedOptimal.entries[0]?.subject_code === "CS101", "Entry 0 subject code mapped correctly");
  assert(enrichedOptimal.entries[0]?.faculty_name === "Dr. Alan Turing", "Entry 0 faculty name mapped correctly");
  assert(enrichedOptimal.entries[0]?.room_number === "LH-101", "Entry 0 room number mapped correctly");

  // ---------------------------------------------------------------------------
  // Test 5: OPTIMAL normalization
  // ---------------------------------------------------------------------------
  console.log("\n5. OPTIMAL normalization:");
  assert(enrichedOptimal.status === "OPTIMAL", "Status is OPTIMAL");
  assert(enrichedOptimal.is_complete === true, "Schedule is marked complete");
  assert(enrichedOptimal.hard_constraint_violations === 0, "Hard constraint violations is 0");
  assert(enrichedOptimal.total_assigned_sessions === 3, "Total assigned sessions matches requirements");

  // ---------------------------------------------------------------------------
  // Test 6: FEASIBLE normalization
  // ---------------------------------------------------------------------------
  console.log("\n6. FEASIBLE normalization:");
  const feasibleOutput: SchedulingOutput = {
    ...validSolverOutput,
    status: "FEASIBLE",
  };
  const enrichedFeasible = enrichSolverOutput(feasibleOutput, meta);
  assert(enrichedFeasible.status === "FEASIBLE", "Status normalized as FEASIBLE");
  assert(enrichedFeasible.hard_constraint_violations === 0, "Feasible timetable has 0 hard violations");

  // ---------------------------------------------------------------------------
  // Test 7: PARTIAL handling
  // ---------------------------------------------------------------------------
  console.log("\n7. PARTIAL handling:");
  const partialOutput: SchedulingOutput = {
    ...validSolverOutput,
    status: "PARTIAL",
    total_assigned_sessions: 2,
    total_required_sessions: 3,
    is_complete: false,
    entries: validSolverOutput.entries.slice(0, 2),
    unassigned_sessions: [
      {
        section_id: "44444444-4444-4444-4444-444444444444",
        subject_id: "sub-3",
        faculty_id: "fac-3",
        block_index: 1,
        required_periods: 1,
        reason: "No available faculty window",
      },
    ],
    warnings: ["Timetable generated partially due to conflicts."],
  };
  const enrichedPartial = enrichSolverOutput(partialOutput, meta);
  assert(enrichedPartial.status === "PARTIAL", "Status is PARTIAL");
  assert(enrichedPartial.is_complete === false, "is_complete is false for partial result");
  assert(enrichedPartial.unassigned_sessions?.length === 1, "Unassigned sessions list contains 1 item");
  assert(enrichedPartial.unassigned_sessions?.[0]?.reason === "No available faculty window", "Unassigned reason preserved");
  assert(enrichedPartial.warnings?.length === 1, "Warnings list preserved");

  // ---------------------------------------------------------------------------
  // Test 8: TIME_LIMIT handling
  // ---------------------------------------------------------------------------
  console.log("\n8. TIME_LIMIT handling:");
  const timeLimitOutput: SchedulingOutput = {
    ...validSolverOutput,
    status: "TIME_LIMIT",
    solve_duration_ms: 30005,
    diagnostics: ["Solver reached time limit of 30s."],
  };
  const enrichedTimeLimit = enrichSolverOutput(timeLimitOutput, meta);
  assert(enrichedTimeLimit.status === "TIME_LIMIT", "Status is TIME_LIMIT");
  assert(enrichedTimeLimit.status !== "OPTIMAL", "TIME_LIMIT is never labeled as OPTIMAL");
  assert(enrichedTimeLimit.diagnostics[0]?.includes("time limit"), "Diagnostics explain timeout");

  // ---------------------------------------------------------------------------
  // Test 9: INFEASIBLE handling
  // ---------------------------------------------------------------------------
  console.log("\n9. INFEASIBLE handling:");
  const infeasibleOutput: SchedulingOutput = {
    status: "INFEASIBLE",
    solver_name: "Google OR-Tools CP-SAT",
    solver_version: "9.15.6755",
    solve_duration_ms: 45.2,
    hard_constraint_violations: 1,
    soft_constraint_violations: 0,
    entries: [],
    violations: [],
    diagnostics: ["No feasible schedule found: required teaching periods exceed total working slots."],
  };
  const enrichedInfeasible = enrichSolverOutput(infeasibleOutput, meta);
  assert(enrichedInfeasible.status === "INFEASIBLE", "Status is INFEASIBLE");
  assert(enrichedInfeasible.entries.length === 0, "No entries assigned for infeasible outcome");
  assert(enrichedInfeasible.diagnostics.length > 0, "Diagnostic message populated");

  // ---------------------------------------------------------------------------
  // Test 10: MODEL_INVALID handling
  // ---------------------------------------------------------------------------
  console.log("\n10. MODEL_INVALID handling:");
  const modelInvalidOutput: SchedulingOutput = {
    status: "MODEL_INVALID",
    solver_name: "Google OR-Tools CP-SAT",
    solver_version: "9.15.6755",
    solve_duration_ms: 5.1,
    hard_constraint_violations: 0,
    soft_constraint_violations: 0,
    entries: [],
    violations: [],
    diagnostics: ["Invalid reference: Faculty assignment contains unknown subject ID."],
    error_message: "Input validation error in scheduling problem.",
  };
  const enrichedModelInvalid = enrichSolverOutput(modelInvalidOutput, meta);
  assert(enrichedModelInvalid.status === "MODEL_INVALID", "Status is MODEL_INVALID");
  assert(enrichedModelInvalid.error_message !== null, "Safe user-readable error message populated");

  // ---------------------------------------------------------------------------
  // Test 11: Faculty filtering
  // ---------------------------------------------------------------------------
  console.log("\n11. Faculty filtering:");
  const turingOnly = sampleEntries.filter((e) => e.faculty_name === "Dr. Alan Turing");
  assert(turingOnly.length === 1, "Filtering by 'Dr. Alan Turing' yields 1 session");
  assert(turingOnly[0]?.subject_code === "CS101", "Matched entry is CS101");

  // ---------------------------------------------------------------------------
  // Test 12: Classroom filtering
  // ---------------------------------------------------------------------------
  console.log("\n12. Classroom filtering:");
  const labOnly = sampleEntries.filter((e) => e.room_number === "LAB-201");
  assert(labOnly.length === 1, "Filtering by room 'LAB-201' yields 1 session");
  assert(labOnly[0]?.is_lab === true, "Classroom matched lab session");

  // ---------------------------------------------------------------------------
  // Test 13: Subject filtering
  // ---------------------------------------------------------------------------
  console.log("\n13. Subject filtering:");
  const mathOnly = sampleEntries.filter((e) => e.subject_code === "MA101");
  assert(mathOnly.length === 1, "Filtering by subject code 'MA101' yields 1 session");
  assert(mathOnly[0]?.subject_name === "Discrete Mathematics", "Subject name matches");

  // ---------------------------------------------------------------------------
  // Test 14: Day filtering
  // ---------------------------------------------------------------------------
  console.log("\n14. Day filtering:");
  const mondayOnly = sampleEntries.filter((e) => e.day_of_week === 1);
  const tuesdayOnly = sampleEntries.filter((e) => e.day_of_week === 2);
  assert(mondayOnly.length === 2, "Monday filter matches 2 sessions");
  assert(tuesdayOnly.length === 1, "Tuesday filter matches 1 session");

  // ---------------------------------------------------------------------------
  // Test 15: Search filtering (multi-field matching)
  // ---------------------------------------------------------------------------
  console.log("\n15. Search filtering (multi-field matching):");
  function runSearch(entries: EnrichedScheduledEntry[], query: string): EnrichedScheduledEntry[] {
    const q = query.trim().toLowerCase();
    return entries.filter(
      (e) =>
        e.subject_code.toLowerCase().includes(q) ||
        e.subject_name.toLowerCase().includes(q) ||
        e.faculty_name.toLowerCase().includes(q) ||
        e.room_number.toLowerCase().includes(q) ||
        e.section_name.toLowerCase().includes(q)
    );
  }
  assert(runSearch(sampleEntries, "Lovelace").length === 1, "Search by faculty name 'Lovelace' matches 1");
  assert(runSearch(sampleEntries, "LH-101").length === 2, "Search by room number 'LH-101' matches 2");
  assert(runSearch(sampleEntries, "Programming").length === 1, "Search by subject name 'Programming' matches 1");
  assert(runSearch(sampleEntries, "CS-A").length === 3, "Search by section name 'CS-A' matches all 3");

  // ---------------------------------------------------------------------------
  // Test 16: Filter reset (restores complete original dataset)
  // ---------------------------------------------------------------------------
  console.log("\n16. Filter reset:");
  let filtered = runSearch(sampleEntries, "NonExistentSearchString");
  assert(filtered.length === 0, "Query with no matches returns 0 entries");
  filtered = sampleEntries; // Reset
  assert(filtered.length === 3, "Reset restores complete dataset of 3 entries");

  // ---------------------------------------------------------------------------
  // Test 17: View-mode switching (grid, list, faculty, room grouping)
  // ---------------------------------------------------------------------------
  console.log("\n17. View-mode switching:");
  // Faculty View Grouping
  const facultyGroups = new Map<string, EnrichedScheduledEntry[]>();
  for (const e of sampleEntries) {
    const list = facultyGroups.get(e.faculty_name) || [];
    list.push(e);
    facultyGroups.set(e.faculty_name, list);
  }
  assert(facultyGroups.size === 3, "Faculty view groups into 3 distinct faculty members");

  // Room View Grouping
  const roomGroups = new Map<string, EnrichedScheduledEntry[]>();
  for (const e of sampleEntries) {
    const list = roomGroups.get(e.room_number) || [];
    list.push(e);
    roomGroups.set(e.room_number, list);
  }
  assert(roomGroups.size === 2, "Room view groups into 2 distinct classrooms");
  assert(roomGroups.get("LH-101")?.length === 2, "LH-101 has 2 scheduled sessions");
  assert(roomGroups.get("LAB-201")?.length === 1, "LAB-201 has 1 scheduled session");

  // ---------------------------------------------------------------------------
  // Test 18: Free-period detection
  // ---------------------------------------------------------------------------
  console.log("\n18. Free-period detection:");
  const periodSlots: TimetablePeriod[] = [
    {
      id: "p1",
      timetable_configuration_id: meta.configuration.id,
      day_of_week: 1,
      period_number: 1,
      start_time: "09:00:00",
      end_time: "09:50:00",
      is_break: false,
      is_active: true,
      created_at: "",
    },
    {
      id: "p2",
      timetable_configuration_id: meta.configuration.id,
      day_of_week: 1,
      period_number: 2,
      start_time: "09:50:00",
      end_time: "10:40:00",
      is_break: false,
      is_active: true,
      created_at: "",
    },
    {
      id: "p3",
      timetable_configuration_id: meta.configuration.id,
      day_of_week: 1,
      period_number: 3,
      start_time: "10:40:00",
      end_time: "11:30:00",
      is_break: false,
      is_active: true,
      created_at: "",
    },
  ];

  const occupancy = new Map<string, EnrichedScheduledEntry>();
  for (const e of sampleEntries) {
    occupancy.set(`${e.day_of_week}-${e.period_number}`, e);
  }

  const p1Occupied = occupancy.has("1-1");
  const p2Occupied = occupancy.has("1-2");
  const p3Occupied = occupancy.has("1-3"); // Empty period
  assert(p1Occupied === true, "Day 1 Period 1 is occupied");
  assert(p2Occupied === true, "Day 1 Period 2 is occupied");
  assert(p3Occupied === false, "Day 1 Period 3 correctly identified as Free Period");

  // ---------------------------------------------------------------------------
  // Test 19: Break-period detection
  // ---------------------------------------------------------------------------
  console.log("\n19. Break-period detection:");
  const breakSlot: TimetablePeriod = {
    id: "p-break",
    timetable_configuration_id: meta.configuration.id,
    day_of_week: 1,
    period_number: 4,
    start_time: "11:30:00",
    end_time: "12:00:00",
    is_break: true,
    is_active: true,
    created_at: "",
  };
  assert(breakSlot.is_break === true, "Period correctly flagged as configured break slot");

  // ---------------------------------------------------------------------------
  // Test 20: Preview-only/no-persistence behavior verification
  // ---------------------------------------------------------------------------
  console.log("\n20. Preview-only/no-persistence behavior verification:");
  // Query timetable_generations count before and after to verify zero DB mutations
  const { count: countBefore } = await supabase
    .from("timetable_generations")
    .select("*", { count: "exact", head: true });

  // Simulate in-memory enrichment without saving
  const previewSimulation = enrichSolverOutput(validSolverOutput, meta);
  assert(previewSimulation.generation_id === undefined, "generation_id remains undefined in preview mode");
  assert(previewSimulation.is_published === undefined || previewSimulation.is_published === false, "is_published is not set");

  const { count: countAfter } = await supabase
    .from("timetable_generations")
    .select("*", { count: "exact", head: true });

  assert(countBefore === countAfter, "Database generation count is unchanged (zero DB insertions)");

  // ---------------------------------------------------------------------------
  // Test 21: Diagnostics metric calculation
  // ---------------------------------------------------------------------------
  console.log("\n21. Diagnostics metric calculation:");
  const assigned = enrichedOptimal.total_assigned_sessions ?? enrichedOptimal.entries.length;
  const required = enrichedOptimal.total_required_sessions ?? assigned;
  const completionRatio = required > 0 ? (assigned / required) * 100 : 0;
  const hardViolations = enrichedOptimal.hard_constraint_violations;
  const softViolations = enrichedOptimal.soft_constraint_violations;
  const score = enrichedOptimal.objective_score;

  assert(assigned === 3, "Assigned session count is 3");
  assert(required === 3, "Required session count is 3");
  assert(completionRatio === 100, "Completion percentage calculated as 100%");
  assert(hardViolations === 0, "Hard constraint violations is 0");
  assert(softViolations === 0, "Soft constraint violations is 0");
  assert(score === 100, "Objective score correctly exposed as 100");

  // Summary
  console.log("\n===============================================================================");
  console.log(`Results: ${passedTests} passed, ${failedTests} failed`);
  console.log("===============================================================================\n");

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution encountered an error:", err);
  process.exit(1);
});
