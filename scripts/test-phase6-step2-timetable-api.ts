/**
 * SAMS — Phase 6 Step 6.2: Timetable Service & REST API Integration Test Suite
 *
 * Verifies:
 * 1. TimetableDataService: fetchSubjects, fetchSections, fetchFacultyAssignments,
 *    fetchClassrooms, fetchPeriods, fetchFacultyAvailability, fetchActiveTimetableConfiguration
 * 2. TimetableDataService: buildValidatedGenerationInput (valid data vs missing config vs section mismatch)
 * 3. GET /api/timetable/configurations/[id]:
 *    - Unauthenticated -> 401
 *    - Invalid UUID format -> 400
 *    - Non-existent configuration -> 404
 *    - Valid configuration -> 200 with configuration and periods
 * 4. GET /api/timetable/generation-input:
 *    - Unauthenticated -> 401
 *    - Student unauthorized -> 403
 *    - Missing query parameters -> 400
 *    - Section mismatch -> 400
 *    - Valid admin request -> 200 with complete assembled generation input
 *    - Valid faculty request -> 200 with complete assembled generation input
 * 5. POST /api/timetable/validate-schedule:
 *    - Unauthenticated -> 401
 *    - Student unauthorized -> 403
 *    - Malformed body -> 400
 *    - Empty entries array -> 400
 *    - Clean conflict-free schedule -> 200 with isValid: true
 *    - Conflicting schedule (faculty double-booking) -> 200 with isValid: false and conflict details
 * 6. Error sanitization (no internal database stack traces or leaked credentials)
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";
import { TimetableDataService } from "../apps/web/src/server/services/timetable-data";

dotenv.config({ path: path.resolve(process.cwd(), "apps/web/.env.local") });
dotenv.config();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const DEV_PASSWORD = process.env.SEED_USER_PASSWORD || "SamsDev#2026!";
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
  console.error("Missing SUPABASE configuration in apps/web/.env.local");
  process.exit(1);
}

const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface TestResult {
  id: number;
  name: string;
  category: "SERVICE" | "API_AUTH" | "API_CONFIG" | "API_GENERATION" | "API_VALIDATE";
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function recordTest(
  id: number,
  name: string,
  category: "SERVICE" | "API_AUTH" | "API_CONFIG" | "API_GENERATION" | "API_VALIDATE",
  passed: boolean,
  details: string
) {
  results.push({ id, name, category, passed, details });
  const status = passed ? "✓ PASS" : "✗ FAIL";
  console.log(`[${status}] [${category}] Test ${String(id).padStart(2, " ")}: ${name} — ${details}`);
}

async function runTests() {
  console.log("================================================================================");
  console.log("SAMS PHASE 6 STEP 6.2: TIMETABLE DATA SERVICE & REST API TEST SUITE");
  console.log(`Target Base URL: ${BASE_URL}`);
  console.log(`Target Supabase URL: ${SUPABASE_URL}`);
  console.log("================================================================================\n");

  let tempConfigId: string | null = null;
  let tempPeriodIds: string[] = [];

  try {
    // --------------------------------------------------------------------------
    // Pre-flight: Health check web server
    // --------------------------------------------------------------------------
    try {
      const health = await fetch(`${BASE_URL}/api/health`);
      if (health.status !== 200) {
        throw new Error(`Health check returned status ${health.status}`);
      }
    } catch (e: any) {
      console.error(`\n[CRITICAL] Web application is not accessible at ${BASE_URL}`);
      console.error("Please ensure the Next.js dev server is running on port 3000.\n", e.message);
      process.exit(1);
    }

    // --------------------------------------------------------------------------
    // Base Fixtures
    // --------------------------------------------------------------------------
    const { data: year } = await serviceClient.from("academic_years").select("id").eq("is_current", true).single();
    const { data: sem } = await serviceClient.from("semesters").select("id").eq("semester_number", 5).single();
    const { data: sectionA } = await serviceClient.from("class_sections").select("id, name").eq("name", "A").single();
    const { data: sectionB } = await serviceClient.from("class_sections").select("id, name").eq("name", "B").single();
    const { data: classroom } = await serviceClient.from("classrooms").select("id, room_number").limit(1).single();

    if (!year || !sem || !sectionA || !sectionB || !classroom) {
      throw new Error("Master data fixtures missing in database.");
    }

    // Authenticate actors
    const anonClient = createClient(SUPABASE_URL, ANON_KEY);

    const { data: adminAuth, error: adminAuthErr } = await anonClient.auth.signInWithPassword({
      email: "superadmin@sams.edu",
      password: DEV_PASSWORD,
    });
    const adminToken = adminAuth?.session?.access_token;

    const { data: facultyAuth, error: facultyAuthErr } = await anonClient.auth.signInWithPassword({
      email: "arun.kumar@sams.edu",
      password: DEV_PASSWORD,
    });
    const facultyToken = facultyAuth?.session?.access_token;

    const { data: studentAuth, error: studentAuthErr } = await anonClient.auth.signInWithPassword({
      email: "rohit.verma@student.sams.edu",
      password: DEV_PASSWORD,
    });
    const studentToken = studentAuth?.session?.access_token;

    if (!adminToken || !facultyToken || !studentToken) {
      throw new Error(
        `Failed to authenticate test actors: adminErr=${adminAuthErr?.message}, facultyErr=${facultyAuthErr?.message}, studentErr=${studentAuthErr?.message}`
      );
    }

    // Setup isolated test configuration and period slots
    const { data: newConfig, error: cfgErr } = await serviceClient
      .from("timetable_configurations")
      .insert({
        academic_year_id: year.id,
        semester_id: sem.id,
        section_id: sectionA.id,
        name: `API_Test_Config_${Date.now()}`,
        working_days: 6,
        periods_per_day: 6,
        period_duration_minutes: 55,
        break_after_periods: [{ period: 3, duration: 30, label: "Short Break" }],
        generation_status: "DRAFT",
        is_active: true,
      })
      .select()
      .single();

    if (cfgErr || !newConfig) {
      throw new Error(`Failed to create test configuration: ${cfgErr?.message}`);
    }
    tempConfigId = newConfig.id;

    // Create 6 periods for Day 1 (Monday) and Day 2 (Tuesday)
    const periodsToInsert = [];
    for (let day = 1; day <= 2; day++) {
      for (let p = 1; p <= 4; p++) {
        periodsToInsert.push({
          timetable_configuration_id: tempConfigId,
          day_of_week: day,
          period_number: p,
          start_time: `0${8 + p}:00:00`,
          end_time: `0${8 + p}:55:00`,
          is_break: p === 3,
          is_active: true,
        });
      }
    }

    const { data: insertedPeriods } = await serviceClient
      .from("timetable_periods")
      .insert(periodsToInsert)
      .select();

    tempPeriodIds = (insertedPeriods || []).map((p) => p.id);

    // ==========================================================================
    // 1. TIMETABLE DATA SERVICE UNIT TESTS
    // ==========================================================================

    // Test 1: Service fetchSubjects
    const subjectsRes = await TimetableDataService.fetchSubjects(serviceClient, {
      section_id: sectionA.id,
      is_active: true,
    });
    const test1Passed = subjectsRes.status === 200 && Array.isArray(subjectsRes.data) && subjectsRes.data.length > 0;
    recordTest(
      1,
      "TimetableDataService.fetchSubjects with section enrichment",
      "SERVICE",
      test1Passed,
      test1Passed
        ? `Retrieved ${subjectsRes.data?.length} subjects enriched with scheduling requirements`
        : `fetchSubjects failed: ${subjectsRes.error}`
    );

    // Test 2: Service fetchSections
    const sectionsRes = await TimetableDataService.fetchSections(serviceClient, {
      section_id: sectionA.id,
    });
    const test2Passed = sectionsRes.status === 200 && sectionsRes.data?.length === 1 && sectionsRes.data[0].id === sectionA.id;
    recordTest(
      2,
      "TimetableDataService.fetchSections",
      "SERVICE",
      test2Passed,
      test2Passed ? `Retrieved section '${sectionsRes.data?.[0].name}' (Capacity: ${sectionsRes.data?.[0].capacity})` : `Failed: ${sectionsRes.error}`
    );

    // Test 3: Service fetchFacultyAssignments
    const assignmentsRes = await TimetableDataService.fetchFacultyAssignments(serviceClient, {
      section_id: sectionA.id,
    });
    const test3Passed = assignmentsRes.status === 200 && Array.isArray(assignmentsRes.data) && assignmentsRes.data.length > 0;
    recordTest(
      3,
      "TimetableDataService.fetchFacultyAssignments",
      "SERVICE",
      test3Passed,
      test3Passed ? `Retrieved ${assignmentsRes.data?.length} faculty assignments for Section A` : `Failed: ${assignmentsRes.error}`
    );

    // Test 4: Service fetchClassrooms
    const classroomsRes = await TimetableDataService.fetchClassrooms(serviceClient, { is_available: true });
    const test4Passed = classroomsRes.status === 200 && Array.isArray(classroomsRes.data) && classroomsRes.data.length > 0;
    recordTest(
      4,
      "TimetableDataService.fetchClassrooms",
      "SERVICE",
      test4Passed,
      test4Passed ? `Retrieved ${classroomsRes.data?.length} available classrooms` : `Failed: ${classroomsRes.error}`
    );

    // Test 5: Service fetchPeriods
    const periodsRes = await TimetableDataService.fetchPeriods(serviceClient, tempConfigId);
    const test5Passed = periodsRes.status === 200 && (periodsRes.data?.length || 0) === 8;
    recordTest(
      5,
      "TimetableDataService.fetchPeriods",
      "SERVICE",
      test5Passed,
      test5Passed ? `Retrieved ${periodsRes.data?.length} active period slots for test configuration` : `Failed: ${periodsRes.error}`
    );

    // Test 6: Service buildValidatedGenerationInput (Success)
    const genInputRes = await TimetableDataService.buildValidatedGenerationInput(serviceClient, {
      configuration_id: tempConfigId,
      section_id: sectionA.id,
      timeout_seconds: 25,
      random_seed: 99,
    });
    const test6Passed = genInputRes.status === 200 && !!genInputRes.data && genInputRes.data.subjects.length > 0;
    recordTest(
      6,
      "TimetableDataService.buildValidatedGenerationInput (Valid Setup)",
      "SERVICE",
      test6Passed,
      test6Passed
        ? `Successfully assembled dataset: ${genInputRes.data?.subjects.length} subjects, ${genInputRes.data?.classrooms.length} rooms, ${genInputRes.data?.periods.length} periods`
        : `Failed to assemble generation input: ${genInputRes.error}`
    );

    // Test 7: Service buildValidatedGenerationInput (Section Mismatch Rejection)
    const mismatchRes = await TimetableDataService.buildValidatedGenerationInput(serviceClient, {
      configuration_id: tempConfigId,
      section_id: sectionB.id, // Configuration belongs to section A!
    });
    const test7Passed = mismatchRes.status === 400 && !!mismatchRes.error && mismatchRes.error.includes("Section mismatch");
    recordTest(
      7,
      "TimetableDataService.buildValidatedGenerationInput (Section Mismatch)",
      "SERVICE",
      test7Passed,
      test7Passed ? "Section mismatch correctly rejected with status 400" : `Expected 400 section mismatch error, got: ${mismatchRes.error}`
    );

    // ==========================================================================
    // 2. AUTHENTICATION & ROLE-BASED ACCESS (REST API)
    // ==========================================================================

    // Test 8: Unauthenticated requests rejected across all 3 endpoints -> 401
    const noAuthGetConfig = await fetch(`${BASE_URL}/api/timetable/configurations/${tempConfigId}`);
    const noAuthGetGenInput = await fetch(
      `${BASE_URL}/api/timetable/generation-input?configuration_id=${tempConfigId}&section_id=${sectionA.id}`
    );
    const noAuthPostValidate = await fetch(`${BASE_URL}/api/timetable/validate-schedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries: [] }),
    });

    const test8Passed =
      noAuthGetConfig.status === 401 && noAuthGetGenInput.status === 401 && noAuthPostValidate.status === 401;
    recordTest(
      8,
      "Unauthenticated Access Rejection across All Endpoints (401)",
      "API_AUTH",
      test8Passed,
      test8Passed
        ? "All 3 timetable endpoints strictly return 401 for unauthenticated requests"
        : `Statuses: config=${noAuthGetConfig.status}, gen-input=${noAuthGetGenInput.status}, validate=${noAuthPostValidate.status}`
    );

    // Test 9: Student blocked from generation input endpoint -> 403
    const studentGenInput = await fetch(
      `${BASE_URL}/api/timetable/generation-input?configuration_id=${tempConfigId}&section_id=${sectionA.id}`,
      {
        headers: { Authorization: `Bearer ${studentToken}` },
      }
    );
    const test9Passed = studentGenInput.status === 403;
    recordTest(
      9,
      "Student Blocked from Generation Input Endpoint (403)",
      "API_AUTH",
      test9Passed,
      test9Passed ? "Student role correctly blocked with 403 Forbidden" : `Expected 403, got ${studentGenInput.status}`
    );

    // Test 10: Student blocked from schedule validation endpoint -> 403
    const studentValidate = await fetch(`${BASE_URL}/api/timetable/validate-schedule`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${studentToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        configuration_id: tempConfigId,
        section_id: sectionA.id,
        entries: [
          {
            section_id: sectionA.id,
            subject_id: subjectsRes.data![0].id,
            faculty_id: assignmentsRes.data![0].faculty_id,
            classroom_id: classroomsRes.data![0].id,
            day_of_week: 1,
            period_number: 1,
          },
        ],
      }),
    });
    const test10Passed = studentValidate.status === 403;
    recordTest(
      10,
      "Student Blocked from Schedule Validation Endpoint (403)",
      "API_AUTH",
      test10Passed,
      test10Passed ? "Student role correctly blocked with 403 Forbidden" : `Expected 403, got ${studentValidate.status}`
    );

    // ==========================================================================
    // 3. GET /api/timetable/configurations/[id]
    // ==========================================================================

    // Test 11: Invalid UUID parameter -> 400
    const invalidUuidRes = await fetch(`${BASE_URL}/api/timetable/configurations/not-a-valid-uuid`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const test11Passed = invalidUuidRes.status === 400;
    recordTest(
      11,
      "GET /api/timetable/configurations/[id] Invalid UUID (400)",
      "API_CONFIG",
      test11Passed,
      test11Passed ? "Non-UUID route parameter correctly rejected with 400" : `Expected 400, got ${invalidUuidRes.status}`
    );

    // Test 12: Non-existent UUID -> 404
    const notFoundRes = await fetch(
      `${BASE_URL}/api/timetable/configurations/00000000-0000-0000-0000-000000000000`,
      {
        headers: { Authorization: `Bearer ${adminToken}` },
      }
    );
    const test12Passed = notFoundRes.status === 404;
    recordTest(
      12,
      "GET /api/timetable/configurations/[id] Non-Existent ID (404)",
      "API_CONFIG",
      test12Passed,
      test12Passed ? "Non-existent configuration ID returns 404 Not Found" : `Expected 404, got ${notFoundRes.status}`
    );

    // Test 13: Valid Configuration Retrieval by ID -> 200
    const validConfigRes = await fetch(`${BASE_URL}/api/timetable/configurations/${tempConfigId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const configBody = await validConfigRes.json();
    const test13Passed =
      validConfigRes.status === 200 &&
      configBody.success === true &&
      configBody.data.configuration.id === tempConfigId &&
      configBody.data.periods.length === 8;

    recordTest(
      13,
      "GET /api/timetable/configurations/[id] Valid Retrieval (200)",
      "API_CONFIG",
      test13Passed,
      test13Passed
        ? `Retrieved configuration '${configBody.data.configuration.name}' with ${configBody.data.periods.length} periods`
        : `Retrieval failed: status=${validConfigRes.status}, error=${configBody.error}`
    );

    // ==========================================================================
    // 4. GET /api/timetable/generation-input
    // ==========================================================================

    // Test 14: Missing query params -> 400
    const missingQueryRes = await fetch(`${BASE_URL}/api/timetable/generation-input`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const test14Passed = missingQueryRes.status === 400;
    recordTest(
      14,
      "GET /api/timetable/generation-input Missing Params (400)",
      "API_GENERATION",
      test14Passed,
      test14Passed ? "Missing query parameters correctly rejected with 400" : `Expected 400, got ${missingQueryRes.status}`
    );

    // Test 15: Valid Admin Call -> 200 with full dataset
    const adminGenInputRes = await fetch(
      `${BASE_URL}/api/timetable/generation-input?configuration_id=${tempConfigId}&section_id=${sectionA.id}`,
      {
        headers: { Authorization: `Bearer ${adminToken}` },
      }
    );
    const adminGenBody = await adminGenInputRes.json();
    const test15Passed =
      adminGenInputRes.status === 200 &&
      adminGenBody.success === true &&
      adminGenBody.data.subjects.length > 0 &&
      adminGenBody.data.classrooms.length > 0 &&
      adminGenBody.data.periods.length > 0;

    recordTest(
      15,
      "GET /api/timetable/generation-input Admin Valid Retrieval (200)",
      "API_GENERATION",
      test15Passed,
      test15Passed
        ? `Retrieved complete generation dataset: ${adminGenBody.data.subjects.length} subjects, ${adminGenBody.data.classrooms.length} rooms`
        : `Admin generation input failed: ${adminGenBody.error}`
    );

    // Test 16: Valid Faculty Call -> 200 with full dataset
    const facultyGenInputRes = await fetch(
      `${BASE_URL}/api/timetable/generation-input?configuration_id=${tempConfigId}&section_id=${sectionA.id}`,
      {
        headers: { Authorization: `Bearer ${facultyToken}` },
      }
    );
    const facultyGenBody = await facultyGenInputRes.json();
    const test16Passed = facultyGenInputRes.status === 200 && facultyGenBody.success === true;
    recordTest(
      16,
      "GET /api/timetable/generation-input Faculty Valid Retrieval (200)",
      "API_GENERATION",
      test16Passed,
      test16Passed
        ? `Faculty member successfully retrieved generation input for assigned section`
        : `Faculty retrieval failed: ${facultyGenBody.error}`
    );

    // ==========================================================================
    // 5. POST /api/timetable/validate-schedule
    // ==========================================================================

    // Test 17: Malformed body / missing entries -> 400
    const emptyValidateRes = await fetch(`${BASE_URL}/api/timetable/validate-schedule`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ entries: [] }),
    });
    const test17Passed = emptyValidateRes.status === 400;
    recordTest(
      17,
      "POST /api/timetable/validate-schedule Empty Payload (400)",
      "API_VALIDATE",
      test17Passed,
      test17Passed ? "Empty entries array rejected with 400" : `Expected 400, got ${emptyValidateRes.status}`
    );

    // Test 18: Valid conflict-free schedule -> 200, isValid: true
    const validEntry = {
      section_id: sectionA.id,
      subject_id: subjectsRes.data![0].id,
      faculty_id: assignmentsRes.data![0].faculty_id,
      classroom_id: classroomsRes.data![0].id,
      day_of_week: 1,
      period_number: 1,
      session_type: "THEORY",
      is_lab: false,
    };

    const cleanValidateRes = await fetch(`${BASE_URL}/api/timetable/validate-schedule`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        configuration_id: tempConfigId,
        section_id: sectionA.id,
        entries: [validEntry],
      }),
    });
    const cleanValidateBody = await cleanValidateRes.json();
    const test18Passed =
      cleanValidateRes.status === 200 &&
      cleanValidateBody.success === true &&
      cleanValidateBody.data.isValid === true &&
      cleanValidateBody.data.totalConflicts === 0;

    recordTest(
      18,
      "POST /api/timetable/validate-schedule Conflict-Free Schedule (200, isValid: true)",
      "API_VALIDATE",
      test18Passed,
      test18Passed
        ? "Clean candidate schedule validated: 0 conflicts detected"
        : `Validation failed: status=${cleanValidateRes.status}, error=${cleanValidateBody.error || JSON.stringify(cleanValidateBody.data)}`
    );

    // Test 19: Schedule with Faculty Double Booking -> 200, isValid: false
    const doubleBookedFaculty = assignmentsRes.data![0].faculty_id;
    const conflictingEntries = [
      {
        id: "entry-1",
        section_id: sectionA.id,
        subject_id: subjectsRes.data![0].id,
        faculty_id: doubleBookedFaculty,
        classroom_id: classroomsRes.data![0].id,
        day_of_week: 1,
        period_number: 2,
      },
      {
        id: "entry-2",
        section_id: sectionB.id, // Double booking in another section!
        subject_id: subjectsRes.data![0].id,
        faculty_id: doubleBookedFaculty,
        classroom_id: classroomsRes.data![1]?.id || classroomsRes.data![0].id,
        day_of_week: 1,
        period_number: 2, // Same day and period!
      },
    ];

    const conflictValidateRes = await fetch(`${BASE_URL}/api/timetable/validate-schedule`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        configuration_id: tempConfigId,
        section_id: sectionA.id,
        entries: conflictingEntries,
      }),
    });
    const conflictValidateBody = await conflictValidateRes.json();
    const test19Passed =
      conflictValidateRes.status === 200 &&
      conflictValidateBody.success === true &&
      conflictValidateBody.data.isValid === false &&
      conflictValidateBody.data.conflicts.some((c: any) => c.type === "FACULTY_DOUBLE_BOOKING");

    recordTest(
      19,
      "POST /api/timetable/validate-schedule Detects Faculty Double-Booking",
      "API_VALIDATE",
      test19Passed,
      test19Passed
        ? `Successfully detected ${conflictValidateBody.data.conflicts.length} conflict(s) including FACULTY_DOUBLE_BOOKING`
        : `Failed to detect conflict: ${JSON.stringify(conflictValidateBody)}`
    );

    // Test 20: Safe Error Handling (No stack traces or credential leaks)
    const malformedJsonRes = await fetch(`${BASE_URL}/api/timetable/validate-schedule`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: "{ bad_json: true",
    });
    const malformedBody = await malformedJsonRes.json();
    const test20Passed =
      malformedJsonRes.status === 400 &&
      malformedBody.success === false &&
      !malformedBody.error.includes("node_modules") &&
      !malformedBody.error.includes("stack");

    recordTest(
      20,
      "API Error Sanitization & Safe Response Format",
      "API_VALIDATE",
      test20Passed,
      test20Passed
        ? "Malformed input rejected with clean sanitized error response"
        : `Leaked stack or unexpected status: ${malformedBody.error}`
    );
  } finally {
    // --------------------------------------------------------------------------
    // Cleanup: Purge temporary test configuration and periods
    // --------------------------------------------------------------------------
    if (tempConfigId) {
      await serviceClient.from("timetable_periods").delete().eq("timetable_configuration_id", tempConfigId);
      await serviceClient.from("timetable_configurations").delete().eq("id", tempConfigId);
    }
    console.log("\n[CLEANUP] Temporary test configuration & periods purged.");
  }

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  const passedCount = results.filter((r) => r.passed).length;
  const totalCount = results.length;

  console.log("\n================================================================================");
  console.log(`TEST RESULTS: ${passedCount}/${totalCount} PASSED (${Math.round((passedCount / totalCount) * 100)}%)`);
  console.log("================================================================================");

  if (passedCount !== totalCount) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Fatal test failure:", err);
  process.exit(1);
});
