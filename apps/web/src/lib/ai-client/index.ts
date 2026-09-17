export interface AIHealthStatus {
  status: string;
  service: string;
  version: string;
  environment: string;
  uptime_seconds: number;
  calibration: {
    match_threshold: number;
    review_threshold: number;
    detection_confidence: number;
  };
  capabilities: {
    or_tools_enabled: boolean;
    vision_enabled: boolean;
    pgvector_ready: boolean;
  };
}

// -----------------------------------------------------------------------------
// TIMETABLE SOLVER SCHEMAS (matching apps/ai-service/app/schemas/timetable.py)
// -----------------------------------------------------------------------------

export interface SolverPeriodSlotInput {
  id: string;
  day_of_week: number;
  period_number: number;
  start_time: string;
  end_time: string;
  is_break: boolean;
  is_active: boolean;
}

export interface SolverTimetableConfigInput {
  id: string;
  academic_year_id: string;
  semester_id: string;
  section_id: string;
  name: string;
  working_days: number;
  periods_per_day: number;
  period_duration_minutes: number;
  break_after_periods?: Array<{ period: number; duration: number; label: string }> | null;
}

export interface SolverSectionInput {
  id: string;
  code: string;
  name: string;
  capacity: number;
}

export interface SolverSubjectInput {
  id: string;
  code: string;
  name: string;
  credits: number;
  is_lab?: boolean;
  subject_type?: string;
  weekly_periods: number;
}

export interface SolverFacultyAssignmentInput {
  id: string;
  faculty_id: string;
  subject_id: string;
  section_id: string;
  is_primary?: boolean;
}

export interface SolverFacultyAvailabilityInput {
  faculty_id: string;
  day_of_week: number;
  period_slot?: number | null;
  period_number?: number | null;
  is_available: boolean;
  availability_status?: string;
}

export interface SolverClassroomInput {
  id: string;
  room_number: string;
  room_type: string;
  capacity: number;
  is_available?: boolean;
  unavailable_period_ids?: string[];
}

export interface SolverSchedulingRequirementInput {
  id: string;
  section_id: string;
  subject_id: string;
  faculty_id?: string | null;
  faculty_subject_assignment_id?: string | null;
  weekly_periods: number;
  consecutive_periods?: number;
  room_type?: string;
  preferred_capacity?: number | null;
  requires_lab?: boolean;
  requires_consecutive_slots?: boolean;
  preferred_days?: number[] | null;
  max_periods_per_day?: number;
  min_period_gap?: number;
  is_active?: boolean;
}

export interface SolverConfigInput {
  max_solve_time_seconds?: number;
  random_seed?: number;
  num_workers?: number;
  log_search_progress?: boolean;
}

export interface SchedulingInput {
  configuration: SolverTimetableConfigInput;
  periods: SolverPeriodSlotInput[];
  sections: SolverSectionInput[];
  subjects: SolverSubjectInput[];
  faculty_assignments: SolverFacultyAssignmentInput[];
  faculty_availability: SolverFacultyAvailabilityInput[];
  classrooms: SolverClassroomInput[];
  scheduling_requirements: SolverSchedulingRequirementInput[];
  solver_timeout_seconds?: number;
  solver_config?: SolverConfigInput | null;
}

export interface ScheduledEntryOutput {
  section_id: string;
  subject_id: string;
  faculty_id: string;
  classroom_id: string;
  timetable_period_id: string;
  occurrence_index: number;
  session_type: string;
  is_lab: boolean;
  notes?: string | null;
}

export interface ConstraintViolationOutput {
  constraint_name: string;
  severity: string;
  description: string;
  entity_id?: string | null;
}

export type SolverStatus =
  | "OPTIMAL"
  | "FEASIBLE"
  | "INFEASIBLE"
  | "TIME_LIMIT"
  | "PARTIAL"
  | "ERROR"
  | "UNKNOWN"
  | "MODEL_INVALID";

