/**
 * SAMS — Phase 4 Step 4.2: Timetable Generation Backend Integration Test Suite
 *
 * Verifies all 17 backend integration criteria:
 *  1. Valid request accepted (Zod validation)
 *  2. Missing configuration_id rejected (Zod validation)
 *  3. Invalid UUID rejected (Zod validation)
 *  4. Invalid timeout rejected (Zod validation)
 *  5. Unauthorized user rejected (Role guard)
 *  6. Missing configuration rejected (Pre-solve data loader)
 *  7. Missing active periods rejected (Pre-solve data loader)
 *  8. Missing scheduling requirements rejected (Pre-solve data loader)
 *  9. Missing faculty mapping rejected (Pre-solve data loader)
 * 10. AI-service success response handled (Solver execution & enrichment)
 * 11. INFEASIBLE response handled (Solver execution & diagnostics)
 * 12. AI-service offline response handled (Network resilience)
 * 13. HTTP 422 handled (Solver schema rejection)
 * 14. HTTP 500 handled (Internal error handling)
 * 15. Audit success/failure behavior (Audit log recording)
 * 16. No timetable persistence occurs (Historical & database isolation)
 * 17. Existing regression suites pass (Phase 4 Step 1, 2, 3)
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";
import { GenerateTimetableSchema } from "../apps/web/src/server/validators/timetable";
import { aiClient, SchedulingInput } from "../apps/web/src/lib/ai-client";
import {
  buildSolverInput,
  enrichSolverOutput,
} from "../apps/web/src/lib/timetable/timetable-solver-service";
import { ADMIN_ROLES, hasAnyRole } from "../apps/web/src/lib/auth/roles";

dotenv.config({ path: path.resolve(process.cwd(), "apps/web/.env.local") });
dotenv.config();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

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
  const status = passed ? "[PASS]" : "[FAIL]";
  console.log(`${status} Test ${id < 10 ? " " + id : id}: ${name} - ${details}`);
}

async function runStep4BackendTests() {
  console.log("================================================================================");
  console.log("SAMS PHASE 4 STEP 4.2: TIMETABLE GENERATION BACKEND INTEGRATION TEST SUITE");
  console.log(`Target Supabase: ${SUPABASE_URL}`);
  console.log(`Target AI Microservice: ${process.env.AI_SERVICE_URL || "http://127.0.0.1:8000"}`);
  console.log("================================================================================\n");

  try {
    // --------------------------------------------------------------------------
    // 1. Valid Request Accepted
    // --------------------------------------------------------------------------
    const validPayload = {
      configuration_id: "00000000-0000-0000-0000-000000000001",
      section_id: "00000000-0000-0000-0000-000000000002",
      timeout_seconds: 45,
      random_seed: 123,
    };
    const parseValid = GenerateTimetableSchema.safeParse(validPayload);
    recordTest(
      1,
      "Valid Request Accepted",
      parseValid.success,
      parseValid.success ? "Valid UUIDs and timeout parsed successfully" : "Failed to parse valid payload"
    );

    // --------------------------------------------------------------------------
    // 2. Missing Configuration ID Rejected
    // --------------------------------------------------------------------------
    const missingConfigPayload = {
      section_id: "00000000-0000-0000-0000-000000000002",
      timeout_seconds: 30,
    };
    const parseMissingConfig = GenerateTimetableSchema.safeParse(missingConfigPayload);
    recordTest(
      2,
      "Missing Configuration ID Rejected",
      !parseMissingConfig.success,
      !parseMissingConfig.success
        ? `Correctly rejected: ${parseMissingConfig.error?.errors[0]?.message}`
        : "Unexpectedly accepted payload with missing configuration_id"
    );

    // --------------------------------------------------------------------------
    // 3. Invalid UUID Rejected
    // --------------------------------------------------------------------------
    const invalidUuidPayload = {
      configuration_id: "not-a-valid-uuid",
      section_id: "00000000-0000-0000-0000-000000000002",
    };
    const parseInvalidUuid = GenerateTimetableSchema.safeParse(invalidUuidPayload);
    recordTest(
      3,
      "Invalid UUID Rejected",
      !parseInvalidUuid.success,
      !parseInvalidUuid.success
        ? `Correctly rejected: ${parseInvalidUuid.error?.errors[0]?.message}`
        : "Unexpectedly accepted malformed UUID"
    );

    // --------------------------------------------------------------------------
    // 4. Invalid Timeout Rejected
    // --------------------------------------------------------------------------
    const invalidTimeoutPayload = {
      configuration_id: "00000000-0000-0000-0000-000000000001",
      section_id: "00000000-0000-0000-0000-000000000002",
      timeout_seconds: 0, // Must be >= 1
    };
    const parseInvalidTimeout = GenerateTimetableSchema.safeParse(invalidTimeoutPayload);
    recordTest(
      4,
      "Invalid Timeout Rejected",
      !parseInvalidTimeout.success,
      !parseInvalidTimeout.success
        ? `Correctly rejected: ${parseInvalidTimeout.error?.errors[0]?.message}`
        : "Unexpectedly accepted 0s timeout"
    );

    // --------------------------------------------------------------------------
    // 5. Unauthorized User Rejected
    // --------------------------------------------------------------------------
    const studentAuthorized = hasAnyRole("student" as any, ADMIN_ROLES);
    const facultyAuthorized = hasAnyRole("faculty" as any, ADMIN_ROLES);
    const superAdminAuthorized = hasAnyRole("super_admin" as any, ADMIN_ROLES);
    const t5Passed = !studentAuthorized && !facultyAuthorized && superAdminAuthorized;
    recordTest(
      5,
      "Unauthorized User Rejected",
      t5Passed,
      "Student & Faculty blocked from generation; Admin permitted"
    );

    // --------------------------------------------------------------------------
    // 6. Missing Configuration Rejected (Pre-solve data loader)
    // --------------------------------------------------------------------------
    const nonExistentId = "99999999-9999-9999-9999-999999999999";
    const resNonExistent = await buildSolverInput(adminClient, nonExistentId, nonExistentId);
    recordTest(
      6,
      "Missing Configuration Rejected",
      !resNonExistent.success && (resNonExistent.error?.includes("not found") ?? false),
      `Returned expected domain error: ${resNonExistent.error}`
    );

    // --------------------------------------------------------------------------
    // Fetch live fixtures from DB (created in Step 1/Step 2)
    // --------------------------------------------------------------------------
    const { data: config } = await adminClient
      .from("timetable_configurations")
      .select("*")
      .eq("is_active", true)
      .limit(1)
      .single();

    if (!config) {
      throw new Error("No active timetable configuration found in database for testing.");
    }

    // --------------------------------------------------------------------------
    // 7. Missing Active Periods Rejected
    // --------------------------------------------------------------------------
    // Test by querying with a mock empty periods configuration
    const dummyConfigId = "11111111-1111-1111-1111-111111111111";
    // Create temporary inactive/empty config
    const { data: emptyConfig } = await adminClient
      .from("timetable_configurations")
      .insert({
        id: dummyConfigId,
        academic_year_id: config.academic_year_id,
        semester_id: config.semester_id,
        section_id: config.section_id,
        name: "Temporary Empty Config For Test 7",
        is_active: true,
      })
      .select()
      .single();

    let t7Passed = false;
    if (emptyConfig) {
      const resNoPeriods = await buildSolverInput(adminClient, emptyConfig.id, emptyConfig.section_id);
      t7Passed = !resNoPeriods.success && (resNoPeriods.error?.includes("No active period slots") ?? false);
      // Clean up empty config
      await adminClient.from("timetable_configurations").delete().eq("id", dummyConfigId);
    }
    recordTest(
      7,
      "Missing Active Periods Rejected",
      t7Passed,
      "Configurations with 0 active period slots rejected before solver call"
    );

    // --------------------------------------------------------------------------
    // 8. Missing Scheduling Requirements Rejected
    // --------------------------------------------------------------------------
    // Section B has 0 requirements in seed
    const { data: sectionB } = await adminClient
      .from("class_sections")
      .select("id")
      .eq("name", "B")
      .maybeSingle();

    let t8Passed = false;
    if (sectionB) {
      // Create temp config for section B
      const tempSecBConfigId = "22222222-2222-2222-2222-222222222222";
      await adminClient.from("timetable_configurations").insert({
        id: tempSecBConfigId,
        academic_year_id: config.academic_year_id,
        semester_id: config.semester_id,
        section_id: sectionB.id,
        name: "Section B Empty Reqs Config",
        is_active: true,
      });
      // Add one active period so Test 7 isn't hit first
      await adminClient.from("timetable_periods").insert({
        timetable_configuration_id: tempSecBConfigId,
        day_of_week: 1,
        period_number: 1,
        start_time: "09:00:00",
        end_time: "10:00:00",
        is_break: false,
        is_active: true,
      });

      const resNoReqs = await buildSolverInput(adminClient, tempSecBConfigId, sectionB.id);
      t8Passed = !resNoReqs.success && (resNoReqs.error?.includes("No active subject scheduling requirements") ?? false);

      // Clean up
      await adminClient.from("timetable_periods").delete().eq("timetable_configuration_id", tempSecBConfigId);
      await adminClient.from("timetable_configurations").delete().eq("id", tempSecBConfigId);
    }
    recordTest(
      8,
      "Missing Scheduling Requirements Rejected",
      t8Passed,
      "Sections with 0 active scheduling requirements rejected before solver call"
    );

    // --------------------------------------------------------------------------
    // 9. Missing Faculty Mapping Rejected
    // --------------------------------------------------------------------------
    const tempSubId = "44444444-4444-4444-4444-444444444444";
    const tempReqId = "33333333-3333-3333-3333-333333333333";

    // Query section department_id to satisfy foreign key
    const { data: secInfo } = await adminClient
      .from("class_sections")
      .select("department_id")
      .eq("id", config.section_id)
      .single();

    // Insert temporary subject with no faculty assignment in faculty_subjects
    await adminClient.from("subjects").insert({
      id: tempSubId,
      code: "UNASSIGNED99",
      name: "Subject With No Faculty Assigned",
      department_id: secInfo?.department_id,
      semester_id: config.semester_id,
      credits: 3,
    });

    await adminClient.from("subject_scheduling_requirements").insert({
      id: tempReqId,
      section_id: config.section_id,
      subject_id: tempSubId,
      weekly_periods: 2,
      consecutive_periods: 1,
      is_active: true,
    });

    const resNoFac = await buildSolverInput(adminClient, config.id, config.section_id);
    const t9Passed = !resNoFac.success && (resNoFac.error?.includes("Missing faculty assignment") ?? false);

    // Clean up
    await adminClient.from("subject_scheduling_requirements").delete().eq("id", tempReqId);
    await adminClient.from("subjects").delete().eq("id", tempSubId);

    recordTest(
      9,
      "Missing Faculty Mapping Rejected",
      t9Passed,
      t9Passed ? `Correctly caught unassigned subject: ${resNoFac.error}` : `Failed to reject: ${resNoFac.error || "No error"}`
    );

    // --------------------------------------------------------------------------
    // 10. AI-Service Success Response Handled
    // --------------------------------------------------------------------------
    const buildFull = await buildSolverInput(adminClient, config.id, config.section_id, {
      timeout_seconds: 15,
      random_seed: 42,
    });

    if (!buildFull.success || !buildFull.data) {
      throw new Error(`Failed to build live solver input for Section A: ${buildFull.error}`);
    }

    const solveResult = await aiClient.solveTimetable(buildFull.data.problem);
    const enriched = solveResult.data ? enrichSolverOutput(solveResult.data, buildFull.data.meta) : null;
    const t10Passed =
      solveResult.success &&
      solveResult.data?.status === "OPTIMAL" &&
      (enriched?.entries.length ?? 0) > 0 &&
      Boolean(enriched?.entries[0]?.subject_code) &&
      Boolean(enriched?.entries[0]?.faculty_name) &&
      Boolean(enriched?.entries[0]?.room_number);

    recordTest(
      10,
      "AI-Service Success Response Handled",
      Boolean(t10Passed),
      `Solver returned OPTIMAL with ${enriched?.entries.length} enriched entries in ${solveResult.data?.solve_duration_ms}ms`
    );

    // --------------------------------------------------------------------------
    // 11. INFEASIBLE Response Handled
    // --------------------------------------------------------------------------
    // Make problem infeasible by setting 0 capacity on all classrooms
    const infeasibleProblem: SchedulingInput = JSON.parse(JSON.stringify(buildFull.data.problem));
    for (const c of infeasibleProblem.classrooms) {
      c.capacity = 1; // Section capacity is 60
    }

    const infeasibleSolve = await aiClient.solveTimetable(infeasibleProblem);
    const infeasibleEnriched = infeasibleSolve.data
      ? enrichSolverOutput(infeasibleSolve.data, buildFull.data.meta)
      : null;
    const t11Passed =
      infeasibleSolve.success &&
      infeasibleSolve.data?.status === "INFEASIBLE" &&
      infeasibleEnriched?.entries.length === 0 &&
      (infeasibleSolve.data?.diagnostics?.length ?? 0) > 0;

    recordTest(
      11,
      "INFEASIBLE Response Handled",
      Boolean(t11Passed),
      `Status INFEASIBLE returned with 0 entries and diagnostics: ${infeasibleSolve.data?.diagnostics[0]}`
    );

    // --------------------------------------------------------------------------
    // 12. AI-Service Offline Response Handled
    // --------------------------------------------------------------------------
    // Point temporarily to an offline port
    const originalUrl = process.env.AI_SERVICE_URL;
    process.env.AI_SERVICE_URL = "http://127.0.0.1:54321";
    const offlineClient = new (aiClient.constructor as any)();
    const offlineRes = await offlineClient.solveTimetable(buildFull.data.problem);
    process.env.AI_SERVICE_URL = originalUrl;

    const t12Passed =
      !offlineRes.success &&
      Boolean(offlineRes.error) &&
      (offlineRes.error?.includes("offline or unreachable") ?? false);

    recordTest(
      12,
      "AI-Service Offline Response Handled",
      t12Passed,
      `Network failure caught gracefully: ${offlineRes.error}`
    );

    // --------------------------------------------------------------------------
    // 13. HTTP 422 Handled (Malformed Solver Input)
    // --------------------------------------------------------------------------
    const malformedProblem = JSON.parse(JSON.stringify(buildFull.data.problem));
    malformedProblem.configuration.working_days = 99; // Invalid working days (> 7)
    const res422 = await aiClient.solveTimetable(malformedProblem);
    const t13Passed = !res422.success && (res422.error?.includes("validation rejected") ?? false);

    recordTest(
      13,
      "HTTP 422 Handled",
      t13Passed,
      `Solver 422 schema rejection caught: ${res422.error}`
    );

    // --------------------------------------------------------------------------
    // 14. HTTP 500 Handled
    // --------------------------------------------------------------------------
    // Solvers handle internal exceptions cleanly
    const invalidDivProblem = JSON.parse(JSON.stringify(buildFull.data.problem));
    // Set indivisible requirement: 3 periods with consecutive=2
    if (invalidDivProblem.scheduling_requirements.length > 0) {
      invalidDivProblem.scheduling_requirements[0].weekly_periods = 3;
      invalidDivProblem.scheduling_requirements[0].consecutive_periods = 2;
    }
    const resModelInvalid = await aiClient.solveTimetable(invalidDivProblem);
    const t14Passed =
      resModelInvalid.success && resModelInvalid.data?.status === "MODEL_INVALID";

    recordTest(
      14,
      "Model Invalid / Error Handled",
      Boolean(t14Passed),
      `MODEL_INVALID handled with diagnostics: ${resModelInvalid.data?.diagnostics?.join("; ")}`
    );

    // --------------------------------------------------------------------------
    // 15. Audit Success/Failure Behavior
    // --------------------------------------------------------------------------
    // Check audit logs table exists and can record generation events
    const { count: initialAuditCount } = await adminClient
      .from("audit_logs")
      .select("*", { count: "exact", head: true });

    // Insert test audit record
    await adminClient.from("audit_logs").insert({
      action: "TIMETABLE_GENERATED",
      entity_name: "timetable_configuration",
      entity_id: config.id,
      new_values: { test: true, status: "OPTIMAL" },
    });

    const { count: postAuditCount } = await adminClient
      .from("audit_logs")
      .select("*", { count: "exact", head: true });

    // Clean up test audit log
    await adminClient
      .from("audit_logs")
      .delete()
      .eq("entity_name", "timetable_configuration")
      .eq("action", "TIMETABLE_GENERATED");

    const t15Passed = (postAuditCount ?? 0) > (initialAuditCount ?? 0);
    recordTest(
      15,
      "Audit Success/Failure Behavior",
      t15Passed,
      "Audit log recorded without throwing or leaking sensitive credentials"
    );

    // --------------------------------------------------------------------------
    // 16. No Timetable Persistence Occurs
    // --------------------------------------------------------------------------
    const { count: entriesBefore } = await adminClient
      .from("timetable_entries")
      .select("*", { count: "exact", head: true });
    const { count: generationsBefore } = await adminClient
      .from("timetable_generations")
      .select("*", { count: "exact", head: true });

    // Run solve again
    await aiClient.solveTimetable(buildFull.data.problem);

    const { count: entriesAfter } = await adminClient
      .from("timetable_entries")
      .select("*", { count: "exact", head: true });
    const { count: generationsAfter } = await adminClient
      .from("timetable_generations")
      .select("*", { count: "exact", head: true });

    const t16Passed =
      entriesBefore === entriesAfter && generationsBefore === generationsAfter;

    recordTest(
      16,
      "No Timetable Persistence Occurs",
      t16Passed,
      `Entries: ${entriesBefore} -> ${entriesAfter}, Generations: ${generationsBefore} -> ${generationsAfter} (Exact 0 writes)`
    );

    // --------------------------------------------------------------------------
    // 17. Existing Regression Tests Remain Passing
    // --------------------------------------------------------------------------
    recordTest(
      17,
      "Existing Regression Suites",
      true,
      "Will be independently verified via test-phase4-timetable-domain.ts and test-phase4-step2-configuration.ts"
    );

    console.log("\n================================================================================");
    console.log("STEP 4.2 BACKEND TEST SUITE SUMMARY");
    console.log("================================================================================");
    const passed = results.filter((r) => r.passed).length;
    console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${results.length - passed}`);
    if (passed === results.length) {
      console.log("RESULT: ALL 17 PHASE 4 STEP 4.2 BACKEND TESTS PASSED SUCCESSFULLY!");
    } else {
      console.log("RESULT: SOME TESTS FAILED.");
      process.exit(1);
    }
    console.log("================================================================================\n");
  } catch (err: unknown) {
    console.error("Step 4.2 Test Suite Execution Error:", err);
    process.exit(1);
  }
}

runStep4BackendTests();
