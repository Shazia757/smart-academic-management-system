# Phase 4 Step 5 — Timetable Persistence and Generation History Architecture & Inspection Report

**Project:** Smart Academic Management System (SAMS)  
**Date:** September 2026  
**Status:** Pre-implementation Architecture Inspection  
**Scope:** Phase 4 Step 5: Timetable Persistence, Generation History, Draft Modeling, and Publishing Preparation  

---

## 1. Executive Summary

In Phase 4 Steps 1 through 4.3, SAMS established:
1. The timetable domain database foundation (Migration `006_timetable_domain.sql`).
2. Timetable configuration and period slot generation.
3. Decoupled OR-Tools CP-SAT optimization microservice.
4. Backend integration layer with pre-solve validation and error normalization.
5. In-memory interactive generation UI with weekly preview grid and diagnostics.

Currently, generated timetables exist purely in client-side React state. **Phase 4 Step 5** designs the transition from in-memory preview to immutable, transaction-safe database persistence with generation history tracking, draft lifecycle management, and publishing preparation.

This inspection verifies that the core tables (`timetable_generations` and `timetable_entries`) **already exist** in Supabase and currently contain zero persistent records. This document establishes the exact transactional architecture, security guards, data contracts, and failure handling required before code modifications begin.

---

## 2. Existing Schema Inventory

Supabase migration `20260910000006_timetable_domain.sql` defines all five relational tables in the timetable domain:

```
academic_years ──┐
semesters ───────┼──> timetable_configurations ──(1:N CASCADE)──> timetable_periods
class_sections ──┘         │
                           ├──(1:N RESTRICT)──> timetable_generations ──(1:N RESTRICT)──> timetable_entries
                           │                                                                     │
                           └──(1:N RESTRICT)──> subject_scheduling_requirements                 └──(1:N SET NULL)──> attendance_sessions
```

### Table 1: `public.timetable_configurations`
Stores scheduling configuration boundaries for a class section in an academic semester.

| Column | Type | Nullable | Default | Constraints / References |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key |
| `academic_year_id` | `UUID` | No | — | `REFERENCES academic_years(id) ON DELETE RESTRICT` |
| `semester_id` | `UUID` | No | — | `REFERENCES semesters(id) ON DELETE RESTRICT` |
| `section_id` | `UUID` | No | — | `REFERENCES class_sections(id) ON DELETE RESTRICT` |
| `name` | `VARCHAR(150)` | No | — | Context label |
| `description` | `TEXT` | Yes | `NULL` | Optional description |
| `working_days` | `INTEGER` | No | `6` | `CHECK (working_days BETWEEN 1 AND 7)` |
| `periods_per_day` | `INTEGER` | No | `7` | `CHECK (periods_per_day BETWEEN 1 AND 12)` |
| `period_duration_minutes` | `INTEGER` | No | `55` | `CHECK (period_duration_minutes BETWEEN 15 AND 180)` |
| `break_after_periods` | `JSONB` | Yes | `'[{"period": 4, "duration": 45, "label": "Lunch Break"}]'::jsonb` | Period break metadata |
| `generation_status` | `VARCHAR(30)` | No | `'DRAFT'` | `CHECK (generation_status IN ('DRAFT', 'GENERATING', 'GENERATED', 'PUBLISHED', 'ARCHIVED'))` |
| `is_active` | `BOOLEAN` | No | `true` | Active status toggle |
| `created_by` | `UUID` | Yes | `NULL` | `REFERENCES profiles(id) ON DELETE SET NULL` |
| `created_at` | `TIMESTAMPTZ` | No | `NOW()` | Audit timestamp |
| `updated_at` | `TIMESTAMPTZ` | No | `NOW()` | Automatically updated via trigger |

* **Unique Constraint**: `uq_tt_config_context UNIQUE (academic_year_id, semester_id, section_id, name)`

---

### Table 2: `public.timetable_periods`
Discrete scheduling slots owned by a timetable configuration.

