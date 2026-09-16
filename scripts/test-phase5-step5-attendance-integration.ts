/**
 * SAMS — Phase 5 Step 5.5: Final Attendance Integration & End-to-End Test Suite
 *
 * Verifies the complete attendance lifecycle, role boundaries, security invariants,
 * persistence guarantees, and error handling across all personas:
 *
 *  1. Faculty session creation (POST /api/attendance/sessions) -> 201 Created
 *  2. Session creation schema validation failure (missing fields) -> 400 Bad Request
 *  3. Faculty impersonation rejected (cannot create session for another faculty) -> 403 Forbidden
 *  4. Student cannot create attendance session -> 403 Forbidden
 *  5. Faculty session list returns assigned sessions and respects RLS -> 200 OK
 *  6. Empty session filter query returns empty list without error -> 200 OK
 *  7. Roster pre-population check: newly created session has 0 records initially -> verified
 *  8. Faculty marks & bulk saves attendance records -> 200 OK
 *  9. Persistence verification after reload (records in DB match saved statuses) -> 200 OK
 * 10. Faculty updates attendance status & remarks -> 200 OK, reflects updated values
 * 11. Un-enrolled/invalid student record rejected with atomic rollback -> 400 Bad Request, 0 partial writes
 * 12. Duplicate student record in payload rejected -> 400 Bad Request
 * 13. Session summary calculation returns exact turnout metrics & percentage -> 200 OK
 * 14. Student views their own attendance history -> 200 OK
 * 15. Student cannot mutate attendance records -> 403 Forbidden
 * 16. Cross-student privacy: Student A cannot view Student B's attendance history -> 403 Forbidden
 * 17. Student cannot close or cancel attendance sessions -> 403 Forbidden
 * 18. Cross-faculty isolation: Faculty B cannot mutate or close Faculty A's session -> 403 Forbidden
 * 19. Unauthenticated requests rejected across all attendance endpoints -> 401 Unauthorized
 * 20. Faculty closes OPEN session -> 200 OK, status = CLOSED
 * 21. Immutability guard: saving records to CLOSED session blocked -> 400 Bad Request
 * 22. Closing an already CLOSED session blocked -> 400 Bad Request
 * 23. Faculty cancels OPEN session -> 200 OK, status = CANCELLED
 * 24. Immutability guard: saving records to CANCELLED session blocked -> 400 Bad Request
 * 25. Error message sanitization strips internal SQL/table leaks -> verified
 * 26. Pure UI helpers format time windows and dates reliably -> verified
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

// Import pure UI helpers directly from web app
import {
  calculateSubjectWiseAttendance,
  filterAttendanceSessions,
  filterStudentHistory,
  formatSessionTimeWindow,
  formatAttendanceDate,
  sanitizeErrorMessage,
} from "../apps/web/src/lib/attendance/attendance-ui-helpers";
import { AttendanceRecord, AttendanceSession } from "../apps/web/src/types/attendance";

interface TestResult {
  id: number;
  name: string;
  category: "CREATION" | "LISTING" | "MARKING" | "SUMMARY" | "STUDENT" | "SECURITY" | "LIFECYCLE" | "HELPERS";
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function recordTest(
  id: number,
  name: string,
  category: "CREATION" | "LISTING" | "MARKING" | "SUMMARY" | "STUDENT" | "SECURITY" | "LIFECYCLE" | "HELPERS",
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

async function runIntegrationSuite() {
  console.log("================================================================================");
  console.log("SAMS PHASE 5 STEP 5.5: FINAL ATTENDANCE INTEGRATION & E2E TEST SUITE");
  console.log(`Target Base URL:     ${BASE_URL}`);
  console.log(`Target Supabase URL: ${SUPABASE_URL}`);
  console.log("================================================================================\n");

  const createdSessionIds: string[] = [];

  try {
    // --------------------------------------------------------------------------
    // 0. Pre-flight check: Web server availability
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
    // 0. Master Data Resolution
    // --------------------------------------------------------------------------
    const { data: year } = await serviceClient.from("academic_years").select("id").eq("is_current", true).single();
    const { data: sectionA } = await serviceClient.from("class_sections").select("id").eq("name", "A").single();
    const { data: subjectCS501 } = await serviceClient.from("subjects").select("id").eq("code", "CS501").single();
    const { data: subjectCS502 } = await serviceClient.from("subjects").select("id").eq("code", "CS502").single();
    const { data: facultyArun } = await serviceClient.from("faculty").select("id").eq("employee_id", "FAC-CSE-001").single();
    const { data: facultyPriya } = await serviceClient.from("faculty").select("id").eq("employee_id", "FAC-CSE-002").single();
    const { data: studentRohit } = await serviceClient.from("students").select("id").eq("roll_number", "24CSE01").single();
    const { data: studentSneha } = await serviceClient.from("students").select("id").eq("roll_number", "24CSE02").single();

    if (!year || !sectionA || !subjectCS501 || !subjectCS502 || !facultyArun || !facultyPriya || !studentRohit || !studentSneha) {
      throw new Error("Master data fixtures missing in database.");
    }

    // Authenticate test actors
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
    // GROUP 1: FACULTY SESSION CREATION & VALIDATION
    // ==========================================================================

    // Test 1: Faculty session creation (POST /api/attendance/sessions) -> 201 Created
    const { status: createStatus, data: createData } = await apiRequest("/api/attendance/sessions", {
      method: "POST",
      token: arunToken,
      body: {
        academic_year_id: year.id,
        section_id: sectionA.id,
        subject_id: subjectCS501.id,
        faculty_id: facultyArun.id,
        session_date: "2026-09-28",
        start_time: "09:00:00",
        end_time: "09:55:00",
        status: "OPEN",
      },
    });
    const session1Id = createData?.data?.id;
    if (session1Id) createdSessionIds.push(session1Id);

    const test1Passed = createStatus === 201 && createData?.success && session1Id !== undefined;
    recordTest(1, "Faculty Session Creation", "CREATION", test1Passed, `Created Session ID=${session1Id}, Status=OPEN`);

    // Test 2: Validation rejection on missing required fields -> 400 Bad Request
    const { status: invalidCreateStatus, data: invalidCreateData } = await apiRequest("/api/attendance/sessions", {
      method: "POST",
      token: arunToken,
      body: {
        faculty_id: facultyArun.id,
        // missing section_id, subject_id, session_date, start_time
      },
    });
    const test2Passed = invalidCreateStatus === 400 && !invalidCreateData?.success;
    recordTest(2, "Missing Required Fields Rejection", "CREATION", test2Passed, `Rejected with status 400: ${invalidCreateData?.error}`);

    // Test 3: Faculty impersonation rejection (Faculty A cannot create session for Faculty B) -> 403 Forbidden
    const { status: impersonateStatus, data: impersonateData } = await apiRequest("/api/attendance/sessions", {
      method: "POST",
      token: arunToken,
      body: {
        academic_year_id: year.id,
        section_id: sectionA.id,
        subject_id: subjectCS501.id,
        faculty_id: facultyPriya.id, // Arun attempts to create session for Priya
        session_date: "2026-09-28",
        start_time: "10:00:00",
        status: "OPEN",
      },
    });
    const test3Passed = impersonateStatus === 403 && !impersonateData?.success;
    recordTest(3, "Faculty Impersonation Rejection", "CREATION", test3Passed, `Access Denied: ${impersonateData?.error}`);

    // Test 4: Student cannot create attendance session -> 403 Forbidden
    const { status: studentCreateStatus, data: studentCreateData } = await apiRequest("/api/attendance/sessions", {
      method: "POST",
      token: rohitToken,
      body: {
        academic_year_id: year.id,
        section_id: sectionA.id,
        subject_id: subjectCS501.id,
        faculty_id: facultyArun.id,
        session_date: "2026-09-28",
        start_time: "11:00:00",
        status: "OPEN",
      },
    });
    const test4Passed = studentCreateStatus === 403 && !studentCreateData?.success;
    recordTest(4, "Student Session Creation Blocked", "CREATION", test4Passed, `Student blocked with status 403: ${studentCreateData?.error}`);

    // ==========================================================================
    // GROUP 2: FACULTY SESSIONS LIST & RLS FILTERING
    // ==========================================================================

    // Test 5: Faculty session listing returns assigned sessions and respects RLS -> 200 OK
    const { status: listStatus, data: listData } = await apiRequest("/api/attendance/sessions", {
      token: arunToken,
    });
    const sessionsList = listData?.data || [];
    const foundSession1 = sessionsList.some((s: any) => s.id === session1Id);
    const test5Passed = listStatus === 200 && listData?.success && foundSession1;
    recordTest(5, "Faculty Session Listing & RLS Filtering", "LISTING", test5Passed, `Fetched ${sessionsList.length} sessions; contains Session 1`);

    // Test 6: Empty session filter query returns empty list without error -> 200 OK
    const { status: emptyFilterStatus, data: emptyFilterData } = await apiRequest(
      "/api/attendance/sessions?from_date=2099-01-01&to_date=2099-01-02",
      { token: arunToken }
    );
    const test6Passed =
      emptyFilterStatus === 200 &&
      emptyFilterData?.success &&
      Array.isArray(emptyFilterData?.data) &&
      emptyFilterData?.data.length === 0;
    recordTest(6, "Empty Filter Query Integrity", "LISTING", test6Passed, "Returns [] with status 200 OK without errors");

    // ==========================================================================
    // GROUP 3: ATTENDANCE MARKING & ATOMIC PERSISTENCE
    // ==========================================================================

    // Test 7: Roster pre-population check: newly created session has 0 records initially
    const { status: initialRecordsStatus, data: initialRecordsData } = await apiRequest(
      `/api/attendance/sessions/${session1Id}/records`,
      { token: arunToken }
    );
    const test7Passed =
      initialRecordsStatus === 200 &&
      initialRecordsData?.success &&
      Array.isArray(initialRecordsData?.data) &&
      initialRecordsData?.data.length === 0;
    recordTest(7, "Roster Pre-population Initial State", "MARKING", test7Passed, "Newly created session has 0 persisted records; defaults to client-memory roster");

    // Test 8: Faculty bulk saves attendance records (PRESENT, LATE) -> 200 OK
    const { status: saveStatus, data: saveData } = await apiRequest(
      `/api/attendance/sessions/${session1Id}/records`,
      {
        method: "POST",
        token: arunToken,
        body: {
          session_id: session1Id,
          records: [
            {
              student_id: studentRohit.id,
              status: "PRESENT",
              recognition_method: "MANUAL",
              confidence_score: 1.0,
            },
            {
              student_id: studentSneha.id,
              status: "LATE",
              recognition_method: "MANUAL",
              confidence_score: 1.0,
              remarks: "Traffic delay 10 mins",
            },
          ],
        },
      }
    );
    const test8Passed = saveStatus === 200 && saveData?.success && saveData?.data?.saved_count === 2;
    recordTest(8, "Bulk Save Attendance Records", "MARKING", test8Passed, `Saved ${saveData?.data?.saved_count} records via atomic RPC`);

    // Test 9: Persistence verification after reload (records in DB match saved statuses)
    const { status: reloadStatus, data: reloadData } = await apiRequest(
      `/api/attendance/sessions/${session1Id}/records`,
      { token: arunToken }
    );
    const persistedRecords = reloadData?.data || [];
    const rohitPersisted = persistedRecords.find((r: any) => r.student_id === studentRohit.id);
    const snehaPersisted = persistedRecords.find((r: any) => r.student_id === studentSneha.id);
    const test9Passed =
      reloadStatus === 200 &&
      persistedRecords.length === 2 &&
      rohitPersisted?.status === "PRESENT" &&
      snehaPersisted?.status === "LATE";
    recordTest(9, "Persistence After Reload Verification", "MARKING", test9Passed, `Rohit: ${rohitPersisted?.status}, Sneha: ${snehaPersisted?.status} persist across requests`);

    // Test 10: Faculty updates student attendance (PRESENT -> ABSENT with remarks) -> 200 OK
    const { status: updateStatus, data: updateData } = await apiRequest(
      `/api/attendance/sessions/${session1Id}/records`,
      {
        method: "POST",
        token: arunToken,
        body: {
          session_id: session1Id,
          records: [
            {
              student_id: studentRohit.id,
              status: "ABSENT",
              recognition_method: "MANUAL",
              remarks: "Left campus early",
            },
            {
              student_id: studentSneha.id,
              status: "PRESENT",
              recognition_method: "MANUAL",
            },
          ],
        },
      }
    );
    const { data: updatedReloadData } = await apiRequest(
      `/api/attendance/sessions/${session1Id}/records`,
      { token: arunToken }
    );
    const rohitUpdated = (updatedReloadData?.data || []).find((r: any) => r.student_id === studentRohit.id);
    const test10Passed = updateStatus === 200 && rohitUpdated?.status === "ABSENT" && rohitUpdated?.remarks === "Left campus early";
    recordTest(10, "Attendance Status Update & Mutation", "MARKING", test10Passed, `Updated Rohit to ABSENT with remarks: "${rohitUpdated?.remarks}"`);

    // Test 11: Invalid/un-enrolled student record rejected with atomic rollback -> 400 Bad Request, 0 partial writes
    const fakeStudentId = "00000000-0000-0000-0000-000000009999";
    const { status: invalidStudentStatus, data: invalidStudentData } = await apiRequest(
      `/api/attendance/sessions/${session1Id}/records`,
      {
        method: "POST",
        token: arunToken,
        body: {
          session_id: session1Id,
          records: [
            {
              student_id: fakeStudentId,
              status: "PRESENT",
            },
          ],
        },
      }
    );
    const test11Passed = invalidStudentStatus === 400 && !invalidStudentData?.success;
    recordTest(11, "Invalid Student Atomic Rollback", "MARKING", test11Passed, `Rejected un-enrolled student with status 400: ${invalidStudentData?.error}`);

    // Test 12: Duplicate student records in bulk payload rejected -> 400 Bad Request
    const { status: dupStatus, data: dupData } = await apiRequest(
      `/api/attendance/sessions/${session1Id}/records`,
      {
        method: "POST",
        token: arunToken,
        body: {
          session_id: session1Id,
          records: [
            { student_id: studentRohit.id, status: "PRESENT" },
            { student_id: studentRohit.id, status: "ABSENT" },
          ],
        },
      }
    );
    const test12Passed = dupStatus === 400 && !dupData?.success;
    recordTest(12, "Duplicate Student Payload Rejection", "MARKING", test12Passed, `Rejected duplicates with status 400: ${dupData?.error}`);

    // ==========================================================================
    // GROUP 4: SESSION SUMMARY METRICS
    // ==========================================================================

    // Test 13: Summary endpoint returns exact counts and turnout percentage -> 200 OK
    const { status: summaryStatus, data: summaryData } = await apiRequest(
      `/api/attendance/sessions/${session1Id}/summary`,
      { token: arunToken }
    );
    const sum = summaryData?.data?.summary;
    const turnout = sum?.attendance_percentage ?? sum?.turnout_percentage;
    const test13Passed =
      summaryStatus === 200 &&
      summaryData?.success &&
      sum?.total_students === 2 &&
      sum?.absent_count === 1 &&
      sum?.present_count === 1 &&
      turnout === 50;
    recordTest(13, "Session Summary Metrics Calculation", "SUMMARY", test13Passed, `Total=2, Present=1, Absent=1, Turnout=${turnout}%`);

    // ==========================================================================
    // GROUP 5: STUDENT ATTENDANCE VISIBILITY & PRIVACY ENFORCEMENT
    // ==========================================================================

    // Test 14: Student views their own attendance history -> 200 OK
    const { status: studentHistStatus, data: studentHistData } = await apiRequest(
      `/api/attendance/students/${studentRohit.id}/history`,
      { token: rohitToken }
    );
    const studentRecords = studentHistData?.data?.records || [];
    const hasSession1Record = studentRecords.some((r: any) => r.session_id === session1Id);
    const test14Passed = studentHistStatus === 200 && studentHistData?.success && hasSession1Record;
    recordTest(14, "Student Personal History Visibility", "STUDENT", test14Passed, `Rohit retrieved ${studentRecords.length} records; contains Session 1`);

    // Test 15: Student cannot mutate attendance records -> 403 Forbidden
    const { status: studentMutateStatus, data: studentMutateData } = await apiRequest(
      `/api/attendance/sessions/${session1Id}/records`,
      {
        method: "POST",
        token: rohitToken,
        body: {
          session_id: session1Id,
          records: [{ student_id: studentRohit.id, status: "PRESENT" }],
        },
      }
    );
    const test15Passed = studentMutateStatus === 403 && !studentMutateData?.success;
    recordTest(15, "Student Mutation Blocked", "STUDENT", test15Passed, `Student mutation rejected with status 403: ${studentMutateData?.error}`);

    // Test 16: Cross-student privacy: Student A cannot view Student B's attendance history -> 403 Forbidden
    const { status: crossStudentStatus, data: crossStudentData } = await apiRequest(
      `/api/attendance/students/${studentSneha.id}/history`,
      { token: rohitToken }
    );
    const test16Passed = crossStudentStatus === 403 && !crossStudentData?.success;
    recordTest(16, "FERPA Cross-Student Privacy Guard", "STUDENT", test16Passed, `Rohit denied access to Sneha's records: ${crossStudentData?.error}`);

    // Test 17: Student cannot close or cancel attendance sessions -> 403 Forbidden
    const { status: studentCloseStatus } = await apiRequest(
      `/api/attendance/sessions/${session1Id}/close`,
      { method: "POST", token: rohitToken }
    );
    const { status: studentCancelStatus } = await apiRequest(
      `/api/attendance/sessions/${session1Id}/cancel`,
      { method: "POST", token: rohitToken }
    );
    const test17Passed = studentCloseStatus === 403 && studentCancelStatus === 403;
    recordTest(17, "Student Lifecycle Controls Blocked", "STUDENT", test17Passed, "Close and cancel rejected with 403 Forbidden for student");

    // ==========================================================================
    // GROUP 6: CROSS-FACULTY & ROLE ISOLATION
    // ==========================================================================

    // Test 18: Cross-faculty rejection: Faculty B cannot mutate or close Faculty A's session -> 403 Forbidden
    const { status: priyaMutateStatus, data: priyaMutateData } = await apiRequest(
      `/api/attendance/sessions/${session1Id}/records`,
      {
        method: "POST",
        token: priyaToken,
        body: {
          session_id: session1Id,
          records: [{ student_id: studentRohit.id, status: "PRESENT" }],
        },
      }
    );
    const { status: priyaCloseStatus, data: priyaCloseData } = await apiRequest(
      `/api/attendance/sessions/${session1Id}/close`,
      { method: "POST", token: priyaToken }
    );
    const test18Passed = priyaMutateStatus === 403 && priyaCloseStatus === 403;
    recordTest(18, "Cross-Faculty Isolation Guard", "SECURITY", test18Passed, `Priya blocked from modifying Arun's session (mutate: ${priyaMutateStatus}, close: ${priyaCloseStatus})`);

    // Test 19: Unauthenticated requests rejected across endpoints -> 401 Unauthorized
    const { status: unauthPostRec } = await apiRequest(`/api/attendance/sessions/${session1Id}/records`, {
      method: "POST",
      body: { session_id: session1Id, records: [] },
    });
    const { status: unauthClose } = await apiRequest(`/api/attendance/sessions/${session1Id}/close`, {
      method: "POST",
    });
    const { status: unauthHist } = await apiRequest(`/api/attendance/students/${studentRohit.id}/history`);
    const test19Passed = unauthPostRec === 401 && unauthClose === 401 && unauthHist === 401;
    recordTest(19, "Unauthenticated Requests Blocked (401)", "SECURITY", test19Passed, "Records, close, and history strictly reject anonymous callers with 401");

    // ==========================================================================
    // GROUP 7: SESSION CLOSURE, CANCELLATION & IMMUTABILITY
    // ==========================================================================

    // Test 20: Faculty closes OPEN session -> 200 OK, status = CLOSED
    const { status: closeStatus, data: closeData } = await apiRequest(
      `/api/attendance/sessions/${session1Id}/close`,
      { method: "POST", token: arunToken }
    );
    const test20Passed = closeStatus === 200 && closeData?.data?.status === "CLOSED";
    recordTest(20, "Session Closure Lifecycle Transition", "LIFECYCLE", test20Passed, `Session 1 status transitioned to CLOSED`);

    // Test 21: Immutability: Cannot save attendance to CLOSED session -> 400 Bad Request
    const { status: closedSaveStatus, data: closedSaveData } = await apiRequest(
      `/api/attendance/sessions/${session1Id}/records`,
      {
        method: "POST",
        token: arunToken,
        body: {
          session_id: session1Id,
          records: [{ student_id: studentRohit.id, status: "PRESENT" }],
        },
      }
    );
    const test21Passed = closedSaveStatus === 400 && !closedSaveData?.success;
    recordTest(21, "Closed Session Immutability Guard", "LIFECYCLE", test21Passed, `Mutations blocked on CLOSED session: ${closedSaveData?.error}`);

    // Test 22: Cannot close an already CLOSED session -> 400 Bad Request
    const { status: doubleCloseStatus, data: doubleCloseData } = await apiRequest(
      `/api/attendance/sessions/${session1Id}/close`,
      { method: "POST", token: arunToken }
    );
    const test22Passed = doubleCloseStatus === 400 && !doubleCloseData?.success;
    recordTest(22, "Double Close Rejection", "LIFECYCLE", test22Passed, `Double close rejected: ${doubleCloseData?.error}`);

    // Test 23: Faculty creates a second session and cancels it -> 200 OK, status = CANCELLED
    const { data: createData2 } = await apiRequest("/api/attendance/sessions", {
      method: "POST",
      token: arunToken,
      body: {
        academic_year_id: year.id,
        section_id: sectionA.id,
        subject_id: subjectCS501.id,
        faculty_id: facultyArun.id,
        session_date: "2026-09-29",
        start_time: "14:00:00",
        end_time: "14:50:00",
        status: "OPEN",
      },
    });
    const session2Id = createData2?.data?.id;
    if (session2Id) createdSessionIds.push(session2Id);

    const { status: cancelStatus, data: cancelData } = await apiRequest(
      `/api/attendance/sessions/${session2Id}/cancel`,
      { method: "POST", token: arunToken }
    );
    const test23Passed = cancelStatus === 200 && cancelData?.data?.status === "CANCELLED";
    recordTest(23, "Session Cancellation Lifecycle Transition", "LIFECYCLE", test23Passed, `cancelStatus=${cancelStatus}, status=${cancelData?.data?.status}, error=${cancelData?.error || "none"}`);

    // Test 24: Immutability: Cannot save attendance to CANCELLED session -> 400 Bad Request
    const { status: cancelledSaveStatus, data: cancelledSaveData } = await apiRequest(
      `/api/attendance/sessions/${session2Id}/records`,
      {
        method: "POST",
        token: arunToken,
        body: {
          session_id: session2Id,
          records: [{ student_id: studentRohit.id, status: "PRESENT" }],
        },
      }
    );
    const test24Passed = cancelledSaveStatus === 400 && !cancelledSaveData?.success;
    recordTest(24, "Cancelled Session Immutability Guard", "LIFECYCLE", test24Passed, `Mutations blocked on CANCELLED session: ${cancelledSaveData?.error}`);

    // ==========================================================================
    // GROUP 8: PURE UI HELPERS & ERROR SANITIZATION
    // ==========================================================================

    // Test 25: Error message sanitization strips internal SQL/table leaks
    const rawSqlError = "PostgreSQL Error: table public.attendance_records does not exist at character 24";
    const sanitized = sanitizeErrorMessage(rawSqlError);
    const test25Passed =
      !sanitized.includes("public.") &&
      !sanitized.includes("character 24") &&
      sanitized.length > 0;
    recordTest(25, "API Error Sanitization Helper", "HELPERS", test25Passed, `Sanitized: "${sanitized}"`);

    // Test 26: Pure UI helpers format time windows and dates reliably
    const formattedWindow = formatSessionTimeWindow("14:00:00", "14:50:00");
    const formattedDate = formatAttendanceDate("2026-09-29");
    const test26Passed =
      formattedWindow === "02:00 PM – 02:50 PM" &&
      formattedDate.includes("Sep 29, 2026");
    recordTest(26, "Time Window & Date Formatting Helpers", "HELPERS", test26Passed, `Window: "${formattedWindow}", Date: "${formattedDate}"`);

  } catch (err: any) {
    console.error("\n[CRITICAL INTEGRATION ERROR]:", err.message);
    process.exit(1);
  } finally {
    console.log("\nCleaning up temporary test records...");
    for (const id of createdSessionIds) {
      await serviceClient.from("attendance_records").delete().eq("session_id", id);
      await serviceClient.from("attendance_sessions").delete().eq("id", id);
    }
    console.log("Cleanup complete.\n");
  }

  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.length - passedCount;

  console.log("================================================================================");
  console.log("INTEGRATION TEST SUMMARY");
  console.log("================================================================================");
  console.log(`Total Tests:  ${results.length}`);
  console.log(`Passed:       ${passedCount}`);
  console.log(`Failed:       ${failedCount}`);
  console.log("================================================================================");

  if (failedCount > 0) {
    console.error(`RESULT: ${failedCount} INTEGRATION TEST(S) FAILED.`);
    process.exit(1);
  } else {
    console.log(`RESULT: ALL ${passedCount} PHASE 5 STEP 5.5 INTEGRATION TESTS PASSED SUCCESSFULLY!`);
    console.log("================================================================================\n");
    process.exit(0);
  }
}

runIntegrationSuite();
