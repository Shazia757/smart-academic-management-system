"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAnyRole } from "@/lib/auth/session";
import { ADMIN_ROLES } from "@/lib/auth/roles";
import {
  GenerateTimetableSchema,
  GenerateTimetableInput,
} from "@/server/validators/timetable";
import { aiClient } from "@/lib/ai-client";
import {
  buildSolverInput,
  enrichSolverOutput,
} from "@/lib/timetable/timetable-solver-service";
import { recordAuditLog } from "@/server/actions/audit";
import { ActionResult } from "@/server/actions/departments";
import { GeneratedTimetableResult } from "@/types/database";

/**
 * Server Action: Generates a conflict-free timetable schedule for a section using
 * Google OR-Tools CP-SAT via the decoupled FastAPI AI Optimization microservice.
 *
 * Scope locks:
 * - Operates in-memory; does NOT write to timetable_entries or timetable_generations
 * - Enforces ADMIN_ROLES authorization
 * - Validates prerequisite domain entities before invoking solver
 * - Returns enriched, serializable schedule preview for client review
 */
export async function generateTimetableAction(
  rawInput: GenerateTimetableInput
): Promise<ActionResult<GeneratedTimetableResult>> {
  try {
    // 1. Authorization Guard
    const caller = await requireAnyRole(ADMIN_ROLES);

    // 2. Request Validation
    const validation = GenerateTimetableSchema.safeParse(rawInput);
    if (!validation.success) {
      return {
        success: false,
        error: validation.error.errors[0]?.message || "Invalid timetable generation request.",
      };
    }

    const input = validation.data;
    const supabase = await createServerSupabaseClient();

    // 3. Assemble and validate solver problem data from Supabase
    const buildRes = await buildSolverInput(
      supabase,
      input.configuration_id,
      input.section_id,
      {
        timeout_seconds: input.timeout_seconds,
        random_seed: input.random_seed,
      }
    );

    if (!buildRes.success || !buildRes.data) {
      // Safe audit failure log
      try {
        await recordAuditLog({
          action: "TIMETABLE_GENERATION_FAILED",
          entityName: "timetable_configuration",
          entityId: input.configuration_id,
          newValues: {
            reason: buildRes.error,
            section_id: input.section_id,
          },
          userId: caller.id,
        });
      } catch {
        // Audit log failures must not mask domain errors
      }

      return {
        success: false,
        error: buildRes.error || "Failed to assemble scheduling data.",
      };
    }

    const { problem, meta } = buildRes.data;

    // 4. Invoke AI Solver microservice with configured timeout (+5s buffer)
    const timeoutMs = (input.timeout_seconds + 5) * 1000;
    const solveRes = await aiClient.solveTimetable(problem, timeoutMs);

    if (!solveRes.success || !solveRes.data) {
      try {
        await recordAuditLog({
          action: "TIMETABLE_GENERATION_FAILED",
          entityName: "timetable_configuration",
          entityId: input.configuration_id,
          newValues: {
            reason: solveRes.error,
            section_id: input.section_id,
          },
          userId: caller.id,
        });
      } catch {
        // Safe swallow
      }

      return {
        success: false,
        error: solveRes.error || "Failed to solve timetable.",
      };
    }

    const solverOutput = solveRes.data;

    // 5. Transform and enrich solver result
    const enrichedResult = enrichSolverOutput(solverOutput, meta);

    // 6. Record Audit Log based on solver outcome
    try {
      if (solverOutput.status === "OPTIMAL" || solverOutput.status === "FEASIBLE") {
        await recordAuditLog({
          action: "TIMETABLE_GENERATED",
          entityName: "timetable_configuration",
          entityId: input.configuration_id,
          newValues: {
            status: solverOutput.status,
            entries_count: enrichedResult.entries.length,
            solve_duration_ms: solverOutput.solve_duration_ms,
            section_id: input.section_id,
          },
          userId: caller.id,
        });
      } else {
        await recordAuditLog({
          action: "TIMETABLE_GENERATION_INFEASIBLE",
          entityName: "timetable_configuration",
          entityId: input.configuration_id,
          newValues: {
            status: solverOutput.status,
            diagnostics: solverOutput.diagnostics,
            section_id: input.section_id,
          },
          userId: caller.id,
        });
      }
    } catch {
      // Audit failure must never fail the returned result
    }

    return {
      success: true,
      data: enrichedResult,
    };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "An unexpected server error occurred during timetable generation.";
    return {
      success: false,
      error: message,
    };
  }
}
