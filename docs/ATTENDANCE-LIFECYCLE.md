# SAMS — Attendance Lifecycle & Persistence Specification

**System**: Smart Academic Management System (SAMS)  
**Document**: Attendance Domain State Machine, RLS Isolation & Database Guarantees  
**Date**: September 18, 2026  
**Status**: Verified in Phase 5 & Phase 7

---

## 1. High-Level Attendance Lifecycle Workflow

The attendance recording, verification, and analytics pipeline in SAMS operates as follows:

```text
+-----------------------+
|  1. Initialize Session| (Faculty creates session tied to section, subject, date, room)
+-----------------------+
           |
           v
+-----------------------+
|  2. Pre-Populate Cohort (System queries enrolled student cohort, defaults to PRESENT)
+-----------------------+
           |
           v
+-----------------------+
|  3. Roll Call / Input | (Manual marking or Facial Recognition status assignment)
+-----------------------+
           |
           v
+-----------------------+
|  4. Validate Payload  | (Check valid statuses, confidence score bounds 0.0-1.0, student IDs)
+-----------------------+
           |
           v
+-----------------------+
|  5. Atomic Batch Save | (Stored Procedure: save_attendance_batch_v2 persists records)
+-----------------------+
           |
           v
+-----------------------+
|  6. Session Closure   | (Optionally locks session to prevent subsequent tampering)
+-----------------------+
           |
           +---------------------------------------+
           |                                       |
           v                                       v
+-----------------------+               +-----------------------+
|  7. Student View Log  |               |  8. Aggregate Turnout | (Live Dashboard Metrics,
|  (RLS: Own Records)   |               |                         Institutional 75% KPI)
+-----------------------+               +-----------------------+
```

---

## 2. Database Guarantees & Integrity Constraints

The attendance schema in `supabase/migrations/20260910000001_initial_schema.sql` and `20260910000002_rls_policies.sql` enforces five essential database guarantees:

### 2.1 Duplicate Record Prevention
- **Unique Constraint**: A compound unique index `UNIQUE(session_id, student_id)` on `public.attendance_records` strictly forbids inserting multiple attendance entries for the same student within a single class session.
- **Batch Deduplication**: The atomic stored procedure `save_attendance_batch_v2` validates the input array; if duplicate `student_id` entries exist in the incoming JSON payload, the entire batch transaction is aborted and rolled back.

### 2.2 Referential & Foreign-Key Integrity
- Every attendance session requires valid foreign keys referencing:
  - `academic_years(id)`
  - `class_sections(id)`
  - `subjects(id)`
  - `faculty(id)`
  - `classrooms(id)`
- Student attendance records require a foreign key referencing `students(id)` with `ON DELETE CASCADE`. Attempting to mark attendance for a non-existent student ID triggers database error code `23503` (Foreign Key Violation).

### 2.3 Row Level Security (RLS) & Cross-Tenant Isolation
- **Student Privacy**: Under policy `"Students view own attendance records"`, students can execute `SELECT` queries strictly on records where `student_id` maps to their authenticated `auth.uid()`. Cross-student attendance snooping is blocked at the database engine level.
- **Faculty Isolation**: Under policy `"Faculty view own assigned attendance sessions"`, faculty can only view and manage sessions assigned to their `faculty_id`. Faculty members cannot modify attendance records belonging to other professors' lectures.
- **Write Restrictions**: Students have zero `INSERT`, `UPDATE`, or `DELETE` permissions on `attendance_sessions` or `attendance_records`. Unauthorized write attempts by student JWTs are rejected with permission denied.

### 2.4 Canonical Status & Bounds Enforcement
- **Status Enum**: Attendance status is restricted to canonical enum values:
  - `PRESENT`
  - `ABSENT`
  - `LATE`
  - `EXCUSED`
  Any non-canonical string (e.g., `'UNKNOWN'`, `'PROXY'`) is rejected by PostgreSQL type validation (error `22P02`).
- **Confidence Score Bounds**: If a confidence score is supplied (via automated recognition), a `CHECK (confidence_score >= 0.0 AND confidence_score <= 1.0)` constraint ensures mathematically valid probabilities. Values `< 0.0` or `> 1.0` are rejected (error `22003`).

### 2.5 Atomic Batch Operations & Session State Rules
- **Atomic Mutation**: The stored procedure `save_attendance_batch_v2` executes in an atomic transaction. If any single record fails validation, zero records are committed to the database.
- **Closure Protection**: Once an attendance session is marked `status = 'CLOSED'` or `'CANCELLED'`, subsequent attempts to modify attendance records are rejected with an exception (error `P0001`), preventing post-hoc grade or attendance manipulation.
- **Audit Ledger Trigger**: Inserting or updating attendance sessions automatically fires PostgreSQL triggers that log the mutation event into `public.audit_logs`.

---

## 3. Real-Time Analytics & Threshold Calculations

- Cumulative student attendance percentage is calculated using:
  $$\text{Attendance Rate} = \left( \frac{\text{Count of PRESENT Sessions}}{\text{Total Sessions Marked}} \right) \times 100$$
- Institutional Policy: An attendance rate below **75.0%** triggers an automated visual warning badge on the student portal and informs faculty of attendance deficits.
- All metrics survive page refreshes, application rebuilds, and database restarts because they are aggregated directly from committed PostgreSQL table rows.
