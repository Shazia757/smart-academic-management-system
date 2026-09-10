# Phase 4 — Timetable Domain Architecture & Database Foundation

## 1. Executive Summary

This document details the architectural foundation, relational schema, and constraint model established in **Phase 4 Step 1** for the **Smart Academic Management System (SAMS)**. 

The primary goal of this phase is to construct a normalized, timetable-ready PostgreSQL domain layer that bridges Phase 3 Academic Master Data (Departments, Academic Years, Semesters, Sections, Faculty, Classrooms, Subjects, Assignments, and Enrollments) with the upcoming **Google OR-Tools CP-SAT** constraint optimization engine.

---

## 2. Entity-Relationship Architecture

```
+------------------------+       1:N       +----------------------------+
| academic_years /       |---------------->|  timetable_configurations  |
| semesters / sections   |                 +----------------------------+
+------------------------+                               |
                                           +-------------+-------------+
                                      1:N  |                      1:N  |
                                           v                           v
                             +-------------------+       +----------------------------+
                             | timetable_periods |       | subject_scheduling_reqs    |
                             +-------------------+       +----------------------------+
                                       |                               |
                                       |                         (Constraint Inputs)
                                       |                               |
                                       |         +---------------------+
                                       |         | (Feeds OR-Tools Solver)
                                       v         v
                             +----------------------------+
                             |   timetable_generations    |
                             +----------------------------+
                                           |
                                      1:N  | (ON DELETE RESTRICT - History Protected)
                                           v
                             +----------------------------+
                             |     timetable_entries      |
                             +----------------------------+
                               |         |         |
               (Unique Section)|         |(Unique) |(Unique Room)
                               v         v         v
                      [class_sections] [faculty] [classrooms]
```

### Core Entities

1. **`timetable_configurations`**:
   - Encapsulates scheduling context for a given section, semester, and academic year.
   - Defines daily periods (`periods_per_day = 7`), working days (`working_days = 6`), slot duration (`period_duration_minutes = 55`), and break periods (`break_after_periods`).
   - Governs the generation status (`DRAFT`, `GENERATING`, `GENERATED`, `PUBLISHED`, `ARCHIVED`).

2. **`timetable_periods`**:
   - Represents discrete, addressable scheduling slots across the weekly schedule.
   - Tied directly to a configuration with `ON DELETE CASCADE`.
   - Guaranteed unique on `(timetable_configuration_id, day_of_week, period_number)`.
   - Protects against invalid periods (`CHECK (end_time > start_time)`).

3. **`subject_scheduling_requirements`**:
   - The concrete scheduling contract consumed by the constraint solver.
   - Defines total `weekly_periods`, `consecutive_periods` (e.g. 3-period lab block), `room_type` requirements (`LECTURE_HALL` vs `LABORATORY`), `preferred_capacity`, `preferred_days`, `max_periods_per_day`, and `min_period_gap`.
   - Directly links to `class_sections`, `subjects`, and `faculty_subjects`.

