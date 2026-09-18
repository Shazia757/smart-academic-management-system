# Phase 6.5: Timetable Persistence & Publishing — Initial Analysis

**Project:** Smart Academic Management System (SAMS)  
**Document:** `PHASE-6-5-INITIAL-ANALYSIS.md`  
**Date:** September 17, 2026  
**Auditor:** Senior Full-Stack Architect & QA Automation Specialist  

---

## 1. Executive Summary

Phase 6.4 delivered the **Timetable Generation Preview UI**, operating in an in-memory preview mode (`Zero Database Mutations`) utilizing the Google OR-Tools CP-SAT solver running in `apps/ai-service`.

Phase 6.5 elevates the timetable system from an in-memory solver prototype to a **production-grade, database-backed timetable lifecycle system**. This encompasses saving drafts, updating draft schedules, validating multi-dimensional conflicts, publishing verified timetables, role-based timetable consumption (Student, Faculty, Admin), enforcing immutability on published schedules, unpublishing/archiving, and triggering transactional academic notifications.

---

## 2. Existing Functionality vs. Missing Functionality

### 2.1 Existing Functionality
1. **Timetable Data Models & Enums:**
   - Database tables: `timetable_configurations`, `timetable_periods`, `subject_scheduling_requirements`, `timetable_generations`, `timetable_entries`, `faculty_availability`, `classrooms`, `faculty_subjects`, `class_sections`, `subjects`.
   - Custom enums: `timetable_generation_status_enum` (`PENDING`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED`), `subject_type_enum` (`THEORY`, `LABORATORY`, `PRACTICAL`, `ELECTIVE`, `PROJECT`).
2. **Atomic Persistence RPC (`save_timetable_generation_atomic`):**
   - Located in `supabase/migrations/20260910000007_timetable_persistence_and_rpc.sql`.
   - Atomically creates a `timetable_generations` row and inserts batch `timetable_entries` with row-locking (`FOR UPDATE`).
   - Stores `is_published: false` in `metadata`.
3. **Pure Conflict Detection Engine (`validateTimetableSchedule`):**
   - In `apps/web/src/lib/timetable/timetable-validation.ts`.
   - Checks faculty double-booking, classroom double-booking, section clashes, room capacities, lab mismatches, breaks, and duplicates.
4. **Solver Integration & Server Actions:**
   - `generateTimetableAction`: In-memory generation with OR-Tools CP-SAT.
   - `saveTimetableGenerationAction`: Invokes `save_timetable_generation_atomic`.
   - `getGenerationHistoryAction`: Retrieves historical generations for a configuration.
   - `getTimetableGenerationAction`: Fetches entries for a specific generation.
5. **Interactive Grid Preview UI:**
   - `TimetableGridPreview`: Supports Grid, List, Faculty, and Room views with filters.
6. **Notifications Table in Schema:**
   - `public.notifications` table exists in Supabase with `notification_type` enum (`TIMETABLE_UPDATE`, `ROOM_CHANGE`, `SYSTEM`, etc.).

### 2.2 Missing Functionality (Gaps to Implement)
1. **Publishing Workflow & Action:**
   - No `publishTimetableAction` or atomic database RPC to transition a generation to `is_published = true`.
   - No mechanism to archive previously published generations for the same section/configuration.
   - No validation check immediately preceding publication to guarantee zero hard conflicts.
2. **Draft Editing & Mutation Control:**
   - No API or action to edit/update entries of an existing draft generation without creating a brand-new generation record.
   - No mechanism to delete an unpublished draft.
3. **Protection of Published Timetables:**
   - Published timetables must be strictly immutable against casual updates; editing must require cloning to a new draft.
4. **Unpublish / Archive Capability:**
   - No action to unpublish a schedule back to draft status or archive an old schedule.
5. **Role-Based Published Timetable Consumption View:**
   - No dedicated `/timetable` or `/timetable/view` page for Students and Faculty to view their active published timetable.
   - In the sidebar, only "Timetable Config" and "Generate Timetable" exist; no student/faculty timetable viewer route is linked.
6. **Publishing UI State in Generator:**
   - The generator UI currently displays a static banner: *"Preview Mode: In-Memory Only — Zero Database Mutations"*.
   - Needs: "Save Draft" feedback, "Publish Timetable" confirmation modal with conflict verification, published status banner with publisher info and timestamp, and disabled editing controls when viewing published schedules.
7. **Notification Dispatch upon Publishing:**
   - When a timetable is published, notifications should be inserted into `public.notifications` for all enrolled students in the section and all assigned faculty members.
8. **REST API Endpoints:**
   - Standardized REST endpoints under `/api/timetable/` for draft CRUD, publishing, unpublishing, and role-filtered retrieval.

---

## 3. Database Changes Required

### 3.1 Schema Migration (`20260910000010_timetable_publishing_and_lifecycle.sql`)
1. **Explicit Columns on `public.timetable_generations`:**
   - `is_published BOOLEAN NOT NULL DEFAULT false`
   - `published_at TIMESTAMPTZ`
   - `published_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL`
   - `archived_at TIMESTAMPTZ`
   - Index: `idx_timetable_generations_published ON public.timetable_generations(timetable_configuration_id, is_published)`
2. **Explicit Column on `public.timetable_configurations`:**
   - `published_generation_id UUID REFERENCES public.timetable_generations(id) ON DELETE SET NULL`
3. **Database Stored Procedures / RPCs:**
   - `public.publish_timetable_generation_atomic(p_generation_id UUID, p_notify BOOLEAN DEFAULT true)`
     - Validates administrator role (`is_timetable_admin()`).
     - Locks generation and configuration `FOR UPDATE`.
     - Archives any existing published generation for that configuration/section.
     - Updates generation: `is_published = true, published_at = NOW(), published_by = auth.uid()`.
     - Updates configuration: `generation_status = 'PUBLISHED', published_generation_id = p_generation_id, updated_at = NOW()`.
     - Inserts `public.notifications` rows for section students and assigned faculty with `type = 'TIMETABLE_UPDATE'`.
     - Emits audit log event `PUBLISH_TIMETABLE`.
   - `public.unpublish_timetable_generation_atomic(p_generation_id UUID)`
     - Reverts generation to `is_published = false, archived_at = NOW()`.
     - Reverts configuration to `generation_status = 'GENERATED', published_generation_id = NULL`.
     - Emits audit log event `UNPUBLISH_TIMETABLE`.
   - `public.delete_timetable_generation_atomic(p_generation_id UUID)`
     - Rejects deletion if generation is published.
     - Cascades deletion of entries for unpublished draft generations.

---

## 4. API & Backend Changes Required

### 4.1 Server Actions (`apps/web/src/server/actions/timetable-generation.ts`)
- `publishTimetableAction(generationId: string)`
- `unpublishTimetableAction(generationId: string)`
- `deleteTimetableGenerationAction(generationId: string)`
- `updateTimetableDraftAction(input: UpdateTimetableDraftInput)`
- `getPublishedTimetableAction(query: { section_id?: string; faculty_id?: string })`

### 4.2 Data Service (`apps/web/src/server/services/timetable-data.ts`)
- `fetchPublishedTimetableForSection(supabase, sectionId)`
- `fetchPublishedTimetableForFaculty(supabase, facultyId)`
- `fetchPublishedTimetableForStudent(supabase, studentId)`

### 4.3 REST API Routes (`apps/web/src/app/api/timetable/`)
- `GET /api/timetable/drafts` — List visible drafts with role restrictions
- `GET /api/timetable/drafts/[id]` — Retrieve specific draft schedule
- `POST /api/timetable/drafts` — Save new draft schedule
- `PUT /api/timetable/drafts/[id]` — Update existing draft entries
- `DELETE /api/timetable/drafts/[id]` — Delete draft (fails if published)
- `POST /api/timetable/publish` — Publish draft with conflict verification
- `POST /api/timetable/unpublish` — Unpublish / archive published timetable
- `GET /api/timetable/published` — Query published timetable for current student, faculty, or section

---

## 5. Frontend Changes Required

1. **`apps/web/src/components/timetable/timetable-generator-client.tsx`:**
   - Add "Save Draft" modal and action with live backend persistence.
   - Add "Publish Timetable" dialog with pre-publish conflict validation.
   - Add published status badge, publisher metadata, and timestamp.
   - Add "Lock" mode (read-only view) when inspecting a published timetable.
   - Add History drawer action buttons: "View", "Publish", "Archive", "Delete Draft".
2. **New Published Schedule View Page (`apps/web/src/app/(dashboard)/timetable/page.tsx`):**
   - Canonical route `/timetable` accessible to Students, Faculty, and Admins.
   - Automatically resolves context:
     - Student -> loads their current section's published timetable.
     - Faculty -> loads their assigned teaching slots across sections.
     - Admin -> dropdown to view any section or faculty published timetable.
   - Empty state when no timetable is published yet.
3. **Sidebar Update (`apps/web/src/components/layout/sidebar.tsx`):**
   - Add "View Timetable" (`/timetable`) navigation link visible to all authenticated roles.

---

## 6. Known Risks & Mitigation

| Risk | Impact | Mitigation Strategy |
| :--- | :--- | :--- |
| **Race Condition on Concurrent Publish** | Multiple admins could attempt to publish different drafts simultaneously | Use Postgres `SELECT ... FOR UPDATE` row locks inside the atomic RPC to serialize status transitions. |
| **Tampering with Published Schedules** | Published timetables altered while classes are underway | Enforce immutability in both database RPC and Server Actions: any mutation to a published generation is rejected with an error. |
| **Publishing with Unresolved Conflicts** | Broken schedule exposed to students and faculty | Pre-publish backend validation re-runs `validateTimetableSchedule` before executing the publish transaction. If any HARD conflict exists, transaction aborts. |
| **Notification Flooding or Failure** | Database failure if hundreds of notifications fail | Dispatch notifications within the same database transaction, targeting only actively enrolled students in the section. |
| **Backward Compatibility with Phase 6.4 Tests** | Existing in-memory preview actions or tests might expect preview behavior | Preserve `generateTimetableAction` in-memory preview return value; save/publish is an explicit user opt-in step. |
