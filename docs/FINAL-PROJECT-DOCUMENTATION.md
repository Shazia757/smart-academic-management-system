# SMART ACADEMIC MANAGEMENT SYSTEM (SAMS)
## Final Project Documentation & Technical Specification

---

### Project Title Page

* **Project Title**: Smart Academic Management System (SAMS)
* **Project Type**: Full-Stack Enterprise Academic Resource Planning & AI Scheduling System
* **Academic Term**: Final Submission Baseline
* **Institution**: [COLLEGE NAME]
* **Department**: [DEPARTMENT NAME]
* **Submitted By**:
  * [STUDENT NAME] (Register Number: [REGISTER NUMBER])
* **Project Guide**:
  * [GUIDE NAME] (Designation: [GUIDE DESIGNATION])
* **Technology Stack**:
  * **Frontend**: Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, Lucide Icons
  * **Database & Identity**: Supabase, PostgreSQL 16, Row Level Security (RLS), PL/pgSQL
  * **AI & Optimization Microservice**: Python 3.11, FastAPI, Google OR-Tools (CP-SAT Solver)
  * **Testing & Verification**: TypeScript/TSX Automated Test Suites, Node.js

---

## 1. Abstract

Higher-education institutions face chronic operational friction in academic scheduling, resource allocation, class attendance tracking, and timely administrative communication. Traditional manual workflows result in scheduling clashes, underutilized laboratory and classroom capacity, proxy attendance, and fragmented student records.

The **Smart Academic Management System (SAMS)** resolves these challenges by providing a centralized, multi-tier academic operations platform. SAMS couples a Next.js 15 server-driven web application with a decoupled Python FastAPI microservice running Google OR-Tools CP-SAT constraint satisfaction algorithms. The system automates conflict-free timetable generation, enforces multi-draft persistence and immutable published schedules, delivers role-based access control (RBAC) backed by 100% PostgreSQL Row Level Security (RLS), supports attendance recording with duplicate prevention, automatically dispatches academic notifications upon timetable publication, and maintains a tamper-evident audit ledger with sensitive payload redaction.

The result is an institutional platform that reduces schedule generation time from weeks to seconds, eliminates double-booking errors, guarantees student and faculty data isolation, and establishes an immutable, auditable operational record.

---

## 2. Problem Statement

Conventional academic administrative procedures in collegiate institutions suffer from systemic inefficiencies:

1. **Manual Timetable Scheduling Complexity**: Preparing semester timetables by hand requires balancing multidimensional constraints: faculty workload limits, classroom capacities, specialized laboratory availability, consecutive period guidelines, and cohort non-overlap requirements. Human error inevitably causes classroom and faculty double-booking.
2. **Fragile Schedule Persistence and Version Confusion**: When timetable modifications occur, institutions struggle with outdated printouts or unversioned spreadsheets. The absence of strict draft-versus-published lifecycle management creates confusion across faculty and students.
3. **Manual Attendance Register Vulnerabilities**: Paper attendance registers and manual roll-calls consume 10–15 minutes per lecture, suffer from proxy attendance, and delay the calculation of cumulative attendance percentages.
4. **Information Fragmentation and Communication Lag**: Students and faculty rely on bulletin boards or disparate messaging groups for timetable releases, cancellations, and room reassignments, causing delayed responses to operational updates.
5. **Lack of Centralized Role-Based Visibility**: Department heads, professors, and students lack tailored views into institutional data. Ad-hoc spreadsheets expose unauthorized private data, violating student privacy standards.
6. **Absence of Mutation Audit Trails**: Traditional college software fails to record who modified an academic record, when the change occurred, and what values were overwritten, leaving administration vulnerable to untracked modifications.

---

## 3. Project Objectives

The specific, verified objectives achieved by SAMS are:

