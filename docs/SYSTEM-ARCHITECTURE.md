# SAMS — System Architecture & Technical Design Specification

**System**: Smart Academic Management System (SAMS)  
**Document**: Architectural Blueprint & Module Design  
**Date**: September 18, 2026  
**Status**: Final Verified Baseline

---

## 1. High-Level System Architecture

SAMS is structured as a decoupled, multi-tier enterprise architecture comprising a Next.js 15 full-stack web application, a stateless Python FastAPI microservice for algorithmic optimization, and Supabase managed PostgreSQL with Row Level Security (RLS).

```text
                                 +---------------------------------------+
                                 |         End-User Web Browsers         |
                                 |    (Admin, Faculty, Student Roles)    |
                                 +---------------------------------------+
                                                     |
                                                     | HTTPS / Secure Cookies
                                                     v
                                 +---------------------------------------+
                                 |       Next.js 15 Web Application      |
                                 |       (App Router, React 19, TS)      |
                                 +---------------------------------------+
                                    |                                 |
                     Server Actions |                     REST API    |
                     & React SSR    |                     Routes      |
                                    v                                 v
                                 +---------------------------------------+
                                 |       Server Data & Auth Layer        |
                                 |   (@supabase/ssr, Zod Validators)     |
                                 +---------------------------------------+
                                    |                                 |
               Internal Server Auth | HTTP               PostgreSQL   | Supabase Client
               (X-Internal-API-Key) | REST               Connection   | (JWT / RLS)
                                    v                                 v
+---------------------------------------+   +-------------------------------------------------+
|          Python AI Microservice       |   |               Supabase PostgreSQL 16            |
|       (FastAPI, Uvicorn, Python 3.11) |   |-------------------------------------------------|
|---------------------------------------|   | - Supabase Auth (Users, Sessions, JWTs)        |
| - Google OR-Tools CP-SAT Solver       |   | - 100% Row Level Security (RLS) Tables          |
| - Constraint Modeling Engine          |   | - PostgreSQL Stored Procedures (PL/pgSQL RPC)   |
| - Biometric Schema & Calibration      |   | - Mutation Audit Triggers & Realtime Alerts     |
+---------------------------------------+   +-------------------------------------------------+
                                                                      |
                                            +-------------------------+-------------------------+
                                            |                         |                         |
                                            v                         v                         v
                                 +---------------------+   +---------------------+   +---------------------+
                                 |  Timetable Engine   |   | Attendance Engine   |   | Notifications & Log |
                                 | - Draft Persistence |   | - Session Records   |   | - Publication Alerts|
                                 | - Conflict Detector |   | - Roster Turnout    |   | - System Notices    |
                                 | - Immutability Lock |   | - Threshold Alerts  |   | - Security Ledger   |
                                 +---------------------+   +---------------------+   +---------------------+
```

---

## 2. Actual Technology Stack

The following table reflects the verified technologies deployed in the repository:

| Layer / Domain | Technology | Exact Version | Repository Role |
| :--- | :--- | :--- | :--- |
| **Web Framework** | Next.js (App Router) | `15.1.0` | Server-rendered pages, API routes, middleware, client hydration |
| **UI Library** | React / React DOM | `19.0.0` | Component composition, virtual DOM, server action transitions |
| **Programming Language** | TypeScript | `5.7.2` | Static type safety across frontend, server actions, and tests |
| **Styling & Design System** | Tailwind CSS | `3.4.17` | Responsive layout utilities, CSS variables, dark/light themes |
| **Component Primitives** | Radix UI Slot | `1.3.3` | Accessible UI primitives, polymorphic button behaviors |
| **Iconography** | Lucide React | `0.468.0` | Standardized modern SVG UI icons |
| **Input Validation** | Zod | `3.24.1` | Schema validation for API payloads and server action parameters |
| **Database & Identity** | PostgreSQL / Supabase | `16.x` / `@supabase/ssr 0.5.2` | Relational persistence, Auth cookies, Row Level Security (RLS) |
| **Optimization Engine** | Google OR-Tools | `9.x` (CP-SAT) | Constraint Satisfaction Problem (CSP) timetable scheduler |
| **AI Microservice** | Python / FastAPI / Uvicorn | Python `3.11+` | Stateless service hosting timetable constraint solver |
| **Test Execution** | TSX / Node.js | TSX `4.x` / Node `20+` | Executing automated end-to-end integration test suites |

---

## 3. Subsystem Architecture & Data Flows

### 3.1 Authentication & Authorization Subsystem
- **Identity Provider**: Supabase Auth securely generates JWT tokens stored in HttpOnly, SameSite cookies managed by `@supabase/ssr`.
- **Role Hierarchy**: Four canonical roles defined in `apps/web/src/lib/auth/roles.ts`:
  1. `super_admin` (Rank 4)
  2. `college_admin` (Rank 3)
  3. `faculty` (Rank 2)
  4. `student` (Rank 1)