export interface SchedulingOutput {
  status: SolverStatus;
  solver_name: string;
  solver_version: string;
  objective_score?: number | null;
  solve_duration_ms: number;
  hard_constraint_violations: number;
  soft_constraint_violations: number;
  total_assigned_sessions?: number;
  total_required_sessions?: number;
  is_complete?: boolean;
  entries: ScheduledEntryOutput[];
  unassigned_sessions?: Array<{
    section_id: string;
    subject_id: string;
    faculty_id?: string;
    block_index: number;
    required_periods: number;
    reason?: string;
  }>;
  violations: ConstraintViolationOutput[];
  warnings?: string[];
  validation_errors?: string[];
  diagnostics: string[];
  error_message?: string | null;
  metadata: Record<string, unknown>;
}

class AIServiceClient {
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    this.baseUrl = process.env.AI_SERVICE_URL || "http://127.0.0.1:8000";
    this.apiKey = process.env.AI_SERVICE_API_KEY || "sams_dev_secret_internal_key_2026";
  }

  private get headers(): HeadersInit {
    return {
      "Content-Type": "application/json",
      "X-Internal-API-Key": this.apiKey,
    };
  }

  /**
   * Health check and diagnostics ping
   */
  async checkHealth(): Promise<{ online: boolean; data?: AIHealthStatus; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: "GET",
        headers: this.headers,
        cache: "no-store",
        next: { revalidate: 0 },
      });

      if (!response.ok) {
        return {
          online: false,
          error: `AI Service returned status ${response.status}: ${response.statusText}`,
        };
      }

      const data: AIHealthStatus = await response.json();
      return { online: true, data };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unable to connect to AI microservice";
      return { online: false, error: message };
    }
  }

  /**
   * Invokes the pure Google OR-Tools CP-SAT Timetable Constraint Solver microservice.
   * Safe for server-side invocation only.
   */
  async solveTimetable(
    problem: SchedulingInput,
    timeoutMs: number = 35000
  ): Promise<{
    success: boolean;
    data?: SchedulingOutput;
    error?: string;
  }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/api/v1/timetable/solve`, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify(problem),
        signal: controller.signal,
        cache: "no-store",
      });

      clearTimeout(timeoutId);

      // Handle structured responses from solver (200 OK, 409 Infeasible, 504 Timeout)
      if (response.status === 409 || response.status === 504) {
        try {
          const body: SchedulingOutput = await response.json();
          if (body && body.status) {
            return { success: true, data: body };
          }
        } catch {
          // If JSON parse fails, fall through to error handling
        }
      }

      if (!response.ok) {
        let errorDetail = `HTTP ${response.status} (${response.statusText})`;
        try {
          const errBody = await response.json();
          if (errBody?.detail) {
            if (Array.isArray(errBody.detail)) {
              errorDetail = errBody.detail
                .map((d: { msg?: string; loc?: string[] }) => d.msg || JSON.stringify(d))
                .join("; ");
            } else if (typeof errBody.detail === "string") {
              errorDetail = errBody.detail;
            }
          }
        } catch {
          // Ignore JSON parse error on non-JSON error response
        }

        if (response.status === 401 || response.status === 403) {
          return {
            success: false,
            error: `AI solver authorization failed: ${errorDetail}`,
          };
        }

        if (response.status === 422) {
          return {
            success: false,
            error: `Solver validation rejected payload: ${errorDetail}`,
          };
        }

        if (response.status >= 500) {
          return {
            success: false,
            error: `AI solver internal error: ${errorDetail}`,
          };
        }

        return {
          success: false,
          error: `AI solver request failed: ${errorDetail}`,
        };
      }

      const result: SchedulingOutput = await response.json();
      return { success: true, data: result };
    } catch (err: unknown) {
      clearTimeout(timeoutId);

      if (err instanceof Error) {
        if (err.name === "AbortError") {
          return {
            success: false,
            error: `AI solver execution timed out after ${Math.round(timeoutMs / 1000)} seconds.`,
          };
        }

        // Connection refused or network unreachable
        const message = err.message || "";
        if (
          message.includes("fetch failed") ||
          message.includes("ECONNREFUSED") ||
          message.includes("ENOTFOUND")
        ) {
          return {
            success: false,
            error: `AI Optimization Service is offline or unreachable at ${this.baseUrl}. Please verify the AI microservice is running.`,
          };
        }

        return {
          success: false,
          error: `Unable to communicate with AI solver: ${err.message}`,
        };
      }

      return {
        success: false,
        error: "An unexpected error occurred while communicating with the AI solver.",
      };
    }
  }
}

export const aiClient = new AIServiceClient();
