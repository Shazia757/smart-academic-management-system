# Smart Academic Management System (SAMS)

> **Enterprise Academic Operations Platform with AI Timetable Optimization & Biometric Attendance**

A modern, production-quality academic management platform built for higher-education institutions. Engineered for 5th-semester delivery with a clean, extensible architectural foundation that smoothly transitions into 6th-semester advanced AI capabilities (RAG, predictive risk modeling, and automated academic advising).

---

## 🏛️ System Overview

The **Smart Academic Management System (SAMS)** integrates academic administration into a unified, secure platform:

1. **Student Management** — Full lifecycle management, department/semester/section assignments, status tracking.
2. **Faculty Management** — Workload limits, department mappings, subject specializations, availability schedules.
3. **Department & Class Management** — Structural academic hierarchy, sections, classrooms, and dedicated laboratories.
4. **Subject Management** — Credits, lecture vs. laboratory hours, weekly period specifications.
5. **AI Timetable Generator** — Hard & soft constraint satisfaction powered by Google OR-Tools CP-SAT solver.
6. **Facial Recognition Attendance** — Computer vision pipeline with configurable similarity calibration, live kiosk, and duplicate prevention.
7. **Real-time Notifications** — Timetable updates, class relocations, and attendance thresholds powered by Supabase Realtime.
8. **Attendance Analytics & Reporting** — Visual metrics via Recharts, below-threshold alerts, CSV/PDF export registers.
9. **Role-Based Access Control (RBAC)** — Strictly enforced at database level with PostgreSQL Row Level Security (RLS).
10. **Audit Logs** — Tamper-evident administrative action logging.

---

## 🏗️ Architecture & Technology Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Frontend Web App** | Next.js 15 (App Router), React 19, TypeScript | Server Components, responsive layouts, fast rendering |
| **Design System** | Tailwind CSS, shadcn/ui, Lucide Icons | Accessible, high-contrast, professional enterprise UI |
| **Database & Identity** | PostgreSQL 16, Supabase Auth, Row Level Security | Multi-role authorization, normalized relational data |
| **Realtime** | Supabase Realtime (WebSockets) | Live notifications, timetable publication events |
| **AI / ML Microservice** | Python 3.11+, FastAPI, Uvicorn | Dedicated stateless service for computational workloads |
| **Constraint Solver** | Google OR-Tools (CP-SAT) | Deterministic, constraint-based timetable scheduling |
| **Computer Vision** | OpenCV, InsightFace / FaceNet | Biometric enrollment, face detection, and similarity matching |
| **Analytics & Charts** | Recharts, scikit-learn | Visual attendance trends & predictive preparation |

---

## 📁 Repository Structure

```
smart-academic-management-system/
├── apps/
│   ├── web/                     # Next.js 15 App Router Web Application
│   │   ├── src/
│   │   │   ├── app/             # Route layouts, dashboard pages, API handlers
│   │   │   ├── components/      # UI primitives (shadcn/ui), layout, feature modules
│   │   │   ├── lib/             # Supabase clients (browser/server/admin), AI client
│   │   │   ├── server/          # Server actions, queries, Zod validators
│   │   │   └── types/           # Generated database types and interface definitions
│   │   ├── public/              # Static assets and icons
│   │   └── tailwind.config.ts   # Design tokens & color system
│   │
│   └── ai-service/              # Python FastAPI Microservice
│       ├── app/
│       │   ├── api/v1/          # Timetable, attendance, and health endpoints
│       │   ├── core/            # Config, security, calibration thresholds
│       │   └── services/        # OR-Tools solver & Face recognition pipeline
│       └── requirements.txt     # Python dependencies
│
├── supabase/
│   ├── migrations/              # PostgreSQL schema DDL, RLS policies, audit triggers
│   └── seed.sql                 # Comprehensive seed data for rapid development demo
├── docs/                        # Architecture specs, ER diagrams, API documentation
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

### 1. Web Application Setup
```bash
# Navigate to web application
cd apps/web

# Install dependencies
npm install

# Copy environment template
cp ../../.env.example .env.local
# (Configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY)

# Start Next.js development server
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 2. Python AI Microservice Setup
```bash
# In a separate terminal, navigate to ai-service
cd apps/ai-service

# Create virtual environment
python -m venv venv

# Activate virtual environment
# Windows (PowerShell):
.\venv\Scripts\Activate.ps1
# Linux/macOS:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start FastAPI server
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```
Check health endpoint at: [http://127.0.0.1:8000/health](http://127.0.0.1:8000/health) or explore Swagger docs at [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs).

### 3. Database Migration & Seed Data
Execute the SQL files located in `supabase/migrations/` in order, followed by `supabase/seed.sql` inside your Supabase SQL Editor.

---

## 🔒 Security & RBAC Principles
* **Zero Client-Side Trust**: Role-based access is validated at the database level with PostgreSQL Row Level Security (RLS) policies using `auth.uid()`.
* **Isolated Service Roles**: The Supabase service-role secret is never shipped to or imported in frontend client bundles.
* **Server-to-Server AI Communication**: All requests to the Python microservice pass through Next.js server actions authenticated with an internal API key (`X-Internal-API-Key`).
* **Configurable Biometric Thresholds**: Face similarity match and review thresholds are configurable parameters with dual thresholding.

---

## 🔮 6th-Semester Extensibility Roadmap
- **pgvector Vector Store**: Pre-structured to activate `pgvector` for syllabus document embeddings and policy queries.
- **RAG & Academic Assistant**: Pluggable LLM endpoints via the existing FastAPI gateway.
- **Academic Risk Prediction**: Historical attendance records structured as normalized feature sets for scikit-learn / XGBoost models.