| Column | Type | Nullable | Default | Constraints / References |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key |
| `timetable_configuration_id` | `UUID` | No | — | `REFERENCES timetable_configurations(id) ON DELETE CASCADE` |
| `day_of_week` | `INTEGER` | No | — | `CHECK (day_of_week BETWEEN 1 AND 7)` |
| `period_number` | `INTEGER` | No | — | `CHECK (period_number > 0)` |
| `start_time` | `TIME` | No | — | Start boundary |
| `end_time` | `TIME` | No | — | `CHECK (end_time > start_time)` |
| `is_break` | `BOOLEAN` | No | `false` | Non-instructional intermission flag |
| `is_active` | `BOOLEAN` | No | `true` | Active period toggle |
| `created_at` | `TIMESTAMPTZ` | No | `NOW()` | Audit timestamp |

* **Unique Constraint**: `uq_period_slot UNIQUE (timetable_configuration_id, day_of_week, period_number)`

---

### Table 3: `public.timetable_generations`
Historical tracking of solver runs and versioned generated schedules.

| Column | Type | Nullable | Default | Constraints / References |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key |
| `timetable_configuration_id` | `UUID` | No | — | `REFERENCES timetable_configurations(id) ON DELETE RESTRICT` |
| `generation_number` | `INTEGER` | No | — | `CHECK (generation_number > 0)` |
| `status` | `timetable_generation_status_enum` | No | `'PENDING'` | Values: `'PENDING'`, `'RUNNING'`, `'COMPLETED'`, `'FAILED'`, `'CANCELLED'` |
| `solver_name` | `VARCHAR(100)` | No | `'OR-Tools CP-SAT'` | Engine identifier |
| `solver_version` | `VARCHAR(50)` | Yes | `'9.8'` | Solver release version |
| `objective_score` | `NUMERIC` | Yes | `NULL` | CP-SAT optimization objective value |
| `hard_constraint_violations` | `INTEGER` | No | `0` | `CHECK (hard_constraint_violations >= 0)` |
| `soft_constraint_violations` | `INTEGER` | No | `0` | `CHECK (soft_constraint_violations >= 0)` |
| `generation_started_at` | `TIMESTAMPTZ` | Yes | `NULL` | Solver start timestamp |
| `generation_completed_at` | `TIMESTAMPTZ` | Yes | `NULL` | Solver end timestamp |
| `generated_by` | `UUID` | Yes | `NULL` | `REFERENCES profiles(id) ON DELETE SET NULL` |
| `error_message` | `TEXT` | Yes | `NULL` | Failure message if status=FAILED |
| `metadata` | `JSONB` | No | `'{}'::jsonb` | Diagnostics, timing, and solver configuration snapshot |
| `created_at` | `TIMESTAMPTZ` | No | `NOW()` | Audit timestamp |

* **Unique Constraint**: `uq_config_generation_number UNIQUE (timetable_configuration_id, generation_number)`
* **Index**: `idx_generations_config ON timetable_generations(timetable_configuration_id)`

---

### Table 4: `public.timetable_entries`
Concrete scheduled instructional sessions within a specific generation.

| Column | Type | Nullable | Default | Constraints / References |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key |
| `timetable_generation_id` | `UUID` | No | — | `REFERENCES timetable_generations(id) ON DELETE RESTRICT` |
| `section_id` | `UUID` | No | — | `REFERENCES class_sections(id) ON DELETE RESTRICT` |
| `subject_id` | `UUID` | No | — | `REFERENCES subjects(id) ON DELETE RESTRICT` |
| `faculty_id` | `UUID` | No | — | `REFERENCES faculty(id) ON DELETE RESTRICT` |
| `classroom_id` | `UUID` | No | — | `REFERENCES classrooms(id) ON DELETE RESTRICT` |
| `timetable_period_id` | `UUID` | No | — | `REFERENCES timetable_periods(id) ON DELETE RESTRICT` |
| `occurrence_index` | `INTEGER` | No | `1` | `CHECK (occurrence_index > 0)` |
| `session_type` | `subject_type_enum` | No | `'THEORY'` | Values: `'THEORY'`, `'LAB'` |
| `is_lab` | `BOOLEAN` | No | `false` | Explicit lab session flag |
| `notes` | `TEXT` | Yes | `NULL` | Session annotations |
| `created_at` | `TIMESTAMPTZ` | No | `NOW()` | Creation timestamp |