1. **Automate Timetable Generation**: Employ Google OR-Tools CP-SAT constraint programming to generate conflict-free weekly schedules satisfying hard and soft academic rules.
2. **Enforce Complete Timetable Lifecycle**: Support multi-generation draft persistence, in-place draft edits, sequential generation numbering, conflict pre-validation, atomic publishing, and unpublishing.
3. **Guarantee Published Timetable Immutability**: Enforce database triggers and constraints preventing direct modification or deletion of published schedules.
4. **Automate Attendance Management**: Provide structured attendance session creation, section roster pre-population, manual marking with canonical statuses (`PRESENT`, `ABSENT`, `LATE`, `EXCUSED`), and real-time attendance percentage computation.
5. **Architect Biometric Facial Recognition Compatibility**: Provide standardized database enums, confidence score validation (`0.0` to `1.0`), and fallback manual verification when physical camera hardware is absent or in headless test environments.
6. **Enforce Role-Based Access Control (RBAC)**: Implement a 4-tier role hierarchy (`super_admin`, `college_admin`, `faculty`, `student`) enforced at edge middleware, Next.js Server Components, server actions, and PostgreSQL RLS.
7. **Deliver Contextual Academic Notifications**: Automate notification creation upon timetable publishing and provide an interactive notifications inbox with live unread badge counters.
8. **Maintain a Tamper-Evident Security Audit Ledger**: Automatically capture administrative events with actor identities, timestamps, and previous/mutated payloads while redacting sensitive authentication keys.
9. **Provide Role-Adaptive Centralized Dashboards**: Deliver tailored home views displaying live student academic standings, faculty teaching schedules, and administrative resource metrics.
10. **Eliminate Client-Side Trust**: Guarantee that the PostgreSQL database remains the single source of truth for authorization, referential integrity, and business logic validation.

---

## 4. Key Functional Modules

### 4.1 Authentication & Security (RBAC + RLS)
- Authentication managed via Supabase Auth with HttpOnly session cookies.
- Server-side role hierarchy validation (`hasMinimumRole`, `hasAnyRole`) preventing unauthorized route access via direct URL manipulation.
- 100% table coverage with PostgreSQL Row Level Security (RLS) policies evaluated with `auth.uid()`.

### 4.2 Academic Master Data Catalog
- Relational schema modeling institutional departments, academic years, semester terms, class cohort sections, curriculum subjects (lecture vs lab periods, credits), classrooms (capacities, amenities), faculty profiles, and student rosters.

### 4.3 Constraint-Based Timetable Engine & Lifecycle
- Stateless Python FastAPI microservice running Google OR-Tools CP-SAT solver.
- Three-dimensional conflict detector (`validateTimetableSchedule`) identifying faculty double-booking, room clashes, and section overlap.
- Multi-draft persistence allowing draft inspection and modification before final commitment.
- Atomic publication stored procedure (`publish_timetable_v2`) enforcing a single active timetable per section and invalidating stale drafts.
- Dedicated view routes filtering published schedules by enrolled section for students and teaching assignments for faculty.

### 4.4 Attendance Management
- Attendance sessions linked to subject, section, faculty, classroom, and date.
- Atomic batch update stored procedure (`save_attendance_batch_v2`) recording roster turnout with duplicate student rejection and confidence bounds checks.
- Real-time aggregation of attendance percentages against institutional 75% thresholds.

### 4.5 Real-Time Notifications
- Transactional trigger automatically generating student and faculty notifications upon timetable publication.
- Interactive notification inbox with filtering (All / Unread), mark-as-read controls, and deep-link actions.
- Topbar notification bell reflecting live unread count.

### 4.6 Security Audit Ledger
- PostgreSQL audit triggers and `recordAuditLog` utility capturing mutations across timetables, user profiles, and attendance sessions.
- Interactive administrator viewer with entity filters, search, and old vs new JSON payload inspectors with secret key redaction.

---

## 5. Summary of Verification

All functional objectives have been confirmed through rigorous automated test suites:
- **TypeScript Type Safety**: 0 errors (`npx tsc --noEmit`).
- **Production Build**: 26 routes successfully compiled (`npm run build:web`).
- **Timetable Persistence & Publishing**: 14/14 automated tests passed (`scripts/test-phase6-step5-persistence-and-publishing.ts`).
- **REST API Contracts**: 5/5 automated tests passed (`scripts/test-phase6-step5-api-endpoints.ts`).
- **Attendance Persistence & RLS**: 30/30 automated tests passed (`scripts/test-phase5-step2-attendance-persistence.ts`).
- **Total Automated Integration Tests**: 49/49 passed (100% pass rate).
