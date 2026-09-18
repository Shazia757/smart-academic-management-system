# Smart Academic Management System (SAMS)

> **Enterprise Academic Operations Platform with AI Timetable Optimization, Attendance Lifecycle, and Security Ledger**

SAMS is a modern, production-hardened academic operations and institutional resource management platform built for higher-education colleges and universities.

---

## 🏛️ System Overview

The **Smart Academic Management System (SAMS)** integrates academic administration into a unified, secure platform:

1. **Student Management** — Full lifecycle management, cohort enrollment, USN/roll number tracking, section mapping, and academic standing.
2. **Faculty Management** — Department assignments, subject specializations, workload tracking, and weekly period availability matrices.
3. **Academic Hierarchy** — Multi-department structure, academic years, semester terms, and class cohort sections.
4. **Classrooms & Laboratories** — Room classification (Lecture Hall, Seminar Room, Research Lab), capacity constraints, and smart amenities.
5. **Curriculum Subjects** — Theory courses, practical laboratories, credit calculations, and required weekly contact periods.
6. **AI Timetable Generator** — Hard & soft constraint satisfaction powered by Google OR-Tools CP-SAT solver running on an asynchronous Python FastAPI microservice.
7. **Timetable Persistence & Publishing (Phase 6.5)** — Multi-draft persistence, automated multi-dimensional conflict detection (faculty/classroom double-booking, cohort overlap), atomic database publishing, immutability locks on published schedules, unpublishing/revert workflows, and cohort-filtered student/faculty views.
8. **Attendance Management** — Multi-role dashboards for Faculty and Students, section roster pre-population, manual marking, status tracking (PRESENT, ABSENT, LATE, EXCUSED), attendance percentages, and warning threshold indicators.
9. **Real-time Notifications & Alerts** — Transactional notification dispatch upon timetable publication, room relocations, and system notices with an interactive inbox and topbar badge integration.
10. **Security Audit Ledger** — Immutable administrative action logging powered by PostgreSQL audit triggers and redacted server actions with JSON payload inspectors.
11. **Role-Based Access Control (RBAC)** — Strictly enforced at database level with PostgreSQL Row Level Security (RLS) policies and Next.js Server Component guards.

---

## 🏗️ Architecture & Technology Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Frontend Web App** | Next.js 15 (App Router), React 19, TypeScript | Server Components, responsive layouts, fast rendering |
| **Design System** | Tailwind CSS, Radix UI primitives, Lucide Icons | Accessible, modern enterprise UI with dark/light themes |
| **Database & Identity** | PostgreSQL 16, Supabase Auth, Row Level Security | Multi-role authorization, normalized relational data, RPC stored procedures |
| **AI / ML Microservice** | Python 3.11+, FastAPI, Uvicorn | Stateless service for computational optimization workloads |
| **Constraint Solver** | Google OR-Tools (CP-SAT) | Deterministic constraint-based master timetable scheduling |
| **Security Ledger** | PostgreSQL Triggers, JSONB payloads | Immutable audit trail for administrative mutations |

---

## 📁 Repository Structure

```
smart-academic-management-system/
├── apps/
│   ├── web/                     # Next.js 15 App Router Web Application
│   │   ├── src/
│   │   │   ├── app/             # Route layouts, dashboard pages, API handlers
│   │   │   │   ├── (auth)/      # Login and authentication views
│   │   │   │   ├── (dashboard)/ # Protected dashboard modules
│   │   │   │   │   ├── academic-structure/ # Academic years, terms, sections
│   │   │   │   │   ├── attendance/         # Faculty & student attendance dashboards
│   │   │   │   │   ├── audit-logs/         # Security audit ledger viewer
│   │   │   │   │   ├── classrooms/         # Lecture halls and labs
│   │   │   │   │   ├── departments/        # Institutional departments
│   │   │   │   │   ├── faculty/            # Faculty directory & availability
│   │   │   │   │   ├── notifications/      # Real-time alerts & notification inbox
│   │   │   │   │   ├── students/           # Student directory & enrollments
│   │   │   │   │   ├── subjects/           # Curriculum subject catalog
│   │   │   │   │   └── timetable/          # Timetable solver, drafts, & publishing
│   │   │   │   └── api/         # REST API route handlers
│   │   │   ├── components/      # UI primitives, layout headers/sidebar, feature modules
│   │   │   ├── lib/             # Supabase clients (SSR, route, admin), AI client, RBAC roles
│   │   │   ├── server/          # Server actions, Zod validators, data services
│   │   │   └── types/           # Generated database types and interface definitions
│   │   ├── public/              # Static assets and icons
│   │   └── tailwind.config.ts   # Design tokens & color system
│   │
│   └── ai-service/              # Python FastAPI Microservice
│       ├── app/
│       │   ├── api/v1/          # Timetable solver & health check endpoints
│       │   ├── core/            # Config, security, API key validation
│       │   ├── schemas/         # Pydantic schemas for timetable optimization
│       │   └── solver/          # OR-Tools CP-SAT timetable optimization engine
│       └── requirements.txt     # Python dependencies
│
├── supabase/
│   └── migrations/              # PostgreSQL schema DDL, RLS policies, audit triggers, publishing RPCs
├── scripts/                     # Automated test suites & provisioning scripts
├── test-results/                # Test output evidence & logs
├── .env.example                 # Environment configuration template
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: v18+ (v20+ recommended)
- **Python**: v3.10+ (v3.11 recommended)
- **npm** or **pnpm**
- A **Supabase** project (or local Supabase CLI)

### 1. Environment Configuration
Copy `.env.example` to `apps/web/.env.local` and configure your Supabase credentials:
```bash
cp .env.example apps/web/.env.local
```

Key environment variables:
```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
AI_SERVICE_URL=http://127.0.0.1:8000
AI_SERVICE_API_KEY=sams_dev_secret_internal_key_2026
```

### 2. Database Migrations
Execute the migrations in `supabase/migrations/` sequentially against your Supabase PostgreSQL instance:
1. `20260910000001_initial_schema.sql`
2. `20260910000002_rls_policies.sql`
3. `20260910000003_audit_triggers.sql`
4. `...`
5. `20260910000010_timetable_publishing_and_lifecycle.sql`

To provision seed development accounts, run:
```bash
npx ts-node scripts/provision-seed-users.ts
```

### 3. Web Application
```bash
# Install workspace dependencies
npm install

