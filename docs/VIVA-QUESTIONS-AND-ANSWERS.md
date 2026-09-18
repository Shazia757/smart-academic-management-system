# SAMS — Comprehensive Viva Voce Examination Guide

**Project**: Smart Academic Management System (SAMS)  
**Document**: 32 Technical Viva Questions & Detailed Model Answers  
**Target Audience**: Academic Project Evaluators, External Examiners & Candidates  
**Date**: September 18, 2026

---

### Q1: Why was Next.js (App Router) chosen instead of a standalone React SPA?
**Answer**: Next.js App Router provides native React Server Components (RSC) and Server Actions. This allows database queries and authorization checks to execute entirely on the server close to the database, eliminating the exposure of secret database keys to the client. Additionally, server-side rendering significantly reduces First Contentful Paint (FCP) latency and eliminates initial client-side token flickering.

---

### Q2: Why did you choose TypeScript across the entire web application?
**Answer**: TypeScript enforces static compile-time type safety. In an enterprise system with complex relational models (students, faculty, timetable slots, attendance sessions), TypeScript prevents runtime `TypeError` issues, guarantees API contract alignment between frontend and backend, and auto-completes Supabase database types generated directly from the schema.

---

### Q3: Why is Supabase used in this architecture?
**Answer**: Supabase provides an enterprise PostgreSQL 16 engine coupled with built-in identity management (Supabase Auth) and Row Level Security (RLS). It enables fine-grained row-level authorization directly in SQL using `auth.uid()`, eliminating the need to write redundant custom authentication middleware for every database query.

---

### Q4: Why PostgreSQL instead of a NoSQL database like MongoDB?
**Answer**: Academic operations are fundamentally relational and require strict ACID transaction guarantees. Entities such as class sections, classrooms, faculty allocations, and timetable slots have strong foreign key dependencies. A relational database enforces referential integrity, compound unique constraints (preventing double-booking and duplicate attendance), and supports PL/pgSQL stored procedures for atomic batch operations.

---

### Q5: What is Row Level Security (RLS) and how does it protect SAMS?
**Answer**: RLS is a PostgreSQL security feature where access control policies are evaluated per table row at the database kernel level. Even if an attacker manipulates API requests or executes direct SQL queries with a valid JWT, PostgreSQL injects policy predicates (e.g., `student_id = auth.uid()`). As a result, a student can never read or modify another student's attendance records.

---

### Q6: What is Role-Based Access Control (RBAC) and what roles exist in SAMS?
**Answer**: RBAC restricts system actions according to the authenticated user's organizational role. SAMS defines a 4-tier hierarchy:
1. `super_admin`: Full system oversight, audit logs, and master catalogs.
2. `college_admin`: Academic structure, classrooms, subjects, and timetable publishing.
3. `faculty`: Availability matrix, teaching schedules, and attendance sessions.
4. `student`: Enrolled section timetable, personal attendance history, and notifications.

---

### Q7: How does SAMS prevent unauthorized access if a user types a URL directly?
**Answer**: SAMS implements multi-layered route protection:
1. Edge Middleware (`middleware.ts`) verifies session validity and refreshes tokens.
2. Next.js Server Components call `requireRole` or `requireAnyRole`. If the user's role rank in `public.profiles` is insufficient, the server halts rendering and immediately executes a redirect to `/unauthorized` (HTTP 403) or `/login` (HTTP 401).

---

### Q8: Why is hiding a button in the UI not considered a security mechanism?
**Answer**: Hiding a UI button is merely client-side cosmetic customization. Any user can open browser developer tools to inspect code, trigger hidden forms, or issue manual HTTP `POST`/`PATCH` requests to API endpoints. True security requires server-side validation and database-level RLS policies that reject unauthorized requests regardless of the client interface.

---

### Q9: How does the AI timetable generation engine work?
**Answer**: Timetable generation is modeled as a Constraint Satisfaction Problem (CSP). The Next.js backend aggregates academic configuration constraints into a JSON payload and dispatches it server-to-server to a Python FastAPI microservice. The microservice uses Google OR-Tools CP-SAT (SAT-based constraint programming) to search for a variable assignment satisfying all hard constraints within configured time bounds.

---

### Q10: What are the hard constraints enforced during timetable generation?
**Answer**:
1. **Faculty Conflict**: A professor cannot be assigned to more than one section during the same period.
2. **Classroom Conflict**: A classroom cannot host more than one lecture/lab simultaneously.
3. **Cohort Conflict**: A class section cannot have two subjects scheduled at the same time.
4. **Curriculum Balance**: Total scheduled periods for each subject must match its weekly credit specification.
5. **Faculty Availability**: Faculty can only be scheduled during periods they marked as available.

