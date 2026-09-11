# SAMS — Phase 4 Step 3: OR-Tools CP-SAT Solver Service

## 1. Overview & Architectural Scope

Phase 4 Step 3 provides the pure algorithmic scheduling core for the Smart Academic Management System (SAMS). It builds a high-performance, deterministic Constraint Programming satisfaction engine using **Google OR-Tools CP-SAT**, wrapped in a thin, decoupled **FastAPI** microservice and strongly typed with **Pydantic v2**.

> [!IMPORTANT]
> Phase 4 Step 3 provides the foundational CP-SAT scheduling engine. Database orchestration, timetable persistence, advanced soft constraints, optimization preferences, publishing, and UI integration are deferred to later phases.

### Scope Lock & Strict Boundaries
* **Pure In-Memory Model**: The solver operates entirely in-memory on typed Pydantic structures. It makes **zero** database queries, executes **zero** database writes, and requires **no** Supabase keys or network connectivity.
* **Pure Functional Boundary**:
  $$\text{Typed SchedulingInput} \longrightarrow \text{TimetableSolver} \longrightarrow \text{CP-SAT Engine} \longrightarrow \text{Typed SchedulingOutput}$$
* **Thin HTTP Adapter**: The FastAPI endpoint (`POST /api/v1/timetable/solve`) acts exclusively as an HTTP serialization adapter.
* **Decoupled Python Tests**: The `TimetableSolver` and independent `validate_solver_result` are directly callable from Python test suites without starting the web server or network stack.

---

## 2. Pydantic v2 Typed Boundary

The domain models extend Phase 4 Step 1/Step 2 schemas in `apps/ai-service/app/schemas/timetable.py`:

### Input Schema (`SchedulingInputSchema`)
* `configuration`: `TimetableConfigSchema` containing academic metadata (`academic_year_id`, `semester_id`, `section_id`, `working_days`, `periods_per_day`).
* `periods`: `List[PeriodSlotSchema]` containing period slots (`id`, `day_of_week`, `period_number`, `start_time`, `end_time`, `is_break`, `is_active`).
* `sections`: `List[SectionSchema]` (`id`, `name`, `capacity`, etc.).
* `subjects`: `List[SubjectSchema]` (`id`, `code`, `name`, `subject_type`, `weekly_lecture_hours`, `weekly_lab_hours`).
* `classrooms`: `List[ClassroomSchema]` (`id`, `room_number`, `room_type`, `capacity`, `unavailable_period_ids`).
* `faculty`: `List[FacultySchema]` (`id`, `name`, `unavailable_period_ids`).
* `faculty_assignments`: `List[FacultyAssignmentSchema]` (`section_id`, `subject_id`, `faculty_id`).
* `faculty_availability`: `List[FacultyAvailabilitySchema]` optional compatibility list.
* `scheduling_requirements`: `List[SchedulingRequirementSchema]` (`id`, `section_id`, `subject_id`, `faculty_id`, `weekly_periods`, `consecutive_periods`, `requires_lab`, `max_periods_per_day`, `min_period_gap`, `is_active`).
* `solver_config`: `SolverConfigurationSchema` (`time_limit_seconds`, `num_search_workers`, `random_seed`, `log_search_progress`).

### Output Schema (`SchedulingOutputSchema`)
* `status`: `OPTIMAL | FEASIBLE | INFEASIBLE | MODEL_INVALID | UNKNOWN`
* `solver_name`: String identifier (`Google OR-Tools CP-SAT`)
* `solver_version`: Version string (`ortools==9.15.6755`)
* `solve_duration_ms`: Wall-clock solving time in milliseconds
* `hard_constraint_violations`: Number of hard constraint violations (always `0` on feasible)
* `soft_constraint_violations`: Number of soft constraint penalties
* `entries`: `List[ScheduledEntrySchema]` detailing:
  - `section_id`: Targeted class section
  - `subject_id`: Scheduled subject
  - `faculty_id`: Assigned faculty member
  - `classroom_id`: Assigned classroom
  - `timetable_period_id`: Assigned period slot
  - `occurrence_index`: Deterministic index ($1 \dots N$ across the week)
  - `session_type`: `THEORY` or `LAB`
  - `is_lab`: Boolean flag
* `diagnostics`: List of human-readable diagnostic messages explaining validation or infeasibility reasons.

---

## 3. Mathematical Model & CP-SAT Formulation