# Start Next.js development server
npm run dev:web
```
Access the application at [http://localhost:3000](http://localhost:3000).

### 4. Python AI Optimization Microservice
```bash
cd apps/ai-service

# Create and activate virtual environment
python -m venv venv
.\venv\Scripts\Activate.ps1   # Windows
# source venv/bin/activate    # Linux/macOS

# Install dependencies
pip install -r requirements.txt

# Start FastAPI server
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```
Check health endpoint at: [http://127.0.0.1:8000/health](http://127.0.0.1:8000/health).

---

## 👥 Seed Accounts & Roles

The system is pre-configured with standardized test personas:

| Role | Email | Password | Access Scope |
| :--- | :--- | :--- | :--- |
| **Super Admin** | `superadmin@sams.edu` | `SamsDev#2026!` | Institutional administration, audit logs, AI engine, master catalogs |
| **College Admin** | `dean.cse@sams.edu` | `SamsDev#2026!` | Department administration, curriculum, timetable publishing |
| **Faculty Member** | `arun.kumar@sams.edu` | `SamsDev#2026!` | Teaching availability, class attendance recording, teaching schedules |
| **Student** | `rohit.verma@student.sams.edu` | `SamsDev#2026!` | Enrolled section timetables, attendance history, notifications |

---

## 🧪 Automated Test Commands

Run the verified test suites to validate system integrity:

```bash
# 1. TypeScript Compilation Check
npx tsc --noEmit --project apps/web/tsconfig.json

# 2. Production Web Application Build
npm run build:web

# 3. Phase 6.5 Timetable Persistence & Publishing Test Suite (14 Tests)
npx tsx scripts/test-phase6-step5-persistence-and-publishing.ts

# 4. Timetable REST API Contract Test Suite (5 Tests)
npx tsx scripts/test-phase6-step5-api-endpoints.ts

# 5. Phase 5 Attendance Persistence & RLS Test Suite (30 Tests)
npx tsx scripts/test-phase5-step2-attendance-persistence.ts
```

---

## 🔒 Security & RBAC Principles
* **Zero Client-Side Trust**: Role-based access is validated at the database level with PostgreSQL Row Level Security (RLS) policies using `auth.uid()`.
* **Isolated Service Roles**: The Supabase service-role secret is never shipped to or imported in frontend client bundles.
* **Server-to-Server AI Communication**: All requests to the Python microservice pass through Next.js server actions authenticated with an internal API key (`X-Internal-API-Key`).
* **Audit Trail Redaction**: Sensitive fields (`password`, `token`, `secret`, `service_role`, `api_key`) are automatically redacted from `public.audit_logs`.

---

## ⚠️ Known Limitations
* **Biometric Camera Hardware Testing**: Live camera frame capture and client-side face mesh detection require physical webcam video devices. In automated headless server environments, camera hardware access is marked **BLOCKED**. Manual attendance marking, roll-call verification, and attendance persistence are 100% operational.
* **Supabase Realtime WebSockets**: Automated notification generation is transactional in PostgreSQL upon timetable publishing; live browser socket subscription depends on active client connectivity.
