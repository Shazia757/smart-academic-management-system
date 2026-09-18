# SAMS — Timetable Lifecycle & Immutability Specification

**System**: Smart Academic Management System (SAMS)  
**Document**: Timetable State Machine, Lifecycle & Immutability Rules  
**Date**: September 18, 2026  
**Status**: Verified in Phase 6.5 & Phase 7

---

## 1. High-Level Timetable Lifecycle Workflow

The timetable scheduling and distribution lifecycle in SAMS operates as a strict state machine:

```text
+-----------------------+
|  1. Configure Master  |  (Academic Year, Semester, Section, Working Days, Daily Periods)
+-----------------------+
           |
           v
+-----------------------+
|  2. Generate Schedule |  (Google OR-Tools CP-SAT Constraint Satisfaction Engine)
+-----------------------+
           |
           v
+-----------------------+
|  3. Validate Engine   |  (Validate Faculty, Classroom & Section Overlaps)
+-----------------------+
           |
           v
+-----------------------+
|  4. Save Draft        |  (Persisted to public.timetable_generations with generation_number)
+-----------------------+
           |
           +---------------------------------------+
           |                                       |
           v                                       v
+-----------------------+               +-----------------------+
|  5. Retrieve Draft    |               |  6. Edit Draft Slots  | (In-Place Modifications)
+-----------------------+               +-----------------------+
           |                                       |
           +-------------------+-------------------+
                               |
                               v
                    +-----------------------+
                    |  7. Re-Validate Sched | (Verify No Clashes Introduced by Edit)
                    +-----------------------+
                               |
                               v
                    +-----------------------+
                    |  8. Publish Schedule  | (Atomic Stored Procedure: publish_timetable_v2)
                    +-----------------------+
                               |
                               v
                    +-----------------------+
                    |  9. Notify Recipients | (Transactional Alerts to Students & Faculty)
                    +-----------------------+
                               |
                               v
                    +-----------------------+
                    | 10. Cohort Views      | (Filtered Section Schedule for Students/Faculty)
                    +-----------------------+
                               |
           +-------------------+-------------------+
           |                                       |
           v                                       v
+-----------------------+               +-----------------------+
| 11. Unpublish / Revert|               | 12. Supersede/Archive | (New Published Generation
| (Revert to GENERATED) |               |  Invalidates Previous)|  Supercedes Active Schedule)
+-----------------------+               +-----------------------+
```

---

## 2. Database State Transitions & Schema Models

The timetable persistence model comprises two core relational entities:
1. `public.timetable_configurations`: Defines the operational parameters (academic year, semester, section, period structure, status).
2. `public.timetable_generations`: Contains specific solved schedule iterations and their detailed slot entries (`timetable_entries`).

### State Transition Table

| From Status | Event / Trigger | To Status | Database Action / Side Effects |
| :--- | :--- | :--- | :--- |
| `DRAFT` | Save Configuration | `DRAFT` | Initial configuration row created in `timetable_configurations`. |
| `DRAFT` | Generate & Save Draft | `GENERATED` | Insert into `timetable_generations` with `generation_number = 1`, entries inserted into `timetable_entries`. |
| `GENERATED` | Re-generate Schedule | `GENERATED` | Sequential increment: new row created with `generation_number = 2`. Stale draft remains accessible. |
| `GENERATED` | In-Place Draft Edit | `GENERATED` | Targeted slot updated in `timetable_entries` without bumping parent generation ID. |
| `GENERATED` | Call `publish_timetable_v2` | `PUBLISHED` | Atomic transition: sets `is_published = true`, `published_at = NOW()`, `status = 'PUBLISHED'`. Dispatches notifications. |
| `PUBLISHED` | Call `unpublish_timetable_v2` | `GENERATED` | Reverts `status = 'GENERATED'`, `is_published = false`. Unlocks draft editing. |
| `PUBLISHED` | Publish New Generation | `PUBLISHED` (New) | Old generation transitioned to superseded/archived; new generation atomically activated. |

---

## 3. The Core Rule: Immutability of Published Schedules

### The Inviolable Rule
> **Once a timetable generation is transitioned to `PUBLISHED` status, its schedule entries are strictly IMMUTABLE and READ-ONLY.**

### Why Immutability is Enforced
1. **Academic Integrity**: Students schedule travel, study plans, and exams around published schedules. Unannounced changes create widespread disruption.
2. **Attendance Synchronization**: Attendance sessions rely on scheduled timetable entry foreign keys. Altering a published slot corrupts historical attendance records.
3. **Auditability**: Administrative accreditation bodies require clear, unalterable historical evidence of what schedule was in effect on any given date.

### How Immutability is Enforced
1. **PostgreSQL Trigger Lock**: A database trigger (`trg_protect_published_timetable_entries`) intercepts `UPDATE` or `DELETE` statements on `timetable_entries`. If the associated configuration has `status = 'PUBLISHED'`, the transaction is aborted with an error:
   ```sql
   RAISE EXCEPTION 'Cannot modify entries of a published timetable. Unpublish the timetable first or create a new draft generation.'
   ```
2. **Server Action & API Guard**: Both `saveTimetableDraftAction` and `POST /api/timetable/drafts` verify that the target configuration is not published before executing any database mutation. If published, HTTP `409 Conflict` is returned immediately.
3. **UI State Protection**: The frontend viewer displays a solid **"Published & Immutable"** badge and disables drag-and-drop slot rescheduling controls.

---

## 4. How Schedule Revisions Must Be Handled

When an institutional schedule change is unavoidable (e.g., faculty leaves, permanent room reassignments), administrators must follow one of two verified paths:

### Method A: Unpublish, Edit, and Re-publish (Emergency Quick-Fix)
1. Administrator navigates to `/timetable`.
2. Selects **"Unpublish Timetable"**.
3. Stored procedure `unpublish_timetable_v2` executes:
   - Sets `is_published = false`.
   - Transitions configuration status back to `GENERATED`.
   - Records the unpublish action in `public.audit_logs`.
4. Administrator modifies the slots or re-runs validation.
5. Administrator clicks **"Publish Timetable"**.
6. Stored procedure re-locks the timetable and sends updated notifications.

### Method B: Generate a New Version (Recommended Institutional Practice)
1. Administrator opens the existing configuration.
2. Clicks **"Generate New Draft Iteration"**.
3. SAMS creates a new generation (`generation_number = n + 1`).
4. The existing published schedule remains live and active for students and faculty while the new draft is being prepared and validated.
5. When the new generation is published, `publish_timetable_v2` atomically supersedes the old version, records the transition in audit logs, and dispatches a notification to all stakeholders.