### A. Pre-solve Period Normalization & Block Decomposition
1. **Break & Inactive Exclusion**: Only periods with `is_active == True` and `is_break == False` are eligible for scheduling. Breaks (e.g. lunch or tea intermissions) are strictly eliminated prior to model variable creation.
2. **Same-Day Sequential Grouping**: For consecutive scheduling, period slots are grouped by `day_of_week` and sorted by `period_number`. Consecutive periods must satisfy:
   $$\text{period\_number}_{k+1} == \text{period\_number}_k + 1 \quad \text{within the same day}$$
   Blocks are strictly forbidden from crossing day boundaries or skipping break periods (e.g. $P3$ and $P5$ separated by lunch break $P4$ are **not** consecutive).
3. **Block Decomposition**:
   Given requirement $r$ with weekly periods $W_r$ and block size $C_r$:
   - If $W_r \pmod{C_r} \ne 0$, the problem is rejected before solving with `MODEL_INVALID` and diagnostic message:
     `"Requirement {r.id}: weekly_periods ({W}) is not divisible by consecutive_periods ({C})."`
   - Otherwise, requirement $r$ is decomposed into $B_r = W_r / C_r$ distinct blocks, indexed $b \in [0, B_r - 1]$.

### B. Boolean Decision Variables
We define Boolean candidate variables:
$$Y[r, b, k, c] \in \{0, 1\}$$
where:
* $r$: Scheduling requirement identifier
* $b$: Block index within the requirement ($0 \dots B_r - 1$)
* $k$: Starting period slot of a valid consecutive sequence of length $C_r$
* $c$: Assigned classroom

### C. Domain Reduction & Candidate Pre-Filtering
A candidate $(r, b, k, c)$ is instantiated **only** if all the following pre-conditions hold:
1. **Contiguous Slot Availability**: All periods $p \in \text{span}(k, C_r)$ belong to the same day and have strictly consecutive `period_number`s.
2. **Faculty Availability (H6)**: The designated faculty $f_r$ is available for all periods in $\text{span}(k, C_r)$ ($p.\text{id} \notin f_r.\text{unavailable\_period\_ids}$).
3. **Classroom Availability (H7)**: The classroom $c$ is available for all periods in $\text{span}(k, C_r)$ ($p.\text{id} \notin c.\text{unavailable\_period\_ids}$).
4. **Room Capacity (H8)**: The room capacity satisfies section demand: $c.\text{capacity} \ge \text{section}_r.\text{capacity}$.
5. **Laboratory Compatibility (H9)**:
   - If $r.\text{requires\_lab} == \text{True}$, $c.\text{room\_type} \in \{\text{LABORATORY}, \text{SEMINAR\_HALL}\}$.
   - If $r.\text{requires\_lab} == \text{False}$, $c.\text{room\_type} \in \{\text{CLASSROOM}, \text{LECTURE\_HALL}\}$.

If any requirement $r$ has zero candidate variables, the solver immediately detects pre-solve infeasibility and returns `INFEASIBLE` with diagnostic details without entering the CP-SAT search.

---

## 4. Hard Constraints (H1 – H9)

The solver implements and guarantees the following hard constraints:

### H1 — Exact Weekly Periods
Every block $b$ of requirement $r$ must be scheduled exactly once:
$$\sum_{k} \sum_{c} Y[r, b, k, c] = 1 \quad \forall r, \forall b \in [0, B_r - 1]$$
Since each block contains $C_r$ periods and $B_r = W_r / C_r$, this mathematically guarantees that every requirement receives exactly $W_r$ scheduled periods.

### H2 — Valid Period Slots
Only periods belonging to the active configuration and having `is_active == True` and `is_break == False` can be candidate targets.

### H3 — Section Conflict Prevention
A section cannot attend more than one class during any single period slot $p$:
$$\sum_{(r, b, k, c) \,:\, \text{section}_r = s,\, p \in \text{span}(k, C_r)} Y[r, b, k, c] \le 1 \quad \forall s, \forall p$$

### H4 — Faculty Conflict Prevention
A faculty member cannot teach more than one section during any single period slot $p$:
$$\sum_{(r, b, k, c) \,:\, \text{faculty}_r = f,\, p \in \text{span}(k, C_r)} Y[r, b, k, c] \le 1 \quad \forall f, \forall p$$