* **Conflict Protection Unique Indexes**:
  1. `uq_entries_section_period_gen UNIQUE (timetable_generation_id, section_id, timetable_period_id)`
  2. `uq_entries_faculty_period_gen UNIQUE (timetable_generation_id, faculty_id, timetable_period_id)`
  3. `uq_entries_classroom_period_gen UNIQUE (timetable_generation_id, classroom_id, timetable_period_id)`
  4. `uq_entries_subject_occurrence_gen UNIQUE (timetable_generation_id, section_id, subject_id, occurrence_index)`
* **Downstream Reference**: `attendance_sessions.timetable_entry_id REFERENCES timetable_entries(id) ON DELETE SET NULL`

---

## 3. Existing Table & Relationship Findings

1. **Both target tables exist and are verified**: `timetable_generations` and `timetable_entries` were deployed in Migration 006. Automated tests in Steps 4.2 and 4.3 confirm exact zero rows currently exist in both tables.
2. **Historical Deletion Safety**:
   - `timetable_entries.timetable_generation_id` is defined with `ON DELETE RESTRICT`. A generation cannot be deleted if child entries exist.
   - `timetable_generations.timetable_configuration_id` is defined with `ON DELETE RESTRICT`. A configuration cannot be deleted if historical generations exist.
   - Downstream attendance sessions reference `timetable_entries(id)` with `ON DELETE SET NULL`.
3. **Multi-Version Conflict Isolation**:
   All four unique clash prevention indexes include `timetable_generation_id`. This means Generation #1 and Generation #2 can assign the exact same faculty/classroom at the same period across generations without database collision, while collisions within a single generation are strictly rejected by the database.
4. **Historical Lock on Periods**:
   `generatePeriodSlotsAction` in `apps/web/src/server/actions/timetable.ts` already enforces that if `timetable_generations` exist for a configuration (`genCount > 0`), period slot regeneration is blocked to preserve period chronology.

---

## 4. Existing RLS & Authorization Findings

### RLS Policies on `timetable_generations`
* **Admin Manage**: `is_admin()` has `ALL` permissions (insert, update, delete, select).
* **Authenticated Read**: `is_admin() OR status = 'COMPLETED'`.
* **Important Gap in DB Function**: `public.is_admin()` in PostgreSQL checks `role IN ('super_admin', 'college_admin')`. It does **not** include `department_admin` at the SQL level, whereas application-level `ADMIN_ROLES` in `apps/web/src/lib/auth/roles.ts` includes `department_admin`.

### RLS Policies on `timetable_entries`
* **Admin Manage**: `is_admin()` has `ALL` permissions.
* **Role Read**:
  ```sql
  public.is_admin()
  OR faculty_id = public.current_faculty_id()
  OR section_id IN (SELECT fs.section_id FROM faculty_subjects fs WHERE fs.faculty_id = public.current_faculty_id())
  OR section_id = (SELECT s.current_section_id FROM students s WHERE s.id = public.current_student_id())
  OR section_id IN (SELECT se.section_id FROM student_enrollments se WHERE se.student_id = public.current_student_id())
  ```
* **Critical Finding Regarding Draft Isolation**:
  The existing `Read timetable entries by role` policy does **not** check whether the generation is published. If entries are inserted for a draft generation, faculty and enrolled students could technically read them via direct Supabase query if RLS is not restricted to published generations.
  * *Mitigation for Step 5*:
    - All persistence actions must execute via Server Actions using the authenticated admin client.
    - An enhancement migration should update RLS so non-admin users only read entries belonging to a `PUBLISHED` configuration/generation.

---

## 5. Existing Code Integration Points