---

### Q11: How does SAMS validate timetable conflicts outside the AI solver?
**Answer**: SAMS implements a backend validation function `validateTimetableSchedule`. It iterates through the generated slot array using three hash maps (indexed by `[faculty_id, day, period]`, `[classroom_id, day, period]`, and `[section_id, day, period]`). If any key collision occurs, it flags the exact conflicting entity, period, and day before allowing database publishing.

---

### Q12: Why are published timetables immutable?
**Answer**: Published timetables are the authoritative master schedule for the institution. If entries could be modified ad-hoc, students and faculty would experience unannounced schedule shifts, and historical attendance records tied to scheduled slots would be corrupted. Immutability guarantees that what is published remains an unalterable historical record.

---

### Q13: How is published timetable immutability enforced at the database level?
**Answer**: A PostgreSQL trigger `trg_protect_published_timetable_entries` intercepts `UPDATE` and `DELETE` commands on `public.timetable_entries`. It checks whether the parent configuration has `status = 'PUBLISHED'`. If true, the trigger throws a PL/pgSQL exception that aborts the transaction.

---

### Q14: How can an administrator modify a schedule if a legitimate change occurs?
**Answer**: SAMS provides two verified workflows:
1. **Unpublish Workflow**: An administrator explicitly executes `unpublish_timetable_v2`, reverting the status back to `GENERATED` draft state, editing the slot, and re-publishing.
2. **Versioned Generation (Recommended)**: The administrator generates a new iteration (`generation_number = 2`). The original published timetable remains active until the new version is validated and published, atomically superseding the old schedule.

---

### Q15: How does the notification system work?
**Answer**: Notifications are event-driven. When stored procedure `publish_timetable_v2` commits a timetable publication, an internal PostgreSQL loop inserts notification rows into `public.notifications` for all enrolled students and assigned faculty. Users view these notices in the `/notifications` inbox, and topbar badges display live unread counters.

---

### Q16: How is class attendance structured in the database?
**Answer**: Attendance is split into two relational tables:
1. `attendance_sessions`: Master record storing date, section, subject, faculty, classroom, and session state (`ACTIVE`, `CLOSED`, `CANCELLED`).
2. `attendance_records`: Line items storing `student_id`, `status` (`PRESENT`, `ABSENT`, `LATE`, `EXCUSED`), optional `confidence_score`, and `recognition_method`.

---

### Q17: How are duplicate attendance records prevented?
**Answer**:
1. At the database layer: a compound unique constraint `UNIQUE(session_id, student_id)` on `public.attendance_records`.
2. At the application layer: the atomic stored procedure `save_attendance_batch_v2` checks the incoming student ID array for duplicates before executing inserts.

---

### Q18: What is an atomic transaction and why is it vital for attendance?
**Answer**: An atomic transaction follows the "all-or-nothing" ACID principle: either every record in the batch is committed, or the entire transaction is rolled back if any single error occurs. In attendance, if 59 students are valid and 1 student payload is corrupt, committing a partial roll-call would corrupt class statistics. Atomicity guarantees ledger consistency.

---

### Q19: What is a PostgreSQL Remote Procedure Call (RPC) / Stored Procedure?
**Answer**: An RPC is a pre-compiled SQL/PL/pgSQL function stored and executed directly inside the database server. SAMS uses RPCs (e.g., `publish_timetable_v2`, `save_attendance_batch_v2`) to bundle multi-step operations into a single round-trip transaction with database-level security and performance.

---

### Q20: How does facial recognition integrate with the attendance workflow?
**Answer**: The data model supports facial recognition via the canonical enum `recognition_method = 'FACIAL_RECOGNITION'` and stores a `confidence_score` (`0.0` to `1.0`). The system architecture allows camera video frames to be analyzed by the Python microservice to match facial embeddings and assign statuses automatically.

---

### Q21: What is the current verified status of facial recognition in Phase 7/8?
**Answer**: In automated test and server environments without physical optical webcams, live biometric video stream capture is classified as **BLOCKED (Hardware Dependent)**. SAMS maintains an active, fully verified manual attendance fallback that persists records, validates duplicates, and computes percentages in PostgreSQL.

---