### H5 — Classroom Conflict Prevention
A classroom cannot host more than one session during any single period slot $p$:
$$\sum_{(r, b, k, c) \,:\, c = \text{room},\, p \in \text{span}(k, C_r)} Y[r, b, k, c] \le 1 \quad \forall \text{room}, \forall p$$

### H6 — Faculty Availability
Enforced via candidate pre-filtering. Any slot where faculty is unavailable generates zero variables.

### H7 — Classroom Availability
Enforced via candidate pre-filtering. Any slot where classroom is unavailable generates zero variables.

### H8 — Classroom Capacity
Enforced via candidate pre-filtering. Inadequate rooms generate zero variables.

### H9 — Laboratory Compatibility
Enforced via candidate pre-filtering based on room type matching.

---

## 5. Additional Hard Scheduling Rules

### Maximum Periods Per Day (`max_periods_per_day`)
If configured for requirement $r$, the maximum periods of that subject scheduled on any single day $d$ is strictly bounded:
$$\sum_{(b, k, c) \,:\, \text{day}(k) = d} C_r \cdot Y[r, b, k, c] \le \max(r.\text{max\_periods\_per\_day}, C_r) \quad \forall r, \forall d$$
*Note: If a requirement has $C_r = 3$ (e.g. a 3-period lab block) and default `max_periods_per_day = 2`, the solver respects the block integrity by allowing that single 3-period block rather than causing an artificial deadlock.*

### Minimum Period Gap (`min_period_gap`)
When multiple separate blocks of the same requirement are placed on the same day, they must be separated by at least `min_period_gap` intervening periods:
$$\text{start}(k_2) - \text{end}(k_1) \ge \text{min\_period\_gap} + 1$$
This prevents back-to-back scheduling of disparate lectures of the same subject on the same day unless deliberately grouped into a single block.

---

## 6. Determinism & Solver Configuration

To guarantee reproducible regression testing and predictable academic timetables:
* **Default Configuration**:
  - `random_seed = 42`
  - `num_search_workers = 1` (single worker guarantees bit-for-bit determinism across runs)
  - `time_limit_seconds = 30.0`
* **Multi-Worker Note**: When `num_search_workers > 1`, CP-SAT runs parallel portfolio search workers whose thread scheduling race conditions can produce non-deterministic assignment variations across architectures. Automated test suites and regression pipelines enforce `num_search_workers = 1`.
* **Deterministic Occurrence Indexing**: Entries are sorted deterministically by `(day_of_week, period_number, section_id, subject_id)` and assigned 1-based sequential occurrence indexes ($1 \dots W_r$) per requirement.

---

## 7. Independent Result Validator

The module `app/solver/validator.py` provides `validate_solver_result(problem, result) -> List[str]`.

To eliminate false-positive solver passes caused by formulation bugs:
* **No Shared Code**: The validator does **NOT** share candidate generators, constraint builders, or data structures with `TimetableSolver`.
* **Exhaustive Checks**:
  1. Status check (must be `OPTIMAL` or `FEASIBLE` to validate entries).
  2. Exact weekly period count per requirement.
  3. No break periods assigned.
  4. No inactive periods assigned.
  5. Section conflict check (no section in 2 places at period $p$).
  6. Faculty conflict check (no faculty in 2 places at period $p$).
  7. Classroom conflict check (no classroom hosting 2 sessions at period $p$).
  8. Faculty availability compliance.
  9. Classroom availability compliance.
  10. Room capacity compliance.
  11. Laboratory compatibility compliance.
  12. Consecutive block contiguity within the same day.
  13. Occurrence index uniqueness and sequence completeness ($1 \dots N$).

Every automated solver test asserts both `status in (OPTIMAL, FEASIBLE)` **and** `len(validate_solver_result(problem, result)) == 0`.

---

## 8. Infeasibility Diagnostics & Pre-Solve Validation

The solver rejects malformed or unresolvable scheduling requests cleanly:
* **Structured Pre-Solve Validation**:
  - Missing section, subject, faculty, or classroom referenced in requirements.
  - Divisibility mismatch ($W_r \pmod{C_r} \ne 0$).
  - Zero candidate periods or empty active period slots.
  - Returns `MODEL_INVALID` with structured diagnostic items.
* **Honest Infeasibility Reporting**:
  - Zero candidate slots for a specific requirement (e.g. all faculty slots locked).
  - All classrooms below required capacity.
  - Returns `INFEASIBLE` with diagnostic messages naming the bottleneck.
  - Guaranteed: For `INFEASIBLE`, **zero** timetable entries are returned.

