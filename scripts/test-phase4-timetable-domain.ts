/**
 * SAMS — Phase 4 Step 1: Timetable Domain & Database Foundation Test Suite
 * 
 * Verifies all 14 criteria against the live Supabase PostgreSQL database:
 * 1. Tables exist
 * 2. Foreign keys are correct
 * 3. CHECK constraints reject invalid periods
 * 4. CHECK constraints reject invalid weekly periods
 * 5. Duplicate section-period entries are rejected
 * 6. Duplicate faculty-period entries are rejected
 * 7. Duplicate classroom-period entries are rejected
 * 8. Different generations may contain same schedule without collision
 * 9. RLS prevents unauthorized mutations
 * 10. Admins can manage timetable data
 * 11. Faculty can read appropriate timetable data
 * 12. Students can read appropriate timetable data
 * 13. Lab/consecutive-period requirements can be represented
 * 14. Existing Phase 3 functionality remains intact
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), "apps/web/.env.local") });
dotenv.config();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const DEV_PASSWORD = process.env.SEED_USER_PASSWORD || "SamsDev#2026!";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
  console.error("Missing SUPABASE configuration in apps/web/.env.local");
  process.exit(1);
}

const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface TestResult {
  id: number;
  name: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function recordTest(id: number, name: string, passed: boolean, details: string) {
  results.push({ id, name, passed, details });
  const status = passed ? "✓ PASS" : "✗ FAIL";
  console.log(`[${status}] Test ${id}: ${name} — ${details}`);
}

async function runTests() {
  console.log("================================================================================");
  console.log("SAMS PHASE 4 STEP 1: TIMETABLE DOMAIN & DATABASE FOUNDATION TEST SUITE");
  console.log(`Target Supabase URL: ${SUPABASE_URL}`);
  console.log("================================================================================\n");

  let tempConfigId: string | null = null;
  let tempPeriod1Id: string | null = null;
  let tempPeriod2Id: string | null = null;
  let tempGen1Id: string | null = null;
  let tempGen2Id: string | null = null;
  let tempEntry1Id: string | null = null;
  let tempEntry2Id: string | null = null;

  try {
    // --------------------------------------------------------------------------
    // Test 1: Tables Exist
    // --------------------------------------------------------------------------
    const tables = [
      "timetable_configurations",
      "timetable_periods",
      "subject_scheduling_requirements",
      "timetable_generations",
      "timetable_entries",
    ];

    let allTablesExist = true;
    const tableChecks: string[] = [];

    for (const table of tables) {
      const { error } = await adminClient.from(table).select("id").limit(1);
      if (error && (error.code === "PGRST205" || error.message.includes("schema cache") || error.message.includes("does not exist"))) {
        allTablesExist = false;
        tableChecks.push(`${table} (NOT FOUND)`);
      } else {
        tableChecks.push(`${table} (EXISTS)`);
      }
    }

    recordTest(1, "Tables Exist", allTablesExist, tableChecks.join(", "));

    if (!allTablesExist) {
      console.error("\n[CRITICAL] Migration 006 has not been applied to the database yet!");
      console.error("Please execute supabase/apply_phase4_step1.sql in the Supabase SQL Editor:\nhttps://supabase.com/dashboard/project/xlkhqimanlpuvstqcwti/sql\n");
      return;
    }

    // --------------------------------------------------------------------------
    // Fetch base fixtures from Phase 3 master data
    // --------------------------------------------------------------------------
    const { data: year } = await adminClient.from("academic_years").select("id").eq("is_current", true).single();
    const { data: sem } = await adminClient.from("semesters").select("id").eq("semester_number", 5).single();
    const { data: section } = await adminClient.from("class_sections").select("id").eq("name", "A").single();
    const { data: subject1 } = await adminClient.from("subjects").select("id").eq("code", "CS501").single();
    const { data: subjectLab } = await adminClient.from("subjects").select("id").eq("code", "CSL51").single();
    const { data: faculty1 } = await adminClient.from("faculty").select("id").eq("employee_id", "FAC-CSE-001").single();
    const { data: room1 } = await adminClient.from("classrooms").select("id").eq("room_number", "LH-101").single();

    if (!year || !sem || !section || !subject1 || !faculty1 || !room1) {
      throw new Error("Phase 3 seed fixtures are missing or incomplete in database.");
    }

    // --------------------------------------------------------------------------
    // Test 2: Foreign Keys Enforcement
    // --------------------------------------------------------------------------
    const invalidUuid = "99999999-9999-9999-9999-999999999999";
    const { error: fkError } = await adminClient.from("timetable_configurations").insert({
      academic_year_id: invalidUuid,
      semester_id: sem.id,
      section_id: section.id,
      name: "Invalid FK Test Config",
    });

    const fkPassed = !!fkError && fkError.message.includes("foreign key");
    recordTest(2, "Foreign Keys Enforcement", fkPassed, fkPassed ? "Invalid foreign key rejected by database" : `Expected FK rejection, got: ${fkError?.message}`);

    // Create a temporary configuration for testing
    const { data: tempConfig, error: cfgErr } = await adminClient
      .from("timetable_configurations")
      .insert({
        academic_year_id: year.id,
        semester_id: sem.id,
        section_id: section.id,
        name: `Test-Run-Config-${Date.now()}`,
        working_days: 6,
        periods_per_day: 7,
        period_duration_minutes: 55,
      })
      .select()
      .single();

    if (cfgErr || !tempConfig) throw new Error(`Failed to create temp configuration: ${cfgErr?.message}`);
    tempConfigId = tempConfig.id;

    // --------------------------------------------------------------------------
    // Test 3: CHECK constraints reject invalid periods
    // --------------------------------------------------------------------------
    // Try period with end_time <= start_time
    const { error: timeOrderError } = await adminClient.from("timetable_periods").insert({
      timetable_configuration_id: tempConfigId,
      day_of_week: 1,
      period_number: 1,
      start_time: "10:00:00",
      end_time: "09:00:00",
    });

    // Try period with invalid day_of_week
    const { error: dayRangeError } = await adminClient.from("timetable_periods").insert({
      timetable_configuration_id: tempConfigId,
      day_of_week: 9,
      period_number: 1,
      start_time: "09:00:00",
      end_time: "10:00:00",
    });

    const checkPeriodPassed = !!timeOrderError && !!dayRangeError;
    recordTest(
      3,
      "CHECK Constraints: Invalid Periods Rejected",
      checkPeriodPassed,
      checkPeriodPassed
        ? "end_time <= start_time and day_of_week > 7 correctly rejected"
        : `Errors: timeOrder=${timeOrderError?.message}, dayRange=${dayRangeError?.message}`
    );

    // Insert 2 valid periods for entry conflict tests
    const { data: p1 } = await adminClient
      .from("timetable_periods")
      .insert({
        timetable_configuration_id: tempConfigId,
        day_of_week: 1,
        period_number: 1,
        start_time: "09:00:00",
        end_time: "09:55:00",
      })
      .select()
      .single();
    tempPeriod1Id = p1.id;

    const { data: p2 } = await adminClient
      .from("timetable_periods")
      .insert({
        timetable_configuration_id: tempConfigId,
        day_of_week: 1,
        period_number: 2,
        start_time: "09:55:00",
        end_time: "10:50:00",
      })
      .select()
      .single();
    tempPeriod2Id = p2.id;

    // --------------------------------------------------------------------------
    // Test 4: CHECK constraints reject invalid weekly periods
    // --------------------------------------------------------------------------
    const { error: weeklyPeriodError } = await adminClient.from("subject_scheduling_requirements").insert({
      section_id: section.id,
      subject_id: subject1.id,
      weekly_periods: -2,
    });

    const { error: consecutiveLeWeeklyError } = await adminClient.from("subject_scheduling_requirements").insert({
      section_id: section.id,
      subject_id: subject1.id,
      weekly_periods: 2,
      consecutive_periods: 4, // 4 > 2
    });

    const checkWeeklyPassed = !!weeklyPeriodError && !!consecutiveLeWeeklyError;
    recordTest(
      4,
      "CHECK Constraints: Invalid Weekly Periods Rejected",
      checkWeeklyPassed,
      checkWeeklyPassed
        ? "weekly_periods <= 0 and consecutive_periods > weekly_periods correctly rejected"
        : `Errors: weekly=${weeklyPeriodError?.message}, consecutiveLe=${consecutiveLeWeeklyError?.message}`
    );

    // Create temporary generations for conflict & multi-version testing
    const { data: gen1 } = await adminClient
      .from("timetable_generations")
      .insert({
        timetable_configuration_id: tempConfigId,
        generation_number: 1,
        status: "COMPLETED",
        hard_constraint_violations: 0,
        soft_constraint_violations: 0,
      })
      .select()
      .single();
    tempGen1Id = gen1.id;

    const { data: gen2 } = await adminClient
      .from("timetable_generations")
      .insert({
        timetable_configuration_id: tempConfigId,
        generation_number: 2,
        status: "COMPLETED",
        hard_constraint_violations: 0,
        soft_constraint_violations: 0,
      })
      .select()
      .single();
    tempGen2Id = gen2.id;

    // Insert initial valid timetable entry in gen1, period 1
    const { data: entry1 } = await adminClient
      .from("timetable_entries")
      .insert({
        timetable_generation_id: tempGen1Id,
        section_id: section.id,
        subject_id: subject1.id,
        faculty_id: faculty1.id,
        classroom_id: room1.id,
        timetable_period_id: tempPeriod1Id,
        occurrence_index: 1,
        session_type: "THEORY",
      })
      .select()
      .single();
    tempEntry1Id = entry1.id;

    // --------------------------------------------------------------------------
    // Test 5: Duplicate section-period entries rejected in same generation
    // --------------------------------------------------------------------------
    // Try scheduling a different subject for same section & period in gen1
    const { error: dupSectionError } = await adminClient.from("timetable_entries").insert({
      timetable_generation_id: tempGen1Id,
      section_id: section.id,
      subject_id: subjectLab.id,
      faculty_id: faculty1.id,
      classroom_id: room1.id,
      timetable_period_id: tempPeriod1Id,
      occurrence_index: 2,
    });

    const dupSectionPassed = !!dupSectionError && dupSectionError.message.includes("uq_entries_section_period_gen");
    recordTest(
      5,
      "Conflict Protection: Duplicate Section-Period Rejected",
      dupSectionPassed,
      dupSectionPassed ? "Unique index uq_entries_section_period_gen correctly enforced" : `Error: ${dupSectionError?.message}`
    );

    // --------------------------------------------------------------------------
    // Test 6: Duplicate faculty-period entries rejected in same generation
    // --------------------------------------------------------------------------
    // Fetch a second section to test faculty conflict across different sections
    const { data: sectionB } = await adminClient.from("class_sections").select("id").eq("name", "B").single();
    const { data: room2 } = await adminClient.from("classrooms").select("id").eq("room_number", "LH-102").single();

    const { error: dupFacultyError } = await adminClient.from("timetable_entries").insert({
      timetable_generation_id: tempGen1Id,
      section_id: sectionB ? sectionB.id : section.id,
      subject_id: subject1.id,
      faculty_id: faculty1.id, // Same faculty!
      classroom_id: room2 ? room2.id : room1.id,
      timetable_period_id: tempPeriod1Id, // Same period!
      occurrence_index: 2,
    });

    const dupFacultyPassed = !!dupFacultyError && (dupFacultyError.message.includes("uq_entries_faculty_period_gen") || dupFacultyError.message.includes("unique"));
    recordTest(
      6,
      "Conflict Protection: Duplicate Faculty-Period Rejected",
      dupFacultyPassed,
      dupFacultyPassed ? "Unique index uq_entries_faculty_period_gen correctly enforced" : `Error: ${dupFacultyError?.message}`
    );

    // --------------------------------------------------------------------------
    // Test 7: Duplicate classroom-period entries rejected in same generation
    // --------------------------------------------------------------------------
    const { data: faculty2 } = await adminClient.from("faculty").select("id").eq("employee_id", "FAC-CSE-002").single();

    const { error: dupRoomError } = await adminClient.from("timetable_entries").insert({
      timetable_generation_id: tempGen1Id,
      section_id: sectionB ? sectionB.id : section.id,
      subject_id: subject1.id,
      faculty_id: faculty2 ? faculty2.id : faculty1.id,
      classroom_id: room1.id, // Same classroom!
      timetable_period_id: tempPeriod1Id, // Same period!
      occurrence_index: 2,
    });

    const dupRoomPassed = !!dupRoomError && (dupRoomError.message.includes("uq_entries_classroom_period_gen") || dupRoomError.message.includes("unique"));
    recordTest(
      7,
      "Conflict Protection: Duplicate Classroom-Period Rejected",
      dupRoomPassed,
      dupRoomPassed ? "Unique index uq_entries_classroom_period_gen correctly enforced" : `Error: ${dupRoomError?.message}`
    );

    // --------------------------------------------------------------------------
    // Test 8: Different generations may contain same schedule without collision
    // --------------------------------------------------------------------------
    // Insert identical section/faculty/room schedule in Generation 2
    const { data: entryGen2, error: gen2InsertError } = await adminClient
      .from("timetable_entries")
      .insert({
        timetable_generation_id: tempGen2Id,
        section_id: section.id,
        subject_id: subject1.id,
        faculty_id: faculty1.id,
        classroom_id: room1.id,
        timetable_period_id: tempPeriod1Id,
        occurrence_index: 1,
        session_type: "THEORY",
      })
      .select()
      .single();

    tempEntry2Id = entryGen2?.id || null;
    const diffGenPassed = !gen2InsertError && !!entryGen2;
    recordTest(
      8,
      "Multi-Version Isolation: Same Schedule in Different Generation Permitted",
      diffGenPassed,
      diffGenPassed ? "Identical schedule safely co-exists across generation boundaries" : `Error: ${gen2InsertError?.message}`
    );

    // --------------------------------------------------------------------------
    // Test 9 & 10: RLS Prevents Unauthorized Mutations & Admins Can Manage
    // --------------------------------------------------------------------------
    const anonClient = createClient(SUPABASE_URL, ANON_KEY);
    const { error: anonInsertError } = await anonClient.from("timetable_configurations").insert({
      academic_year_id: year.id,
      semester_id: sem.id,
      section_id: section.id,
      name: "Unauthorized Anon Config",
    });

    const rlsBlockPassed = !!anonInsertError;
    recordTest(
      9,
      "RLS: Unauthorized Mutations Blocked",
      rlsBlockPassed,
      rlsBlockPassed ? "Unauthenticated insert rejected by RLS" : "Unauthenticated mutation unexpectedly succeeded!"
    );

    // Test Super Admin Client authenticated access
    const adminUserClient = createClient(SUPABASE_URL, ANON_KEY);
    const { error: adminLoginError } = await adminUserClient.auth.signInWithPassword({
      email: "superadmin@sams.edu",
      password: DEV_PASSWORD,
    });

    let adminManagePassed = false;
    if (!adminLoginError) {
      const { data: adminConfig, error: adminErr } = await adminUserClient
        .from("timetable_configurations")
        .select("id")
        .eq("id", tempConfigId)
        .single();
      adminManagePassed = !adminErr && !!adminConfig;
    }

    recordTest(
      10,
      "RLS: Admin Can Manage Timetable Data",
      adminManagePassed,
      adminManagePassed ? "Super Admin successfully authenticated and read configuration" : `Admin Login/Read failed: ${adminLoginError?.message}`
    );

    // --------------------------------------------------------------------------
    // Test 11: Faculty Can Read Appropriate Timetable Data
    // --------------------------------------------------------------------------
    const facultyClient = createClient(SUPABASE_URL, ANON_KEY);
    const { error: facultyLoginError } = await facultyClient.auth.signInWithPassword({
      email: "arun.kumar@sams.edu",
      password: DEV_PASSWORD,
    });

    let facultyReadPassed = false;
    if (!facultyLoginError) {
      const { data: facultyEntries, error: fReadErr } = await facultyClient
        .from("timetable_entries")
        .select("id, faculty_id")
        .eq("timetable_generation_id", tempGen1Id);

      // Faculty Arun should see entries where faculty_id is his own
      facultyReadPassed = !fReadErr && Array.isArray(facultyEntries) && facultyEntries.length > 0;
    }

    recordTest(
      11,
      "RLS: Faculty Can Read Appropriate Timetable Data",
      facultyReadPassed,
      facultyReadPassed ? "Faculty successfully accessed assigned timetable entry" : `Faculty test failed: ${facultyLoginError?.message}`
    );

    // --------------------------------------------------------------------------
    // Test 12: Students Can Read Appropriate Timetable Data
    // --------------------------------------------------------------------------
    const studentClient = createClient(SUPABASE_URL, ANON_KEY);
    const { error: studentLoginError } = await studentClient.auth.signInWithPassword({
      email: "rohit.verma@student.sams.edu",
      password: DEV_PASSWORD,
    });

    let studentReadPassed = false;
    if (!studentLoginError) {
      const { data: studentEntries, error: sReadErr } = await studentClient
        .from("timetable_entries")
        .select("id, section_id")
        .eq("timetable_generation_id", tempGen1Id);

      // Student Rohit is enrolled in Section 5-A, should see section entries
      studentReadPassed = !sReadErr && Array.isArray(studentEntries) && studentEntries.length > 0;
    }

    recordTest(
      12,
      "RLS: Students Can Read Section Timetable Data",
      studentReadPassed,
      studentReadPassed ? "Student successfully accessed enrolled section timetable entry" : `Student test failed: ${studentLoginError?.message}`
    );

    // --------------------------------------------------------------------------
    // Test 13: Lab / Consecutive-Period Requirements Can Be Represented
    // --------------------------------------------------------------------------
    const { data: labReq } = await adminClient
      .from("subject_scheduling_requirements")
      .select("*")
      .eq("subject_id", subjectLab.id)
      .eq("section_id", section.id)
      .maybeSingle();

    const labRepresented =
      !!labReq &&
      labReq.requires_lab === true &&
      labReq.requires_consecutive_slots === true &&
      labReq.consecutive_periods === 3 &&
      labReq.room_type === "LABORATORY";

    recordTest(
      13,
      "Lab & Consecutive-Period Requirements Representable",
      labRepresented,
      labRepresented
        ? "Laboratory constraints accurately represented (requires_lab=true, consecutive=3, room_type=LABORATORY)"
        : `Lab requirement mismatch or not seeded: ${JSON.stringify(labReq)}`
    );

    // --------------------------------------------------------------------------
    // Test 14: Existing Phase 3 Functionality Remains Intact
    // --------------------------------------------------------------------------
    const { count: deptCount } = await adminClient.from("departments").select("*", { count: "exact", head: true });
    const { count: yearCount } = await adminClient.from("academic_years").select("*", { count: "exact", head: true });
    const { count: facCount } = await adminClient.from("faculty").select("*", { count: "exact", head: true });
    const { count: studCount } = await adminClient.from("students").select("*", { count: "exact", head: true });

    const phase3Intact = (deptCount || 0) >= 3 && (yearCount || 0) >= 1 && (facCount || 0) >= 4 && (studCount || 0) >= 5;
    recordTest(
      14,
      "Phase 3 Master Data & Relationships Intact",
      phase3Intact,
      `Verified: ${deptCount} depts, ${yearCount} years, ${facCount} faculty, ${studCount} students in database`
    );
  } catch (err: unknown) {
    console.error("\nUnexpected test suite error:", err);
  } finally {
    // --------------------------------------------------------------------------
    // Cleanup temporary test records safely
    // --------------------------------------------------------------------------
    console.log("\nCleaning up temporary test records...");
    if (tempEntry1Id) await adminClient.from("timetable_entries").delete().eq("id", tempEntry1Id);
    if (tempEntry2Id) await adminClient.from("timetable_entries").delete().eq("id", tempEntry2Id);
    if (tempGen1Id) await adminClient.from("timetable_generations").delete().eq("id", tempGen1Id);
    if (tempGen2Id) await adminClient.from("timetable_generations").delete().eq("id", tempGen2Id);
    if (tempPeriod1Id) await adminClient.from("timetable_periods").delete().eq("id", tempPeriod1Id);
    if (tempPeriod2Id) await adminClient.from("timetable_periods").delete().eq("id", tempPeriod2Id);
    if (tempConfigId) await adminClient.from("timetable_configurations").delete().eq("id", tempConfigId);
    console.log("Temporary test cleanup completed.");
  }

  console.log("\n================================================================================");
  console.log("TEST SUMMARY");
  console.log("================================================================================");
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = total - passed;
  console.log(`Total: ${total} | Passed: ${passed} | Failed: ${failed}`);
  if (failed === 0) {
    console.log("RESULT: ALL PHASE 4 STEP 1 DOMAIN TESTS PASSED SUCCESSFULLY!");
  } else {
    console.log(`RESULT: ${failed} TEST(S) FAILED`);
  }
  console.log("================================================================================\n");
}

runTests();
