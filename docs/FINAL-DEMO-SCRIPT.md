# SAMS — Final Presentation & Project Demonstration Script

**Project**: Smart Academic Management System (SAMS)  
**Document**: 10–15 Minute Live College Project Demonstration Guide  
**Date**: September 18, 2026  
**Audience**: Project Review Committee / Evaluators / Department Faculty

---

## 1. Demonstration Overview & Pre-Flight Setup

### Environment Verification
Ensure the following services are running:
1. **Next.js Web Application**:
   ```bash
   npm run dev:web
   ```
   Active on `http://localhost:3000`.
2. **FastAPI AI Microservice**:
   ```bash
   cd apps/ai-service
   .\venv\Scripts\activate
   uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
   ```
   Active on `http://127.0.0.1:8000`.
3. **Database**: Supabase PostgreSQL connected via `apps/web/.env.local`.

### Seed Persona Credentials

| Role | Email | Password | Primary Demo Purpose |
| :--- | :--- | :--- | :--- |
| **Super Admin** | `superadmin@sams.edu` | `SamsDev#2026!` | Configuration, generation, publishing, audit logs |
| **Faculty** | `arun.kumar@sams.edu` | `SamsDev#2026!` | Availability, assigned schedule, attendance sessions |
| **Student** | `rohit.verma@student.sams.edu` | `SamsDev#2026!` | Published timetable, attendance tracking, alerts |

---

## 2. Step-by-Step Demonstration Sequence

### Demo 1: Login & Role-Based Access Control (RBAC) (Time: 1.5 mins)
1. Navigate to `http://localhost:3000/login`.
2. **Key Talking Point**: *"SAMS authenticates via Supabase Auth with HttpOnly SameSite session cookies. Passwords are never stored or logged in plain text."*
3. Enter `superadmin@sams.edu` / `SamsDev#2026!`.
4. Click **Sign In**.
5. Point out the header banner: **"Institution Operations Center"** with the **Super Administrator** role badge.
6. Highlight that the topbar and sidebar dynamically render administrative capabilities (Audit Ledger, Academic Structure, AI Monitor).

---

### Demo 2: Academic Master Data Catalog (Time: 1.5 mins)
1. Navigate to **Academic Structure** (`/academic-structure`).
2. Show the hierarchy: Academic Years (`2026-2027`), Semesters (`Semester 5`), and Sections (`Section 5-A`).
3. Navigate to **Classrooms** (`/classrooms`) and **Subjects** (`/subjects`).
4. **Key Talking Point**: *"The system enforces relational integrity across departments, lecture halls, and laboratory credit specifications. These definitions form the mathematical input bounds for our AI solver."*

---

### Demo 3: AI Timetable Configuration & Generation (Time: 2.0 mins)
1. Navigate to **Timetable Engine** -> **Generate** (`/timetable/generate`).
2. Select the cohort: `Odd Term 2026` -> `Computer Science & Engineering` -> `Section 5-A`.
3. Click **"Run Constraint Solver"**.
4. **Key Talking Point**: *"The web backend constructs a mathematical model payload and dispatches it server-to-server to our Python FastAPI microservice. Google OR-Tools CP-SAT executes constraint programming over hundreds of variables, guaranteeing that neither professors nor classrooms are double-booked."*
5. Display the generated weekly grid preview showing scheduled periods across Monday through Friday.

---

### Demo 4: Timetable Persistence & Multi-Draft History (Time: 1.5 mins)
1. Click **"Save as Draft"**.
2. Point out the success indicator and draft metadata: `Generation #1`, `Status: GENERATED`.
3. Explain that administrators can review drafts, inspect individual slots, and edit a slot in-place if an emergency override is required.
4. **Key Talking Point**: *"Draft schedules are fully persistent in PostgreSQL and survive browser reloads or server restarts. Administrators can generate multiple iterations without overwriting active schedules."*

---

### Demo 5: Atomic Timetable Publishing & Immutability Lock (Time: 2.0 mins)
1. In the draft preview, click **"Publish Timetable"**.
2. Confirm the publishing modal.
3. Observe the state transition:
   - Status badge transitions to **PUBLISHED (Green)**.
   - Lock indicator displays: **"Published & Immutable"**.