### Q22: What does the Security Audit Ledger provide?
**Answer**: The audit ledger (`public.audit_logs`) records all administrative mutations across timetables, user profiles, and attendance sessions. Each entry captures the actor (`user_id`), action name (`PUBLISH_TIMETABLE`, `CREATE_STUDENT`), target entity, timestamp, IP address, and old vs new JSON values.

---

### Q23: How does SAMS prevent sensitive data from leaking into audit logs?
**Answer**: The `recordAuditLog` server action sanitizes JSON payloads against a strict key blacklist: `password`, `token`, `secret`, `service_role`, `api_key`, `embedding`, and `encrypted_password`. Matching fields are converted to `"[REDACTED]"` before database insertion.

---

### Q24: What information does the Student Dashboard display?
**Answer**:
- Enrolled Section (e.g., `Section 5-A`) and Current Term (`Semester 5`).
- Student Roll Number and USN (`1MS24CS001`).
- Cumulative Attendance Percentage (dynamically calculated from `attendance_records`) with 75% institutional compliance badges.
- Active Enrolled Courses.
- Published Section Timetable.

---

### Q25: What information does the Faculty Dashboard display?
**Answer**:
- Department affiliation (e.g., `Computer Science & Engineering`).
- Assigned curriculum subjects from `faculty_subjects`.
- Weekly scheduled teaching load (hours/week) derived from timetable slots.
- Aggregate class attendance turnout across conducted lectures.

---

### Q26: Are dashboard metrics hardcoded?
**Answer**: No. All dashboard statistics and metrics derive dynamically from live Supabase PostgreSQL queries (`students`, `faculty`, `attendance_records`, `timetable_entries`) executed via server actions on every page request using `Promise.all()`.

---

### Q27: How is the system tested and verified?
**Answer**: SAMS is validated across 49 automated integration and regression tests:
1. `npx tsc --noEmit`: 0 TypeScript errors.
2. `npm run build:web`: 26 routes compiled in production bundle.
3. `test-phase6-step5-persistence-and-publishing.ts`: 14/14 timetable persistence tests passed.
4. `test-phase6-step5-api-endpoints.ts`: 5/5 REST API contract tests passed.
5. `test-phase5-step2-attendance-persistence.ts`: 30/30 attendance persistence and RLS tests passed.

---

### Q28: Why did automated browser CDP testing fail in Phase 7?
**Answer**: When the browser subagent connected to Chrome via Chrome DevTools Protocol (CDP), the active page target (`/faculty/availability`) encountered an unresponsive renderer thread execution loop on the client side. This caused Playwright protocol calls to exceed the 30-second timeout. The underlying routes compile cleanly in the production build and are manually verified.

---

### Q29: What environment variables are required to run the web application?
**Answer**:
- `NEXT_PUBLIC_APP_URL`: Base application URL (`http://localhost:3000`).
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Public client key (governed by RLS).
- `SUPABASE_SERVICE_ROLE_KEY`: Server-only administrative key (never exposed to client).
- `AI_SERVICE_URL`: URL of the Python microservice (`http://127.0.0.1:8000`).
- `AI_SERVICE_API_KEY`: Shared secret key for internal server-to-server calls.

---

### Q30: How does SAMS scale to support thousands of students across departments?
**Answer**:
1. **Stateless Web Tier**: Next.js runs as a stateless container that scales horizontally behind a load balancer.
2. **Database Indexing**: B-tree indexes are established on all high-cardinality foreign keys (`user_id`, `student_id`, `section_id`, `session_id`, `created_at`).
3. **Decoupled AI Solver**: Computational constraint solving runs on an isolated microservice, ensuring timetable generation does not block web request threads.

---

### Q31: What are the current project limitations?
**Answer**:
1. Live biometric facial recognition requires physical optical camera hardware and controlled lighting.
2. Automated CDP browser testing requires resolving the client-side renderer loop on the availability matrix page.
3. The solver currently optimizes one semester section at a time; cross-department whole-institution simultaneous solving is targeted for future phases.

---

### Q32: What is the 6th-Semester roadmap for SAMS?
**Answer**:
1. **pgvector RAG Knowledge Base**: Embedding institutional regulations, exam ordinances, and course syllabi for natural language student querying.
2. **Predictive Attendance Analytics**: Applying machine learning models (scikit-learn/XGBoost) to historical attendance to predict semester exam eligibility risks early.
3. **Automated Faculty Substitution**: Intelligent recommendation of available faculty when a scheduled professor requests emergency leave.
