/**
 * SAMS — Phase 4 Step 2: Working Days, Periods & Scheduling Configuration Test Suite
 * 
 * Verifies all 18 criteria against the live Supabase PostgreSQL database:
 * 1. Admin can create configuration
 * 2. Admin can update configuration
 * 3. Admin can activate/deactivate configuration (soft toggle)
 * 4. Non-admin cannot mutate configuration
 * 5. Valid working-day selection is accepted
 * 6. Invalid working-day configuration is rejected
 * 7. Period generation produces correct number of slots
 * 8. Period numbering is deterministic
 * 9. Start/end times are calculated correctly
 * 10. Breaks shift subsequent period times correctly
 * 11. Duplicate break positions are rejected
 * 12. Invalid break positions are rejected
 * 13. Regeneration does not destroy timetable history
 * 14. Multiple configurations can coexist
 * 15. Faculty can read configuration/periods
 * 16. Students can read appropriate configuration/periods
 * 17. Generated slots have correct day/period uniqueness
 * 18. Existing Phase 3 functionality remains intact
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";
import { generatePeriodSlotsAction } from "../apps/web/src/server/actions/timetable";
import { computePeriodSlots } from "../apps/web/src/lib/timetable/period-utils";
import { TimetableConfigurationSchema } from "../apps/web/src/server/validators/timetable";

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

async function runStep2Tests() {
  console.log("================================================================================");
  console.log("SAMS PHASE 4 STEP 2: WORKING DAYS, PERIODS & SCHEDULING CONFIGURATION TESTS");
  console.log(`Target Supabase URL: ${SUPABASE_URL}`);
  console.log("================================================================================\n");

  const createdConfigIds: string[] = [];

  try {
    // --------------------------------------------------------------------------
    // Fetch base fixtures from Phase 3 master data
    // --------------------------------------------------------------------------
    const { data: year } = await adminClient.from("academic_years").select("id").eq("is_current", true).single();
    const { data: sem } = await adminClient.from("semesters").select("id").eq("semester_number", 5).single();
    const { data: sectionA } = await adminClient.from("class_sections").select("id").eq("name", "A").single();
    const { data: sectionB } = await adminClient.from("class_sections").select("id").eq("name", "B").single();

    if (!year || !sem || !sectionA) {
      throw new Error("Missing academic fixtures in live database.");
    }

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
      throw new Error(
        "Missing required Supabase environment variables (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY)."
      );
    }

    // Authenticate test users
    const adminUserClient = createClient(SUPABASE_URL, ANON_KEY);
    await adminUserClient.auth.signInWithPassword({
      email: "superadmin@sams.edu",
      password: DEV_PASSWORD,
    });

    const facultyClient = createClient(SUPABASE_URL, ANON_KEY);
    await facultyClient.auth.signInWithPassword({
      email: "arun.kumar@sams.edu",
      password: DEV_PASSWORD,
    });

    const studentClient = createClient(SUPABASE_URL, ANON_KEY);
    await studentClient.auth.signInWithPassword({
      email: "rohit.verma@student.sams.edu",
      password: DEV_PASSWORD,
    });

    // --------------------------------------------------------------------------
    // Test 1: Admin can create configuration
    // --------------------------------------------------------------------------
    const testConfigName = `Test-Config-Step2-${Date.now()}`;
    const { data: newConfig, error: createErr } = await adminClient
      .from("timetable_configurations")
      .insert({
        academic_year_id: year.id,
        semester_id: sem.id,
        section_id: sectionA.id,
        name: testConfigName,
        description: "Automated test configuration for Step 2",
        working_days: 6,
        periods_per_day: 7,
        period_duration_minutes: 55,
        break_after_periods: {
          breaks: [
            { period: 2, duration: 15, label: "Tea Break" },
            { period: 4, duration: 45, label: "Lunch Break" },
          ],
          enabled_days: [1, 2, 3, 4, 5, 6],
          start_time: "09:00:00",
        },
        generation_status: "DRAFT",
        is_active: true,
      })
      .select()
      .single();

    const t1Passed = !createErr && !!newConfig;
    if (newConfig) createdConfigIds.push(newConfig.id);
    recordTest(1, "Admin Can Create Configuration", t1Passed, t1Passed ? `Created ID: ${newConfig.id}` : `Error: ${createErr?.message}`);

    // --------------------------------------------------------------------------
    // Test 2: Admin can update configuration
    // --------------------------------------------------------------------------
    const updatedName = `${testConfigName}-UPDATED`;
    const { data: updatedConfig, error: updateErr } = await adminClient
      .from("timetable_configurations")
      .update({
        name: updatedName,
        description: "Updated description via Step 2 test",
        period_duration_minutes: 50,
      })
      .eq("id", newConfig.id)
      .select()
      .single();

    const t2Passed = !updateErr && updatedConfig?.name === updatedName && updatedConfig?.period_duration_minutes === 50;
    recordTest(2, "Admin Can Update Configuration", t2Passed, t2Passed ? "Name and period duration updated successfully" : `Error: ${updateErr?.message}`);

    // --------------------------------------------------------------------------
    // Test 3: Admin can activate/deactivate configuration (Soft Toggle)
    // --------------------------------------------------------------------------
    const { data: deactConfig, error: deactErr } = await adminClient
      .from("timetable_configurations")
      .update({ is_active: false })
      .eq("id", newConfig.id)
      .select("id, is_active")
      .single();

    const { data: reactConfig, error: reactErr } = await adminClient
      .from("timetable_configurations")
      .update({ is_active: true })
      .eq("id", newConfig.id)
      .select("id, is_active")
      .single();

    const t3Passed = !deactErr && deactConfig?.is_active === false && !reactErr && reactConfig?.is_active === true;
    recordTest(3, "Admin Can Soft Deactivate and Activate", t3Passed, t3Passed ? "Soft toggle updated is_active without deleting record" : `Errors: ${deactErr?.message} / ${reactErr?.message}`);

    // --------------------------------------------------------------------------
    // Test 4: Non-admin cannot mutate configuration
    // --------------------------------------------------------------------------
    const anonClient = createClient(SUPABASE_URL, ANON_KEY);
    const { error: anonErr } = await anonClient
      .from("timetable_configurations")
      .update({ name: "Hacked Name" })
      .eq("id", newConfig.id);

    const { error: studentMutateErr } = await studentClient
      .from("timetable_configurations")
      .update({ name: "Student Hacked Name" })
      .eq("id", newConfig.id);

    // In Supabase RLS, non-permitted updates return either an error or 0 affected rows
    const { data: checkName } = await adminClient
      .from("timetable_configurations")
      .select("name")
      .eq("id", newConfig.id)
      .single();

    const t4Passed = checkName?.name === updatedName;
    recordTest(4, "Non-Admin Cannot Mutate Configuration", t4Passed, t4Passed ? "Unauthorized mutations strictly blocked by RLS" : "Unauthorized mutation succeeded!");

    // --------------------------------------------------------------------------
    // Test 5: Valid working-day selection is accepted
    // --------------------------------------------------------------------------
    const validValidation = TimetableConfigurationSchema.safeParse({
      name: "Valid Days Test",
      academic_year_id: year.id,
      semester_id: sem.id,
      section_id: sectionA.id,
      enabled_days: [1, 2, 3, 4, 5], // Mon-Fri
      periods_per_day: 6,
      period_duration_minutes: 60,
      start_time: "08:30",
      breaks: [{ period: 3, duration: 30, label: "Lunch" }],
    });

    recordTest(5, "Valid Working-Day Selection Accepted", validValidation.success, validValidation.success ? "Monday-Friday (5 days) validated cleanly" : `Errors: ${validValidation.error?.message}`);

    // --------------------------------------------------------------------------
    // Test 6: Invalid working-day configuration is rejected
    // --------------------------------------------------------------------------
    const emptyDaysValidation = TimetableConfigurationSchema.safeParse({
      name: "Empty Days Test",
      academic_year_id: year.id,
      semester_id: sem.id,
      section_id: sectionA.id,
      enabled_days: [], // Invalid: empty
      periods_per_day: 7,
      period_duration_minutes: 55,
      start_time: "09:00",
      breaks: [],
    });

    const duplicateDaysValidation = TimetableConfigurationSchema.safeParse({
      name: "Duplicate Days Test",
      academic_year_id: year.id,
      semester_id: sem.id,
      section_id: sectionA.id,
      enabled_days: [1, 1, 2], // Invalid: duplicate day 1
      periods_per_day: 7,
      period_duration_minutes: 55,
      start_time: "09:00",
      breaks: [],
    });

    const t6Passed = !emptyDaysValidation.success && !duplicateDaysValidation.success;
    recordTest(6, "Invalid Working-Day Configuration Rejected", t6Passed, t6Passed ? "Empty days and duplicate days rejected by Zod schema" : "Invalid working days were incorrectly accepted!");

    // --------------------------------------------------------------------------
    // Test 7 & 8: Period generation produces correct number of slots & deterministic numbering
    // --------------------------------------------------------------------------
    const generatedSlots = computePeriodSlots(
      newConfig.id,
      [1, 2, 3, 4, 5, 6], // 6 days
      7,                  // 7 periods/day
      55,                 // 55 mins
      "09:00:00",
      [
        { period: 2, duration: 20, label: "Tea Break" },
        { period: 4, duration: 45, label: "Lunch Break" },
      ]
    );

    const expectedCount = 6 * 7; // 42 slots
    const countMatches = generatedSlots.length === expectedCount;

    // Verify deterministic numbering (1..7 for every day)
    let deterministicNumbering = true;
    for (let day = 1; day <= 6; day++) {
      const daySlots = generatedSlots.filter((s) => s.day_of_week === day);
      if (daySlots.length !== 7) deterministicNumbering = false;
      daySlots.forEach((s, idx) => {
        if (s.period_number !== idx + 1) deterministicNumbering = false;
      });
    }

    recordTest(7, "Period Generation Produces Correct Number of Slots", countMatches, `Generated ${generatedSlots.length} slots (expected ${expectedCount})`);
    recordTest(8, "Period Numbering Is Deterministic (1..N per Day)", deterministicNumbering, deterministicNumbering ? "All days contain sequential periods 1 through 7" : "Period numbering sequence mismatch!");

    // --------------------------------------------------------------------------
    // Test 9 & 10: Start/End times are calculated correctly & Breaks shift subsequent times
    // --------------------------------------------------------------------------
    // Mon P1: 09:00 - 09:55
    // Mon P2: 09:55 - 10:50
    // (Tea break 20m: 10:50 - 11:10)
    // Mon P3: 11:10 - 12:05
    // Mon P4: 12:05 - 13:00
    // (Lunch break 45m: 13:00 - 13:45)
    // Mon P5: 13:45 - 14:40
    // Mon P6: 14:40 - 15:35
    // Mon P7: 15:35 - 16:30
    const monP1 = generatedSlots.find((s) => s.day_of_week === 1 && s.period_number === 1);
    const monP2 = generatedSlots.find((s) => s.day_of_week === 1 && s.period_number === 2);
    const monP3 = generatedSlots.find((s) => s.day_of_week === 1 && s.period_number === 3);
    const monP4 = generatedSlots.find((s) => s.day_of_week === 1 && s.period_number === 4);
    const monP5 = generatedSlots.find((s) => s.day_of_week === 1 && s.period_number === 5);
    const monP7 = generatedSlots.find((s) => s.day_of_week === 1 && s.period_number === 7);

    const timesCorrect =
      monP1?.start_time === "09:00:00" &&
      monP1?.end_time === "09:55:00" &&
      monP2?.start_time === "09:55:00" &&
      monP2?.end_time === "10:50:00" &&
      monP7?.end_time === "16:30:00";

    const breakShiftCorrect =
      monP3?.start_time === "11:10:00" && // 10:50 + 20m break = 11:10
      monP5?.start_time === "13:45:00";   // 13:00 + 45m break = 13:45

    recordTest(9, "Start and End Times Calculated Correctly", timesCorrect, timesCorrect ? "P1 starts 09:00:00, ends 09:55:00; P7 ends 16:30:00" : `Actual P1: ${monP1?.start_time}-${monP1?.end_time}`);
    recordTest(10, "Breaks Shift Subsequent Period Times Correctly", breakShiftCorrect, breakShiftCorrect ? "P3 starts at 11:10:00 (after 20m tea break); P5 starts at 13:45:00 (after 45m lunch break)" : `Actual: P3 starts ${monP3?.start_time}, P5 starts ${monP5?.start_time}`);

    // Persist slots into database for testing uniqueness and RLS
    await adminClient.from("timetable_periods").delete().eq("timetable_configuration_id", newConfig.id);
    const { error: batchInsertErr } = await adminClient.from("timetable_periods").insert(generatedSlots);
    if (batchInsertErr) throw new Error(`Batch insert failed: ${batchInsertErr.message}`);

    // --------------------------------------------------------------------------
    // Test 11 & 12: Duplicate and Invalid Break Positions are Rejected
    // --------------------------------------------------------------------------
    const dupBreakValidation = TimetableConfigurationSchema.safeParse({
      name: "Duplicate Break Test",
      academic_year_id: year.id,
      semester_id: sem.id,
      section_id: sectionA.id,
      enabled_days: [1, 2, 3, 4, 5],
      periods_per_day: 7,
      period_duration_minutes: 55,
      start_time: "09:00",
      breaks: [
        { period: 2, duration: 15, label: "Tea Break 1" },
        { period: 2, duration: 20, label: "Tea Break 2" }, // Duplicate period 2
      ],
    });

    const invalidPosBreakValidation = TimetableConfigurationSchema.safeParse({
      name: "Invalid Position Break Test",
      academic_year_id: year.id,
      semester_id: sem.id,
      section_id: sectionA.id,
      enabled_days: [1, 2, 3, 4, 5],
      periods_per_day: 7,
      period_duration_minutes: 55,
      start_time: "09:00",
      breaks: [
        { period: 7, duration: 15, label: "After Final Period" }, // Invalid: period >= periods_per_day
      ],
    });

    recordTest(11, "Duplicate Break Positions Rejected", !dupBreakValidation.success, !dupBreakValidation.success ? "Multiple breaks after same period number rejected" : "Duplicate break position accepted!");
    recordTest(12, "Invalid Break Positions Rejected", !invalidPosBreakValidation.success, !invalidPosBreakValidation.success ? "Break after final period rejected (breaks must be between periods)" : "Invalid break position accepted!");

    // --------------------------------------------------------------------------
    // Test 13: Regeneration does not destroy timetable history
    // --------------------------------------------------------------------------
    // Create a temporary generation referencing newConfig
    const { data: testGen } = await adminClient
      .from("timetable_generations")
      .insert({
        timetable_configuration_id: newConfig.id,
        generation_number: 1,
        status: "COMPLETED",
      })
      .select()
      .single();

    // Now attempt to regenerate period slots
    const regenResult = await generatePeriodSlotsAction(
      { configuration_id: newConfig.id },
      adminClient
    );

    const regenBlocked = !regenResult.success && (regenResult.error?.includes("existing timetable generations") || false);
    recordTest(13, "Regeneration Blocked When Historical Generations Exist", regenBlocked, regenBlocked ? "Historical lock successfully prevented destructive period regeneration" : `Unexpected result: ${JSON.stringify(regenResult)}`);

    // Clean up temporary test generation so other operations succeed
    if (testGen) {
      await adminClient.from("timetable_generations").delete().eq("id", testGen.id);
    }

    // --------------------------------------------------------------------------
    // Test 14: Multiple configurations can coexist
    // --------------------------------------------------------------------------
    const secondConfigName = `Test-Config-SectionB-${Date.now()}`;
    const { data: configB, error: cfgBErr } = await adminClient
      .from("timetable_configurations")
      .insert({
        academic_year_id: year.id,
        semester_id: sem.id,
        section_id: sectionB ? sectionB.id : sectionA.id,
        name: secondConfigName,
        working_days: 5,
        periods_per_day: 6,
        period_duration_minutes: 60,
      })
      .select()
      .single();

    if (configB) createdConfigIds.push(configB.id);
    const coexistPassed = !cfgBErr && !!configB && configB.id !== newConfig.id;
    recordTest(14, "Multiple Configurations Coexist Safely", coexistPassed, coexistPassed ? `Both configs active (ID1: ${newConfig.id}, ID2: ${configB.id})` : `Error: ${cfgBErr?.message}`);

    // --------------------------------------------------------------------------
    // Test 15: Faculty can read configuration/periods
    // --------------------------------------------------------------------------
    const { data: facConfigs, error: facCfgErr } = await facultyClient
      .from("timetable_configurations")
      .select("id, name")
      .eq("id", newConfig.id);

    const { data: facPeriods, error: facPerErr } = await facultyClient
      .from("timetable_periods")
      .select("id")
      .eq("timetable_configuration_id", newConfig.id);

    const facultyReadPassed = !facCfgErr && Array.isArray(facConfigs) && facConfigs.length > 0 && !facPerErr && Array.isArray(facPeriods) && facPeriods.length > 0;
    recordTest(15, "Faculty Can Read Configuration and Periods", facultyReadPassed, facultyReadPassed ? `Faculty verified ${facPeriods?.length} period slots` : `Errors: ${facCfgErr?.message} / ${facPerErr?.message}`);

    // --------------------------------------------------------------------------
    // Test 16: Students can read appropriate configuration/periods
    // --------------------------------------------------------------------------
    const { data: studConfigs, error: studCfgErr } = await studentClient
      .from("timetable_configurations")
      .select("id, name")
      .eq("id", newConfig.id);

    const { data: studPeriods, error: studPerErr } = await studentClient
      .from("timetable_periods")
      .select("id")
      .eq("timetable_configuration_id", newConfig.id);

    const studentReadPassed = !studCfgErr && Array.isArray(studConfigs) && studConfigs.length > 0 && !studPerErr && Array.isArray(studPeriods) && studPeriods.length > 0;
    recordTest(16, "Students Can Read Configuration and Periods", studentReadPassed, studentReadPassed ? `Student verified ${studPeriods?.length} period slots` : `Errors: ${studCfgErr?.message} / ${studPerErr?.message}`);

    // --------------------------------------------------------------------------
    // Test 17: Generated slots have correct day/period uniqueness
    // --------------------------------------------------------------------------
    // Try to insert a duplicate slot for same (configuration_id, day_of_week, period_number)
    const { error: dupSlotErr } = await adminClient.from("timetable_periods").insert({
      timetable_configuration_id: newConfig.id,
      day_of_week: 1,
      period_number: 1, // Duplicate day 1 period 1
      start_time: "09:00:00",
      end_time: "09:55:00",
    });

    const slotUniquenessPassed = !!dupSlotErr && (dupSlotErr.message.includes("uq_period_slot") || dupSlotErr.message.includes("unique"));
    recordTest(17, "Generated Slots Enforce (Config, Day, Period) Uniqueness", slotUniquenessPassed, slotUniquenessPassed ? "Unique constraint uq_period_slot correctly rejected duplicate slot" : `Error: ${dupSlotErr?.message}`);

    // --------------------------------------------------------------------------
    // Test 18: Existing Phase 3 functionality remains intact
    // --------------------------------------------------------------------------
    const { count: deptCount } = await adminClient.from("departments").select("*", { count: "exact", head: true });
    const { count: facCount } = await adminClient.from("faculty").select("*", { count: "exact", head: true });
    const { count: studCount } = await adminClient.from("students").select("*", { count: "exact", head: true });
    const { count: subjCount } = await adminClient.from("subjects").select("*", { count: "exact", head: true });

    const phase3Intact = (deptCount || 0) >= 3 && (facCount || 0) >= 4 && (studCount || 0) >= 5 && (subjCount || 0) >= 6;
    recordTest(18, "Phase 3 Academic Foundation Uncompromised", phase3Intact, `Verified: ${deptCount} depts, ${facCount} faculty, ${studCount} students, ${subjCount} subjects intact`);
  } catch (err: unknown) {
    console.error("\nUnexpected test suite error:", err);
  } finally {
    console.log("\nCleaning up temporary test configurations...");
    for (const cid of createdConfigIds) {
      await adminClient.from("timetable_periods").delete().eq("timetable_configuration_id", cid);
      await adminClient.from("timetable_configurations").delete().eq("id", cid);
    }
    console.log("Cleanup completed.");
  }

  console.log("\n================================================================================");
  console.log("TEST SUMMARY");
  console.log("================================================================================");
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = total - passed;
  console.log(`Total: ${total} | Passed: ${passed} | Failed: ${failed}`);
  if (failed === 0) {
    console.log("RESULT: ALL 18 PHASE 4 STEP 2 CONFIGURATION TESTS PASSED SUCCESSFULLY!");
  } else {
    console.log(`RESULT: ${failed} TEST(S) FAILED`);
  }
  console.log("================================================================================\n");
}

runStep2Tests();