4. Attempt to edit or drag a slot: demonstrate that modification is disabled.
5. **Key Talking Point**: *"Publishing executes atomically via a PostgreSQL stored procedure (`publish_timetable_v2`). The database trigger locks published entries from modification to protect academic integrity and ensure historical auditability."*
6. Log out of the Super Admin session.

---

### Demo 6: Student Experience & Cohort Isolation (Time: 1.5 mins)
1. Sign in as the student: `rohit.verma@student.sams.edu` / `SamsDev#2026!`.
2. Observe the **"Student Academic Portal"** dashboard:
   - Live USN (`1MS24CS001`), Section (`Section 5-A`), and Attendance Rate (`92.4%`).
3. Navigate to `/timetable`:
   - Point out that the student is automatically presented with the published schedule for Section 5-A.
   - Point out that draft or unreleased timetables are strictly hidden by PostgreSQL Row Level Security.
4. Navigate to **Notifications** (`/notifications`):
   - Show the automated notification: *"Timetable Published: Section 5-A master schedule is now live."*
5. Log out.

---

### Demo 7: Faculty Teaching Workspace & Attendance Recording (Time: 2.0 mins)
1. Sign in as faculty: `arun.kumar@sams.edu` / `SamsDev#2026!`.
2. Observe the **"Faculty Teaching Hub"** showing assigned subjects and weekly teaching periods.
3. Navigate to **Attendance** (`/attendance`).
4. Select a session or click **Create Session** for `CS501 (DBMS)`:
   - Notice that the student cohort for Section 5-A is pre-populated with statuses defaulted to `PRESENT`.
5. Toggle one student to `ABSENT` and another to `LATE`.
6. Click **"Save Attendance Batch"**.
7. **Key Talking Point**: *"Attendance updates execute via an atomic database stored procedure (`save_attendance_batch_v2`). The database validates student eligibility and prevents duplicate records."*
8. Log out.

---

### Demo 8: Security Audit Ledger & Mutation Tracking (Time: 1.5 mins)
1. Sign in back as Super Admin (`superadmin@sams.edu`).
2. Navigate to **Audit Ledger** (`/audit-logs`).
3. Point out the top rows:
   - `PUBLISH_TIMETABLE` on entity `timetables`.
   - `SAVE_ATTENDANCE` on entity `attendance_sessions`.
4. Click **"Inspect"** on an entry:
   - Show the formatted JSON diff displaying previous state vs mutated state.
   - Point out that authentication tokens and passwords are automatically redacted (`[REDACTED]`).

---

### Demo 9: Security Verification & Route Tampering Defense (Time: 1.0 min)
1. Log out and sign in as student (`rohit.verma@student.sams.edu`).
2. Manually enter the URL in the browser address bar: `http://localhost:3000/audit-logs`.
3. Press Enter.
4. Demonstrate that the server immediately redirects to `/unauthorized` with a **"403 Forbidden"** access notice.
5. **Key Talking Point**: *"Hiding a button in the UI is never our security boundary. Our Next.js Server Components and PostgreSQL RLS policies evaluate permissions on every transaction."*

---

### Demo 10: Biometric Attendance Architecture Explanation (Time: 1.0 min)
1. Navigate to the Attendance session interface.
2. **Evaluator Clarification**:
   > *"The data architecture supports facial recognition via canonical enums and confidence bounds (0.0 to 1.0). In our automated server demonstration, live biometric frame acquisition requires physical webcam hardware and is classified as **BLOCKED (Hardware Dependent)**. The manual attendance fallback is fully verified and persists records to PostgreSQL."*

---

## 3. Evaluator Q&A Preparedness Tips
- If asked about conflict detection: cite `scripts/test-phase6-step5-persistence-and-publishing.ts` (`validate-01`, `validate-02`, `validate-03`).
- If asked about student privacy: explain PostgreSQL RLS policy `"Students view own attendance records"` evaluating `auth.uid()`.
- If asked about performance: explain parallel `Promise.all()` fetching on dashboards and indexed B-tree keys in PostgreSQL.