4. **`timetable_generations`**:
   - Immutable versioned ledger of solver optimization runs.
   - Stores `generation_number`, status (`PENDING`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED`), `solver_name`, `solver_version`, `objective_score`, hard/soft violation counts, solve timestamps, and error metadata.
   - Protected against accidental deletion (`timetable_entries` references this with `ON DELETE RESTRICT`).

5. **`timetable_entries`**:
   - Concrete, finalized scheduled slot assignment.
   - Specifies `section_id`, `subject_id`, `faculty_id`, `classroom_id`, and `timetable_period_id`.
   - Distinguishes session types (`THEORY`, `LABORATORY`, `PRACTICAL`, etc.) and multi-period occurrence indices.
   - Linked to downstream operational modules (`attendance_sessions.timetable_entry_id`).

---

## 3. Multi-Dimensional Conflict Protection

PostgreSQL-native unique indexes guarantee mathematical conflict-freedom within any single generation without preventing different generations from containing identical or updated schedules:

1. **Section Slot Conflict Prevention**:
   ```sql
   CREATE UNIQUE INDEX uq_entries_section_period_gen 
   ON public.timetable_entries (timetable_generation_id, section_id, timetable_period_id);
   ```
   *Guarantees no section can ever be scheduled for two concurrent subjects.*

2. **Faculty Slot Conflict Prevention**:
   ```sql
   CREATE UNIQUE INDEX uq_entries_faculty_period_gen 
   ON public.timetable_entries (timetable_generation_id, faculty_id, timetable_period_id);
   ```
   *Guarantees no faculty member can ever be double-booked across sections or subjects.*

3. **Classroom Slot Conflict Prevention**:
   ```sql
   CREATE UNIQUE INDEX uq_entries_classroom_period_gen 
   ON public.timetable_entries (timetable_generation_id, classroom_id, timetable_period_id);
   ```
   *Guarantees no classroom or laboratory can host concurrent sessions.*

4. **Subject Occurrence Integrity**:
   ```sql
   CREATE UNIQUE INDEX uq_entries_subject_occurrence_gen 
   ON public.timetable_entries (timetable_generation_id, section_id, subject_id, occurrence_index);
   ```
   *Guarantees that individual subject sessions cannot be accidentally duplicated within the same section schedule.*

---

## 4. Laboratory & Consecutive Period Modeling

The domain model represents specialized lab requirements flexibly without hardcoding arbitrary period lengths:

- **Laboratory Room Constraints**: Filtered via `room_type = 'LABORATORY'` and mapped to dedicated computer/network labs (`LAB-CS1`, `LAB-CS2`, etc.).
- **Consecutive Period Blocks**: `consecutive_periods` specifies the required contiguous block size (e.g. 3 consecutive periods for a 3-hour DBMS Laboratory `CSL51`).
- **Occurrence Indexing**: Each period within a lab block is tracked with an explicit `occurrence_index` (e.g., periods 1, 2, 3 of weekly allocation 3), while `is_lab = true` and `session_type = 'LABORATORY'`.
- **Validation**: Enforced at the database level via `CHECK (consecutive_periods <= weekly_periods)` and `CHECK (consecutive_periods > 0)`.

---

## 5. Security & Row-Level Security (RLS) Model

All 5 timetable tables enforce database-level Row Level Security:

| Role | Configurations | Periods | Requirements | Generations | Entries |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Super Admin / College Admin** | FULL (`ALL`) | FULL (`ALL`) | FULL (`ALL`) | FULL (`ALL`) | FULL (`ALL`) |
| **Faculty** | READ (`SELECT`) | READ (`SELECT`) | READ (`SELECT`) | READ (`COMPLETED`) | READ (Assigned or Teaching Section) |
| **Student** | READ (`SELECT`) | READ (`SELECT`) | READ (`SELECT`) | READ (`COMPLETED`) | READ (Enrolled Section Only) |
| **Anonymous** | DENIED | DENIED | DENIED | DENIED | DENIED |

---

## 6. Audit Logging & Historical Integrity

- **Historical Record Integrity**: `timetable_entries.timetable_generation_id` uses `ON DELETE RESTRICT`, preventing accidental cascade deletion from destroying historical academic schedules.
- **Audit Triggers**: All INSERT, UPDATE, and DELETE operations automatically execute `public.log_audit_event()`, capturing before/after JSONB diffs, user IDs, and timestamps in `public.audit_logs`.
- **Automated Timestamps**: `public.handle_updated_at()` updates timestamps on `timetable_configurations` and `subject_scheduling_requirements`.

---

## 7. OR-Tools CP-SAT Integration Interface

In FastAPI (`apps/ai-service/app/schemas/timetable.py`), Pydantic v2 domain schemas establish the clean input/output boundary:

```python
class SchedulingInputSchema(BaseModel):
    configuration: TimetableConfigSchema
    periods: List[PeriodSlotSchema]
    sections: List[SectionSchema]
    subjects: List[SubjectSchema]
    faculty_assignments: List[FacultyAssignmentSchema]
    faculty_availability: List[FacultyAvailabilitySchema]
    classrooms: List[ClassroomSchema]
    scheduling_requirements: List[SchedulingRequirementSchema]
    solver_timeout_seconds: int = 30
```

This ensures zero coupled business logic between Next.js and the Python optimization worker: Next.js extracts normalized database records, dispatches `SchedulingInputSchema` over HTTP, and persists the resulting `SchedulingOutputSchema` into `timetable_generations` and `timetable_entries`.