- **Multi-Level Enforcement**:
  1. *Edge Middleware* (`apps/web/src/middleware.ts`): Refreshes auth tokens and blocks unauthenticated requests to protected paths.
  2. *Server Component Guards* (`requireUser`, `requireRole`, `requireAnyRole`): Evaluates role ranks before page rendering and issues redirects to `/unauthorized`.
  3. *Server Action Guards*: Verifies `supabase.auth.getUser()` inside every server mutation independently of client state.
  4. *PostgreSQL Row Level Security (RLS)*: Evaluates `auth.uid()` directly at the database engine level, guaranteeing cross-tenant isolation even if client code is bypassed.

### 3.2 Academic Master Data Subsystem
- **Data Normalization**: Normalized relational tables in `supabase/migrations/20260910000001_initial_schema.sql`:
  - `departments`: Institutional units (e.g., Computer Science & Engineering).
  - `academic_years` & `semesters`: Temporal terms with `is_active` flags.
  - `class_sections`: Cohorts linked to a department and semester term.
  - `classrooms`: Physical spaces with capacity bounds and amenity tags.
  - `subjects`: Theory vs. practical lab classifications, credits, weekly period allocations.
  - `faculty`: Academic profiles linked to `profiles`, with department and availability constraints.
  - `students`: Student records linked to `profiles`, USN, roll number, and enrolled section.

### 3.3 Timetable Generation, Persistence & Publishing Subsystem (Phase 6.5)
- **Decoupled Engine**: Next.js constructs a mathematical constraint payload (`TimetableGenerationInput`) containing sections, subjects, classrooms, faculty availability matrices, and period bounds.
- **CP-SAT Solver**: FastAPI receives the payload authenticated via `X-Internal-API-Key`, solves the constraint satisfaction model, and returns a conflict-free schedule.
- **Draft Persistence**: Generations are stored in `timetable_generations` with sequential numbering (`generation_number`), allowing drafts to be saved, reviewed, and edited in-place.
- **Multi-Dimensional Conflict Detection**: `validateTimetableSchedule` validates faculty double-booking, classroom double-booking, and section period clashes prior to publication.
- **Atomic Publishing**: Executed via PostgreSQL stored procedure `publish_timetable_v2`:
  - Enforces atomic metadata update (`is_published = true`, `published_at = NOW()`).
  - Sets parent configuration status to `PUBLISHED`.
  - Atomically invalidates any previously published timetable for the same section.
  - Enforces published timetable immutability via database trigger lock.
  - Dispatches publication notifications to all enrolled students and assigned faculty.
- **Unpublishing & Reversion**: Stored procedure `unpublish_timetable_v2` safely reverts a published timetable back to `GENERATED` draft state.

### 3.4 Attendance Management Subsystem
- **Session Lifecycle**: Faculty initialize sessions tied to an academic year, section, subject, classroom, date, and time slot.
- **Roster Pre-population**: Cohorts enrolled in the section are automatically loaded with a default status of `PRESENT`.
- **Atomic Persistence**: Records are saved via stored procedure `save_attendance_batch_v2` with foreign key checks, duplicate student payload rejection, and confidence score bound validation (`0.0 <= score <= 1.0`).
- **Student Privacy & Isolation**: Students can query only their own attendance records (`student_id = current_student.id`). Faculty can manage only sessions assigned to them.
- **Attendance Calculation**: Dynamic percentage computation (`present / total * 100`) with visual threshold warnings (<75% institutional requirement).

### 3.5 Facial Recognition Module Architecture
- **Data Model**: Supported via canonical enum `recognition_method = 'FACIAL_RECOGNITION'` and numeric `confidence_score`.
- **Decoupled Microservice**: Designed to receive image frames, extract facial landmark vectors, and compute cosine similarity against registered embeddings.
- **Verified Environment Status**: In headless test environments without physical webcam hardware, live biometric frame capture is classified as **BLOCKED (Hardware Dependent)**. The manual roster fallback is 100% operational and verified.

### 3.6 Real-Time Notifications Subsystem
- **Event-Driven Creation**: Database transactions (such as timetable publication) automatically insert records into `public.notifications` for affected student and faculty profiles.
- **Notification Inbox**: `/notifications` dashboard page allows users to view, filter (All / Unread), and mark notifications as read.
- **Live Badge**: Topbar notification bell displays real-time unread counts queried from `getUnreadNotificationCountAction()`.

### 3.7 Security Audit Ledger Subsystem
- **Audit Triggers**: PostgreSQL triggers configured on core tables record mutations (`INSERT`, `UPDATE`, `DELETE`) into `public.audit_logs`.
- **Application Logger**: Server action `recordAuditLog` captures administrative events.
- **Sanitization & Redaction**: Automated key filter redacts sensitive fields (`password`, `token`, `secret`, `service_role`, `api_key`, `embedding`).
- **Audit Trail Viewer**: `/audit-logs` provides administrators with searchable, filterable logs and an interactive JSON diff inspector.