---

## 9. FastAPI Endpoint Specification

* **Path**: `POST /api/v1/timetable/solve`
* **Request**: JSON payload conforming to `SchedulingInputSchema` (or `SolveTimetableRequestSchema`).
* **Response**: `200 OK` with JSON conforming to `SchedulingOutputSchema`.
* **Status Codes**:
  - `200 OK`: Valid solve execution (returns status `OPTIMAL`, `FEASIBLE`, `INFEASIBLE`, or `MODEL_INVALID` in body).
  - `422 Unprocessable Entity`: Malformed JSON or Pydantic validation failure.
  - `500 Internal Server Error`: Unexpected runtime exception.

---

## 10. Automated Test Suite

Implemented in `scripts/test-phase4-step3-solver.py`:

| Test # | Description | Criteria Verified |
| :--- | :--- | :--- |
| **Test 1** | OR-Tools CP-SAT Import | Verifies `ortools==9.15.6755` CP-SAT module imports cleanly. |
| **Test 2** | Minimal Feasible Timetable | Basic 1-requirement, 1-period scheduling verified. |
| **Test 3** | Exact Weekly Count (H1) | 5 requirements verified with exact weekly period totals. |
| **Test 4** | Section Conflict Prevention (H3) | Section has 2 subjects; solver schedules them in distinct periods. |
| **Test 5** | Faculty Conflict Prevention (H4) | Shared faculty across 2 sections; solver avoids overlap. |
| **Test 6** | Classroom Conflict Prevention (H5) | Shared classroom across 2 sections; solver schedules separate periods. |
| **Test 7** | Faculty Unavailable Slots (H6) | Faculty busy slots avoided; valid alternative selected. |
| **Test 8** | Classroom Unavailable Slots (H7) | Room busy slots avoided; valid alternative selected. |
| **Test 9** | Classroom Capacity (H8) | Section with 50 students assigned only to 60-seat room, not 30-seat room. |
| **Test 10** | Laboratory Compatibility (H9) | Lab requirement assigned to `LABORATORY`, theory to `CLASSROOM`. |
| **Test 11** | Consecutive Periods | Lab block ($C=3$) scheduled in contiguous sequence on 1 day. |
| **Test 12** | No Cross-Day Consecutive Block | Block never splits across day boundary. |
| **Test 13** | Multiple Occurrences | Requirement with $W=4, C=2$ produces 2 distinct 2-period blocks. |
| **Test 14** | Break Exclusion (H2) | Period 4 (Lunch) is never assigned. |
| **Test 15** | Infeasible Faculty Availability | All faculty periods locked; returns `INFEASIBLE` with 0 entries. |
| **Test 16** | Deterministic Output | Identical seeds produce identical timetable assignments across runs. |
| **Test 17** | Timeout / Status Handling | Constrained time limit terminates gracefully; honest status returned. |
| **Test 18** | Malformed Pydantic Input | Missing required fields caught by Pydantic v2 validation. |
| **Test 19** | Invalid Internal References | Unknown section ID caught by pre-solve reference validator. |
| **Test 20** | FastAPI Solve Endpoint | HTTP POST to `/api/v1/timetable/solve` succeeds and validates. |
| **Test 21** | FastAPI Without Supabase | Solves cleanly with zero Supabase credentials or database calls. |
| **Test 22** | Health Endpoint Regression | `/health` and `/api/v1/health` both return 200 OK. |
| **Test 23** | Phase 4 Step 1 Regression | All 14 live Supabase database tests pass. |
| **Test 24** | Phase 4 Step 2 Regression | All 18 scheduling configuration tests pass. |

---

## 11. Known Limitations & Deferred Work

* **Step 4 Deferred Work**:
  - Supabase database orchestration (fetching problem inputs from database tables).
  - Persisting solver results into `timetable_generations` and `timetable_entries`.
  - Next.js Server Actions connecting web UI to AI microservice.
  - Next.js interactive Timetable Generation dashboard.
  - Publishing workflows (`DRAFT` $\to$ `PUBLISHED`).
* **Step 5 Deferred Work**:
  - Soft optimization objectives (faculty preferred periods, student gap minimization, classroom movement minimization).
  - Biometric attendance integration, facial recognition, chatbot/RAG, and predictive analytics.
