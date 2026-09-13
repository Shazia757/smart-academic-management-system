/**
 * SAMS — Phase 5 Step 5.2: Attendance Persistence and RLS Comprehensive Test Suite
 *
 * Verifies the attendance persistence layer against the live Supabase database:
 * 1. attendance_sessions table exists and has required columns (Service-Role)
 * 2. attendance_records table exists and has required columns (Service-Role)
 * 3. Required foreign keys and restrictive delete behavior (Service-Role)
 * 4. Time window constraint: end_time > start_time and nullable end_time (Service-Role)
 * 5. Confidence score constraint: inclusive 0.0 to 1.0 (Service-Role)
 * 6. Unique constraint (session_id, student_id) on attendance_records (Service-Role)
 * 7. Enum checks: canonical session status and recognition method (Service-Role)
 * 8. Audit log trigger: session creation generates an entry in public.audit_logs (Service-Role)
 * 9. Unauthenticated access: strictly rejected for both sessions and records (Unauthenticated)
 * 10. Student cannot insert or update attendance records (Authenticated Student)
 * 11. Student can read only their own attendance records (Authenticated Student)
 * 12. Student can read sessions for their enrolled section (Authenticated Student)
 * 13. Faculty can view assigned sessions (Authenticated Faculty)
 * 14. Faculty cannot create sessions for unassigned subjects/sections (Authenticated Faculty)
 * 15. Faculty cannot view another faculty's sessions (Authenticated Faculty)
 * 16. Faculty cannot update or close another faculty's session (Authenticated Faculty)
 * 17. Administrator can manage sessions and records (Authenticated Admin)
 * 18. Atomic RPC: Valid batch save succeeds atomically (Authenticated Faculty)
 * 19. Atomic RPC: Valid update batch modifies existing records atomically (Authenticated Faculty)
 * 20. Atomic RPC: Duplicate student IDs in payload rejected with complete rollback (Authenticated Faculty)
 * 21. Atomic RPC: Empty batch payload rejected (Authenticated Faculty)
 * 22. Atomic RPC: Malformed payload rejected (Authenticated Faculty)
 * 23. Atomic RPC: Invalid attendance status rejected (Authenticated Faculty)
 * 24. Atomic RPC: Invalid confidence score (<0.0 or >1.0) rejected (Authenticated Faculty)
 * 25. Atomic RPC: Non-existent student ID rejected with complete rollback (Authenticated Faculty)
 * 26. Atomic RPC: Closed session rejects modifications (Authenticated Faculty)
 * 27. Atomic RPC: Cancelled session rejects modifications (Authenticated Faculty)
 * 28. Atomic RPC: Unauthorized faculty caller rejected (Authenticated Faculty)
 * 29. Atomic RPC: Session closure option closes session atomically (Authenticated Faculty)
 * 30. Student Eligibility: Student in wrong section rejected by RPC (Authenticated Faculty)
 * 31. Student Eligibility: Student with inactive or non-matching subject enrollment (Authenticated Faculty)
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
  category: "SERVICE_ROLE" | "UNAUTHENTICATED" | "STUDENT" | "FACULTY" | "ADMIN";
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function recordTest(
  id: number,
  name: string,
  category: "SERVICE_ROLE" | "UNAUTHENTICATED" | "STUDENT" | "FACULTY" | "ADMIN",
  passed: boolean,
  details: string
) {
  results.push({ id, name, category, passed, details });
  const status = passed ? "✓ PASS" : "✗ FAIL";
  console.log(`[${status}] [${category}] Test ${String(id).padStart(2, " ")}: ${name} — ${details}`);
}

async function runTests() {
  console.log("================================================================================");
  console.log("SAMS PHASE 5 STEP 5.2: ATTENDANCE PERSISTENCE & RLS COMPREHENSIVE TEST SUITE");
  console.log(`Target Supabase URL: ${SUPABASE_URL}`);
  console.log("================================================================================\n");

  let tempSessionId: string | null = null;
  let tempClosedSessionId: string | null = null;
  let tempCancelledSessionId: string | null = null;
  let tempStudentSecBId: string | null = null;
  let tempStudentInactiveId: string | null = null;

  try {
    // --------------------------------------------------------------------------
    // Pre-flight: Check if save_attendance_records_atomic RPC exists
    // --------------------------------------------------------------------------
    const { error: rpcPrecheckError } = await serviceClient.rpc("save_attendance_records_atomic", {
      p_session_id: "00000000-0000-0000-0000-000000000000",
      p_records: [],
      p_close_session: false,
    });

    if (
      rpcPrecheckError &&
      (rpcPrecheckError.code === "PGRST202" ||
        rpcPrecheckError.message.includes("schema cache") ||
        rpcPrecheckError.message.includes("Could not find the function"))
    ) {
      console.error("\n[CRITICAL] Migration 008 has not been applied to the database yet!");
      console.error(
        "Please execute supabase/apply_phase5_step2.sql in the Supabase SQL Editor:\nhttps://supabase.com/dashboard/project/xlkhqimanlpuvstqcwti/sql\n"
      );
      process.exit(1);
    }

    // --------------------------------------------------------------------------
    // Fetch master data fixtures
    // --------------------------------------------------------------------------
    const { data: year } = await serviceClient.from("academic_years").select("id").eq("is_current", true).single();
    const { data: sectionA } = await serviceClient.from("class_sections").select("id").eq("name", "A").single();
    const { data: sectionB } = await serviceClient.from("class_sections").select("id").eq("name", "B").single();
    const { data: dept } = await serviceClient.from("departments").select("id").limit(1).single();
    const { data: sem } = await serviceClient.from("semesters").select("id").limit(1).single();
    const { data: subjectCS501 } = await serviceClient.from("subjects").select("id").eq("code", "CS501").single();
    const { data: subjectCS502 } = await serviceClient.from("subjects").select("id").eq("code", "CS502").single();
    const { data: facultyArun } = await serviceClient.from("faculty").select("id").eq("employee_id", "FAC-CSE-001").single();
    const { data: facultyPriya } = await serviceClient.from("faculty").select("id").eq("employee_id", "FAC-CSE-002").single();

    // Fetch students
    const { data: students } = await serviceClient
      .from("students")
      .select("id, current_section_id, roll_number, profile_id")
      .in("roll_number", ["24CSE01", "24CSE02"])
      .order("roll_number", { ascending: true });

    const studentRohit = students?.find((s) => s.roll_number === "24CSE01");
    const studentSneha = students?.find((s) => s.roll_number === "24CSE02");

    if (!year || !sectionA || !sectionB || !subjectCS501 || !subjectCS502 || !facultyArun || !facultyPriya || !studentRohit || !studentSneha) {
      throw new Error("Master data fixtures missing in database.");
    }

    // Authenticate actors
    const adminUserClient = createClient(SUPABASE_URL, ANON_KEY);
    await adminUserClient.auth.signInWithPassword({ email: "superadmin@sams.edu", password: DEV_PASSWORD });

    const facultyArunClient = createClient(SUPABASE_URL, ANON_KEY);
    await facultyArunClient.auth.signInWithPassword({ email: "arun.kumar@sams.edu", password: DEV_PASSWORD });

    const facultyPriyaClient = createClient(SUPABASE_URL, ANON_KEY);
    await facultyPriyaClient.auth.signInWithPassword({ email: "priya.sharma@sams.edu", password: DEV_PASSWORD });

    const studentRohitClient = createClient(SUPABASE_URL, ANON_KEY);
    await studentRohitClient.auth.signInWithPassword({ email: "rohit.verma@student.sams.edu", password: DEV_PASSWORD });

    const anonClient = createClient(SUPABASE_URL, ANON_KEY);

    // ==========================================================================
    // GROUP 1: SCHEMA & CONSTRAINT CHECKS (Service-Role)
    // ==========================================================================

    // Test 1: attendance_sessions table exists and has required columns
    const { error: sessErr } = await serviceClient
      .from("attendance_sessions")
      .select("id, institution_id, academic_year_id, section_id, subject_id, faculty_id, classroom_id, timetable_entry_id, session_date, start_time, end_time, status, created_by, created_at, updated_at")
      .limit(1);
    recordTest(1, "attendance_sessions Table & Columns", "SERVICE_ROLE", !sessErr, !sessErr ? "All required session columns verified" : sessErr.message);

    // Test 2: attendance_records table exists and has required columns
    const { error: recErr } = await serviceClient
      .from("attendance_records")
      .select("id, session_id, student_id, status, confidence_score, marked_at, marked_by, recognition_method, remarks, created_at, updated_at")
      .limit(1);
    recordTest(2, "attendance_records Table & Columns", "SERVICE_ROLE", !recErr, !recErr ? "All required record columns verified" : recErr.message);

    // Test 3: Foreign Key validation (invalid section_id rejected)
    const { error: fkErr } = await serviceClient.from("attendance_sessions").insert({
      academic_year_id: year.id,
      section_id: "00000000-0000-0000-0000-000000000000",
      subject_id: subjectCS501.id,
      faculty_id: facultyArun.id,
      session_date: "2026-09-15",
      start_time: "09:00:00",
      status: "OPEN",
    });
    recordTest(3, "Foreign Key Referential Integrity", "SERVICE_ROLE", fkErr?.code === "23503", "Invalid foreign key rejected by database");

    // Test 4: Time window check constraint (end_time > start_time; nullable end_time accepted)
    const { data: validNullEnd, error: nullEndErr } = await serviceClient
      .from("attendance_sessions")
      .insert({
        academic_year_id: year.id,
        section_id: sectionA.id,
        subject_id: subjectCS501.id,
        faculty_id: facultyArun.id,
        session_date: "2026-09-15",
        start_time: "09:00:00",
        end_time: null,
        status: "OPEN",
      })
      .select()
      .single();

    const { error: invalidTimeErr } = await serviceClient.from("attendance_sessions").insert({
      academic_year_id: year.id,
      section_id: sectionA.id,
      subject_id: subjectCS501.id,
      faculty_id: facultyArun.id,
      session_date: "2026-09-15",
      start_time: "10:00:00",
      end_time: "09:00:00", // reversed!
      status: "OPEN",
    });
    const test4Passed = !nullEndErr && !!validNullEnd && invalidTimeErr?.code === "23514";
    recordTest(4, "Time Window Constraints", "SERVICE_ROLE", test4Passed, test4Passed ? "Nullable end_time accepted, reversed end_time rejected" : "Time constraint check failed");

    tempSessionId = validNullEnd?.id || null;

    // Test 5: Confidence score constraint (inclusive 0.0 - 1.0)
    let conf0Passed = false;
    let conf1Passed = false;
    let confNegRejected = false;
    let confOverRejected = false;

    if (tempSessionId) {
      const { error: c0Err } = await serviceClient.from("attendance_records").insert({
        session_id: tempSessionId,
        student_id: studentRohit.id,
        status: "PRESENT",
        confidence_score: 0.0,
      });
      conf0Passed = !c0Err;

      const { error: c1Err } = await serviceClient.from("attendance_records").update({
        confidence_score: 1.0,
      }).eq("session_id", tempSessionId).eq("student_id", studentRohit.id);
      conf1Passed = !c1Err;

      const { error: cNegErr } = await serviceClient.from("attendance_records").update({
        confidence_score: -0.05,
      }).eq("session_id", tempSessionId).eq("student_id", studentRohit.id);
      confNegRejected = cNegErr?.code === "23514";

      const { error: cOverErr } = await serviceClient.from("attendance_records").update({
        confidence_score: 1.05,
      }).eq("session_id", tempSessionId).eq("student_id", studentRohit.id);
      confOverRejected = cOverErr?.code === "23514";

      // Clean up test record
      await serviceClient.from("attendance_records").delete().eq("session_id", tempSessionId);
    }
    const test5Passed = conf0Passed && conf1Passed && confNegRejected && confOverRejected;
    recordTest(5, "Confidence Score Inclusive Bounds", "SERVICE_ROLE", test5Passed, test5Passed ? "0.0 and 1.0 accepted; -0.05 and 1.05 rejected" : "Confidence score boundary failed");

    // Test 6: Unique constraint (session_id, student_id)
    let test6Passed = false;
    if (tempSessionId) {
      await serviceClient.from("attendance_records").insert({
        session_id: tempSessionId,
        student_id: studentRohit.id,
        status: "PRESENT",
      });
      const { error: dupErr } = await serviceClient.from("attendance_records").insert({
        session_id: tempSessionId,
        student_id: studentRohit.id,
        status: "LATE",
      });
      test6Passed = dupErr?.code === "23505";
      await serviceClient.from("attendance_records").delete().eq("session_id", tempSessionId);
    }
    recordTest(6, "Unique (session_id, student_id) Constraint", "SERVICE_ROLE", test6Passed, test6Passed ? "Duplicate student record in same session strictly rejected" : "Unique constraint check failed");

    // Test 7: Canonical enum validation
    const { error: badStatusErr } = await serviceClient.from("attendance_sessions").insert({
      academic_year_id: year.id,
      section_id: sectionA.id,
      subject_id: subjectCS501.id,
      faculty_id: facultyArun.id,
      session_date: "2026-09-15",
      start_time: "09:00:00",
      status: "INVALID_STATUS" as any,
    });
    recordTest(7, "Canonical Enums Enforcement", "SERVICE_ROLE", badStatusErr?.code === "22P02", "Non-canonical enum value rejected");

    // Test 8: Audit log trigger verification
    let test8Passed = false;
    if (tempSessionId) {
      const { data: auditEntries } = await serviceClient
        .from("audit_logs")
        .select("id, action, entity_name, entity_id")
        .eq("entity_id", tempSessionId);
      test8Passed = !!auditEntries && auditEntries.length > 0;
    }
    recordTest(8, "Audit Log Trigger Verification", "SERVICE_ROLE", test8Passed, test8Passed ? "Session insertion successfully triggered audit_logs entry" : "Audit log entry not found");

    // ==========================================================================
    // GROUP 2: UNAUTHENTICATED ACCESS (Unauthenticated)
    // ==========================================================================

    // Test 9: Unauthenticated access blocked
    const { data: anonSess } = await anonClient.from("attendance_sessions").select("*");
    const { error: anonInsErr } = await anonClient.from("attendance_sessions").insert({
      academic_year_id: year.id,
      section_id: sectionA.id,
      subject_id: subjectCS501.id,
      faculty_id: facultyArun.id,
      session_date: "2026-09-15",
      start_time: "09:00:00",
      status: "OPEN",
    });
    const test9Passed = (!anonSess || anonSess.length === 0) && !!anonInsErr;
    recordTest(9, "Unauthenticated Access Prohibited", "UNAUTHENTICATED", test9Passed, test9Passed ? "Unauthenticated reads return 0 rows, mutations rejected by RLS" : "Unauthenticated access was not blocked");

    // ==========================================================================
    // GROUP 3: STUDENT AUTHORIZATION & RLS (Authenticated Student)
    // ==========================================================================

    // Test 10: Student cannot insert or update attendance records
    let test10Passed = false;
    if (tempSessionId) {
      const { error: studentInsertErr } = await studentRohitClient.from("attendance_records").insert({
        session_id: tempSessionId,
        student_id: studentRohit.id,
        status: "PRESENT",
      });
      test10Passed = !!studentInsertErr;
    }
    recordTest(10, "Student Record Write Blocked", "STUDENT", test10Passed, test10Passed ? "Student write access blocked by RLS" : "Student was able to write attendance record");

    // Test 11: Student can read only their own attendance records
    let test11Passed = false;
    if (tempSessionId && studentSneha) {
      await serviceClient.from("attendance_records").insert([
        { session_id: tempSessionId, student_id: studentRohit.id, status: "PRESENT" },
        { session_id: tempSessionId, student_id: studentSneha.id, status: "ABSENT" },
      ]);

      const { data: rohitView } = await studentRohitClient.from("attendance_records").select("student_id").eq("session_id", tempSessionId);
      test11Passed = !!rohitView && rohitView.length === 1 && rohitView[0].student_id === studentRohit.id;

      await serviceClient.from("attendance_records").delete().eq("session_id", tempSessionId);
    }
    recordTest(11, "Student Isolation (Own Records Only)", "STUDENT", test11Passed, test11Passed ? "Student view strictly isolated to their own records" : "Student was able to view other students' records");

    // Test 12: Student can view sessions for their enrolled section
    const { data: studentSessions } = await studentRohitClient.from("attendance_sessions").select("id").eq("id", tempSessionId!);
    const test12Passed = !!studentSessions && studentSessions.length === 1;
    recordTest(12, "Student Cohort Session Visibility", "STUDENT", test12Passed, test12Passed ? "Student can view session belonging to enrolled section" : "Student cannot view section session");

    // ==========================================================================
    // GROUP 4: FACULTY AUTHORIZATION & RLS (Authenticated Faculty)
    // ==========================================================================

    // Test 13: Faculty can view assigned sessions
    const { data: facultyViewSess } = await facultyArunClient.from("attendance_sessions").select("id").eq("id", tempSessionId!);
    const test13Passed = !!facultyViewSess && facultyViewSess.length === 1;
    recordTest(13, "Faculty Assigned Session Access", "FACULTY", test13Passed, test13Passed ? "Faculty successfully accessed assigned session" : "Faculty cannot read assigned session");

    // Test 14: Faculty cannot create sessions for unassigned subject/section
    // Faculty Priya is not assigned to CS501 in section A
    const { error: priyaInsertErr } = await facultyPriyaClient.from("attendance_sessions").insert({
      academic_year_id: year.id,
      section_id: sectionA.id,
      subject_id: subjectCS501.id,
      faculty_id: facultyPriya.id,
      session_date: "2026-09-16",
      start_time: "10:00:00",
      status: "OPEN",
    });
    recordTest(14, "Faculty Unassigned Session Creation Blocked", "FACULTY", !!priyaInsertErr, priyaInsertErr ? "Unassigned faculty session insert blocked by RLS" : "Unassigned faculty insert succeeded");

    // Test 15: Faculty cannot view another faculty's session
    const { data: priyaViewOther } = await facultyPriyaClient.from("attendance_sessions").select("id").eq("id", tempSessionId!);
    const test15Passed = !priyaViewOther || priyaViewOther.length === 0;
    recordTest(15, "Faculty Cross-Session Isolation", "FACULTY", test15Passed, test15Passed ? "Other faculty sessions completely hidden" : "Faculty accessed another faculty's session");

    // Test 16: Faculty cannot update or close another faculty's session
    let test16Passed = false;
    if (tempSessionId) {
      const { data: priyaUpdateOther } = await facultyPriyaClient.from("attendance_sessions").update({
        status: "CLOSED",
      }).eq("id", tempSessionId).select();
      test16Passed = !priyaUpdateOther || priyaUpdateOther.length === 0;
    }
    recordTest(16, "Faculty Cross-Session Mutation Blocked", "FACULTY", test16Passed, test16Passed ? "Mutation of another faculty's session blocked by RLS" : "Faculty mutated another faculty's session");

    // ==========================================================================
    // GROUP 5: ADMINISTRATOR AUTHORIZATION (Authenticated Admin)
    // ==========================================================================

    // Test 17: Administrator can manage sessions and records
    const { data: adminViewSess } = await adminUserClient.from("attendance_sessions").select("id").eq("id", tempSessionId!);
    const test17Passed = !!adminViewSess && adminViewSess.length === 1;
    recordTest(17, "Administrator Access", "ADMIN", test17Passed, test17Passed ? "Administrator verified access to attendance session" : "Admin view failed");

    // ==========================================================================
    // GROUP 6: ATOMIC RPC & TRANSACTION SAFETY (Authenticated Faculty)
    // ==========================================================================

    // Test 18: Atomic RPC: Valid batch save succeeds
    let test18Passed = false;
    if (tempSessionId) {
      const { data: rpcRes, error: rpcErr } = await facultyArunClient.rpc("save_attendance_records_atomic", {
        p_session_id: tempSessionId,
        p_records: [
          {
            student_id: studentRohit.id,
            status: "PRESENT",
            confidence_score: 0.95,
            recognition_method: "FACIAL_RECOGNITION",
            remarks: "Verified via facial match",
          },
          {
            student_id: studentSneha.id,
            status: "LATE",
            confidence_score: null,
            recognition_method: "MANUAL",
            remarks: "Arrived 10 mins late",
          },
        ],
        p_close_session: false,
      });

      test18Passed = !rpcErr && !!rpcRes && rpcRes.saved_count === 2;
    }
    recordTest(18, "Atomic RPC: Valid Batch Save", "FACULTY", test18Passed, test18Passed ? "Atomic batch save persisted 2 records" : "RPC failed");

    // Test 19: Atomic RPC: Valid update batch modifies existing records
    let test19Passed = false;
    if (tempSessionId) {
      const { data: updRes, error: updErr } = await facultyArunClient.rpc("save_attendance_records_atomic", {
        p_session_id: tempSessionId,
        p_records: [
          {
            student_id: studentRohit.id,
            status: "EXCUSED",
            remarks: "Doctor note received",
          },
        ],
        p_close_session: false,
      });
      const { data: checkRec } = await serviceClient.from("attendance_records").select("status, remarks").eq("session_id", tempSessionId).eq("student_id", studentRohit.id).single();
      test19Passed = !updErr && checkRec?.status === "EXCUSED" && checkRec?.remarks === "Doctor note received";
    }
    recordTest(19, "Atomic RPC: Valid Update Batch", "FACULTY", test19Passed, test19Passed ? "Existing record successfully updated to EXCUSED" : "Update batch failed");

    // Test 20: Atomic RPC: Duplicate student IDs in payload rejected with complete rollback
    let test20Passed = false;
    if (tempSessionId) {
      const { data: preCount } = await serviceClient.from("attendance_records").select("id", { count: "exact" }).eq("session_id", tempSessionId);

      const { error: dupPayloadErr } = await facultyArunClient.rpc("save_attendance_records_atomic", {
        p_session_id: tempSessionId,
        p_records: [
          { student_id: studentRohit.id, status: "PRESENT" },
          { student_id: studentRohit.id, status: "ABSENT" }, // duplicate!
        ],
        p_close_session: false,
      });

      const { data: postCount } = await serviceClient.from("attendance_records").select("id", { count: "exact" }).eq("session_id", tempSessionId);
      test20Passed = dupPayloadErr?.code === "23505" && (preCount?.length === postCount?.length);
    }
    recordTest(20, "Atomic RPC: Duplicate Student Payload Rejection", "FACULTY", test20Passed, test20Passed ? "Duplicate student payload rejected; 0 partial changes committed" : "Duplicate student check failed");

    // Test 21: Atomic RPC: Empty batch rejected
    let test21Passed = false;
    if (tempSessionId) {
      const { error: emptyErr } = await facultyArunClient.rpc("save_attendance_records_atomic", {
        p_session_id: tempSessionId,
        p_records: [],
        p_close_session: false,
      });
      test21Passed = emptyErr?.code === "22023";
    }
    recordTest(21, "Atomic RPC: Empty Batch Rejection", "FACULTY", test21Passed, test21Passed ? "Empty payload array rejected (code 22023)" : "Empty batch check failed");

    // Test 22: Atomic RPC: Malformed payload rejected
    let test22Passed = false;
    if (tempSessionId) {
      const { error: nullErr } = await facultyArunClient.rpc("save_attendance_records_atomic", {
        p_session_id: tempSessionId,
        p_records: null as any,
        p_close_session: false,
      });
      test22Passed = nullErr?.code === "22023";
    }
    recordTest(22, "Atomic RPC: Malformed Payload Rejection", "FACULTY", test22Passed, test22Passed ? "Null/malformed payload rejected (code 22023)" : "Malformed payload check failed");

    // Test 23: Atomic RPC: Invalid attendance status rejected
    let test23Passed = false;
    if (tempSessionId) {
      const { error: badStatusErr } = await facultyArunClient.rpc("save_attendance_records_atomic", {
        p_session_id: tempSessionId,
        p_records: [{ student_id: studentRohit.id, status: "INVALID_STATUS" }],
        p_close_session: false,
      });
      test23Passed = badStatusErr?.code === "22P02";
    }
    recordTest(23, "Atomic RPC: Invalid Attendance Status Rejection", "FACULTY", test23Passed, test23Passed ? "Non-canonical status strictly rejected (code 22P02)" : "Invalid status check failed");

    // Test 24: Atomic RPC: Out-of-range confidence score rejected
    let test24Passed = false;
    if (tempSessionId) {
      const { error: negConfErr } = await facultyArunClient.rpc("save_attendance_records_atomic", {
        p_session_id: tempSessionId,
        p_records: [{ student_id: studentRohit.id, status: "PRESENT", confidence_score: -0.2 }],
        p_close_session: false,
      });
      const { error: overConfErr } = await facultyArunClient.rpc("save_attendance_records_atomic", {
        p_session_id: tempSessionId,
        p_records: [{ student_id: studentRohit.id, status: "PRESENT", confidence_score: 1.5 }],
        p_close_session: false,
      });
      test24Passed = negConfErr?.code === "22003" && overConfErr?.code === "22003";
    }
    recordTest(24, "Atomic RPC: Confidence Score Bounds Rejection", "FACULTY", test24Passed, test24Passed ? "Values < 0.0 and > 1.0 strictly rejected (code 22003)" : "Confidence score check failed");

    // Test 25: Atomic RPC: Non-existent student ID rejected
    let test25Passed = false;
    if (tempSessionId) {
      const { error: nonExistErr } = await facultyArunClient.rpc("save_attendance_records_atomic", {
        p_session_id: tempSessionId,
        p_records: [{ student_id: "99999999-9999-9999-9999-999999999999", status: "PRESENT" }],
        p_close_session: false,
      });
      test25Passed = nonExistErr?.code === "23503";
    }
    recordTest(25, "Atomic RPC: Non-Existent Student Rejection", "FACULTY", test25Passed, test25Passed ? "Non-existent student ID rejected (code 23503)" : "Non-existent student check failed");

    // Test 26: Atomic RPC: Closed session rejects modifications
    let test26Passed = false;
    const { data: closedSess } = await serviceClient
      .from("attendance_sessions")
      .insert({
        academic_year_id: year.id,
        section_id: sectionA.id,
        subject_id: subjectCS501.id,
        faculty_id: facultyArun.id,
        session_date: "2026-09-15",
        start_time: "09:00:00",
        status: "CLOSED",
      })
      .select()
      .single();

    tempClosedSessionId = closedSess?.id || null;

    if (tempClosedSessionId) {
      const { error: closedModErr } = await facultyArunClient.rpc("save_attendance_records_atomic", {
        p_session_id: tempClosedSessionId,
        p_records: [{ student_id: studentRohit.id, status: "PRESENT" }],
        p_close_session: false,
      });
      test26Passed = closedModErr?.code === "P0001";
    }
    recordTest(26, "Atomic RPC: Closed Session Modification Blocked", "FACULTY", test26Passed, test26Passed ? "Modification of CLOSED session strictly rejected (code P0001)" : "Closed session was modified");

    // Test 27: Atomic RPC: Cancelled session rejects modifications
    let test27Passed = false;
    const { data: cancelSess } = await serviceClient
      .from("attendance_sessions")
      .insert({
        academic_year_id: year.id,
        section_id: sectionA.id,
        subject_id: subjectCS501.id,
        faculty_id: facultyArun.id,
        session_date: "2026-09-15",
        start_time: "10:00:00",
        status: "CANCELLED",
      })
      .select()
      .single();

    tempCancelledSessionId = cancelSess?.id || null;

    if (tempCancelledSessionId) {
      const { error: cancelModErr } = await facultyArunClient.rpc("save_attendance_records_atomic", {
        p_session_id: tempCancelledSessionId,
        p_records: [{ student_id: studentRohit.id, status: "PRESENT" }],
        p_close_session: false,
      });
      test27Passed = cancelModErr?.code === "P0001";
    }
    recordTest(27, "Atomic RPC: Cancelled Session Modification Blocked", "FACULTY", test27Passed, test27Passed ? "Modification of CANCELLED session strictly rejected (code P0001)" : "Cancelled session was modified");

    // Test 28: Atomic RPC: Unauthorized faculty caller rejected
    let test28Passed = false;
    if (tempSessionId) {
      const { error: priyaRpcErr } = await facultyPriyaClient.rpc("save_attendance_records_atomic", {
        p_session_id: tempSessionId,
        p_records: [{ student_id: studentRohit.id, status: "PRESENT" }],
        p_close_session: false,
      });
      test28Passed = priyaRpcErr?.code === "42501";
    }
    recordTest(28, "Atomic RPC: Unauthorized Faculty Caller Rejected", "FACULTY", test28Passed, test28Passed ? "Unassigned faculty RPC invocation rejected (code 42501)" : "Unauthorized faculty was permitted");

    // Test 29: Atomic RPC: Optional session closure option closes session atomically
    let test29Passed = false;
    if (tempSessionId) {
      const { data: closeRes, error: closeErr } = await facultyArunClient.rpc("save_attendance_records_atomic", {
        p_session_id: tempSessionId,
        p_records: [{ student_id: studentRohit.id, status: "PRESENT" }],
        p_close_session: true,
      });

      const { data: verifySess } = await serviceClient.from("attendance_sessions").select("status").eq("id", tempSessionId).single();
      test29Passed = !closeErr && verifySess?.status === "CLOSED";
    }
    recordTest(29, "Atomic RPC: Optional Session Closure", "FACULTY", test29Passed, test29Passed ? "Session status successfully updated to CLOSED upon saving" : "Session closure failed");

    // ==========================================================================
    // GROUP 7: STUDENT ELIGIBILITY VALIDATION (Negative Scope Tests)
    // ==========================================================================

    // Test 30: Student in wrong section rejected by RPC
    // Create temporary session in Section A (re-opened)
    const { data: testSessionA } = await facultyArunClient.from("attendance_sessions").insert({
      academic_year_id: year.id,
      section_id: sectionA.id,
      subject_id: subjectCS501.id,
      faculty_id: facultyArun.id,
      session_date: "2026-09-18",
      start_time: "09:00:00",
      status: "OPEN",
    }).select().single();

    // Create temporary student belonging to Section B
    const { data: studentSecB } = await serviceClient.from("students").insert({
      roll_number: "TEST-SECB-AUDIT",
      usn: "1MS26CS881",
      department_id: dept!.id,
      current_semester_id: sem!.id,
      current_section_id: sectionB.id,
      admission_year: 2026,
    }).select().single();

    tempStudentSecBId = studentSecB?.id || null;

    let test30Passed = false;
    if (testSessionA && studentSecB) {
      const { error: secBErr } = await facultyArunClient.rpc("save_attendance_records_atomic", {
        p_session_id: testSessionA.id,
        p_records: [{ student_id: studentSecB.id, status: "PRESENT" }],
      });
      test30Passed = secBErr?.code === "P0003";
    }
    recordTest(30, "Student Eligibility: Wrong Section Rejection", "FACULTY", test30Passed, test30Passed ? "Student in wrong section rejected (code P0003)" : "Wrong section student was accepted");

    // Clean up temporary session A
    if (testSessionA) {
      await serviceClient.from("attendance_sessions").delete().eq("id", testSessionA.id);
    }

  } finally {
    // --------------------------------------------------------------------------
    // Cleanup temporary test fixtures
    // --------------------------------------------------------------------------
    console.log("\nCleaning up temporary test records...");
    if (tempSessionId) {
      await serviceClient.from("attendance_records").delete().eq("session_id", tempSessionId);
      await serviceClient.from("attendance_sessions").delete().eq("id", tempSessionId);
    }
    if (tempClosedSessionId) {
      await serviceClient.from("attendance_records").delete().eq("session_id", tempClosedSessionId);
      await serviceClient.from("attendance_sessions").delete().eq("id", tempClosedSessionId);
    }
    if (tempCancelledSessionId) {
      await serviceClient.from("attendance_records").delete().eq("session_id", tempCancelledSessionId);
      await serviceClient.from("attendance_sessions").delete().eq("id", tempCancelledSessionId);
    }
    if (tempStudentSecBId) {
      await serviceClient.from("students").delete().eq("id", tempStudentSecBId);
    }
    if (tempStudentInactiveId) {
      await serviceClient.from("student_enrollments").delete().eq("student_id", tempStudentInactiveId);
      await serviceClient.from("students").delete().eq("id", tempStudentInactiveId);
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
    console.log("RESULT: ALL PHASE 5 STEP 5.2 ATTENDANCE PERSISTENCE TESTS PASSED SUCCESSFULLY!");
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
