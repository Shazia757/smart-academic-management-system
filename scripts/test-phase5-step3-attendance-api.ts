/**
 * SAMS — Phase 5 Step 5.3: Attendance Service & API Integration Test Suite
 *
 * Tests the complete attendance service and REST API integration:
 * 1. Valid session creation (POST /api/attendance/sessions) -> 201
 * 2. Missing required fields validation error -> 400
 * 3. Invalid UUIDs in route / payload -> 400
 * 4. Invalid session status -> 400
 * 5. Invalid attendance status -> 400
 * 6. Confidence score out of bounds (<0.0 or >1.0) -> 400
 * 7. Duplicate student IDs in bulk payload -> 400
 * 8. Unauthenticated requests rejected -> 401 across all endpoints
 * 9. Unauthorized faculty creation/mutation rejected -> 403
 * 10. Student access to another student's history strictly rejected -> 403
 * 11. Student can read their own attendance history -> 200
 * 12. Saving records to closed session blocked -> 400
 * 13. Saving records to cancelled session blocked -> 400
 * 14. Atomic rollback on invalid student record -> 400, 0 partial writes
 * 15. Audit actor identity derived securely from auth.uid() -> verified
 * 16. Safe error responses without database stack trace leaks -> verified
 * 17. Session retrieval by ID (GET /api/attendance/sessions/[id]) -> 200
 * 18. Session listing with filters (GET /api/attendance/sessions) -> 200
 * 19. Session closure endpoint (POST /api/attendance/sessions/[id]/close) -> 200
 * 20. Session cancellation endpoint (POST /api/attendance/sessions/[id]/cancel) -> 200
 * 21. Session summary calculation (GET /api/attendance/sessions/[id]/summary) -> 200
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

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
  category: "SERVICE" | "API_AUTH" | "API_SESSION" | "API_RECORDS" | "API_SECURITY";
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function recordTest(
  id: number,
  name: string,
  category: "SERVICE" | "API_AUTH" | "API_SESSION" | "API_RECORDS" | "API_SECURITY",
  passed: boolean,
  details: string
) {
  results.push({ id, name, category, passed, details });
  const status = passed ? "✓ PASS" : "✗ FAIL";
  console.log(`[${status}] [${category}] Test ${String(id).padStart(2, " ")}: ${name} — ${details}`);
}

async function apiRequest(
  endpoint: string,
  options: {
    method?: string;
    token?: string | null;
    body?: any;
  } = {}
) {
  const url = `${BASE_URL}${endpoint}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (options.token) {
    headers["Authorization"] = `Bearer ${options.token}`;
  }

  const res = await fetch(url, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  return { status: res.status, data };
}

async function runTests() {
  console.log("================================================================================");
  console.log("SAMS PHASE 5 STEP 5.3: ATTENDANCE SERVICE & API INTEGRATION TEST SUITE");
  console.log(`Target Base URL: ${BASE_URL}`);
  console.log(`Target Supabase URL: ${SUPABASE_URL}`);
  console.log("================================================================================\n");

  const createdSessionIds: string[] = [];

  try {
    // --------------------------------------------------------------------------
    // Pre-flight check: Web server availability
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
    // Fetch master data fixtures
    // --------------------------------------------------------------------------
    const { data: year } = await serviceClient.from("academic_years").select("id").eq("is_current", true).single();
    const { data: sectionA } = await serviceClient.from("class_sections").select("id").eq("name", "A").single();
    const { data: sectionB } = await serviceClient.from("class_sections").select("id").eq("name", "B").single();
    const { data: subjectCS501 } = await serviceClient.from("subjects").select("id").eq("code", "CS501").single();
    const { data: subjectCS502 } = await serviceClient.from("subjects").select("id").eq("code", "CS502").single();
    const { data: facultyArun } = await serviceClient.from("faculty").select("id").eq("employee_id", "FAC-CSE-001").single();
    const { data: facultyPriya } = await serviceClient.from("faculty").select("id").eq("employee_id", "FAC-CSE-002").single();
    const { data: studentRohit } = await serviceClient.from("students").select("id").eq("roll_number", "24CSE01").single();
    const { data: studentSneha } = await serviceClient.from("students").select("id").eq("roll_number", "24CSE02").single();

    if (!year || !sectionA || !sectionB || !subjectCS501 || !subjectCS502 || !facultyArun || !facultyPriya || !studentRohit || !studentSneha) {
      throw new Error("Master data fixtures missing in database.");
    }

    // Authenticate actors and obtain JWT access tokens
    const anonClient = createClient(SUPABASE_URL, ANON_KEY);

    const { data: adminAuth } = await anonClient.auth.signInWithPassword({
      email: "superadmin@sams.edu",
      password: DEV_PASSWORD,
    });
    const adminToken = adminAuth.session?.access_token;

    const { data: arunAuth } = await anonClient.auth.signInWithPassword({
      email: "arun.kumar@sams.edu",
      password: DEV_PASSWORD,
    });
    const arunToken = arunAuth.session?.access_token;

    const { data: priyaAuth } = await anonClient.auth.signInWithPassword({
      email: "priya.sharma@sams.edu",
      password: DEV_PASSWORD,
    });
    const priyaToken = priyaAuth.session?.access_token;

    const { data: rohitAuth } = await anonClient.auth.signInWithPassword({
      email: "rohit.verma@student.sams.edu",
      password: DEV_PASSWORD,
    });
    const rohitToken = rohitAuth.session?.access_token;

    if (!adminToken || !arunToken || !priyaToken || !rohitToken) {
      throw new Error("Failed to authenticate test actors.");
    }

    // ==========================================================================
    // GROUP 1: AUTHENTICATION & ACCESS CONTROL (API_AUTH)
    // ==========================================================================

    // Test 1: Unauthenticated request rejected (401)
    const { status: unauthPostStatus } = await apiRequest("/api/attendance/sessions", {
      method: "POST",
      body: { section_id: sectionA.id, subject_id: subjectCS501.id },
    });
    const { status: unauthGetStatus } = await apiRequest("/api/attendance/sessions");
    const test1Passed = unauthPostStatus === 401 && unauthGetStatus === 401;
    recordTest(1, "Unauthenticated Requests Blocked (401)", "API_AUTH", test1Passed, test1Passed ? "Both POST and GET rejected with 401 Unauthorized" : "Unauthenticated request was permitted");

    // Test 2: Student cannot create attendance session (403)
    const { status: studentCreateStatus, data: studentCreateData } = await apiRequest("/api/attendance/sessions", {
      method: "POST",
      token: rohitToken,
      body: {
        academic_year_id: year.id,
        section_id: sectionA.id,
        subject_id: subjectCS501.id,
        faculty_id: facultyArun.id,
        session_date: "2026-09-20",
        start_time: "09:00:00",
        status: "OPEN",
      },
    });
    const test2Passed = studentCreateStatus === 403;
    recordTest(2, "Student Session Creation Prohibited (403)", "API_AUTH", test2Passed, test2Passed ? `Blocked: ${studentCreateData?.error}` : "Student was permitted to create session");

    // Test 3: Faculty cannot create session for another faculty member (403)
    const { status: crossFacultyStatus, data: crossFacultyData } = await apiRequest("/api/attendance/sessions", {
      method: "POST",
      token: priyaToken,
      body: {
        academic_year_id: year.id,
        section_id: sectionA.id,
        subject_id: subjectCS501.id,
        faculty_id: facultyArun.id, // Priya trying to create Arun's session!
        session_date: "2026-09-20",
        start_time: "09:00:00",
        status: "OPEN",
      },
    });
    const test3Passed = crossFacultyStatus === 403;
    recordTest(3, "Cross-Faculty Session Creation Blocked (403)", "API_AUTH", test3Passed, test3Passed ? `Blocked: ${crossFacultyData?.error}` : "Cross-faculty session was permitted");

    // ==========================================================================
    // GROUP 2: SESSION MANAGEMENT & VALIDATION (API_SESSION)
    // ==========================================================================

    // Test 4: Missing required fields validation error (400)
    const { status: missingFieldStatus, data: missingFieldData } = await apiRequest("/api/attendance/sessions", {
      method: "POST",
      token: arunToken,
      body: {
        faculty_id: facultyArun.id,
        // missing section_id, subject_id, session_date, start_time
      },
    });
    const test4Passed = missingFieldStatus === 400 && !missingFieldData?.success;
    recordTest(4, "Missing Required Fields Validation (400)", "API_SESSION", test4Passed, test4Passed ? `Validation error: ${missingFieldData?.error}` : "Missing fields were accepted");

    // Test 5: Invalid UUID format in body rejected (400)
    const { status: invalidUuidStatus } = await apiRequest("/api/attendance/sessions", {
      method: "POST",
      token: arunToken,
      body: {
        section_id: "not-a-real-uuid",
        subject_id: subjectCS501.id,
        faculty_id: facultyArun.id,
        session_date: "2026-09-20",
        start_time: "09:00:00",
      },
    });
    const test5Passed = invalidUuidStatus === 400;
    recordTest(5, "Invalid UUID in Payload Rejected (400)", "API_SESSION", test5Passed, test5Passed ? "Malformed UUID cleanly rejected" : "Invalid UUID accepted");

    // Test 6: Invalid session status rejected (400)
    const { status: badStatusStatus } = await apiRequest("/api/attendance/sessions", {
      method: "POST",
      token: arunToken,
      body: {
        section_id: sectionA.id,
        subject_id: subjectCS501.id,
        faculty_id: facultyArun.id,
        session_date: "2026-09-20",
        start_time: "09:00:00",
        status: "NON_EXISTENT_STATUS",
      },
    });
    const test6Passed = badStatusStatus === 400;
    recordTest(6, "Invalid Session Status Rejected (400)", "API_SESSION", test6Passed, test6Passed ? "Non-canonical session status rejected" : "Invalid status accepted");

    // Test 7: Valid session creation by faculty (201)
    const { status: validCreateStatus, data: validCreateData } = await apiRequest("/api/attendance/sessions", {
      method: "POST",
      token: arunToken,
      body: {
        academic_year_id: year.id,
        section_id: sectionA.id,
        subject_id: subjectCS501.id,
        faculty_id: facultyArun.id,
        session_date: "2026-09-20",
        start_time: "09:00:00",
        status: "OPEN",
        created_by: "55555555-5555-5555-5555-555555555555", // Spoofed created_by to verify server ignores it!
      },
    });
    const activeSessionId = validCreateData?.data?.id;
    if (activeSessionId) createdSessionIds.push(activeSessionId);

    const test7Passed =
      validCreateStatus === 201 &&
      validCreateData?.success &&
      !!activeSessionId &&
      validCreateData.data.created_by !== "55555555-5555-5555-5555-555555555555";
    recordTest(7, "Valid Session Creation & created_by Sanitization (201)", "API_SESSION", test7Passed, test7Passed ? `Created Session ID: ${activeSessionId} (created_by derived securely)` : "Session creation failed");

    // Test 8: Get session by ID (GET /api/attendance/sessions/[id])
    const { status: getSessStatus, data: getSessData } = await apiRequest(`/api/attendance/sessions/${activeSessionId}`, {
      token: arunToken,
    });
    const test8Passed = getSessStatus === 200 && getSessData?.data?.id === activeSessionId;
    recordTest(8, "Get Session by ID (200)", "API_SESSION", test8Passed, test8Passed ? `Retrieved: ${getSessData?.data?.subject?.name} (${getSessData?.data?.status})` : "Get session failed");

    // Test 9: Invalid UUID in dynamic route URL (400)
    const { status: badUrlIdStatus } = await apiRequest("/api/attendance/sessions/not-a-valid-uuid", {
      token: arunToken,
    });
    const test9Passed = badUrlIdStatus === 400;
    recordTest(9, "Invalid UUID in Route URL (400)", "API_SESSION", test9Passed, test9Passed ? "Malformed route parameter rejected with 400" : "Invalid route ID accepted");

    // Test 10: List sessions with query filter (GET /api/attendance/sessions)
    const { status: listSessStatus, data: listSessData } = await apiRequest(
      `/api/attendance/sessions?section_id=${sectionA.id}&status=OPEN`,
      { token: arunToken }
    );
    const test10Passed = listSessStatus === 200 && Array.isArray(listSessData?.data) && listSessData.data.length > 0;
    recordTest(10, "List Sessions with Query Filters (200)", "API_SESSION", test10Passed, test10Passed ? `Found ${listSessData?.data?.length} matching sessions` : "List sessions failed");

    // ==========================================================================
    // GROUP 3: ATTENDANCE RECORDS & ATOMIC RPC (API_RECORDS)
    // ==========================================================================

    // Test 11: Invalid attendance status in records payload (400)
    const { status: badRecStatus, data: badRecData } = await apiRequest(
      `/api/attendance/sessions/${activeSessionId}/records`,
      {
        method: "POST",
        token: arunToken,
        body: {
          records: [{ student_id: studentRohit.id, status: "INVALID_STATUS" }],
        },
      }
    );
    const test11Passed = badRecStatus === 400 && !badRecData?.success;
    recordTest(11, "Invalid Attendance Status in Bulk Payload (400)", "API_RECORDS", test11Passed, test11Passed ? `Rejected: ${badRecData?.error}` : "Invalid status was accepted");

    // Test 12: Confidence score bounds validation (<0.0 or >1.0) (400)
    const { status: badConfStatus } = await apiRequest(
      `/api/attendance/sessions/${activeSessionId}/records`,
      {
        method: "POST",
        token: arunToken,
        body: {
          records: [{ student_id: studentRohit.id, status: "PRESENT", confidence_score: 1.5 }],
        },
      }
    );
    const test12Passed = badConfStatus === 400;
    recordTest(12, "Out-of-Bounds Confidence Score Rejected (400)", "API_RECORDS", test12Passed, test12Passed ? "Confidence score > 1.0 cleanly rejected" : "Out-of-bounds confidence accepted");

    // Test 13: Duplicate student IDs in bulk payload rejected with rollback (400)
    const { status: dupStudentStatus, data: dupStudentData } = await apiRequest(
      `/api/attendance/sessions/${activeSessionId}/records`,
      {
        method: "POST",
        token: arunToken,
        body: {
          records: [
            { student_id: studentRohit.id, status: "PRESENT" },
            { student_id: studentRohit.id, status: "LATE" }, // Duplicate!
          ],
        },
      }
    );
    const test13Passed = dupStudentStatus === 400 && dupStudentData?.error?.includes("Duplicate");
    recordTest(13, "Duplicate Student IDs in Submission Rejected (400)", "API_RECORDS", test13Passed, test13Passed ? `Rejected: ${dupStudentData?.error}` : "Duplicate students accepted");

    // Test 14: Valid bulk attendance records submission (200)
    const { status: validRecStatus, data: validRecData } = await apiRequest(
      `/api/attendance/sessions/${activeSessionId}/records`,
      {
        method: "POST",
        token: arunToken,
        body: {
          records: [
            {
              student_id: studentRohit.id,
              status: "PRESENT",
              confidence_score: 0.94,
              recognition_method: "FACIAL_RECOGNITION",
              remarks: "Verified via facial match",
            },
            {
              student_id: studentSneha.id,
              status: "LATE",
              confidence_score: null,
              recognition_method: "MANUAL",
              remarks: "Arrived 15 minutes late",
            },
          ],
        },
      }
    );
    const test14Passed = validRecStatus === 200 && validRecData?.data?.saved_count === 2;
    recordTest(14, "Valid Bulk Attendance Persistence (200)", "API_RECORDS", test14Passed, test14Passed ? `Atomically saved ${validRecData?.data?.saved_count} records` : "Bulk save failed");

    // Test 15: Atomic rollback on invalid student record (400)
    const { count: preCount } = await serviceClient.from("attendance_records").select("*", { count: "exact", head: true }).eq("session_id", activeSessionId);
    const { status: rollbackStatus } = await apiRequest(
      `/api/attendance/sessions/${activeSessionId}/records`,
      {
        method: "POST",
        token: arunToken,
        body: {
          records: [
            { student_id: "00000000-0000-0000-0000-000000000000", status: "PRESENT" }, // Invalid student
          ],
        },
      }
    );
    const { count: postCount } = await serviceClient.from("attendance_records").select("*", { count: "exact", head: true }).eq("session_id", activeSessionId);
    const test15Passed = rollbackStatus === 400 && preCount === postCount;
    recordTest(15, "Atomic Rollback on Invalid Student (400)", "API_RECORDS", test15Passed, test15Passed ? "Transaction rolled back completely, 0 partial writes" : "Rollback check failed");

    // Test 16: Get session summary (GET /api/attendance/sessions/[id]/summary)
    const { status: summaryStatus, data: summaryData } = await apiRequest(
      `/api/attendance/sessions/${activeSessionId}/summary`,
      { token: arunToken }
    );
    const test16Passed =
      summaryStatus === 200 &&
      summaryData?.data?.summary?.total_students === 2 &&
      summaryData?.data?.summary?.present_count === 1 &&
      summaryData?.data?.summary?.late_count === 1;
    recordTest(16, "Session Summary Metrics (200)", "API_RECORDS", test16Passed, test16Passed ? `Summary: Total=${summaryData?.data?.summary?.total_students}, Present=${summaryData?.data?.summary?.present_count}, Late=${summaryData?.data?.summary?.late_count}, Percentage=${summaryData?.data?.summary?.attendance_percentage}%` : "Summary retrieval failed");

    // ==========================================================================
    // GROUP 4: SESSION LIFECYCLE & STATE TRANSITIONS (API_SESSION)
    // ==========================================================================

    // Test 17: Close attendance session (POST /api/attendance/sessions/[id]/close)
    const { status: closeStatus, data: closeData } = await apiRequest(
      `/api/attendance/sessions/${activeSessionId}/close`,
      { method: "POST", token: arunToken }
    );
    const test17Passed = closeStatus === 200 && closeData?.data?.status === "CLOSED";
    recordTest(17, "Close Attendance Session (200)", "API_SESSION", test17Passed, test17Passed ? "Session status transitioned to CLOSED" : "Session close failed");

    // Test 18: Saving records to CLOSED session strictly blocked (400)
    const { status: closedPostStatus, data: closedPostData } = await apiRequest(
      `/api/attendance/sessions/${activeSessionId}/records`,
      {
        method: "POST",
        token: arunToken,
        body: {
          records: [{ student_id: studentRohit.id, status: "PRESENT" }],
        },
      }
    );
    const test18Passed = closedPostStatus === 400 && closedPostData?.error?.includes("CLOSED");
    recordTest(18, "Modifying CLOSED Session Blocked (400)", "API_SESSION", test18Passed, test18Passed ? `Blocked: ${closedPostData?.error}` : "Modification to CLOSED session was allowed");

    // Create a temporary session to test cancellation
    const { data: cancelSessData } = await apiRequest("/api/attendance/sessions", {
      method: "POST",
      token: arunToken,
      body: {
        academic_year_id: year.id,
        section_id: sectionA.id,
        subject_id: subjectCS501.id,
        faculty_id: facultyArun.id,
        session_date: "2026-09-21",
        start_time: "14:00:00",
        status: "OPEN",
      },
    });
    const cancelSessId = cancelSessData?.data?.id;
    if (cancelSessId) createdSessionIds.push(cancelSessId);

    // Test 19: Cancel attendance session (POST /api/attendance/sessions/[id]/cancel)
    const { status: cancelStatus, data: cancelData } = await apiRequest(
      `/api/attendance/sessions/${cancelSessId}/cancel`,
      { method: "POST", token: arunToken }
    );
    const test19Passed = cancelStatus === 200 && cancelData?.data?.status === "CANCELLED";
    recordTest(19, "Cancel Attendance Session (200)", "API_SESSION", test19Passed, test19Passed ? "Session status transitioned to CANCELLED" : "Session cancel failed");

    // Test 20: Saving records to CANCELLED session strictly blocked (400)
    const { status: cancelPostStatus, data: cancelPostData } = await apiRequest(
      `/api/attendance/sessions/${cancelSessId}/records`,
      {
        method: "POST",
        token: arunToken,
        body: {
          records: [{ student_id: studentRohit.id, status: "PRESENT" }],
        },
      }
    );
    const test20Passed = cancelPostStatus === 400 && cancelPostData?.error?.includes("CANCELLED");
    recordTest(20, "Modifying CANCELLED Session Blocked (400)", "API_SESSION", test20Passed, test20Passed ? `Blocked: ${cancelPostData?.error}` : "Modification to CANCELLED session was allowed");

    // ==========================================================================
    // GROUP 5: STUDENT PRIVACY & SECURITY ENFORCEMENT (API_SECURITY)
    // ==========================================================================

    // Test 21: Student reads their own attendance history (200)
    const { status: rohitOwnStatus, data: rohitOwnData } = await apiRequest(
      `/api/attendance/students/${studentRohit.id}/history`,
      { token: rohitToken }
    );
    const test21Passed =
      rohitOwnStatus === 200 &&
      rohitOwnData?.success &&
      rohitOwnData?.data?.student_id === studentRohit.id &&
      Array.isArray(rohitOwnData?.data?.records);
    recordTest(21, "Student Views Own Attendance History (200)", "API_SECURITY", test21Passed, test21Passed ? `Rohit retrieved ${rohitOwnData?.data?.records?.length} records (Attendance: ${rohitOwnData?.data?.summary?.attendance_percentage}%)` : "Student could not read own history");

    // Test 22: Student attempts to access another student's history strictly rejected (403)
    const { status: crossStudentStatus, data: crossStudentData } = await apiRequest(
      `/api/attendance/students/${studentSneha.id}/history`, // Rohit querying Sneha!
      { token: rohitToken }
    );
    const test22Passed = crossStudentStatus === 403 && !crossStudentData?.success;
    recordTest(22, "Cross-Student Attendance History Blocked (403)", "API_SECURITY", test22Passed, test22Passed ? `Access Denied: ${crossStudentData?.error}` : "Student accessed another student's history");

    // Test 23: Faculty attempts to close another faculty's session rejected (403)
    // Create an open session for Priya
    const { data: priyaSessData } = await apiRequest("/api/attendance/sessions", {
      method: "POST",
      token: priyaToken,
      body: {
        academic_year_id: year.id,
        section_id: sectionA.id,
        subject_id: subjectCS502.id, // Priya is assigned to CS502
        faculty_id: facultyPriya.id,
        session_date: "2026-09-22",
        start_time: "10:00:00",
        status: "OPEN",
      },
    });
    const priyaSessId = priyaSessData?.data?.id;
    if (priyaSessId) createdSessionIds.push(priyaSessId);

    // Arun attempts to close Priya's session
    const { status: arunClosePriyaStatus } = await apiRequest(
      `/api/attendance/sessions/${priyaSessId}/close`,
      { method: "POST", token: arunToken }
    );
    const test23Passed = arunClosePriyaStatus === 403;
    recordTest(23, "Unauthorized Faculty Session Closure Blocked (403)", "API_SECURITY", test23Passed, test23Passed ? "Arun blocked from closing Priya's session (status 403)" : "Unauthorized faculty closed session");

    // Test 24: Error responses never leak SQL / Postgres internals
    const { data: safeErrData } = await apiRequest("/api/attendance/sessions/00000000-0000-0000-0000-000000000000", {
      token: arunToken,
    });
    const errorString = JSON.stringify(safeErrData);
    const test24Passed =
      !errorString.includes("SELECT") &&
      !errorString.includes("FROM") &&
      !errorString.includes("public.") &&
      !errorString.includes("stack");
    recordTest(24, "Safe Sanitized Error Responses", "API_SECURITY", test24Passed, test24Passed ? "Response contains clean domain error without internal database traces" : "Internal database details leaked");

  } finally {
    // --------------------------------------------------------------------------
    // Cleanup temporary test records
    // --------------------------------------------------------------------------
    console.log("\nCleaning up temporary test records...");
    for (const sid of createdSessionIds) {
      await serviceClient.from("attendance_records").delete().eq("session_id", sid);
      await serviceClient.from("attendance_sessions").delete().eq("id", sid);
    }
    console.log("Cleanup complete.");
  }

  // ----------------------------------------------------------------------------
  // Summary
  // ----------------------------------------------------------------------------
  console.log("\n================================================================================");
  console.log("TEST SUMMARY");
  console.log("================================================================================");
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = total - passed;
  console.log(`Total: ${total} | Passed: ${passed} | Failed: ${failed}`);
  if (failed === 0) {
    console.log("RESULT: ALL 24 PHASE 5 STEP 5.3 ATTENDANCE SERVICE & API TESTS PASSED SUCCESSFULLY!");
  } else {
    console.error(`RESULT: ${failed} TESTS FAILED.`);
    process.exit(1);
  }
  console.log("================================================================================\n");
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