| File | Current Role | Step 5 Integration Point |
| :--- | :--- | :--- |
| [timetable-generation.ts](file:///c:/Users/shazi/smart-academic-management-system/apps/web/src/server/actions/timetable-generation.ts) | Houses `generateTimetableAction()` | Add `saveTimetableGenerationAction()` and `getGenerationHistoryAction()` |
| [timetable-generator-client.tsx](file:///c:/Users/shazi/smart-academic-management-system/apps/web/src/components/timetable/timetable-generator-client.tsx) | Manages client UI states | Add "Save Schedule as Draft" action button, save confirmation dialog, and "History" drawer/view |
| [timetable-grid-preview.tsx](file:///c:/Users/shazi/smart-academic-management-system/apps/web/src/components/timetable/timetable-grid-preview.tsx) | Renders weekly grid | Display active generation version badge (`Draft Generation #X`) |
| [timetable-diagnostics.tsx](file:///c:/Users/shazi/smart-academic-management-system/apps/web/src/components/timetable/timetable-diagnostics.tsx) | Displays solver metrics | Display saved status and generation number when persisted |
| [database.ts](file:///c:/Users/shazi/smart-academic-management-system/apps/web/src/types/database.ts) | Declares TypeScript domain types | Contains existing `TimetableGeneration` and `TimetableEntry` interfaces |
| [timetable.ts](file:///c:/Users/shazi/smart-academic-management-system/apps/web/src/server/validators/timetable.ts) | Zod request validation | Add `SaveTimetableGenerationSchema` |

---

## 6. Identified Gaps and Risks

| Risk / Gap | Severity | Description | Recommended Solution |
| :--- | :--- | :--- | :--- |
| **Non-Atomic Batch Persistence** | High | Inserting parent generation and then 20+ entries across multiple HTTP REST calls risks orphaned records if network drops or entry constraints fail. | Implement an atomic PostgreSQL RPC function `save_timetable_generation_atomic` or server-side transactional rollback. |
| **Generation Number Race Condition** | Medium | Concurrent saves on the same configuration could attempt duplicate `generation_number`. | Compute `MAX(generation_number) + 1` atomically inside the database transaction with row-level lock. |
| **Premature Read of Draft Entries** | Medium | Non-admin users (students/faculty) could read draft entries before official publication. | Ensure `timetable_configurations.generation_status` tracks `'GENERATED'` vs `'PUBLISHED'`. Update RLS or filter by published status. |
| **Missing Direct Published Pointer** | Low | Currently, `timetable_configurations` has `generation_status: VARCHAR(30)`, but no direct FK `published_generation_id`. | Store published indicator in `timetable_generations.metadata->>'is_published'` or add `published_generation_id UUID` to `timetable_configurations`. |
| **Immutability of Historical Schedules** | Medium | Once saved to history, generations and entries must not be editable in-place. | Block updates to `timetable_entries` for completed generations. Any change requires generating and saving a new generation number. |

---

## 7. Recommended Persistence Architecture

We recommend a **Transactional RPC Architecture** backed by a typed Next.js Server Action:

```
[Browser UI: TimetableGeneratorClient]
       │
       │ 1. Admin clicks "Save Schedule (Draft)"
       ▼
[Server Action: saveTimetableGenerationAction]
       │
       │ 2. requireAnyRole(ADMIN_ROLES)
       │ 3. Zod validation of configuration_id, section_id, and entries
       │ 4. Pre-save integrity checks
       ▼
[PostgreSQL RPC: save_timetable_generation_atomic]
  BEGIN TRANSACTION;
    │ 5. Lock configuration row: FOR UPDATE
    │ 6. Compute generation_number = COALESCE(MAX(generation_number), 0) + 1
    │ 7. INSERT INTO timetable_generations (...) RETURNING id
    │ 8. Bulk INSERT INTO timetable_entries (...)
    │ 9. UPDATE timetable_configurations SET generation_status = 'GENERATED'
  COMMIT;
       │
       │ 10. Record audit log (TIMETABLE_GENERATION_SAVED)
       ▼
[Return ActionResult<{ generation_id, generation_number }>]
```

### Why Database RPC for Persistence?
1. **Guaranteed Atomicity**: If any unique constraint is violated (e.g. conflicting slot or duplicate occurrence), PostgreSQL rolls back the generation record and entries simultaneously.
2. **Concurrency Safe**: `FOR UPDATE` prevents two simultaneous saves from assigning the same `generation_number`.
3. **Bandwidth & Latency**: A single RPC call sends the entries batch and completes in < 50ms.
4. **Clean Rollback**: Eliminates compensation logic or manual cleanup in Node.js.

---

## 8. Proposed Table / Migration Changes

### Optional Migration: `007_timetable_persistence_and_rpc.sql`

```sql
-- 1. Optional helper function for atomic generation persistence
CREATE OR REPLACE FUNCTION public.save_timetable_generation_atomic(
    p_configuration_id UUID,
    p_section_id UUID,
    p_solver_name VARCHAR,
    p_solver_version VARCHAR,
    p_objective_score NUMERIC,
    p_hard_violations INTEGER,
    p_soft_violations INTEGER,
    p_solve_duration_ms NUMERIC,
    p_diagnostics JSONB,
    p_generated_by UUID,
    p_entries JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_next_gen_num INTEGER;
    v_gen_id UUID;
    v_inserted_count INTEGER;
BEGIN
    -- 1. Verify configuration exists and lock row
    PERFORM 1 FROM public.timetable_configurations 
    WHERE id = p_configuration_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Configuration not found';
    END IF;

    -- 2. Calculate next generation number
    SELECT COALESCE(MAX(generation_number), 0) + 1 
    INTO v_next_gen_num
    FROM public.timetable_generations
    WHERE timetable_configuration_id = p_configuration_id;

    -- 3. Insert generation record
    INSERT INTO public.timetable_generations (
        timetable_configuration_id,
        generation_number,
        status,
        solver_name,
        solver_version,
        objective_score,
        hard_constraint_violations,
        soft_constraint_violations,
        generation_completed_at,
        generated_by,
        metadata
    ) VALUES (
        p_configuration_id,
        v_next_gen_num,
        'COMPLETED',
        p_solver_name,
        p_solver_version,
        p_objective_score,
        p_hard_violations,
        p_soft_violations,
        NOW(),
        p_generated_by,
        jsonb_build_object(
            'solve_duration_ms', p_solve_duration_ms,
            'diagnostics', p_diagnostics,
            'section_id', p_section_id,
            'is_published', false
        )
    ) RETURNING id INTO v_gen_id;

    -- 4. Bulk insert entries from JSONB array
    INSERT INTO public.timetable_entries (
        timetable_generation_id,
        section_id,
        subject_id,
        faculty_id,
        classroom_id,
        timetable_period_id,
        occurrence_index,
        session_type,
        is_lab,
        notes
    )
    SELECT 
        v_gen_id,
        p_section_id,
        (e->>'subject_id')::UUID,
        (e->>'faculty_id')::UUID,
        (e->>'classroom_id')::UUID,
        (e->>'timetable_period_id')::UUID,
        COALESCE((e->>'occurrence_index')::INTEGER, 1),
        COALESCE((e->>'session_type')::public.subject_type_enum, 'THEORY'),
        COALESCE((e->>'is_lab')::BOOLEAN, false),
        e->>'notes'
    FROM jsonb_array_elements(p_entries) AS e;

    GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

    -- 5. Update configuration status to GENERATED
    UPDATE public.timetable_configurations
    SET generation_status = 'GENERATED',
        updated_at = NOW()
    WHERE id = p_configuration_id;

    RETURN jsonb_build_object(
        'generation_id', v_gen_id,
        'generation_number', v_next_gen_num,
        'entries_count', v_inserted_count
    );
END;
$$;
```

---

## 9. Proposed Server Action Contract

### Request Validator in `apps/web/src/server/validators/timetable.ts`

```ts
export const SaveTimetableGenerationSchema = z.object({
  configuration_id: z.string().uuid("Configuration ID must be a valid UUID"),
  section_id: z.string().uuid("Section ID must be a valid UUID"),
  solver_metrics: z.object({
    solver_name: z.string().default("OR-Tools CP-SAT"),
    solver_version: z.string().default("9.15.6755"),
    solve_duration_ms: z.number().nonnegative(),
    hard_constraint_violations: z.number().int().nonnegative(),
    soft_constraint_violations: z.number().int().nonnegative(),
    objective_score: z.number().nullable().optional(),
    diagnostics: z.array(z.string()).default([]),
  }),
  entries: z.array(
    z.object({
      subject_id: z.string().uuid(),
      faculty_id: z.string().uuid(),
      classroom_id: z.string().uuid(),
      timetable_period_id: z.string().uuid(),
      occurrence_index: z.number().int().positive(),
      session_type: z.enum(["THEORY", "LAB"]).default("THEORY"),
      is_lab: z.boolean().default(false),
      notes: z.string().nullable().optional(),
    })
  ).min(1, "Cannot save an empty timetable schedule"),
});

export type SaveTimetableGenerationInput = z.infer<typeof SaveTimetableGenerationSchema>;
```

### Server Action in `apps/web/src/server/actions/timetable-generation.ts`

```ts
export async function saveTimetableGenerationAction(
  rawInput: SaveTimetableGenerationInput
): Promise<ActionResult<{ generation_id: string; generation_number: number; entries_count: number }>>
```

### History Retrieval Action
```ts
export async function getGenerationHistoryAction(
  configurationId: string
): Promise<ActionResult<TimetableGenerationHistoryItem[]>>
```

---

## 10. Proposed Generation History UI

Add a **Generation History** tab or drawer in `/timetable/generate`:
1. **History Table**:
   - **Gen #**: Sequential badge (`Gen #1`, `Gen #2`, etc.)
   - **Date & Time**: Formatted timestamp (`Sep 11, 2026, 08:35 PM`)
   - **Author**: Administrator profile name
   - **Entries**: Total scheduled slots (`21 slots`)
   - **Solve Time**: Duration (`399.9 ms`)
   - **Status**: `DRAFT` / `COMPLETED`
   - **Actions**:
     - `View Schedule`: Loads saved entries into the weekly preview grid.
     - `Compare`: Highlights differences against another generation.
2. **Save Control**:
   - Primary button: `Save Schedule as Draft` in the preview header.
   - Triggers confirmation modal detailing the configuration, section, and total period slots.
   - Upon save: Shows success notification and adds entry to history table.

---

## 11. Draft / Published Preparation

| State | Scope | Where Stored | User Visibility |
| :--- | :--- | :--- | :--- |
| **In-Memory Preview** | Transient | React client state | Current admin user only |
| **Draft Generation** | Persistent | `timetable_generations.status = 'COMPLETED'`, `is_published = false` | All academic administrators |
| **Published Timetable** | Persistent | `timetable_configurations.generation_status = 'PUBLISHED'` | College admins, faculty, enrolled students |
| **Archived Generation** | Persistent | `timetable_configurations.generation_status = 'ARCHIVED'` | Administrators (audit/historical records only) |

* **Single Published Invariant**: A section can have at most **one** active published generation per academic term.
* **Publishing Workflow (Step 6)**: Admin inspects draft, clicks "Publish Timetable", verifies effective dates, and transitions status.

---

## 12. Rollback & Failure Strategy

1. **Pre-Save Integrity Re-check**:
   The server action validates that the referenced `configuration_id` is still active and matches the section.
2. **Transactional All-or-Nothing**:
   All database inserts execute inside a single transaction. If any entry constraint fails, zero rows are committed.
3. **Safe Audit Logging**:
   Audit logging failures (`TIMETABLE_SAVED` or `TIMETABLE_SAVE_FAILED`) are wrapped in try-catch so audit logging issues never fail the transaction.

---

## 13. Testing Strategy for Step 5

Create `scripts/test-phase4-step5-persistence.ts` covering:
1. Admin authorization check on save action.
2. Non-admin mutation blocked (faculty/student rejected).
3. Generation number sequential incrementation (`Gen #1 -> Gen #2`).
4. Atomicity check: simulated invalid foreign key rolls back entire generation.
5. Multi-version conflict isolation: saving a second generation for the same configuration succeeds without clashing.
6. History retrieval action returns generations with correct metadata and entry counts.
7. Entry placement integrity: all entries in database match solver output.
8. Historical period lock: configuration period slot regeneration remains blocked when generations exist.

---

## 14. Explicit Out-of-Scope Items for Step 5

* Publishing schedule to live students/faculty view (`status -> PUBLISHED`).
* Generating attendance sessions from timetable entries.
* Push/email notifications to faculty or students.
* Modifying the Python CP-SAT solver algorithm.
* Destructive deletion of historical generations.

---

## 15. Conclusion & Verification Readiness

* **Database readiness**: Tables `timetable_generations` and `timetable_entries` are in place with all required foreign keys, checks, and unique indexes.
* **Application readiness**: Frontend preview grid and backend solver integration are verified.
* **Next action**: Await user approval of this inspection plan before implementing the persistence migration, Server Action, and history UI.
