# System Architecture Specification

## 1. Monorepo Architecture Overview
The Smart Academic Management System (SAMS) is designed as a modular decoupled system:

```
[Browser Clients: Admin, Faculty, Student]
                   │
                   ▼ (HTTPS)
   ┌────────────────────────────────┐
   │    Next.js 15 Web App (SSR/RSC) │
   │  - App Router Dashboard UI     │
   │  - Server Actions (Mutations)  │
   │  - Zod Request Validation      │
   │  - Supabase SSR Cookie Auth    │
   └───────┬────────────────┬───────┘
           │                │
           │ (Internal API) │ (Direct SQL + RLS)
           ▼                ▼
   ┌──────────────┐   ┌─────────────────────────────┐
   │ Python AI    │   │ Supabase Managed PostgreSQL │
   │ Microservice │   │  - Row Level Security (RLS) │
   │ (FastAPI)    │   │  - Audit Triggers           │
   │  - OR-Tools  │   │  - Biometric Embeddings     │
   │  - OpenCV    │   │  - pgvector Ready           │
   │  - ArcFace   │   │  - Realtime CDC Engine      │
   └──────────────┘   └─────────────────────────────┘
```

## 2. Security & Network Topology
- **Direct Client to AI Service Prohibited**: The client browser cannot directly call the Python FastAPI microservice. All AI requests (Timetable Generation, Live Face Verification) are mediated through Next.js Server Actions or Route Handlers.
- **Server-to-Server Auth**: Requests from Next.js to FastAPI carry the `X-Internal-API-Key` header matching the shared secret in `.env`.
- **Row Level Security (RLS)**: Even if a malicious client attempts to modify request parameters, PostgreSQL verifies `auth.uid()` against policies in `supabase/migrations/20260910000002_rls_policies.sql`.

## 3. Face Recognition Calibration Architecture
Face recognition is non-trivial and environment-sensitive. SAMS does not hardcode static thresholds:
- **`FACE_SIMILARITY_MATCH_THRESHOLD`**: Defaults to 0.65. Any cosine similarity at or above this threshold is confirmed as `PRESENT`.
- **`FACE_SIMILARITY_REVIEW_THRESHOLD`**: Defaults to 0.45. Any score between 0.45 and 0.65 is marked as `REVIEW_REQUIRED` / Flagged for faculty verification.
- **`< 0.45`**: Denied as unknown face.
These values are surfaced in microservice settings and can be calibrated per institution camera hardware.

## 4. Timetable Constraint Formulation (Google OR-Tools)
- **Model**: `cp_model.CpModel()`
- **Variables**: Binary decision variables $X_{s, c, f, r, d, p} \in \{0, 1\}$ indicating whether subject $s$ for class section $c$ is taught by faculty $f$ in room $r$ on day $d$ during period $p$.
- **Hard Constraints**:
  - $\sum_{s, c, r} X_{s, c, f, r, d, p} \le 1, \quad \forall f, d, p$ (Faculty double-booking)
  - $\sum_{s, f, r} X_{s, c, f, r, d, p} \le 1, \quad \forall c, d, p$ (Section double-booking)
  - $\sum_{s, c, f} X_{s, c, f, r, d, p} \le 1, \quad \forall r, d, p$ (Classroom double-booking)
  - $\sum_{d, p} X_{s, c, f, r, d, p} = \text{RequiredPeriods}(s), \quad \forall s, c$
  - Room type compatibility: $X_{s, c, f, r, d, p} = 0$ if $s$ is Lab and $r$ is not `LABORATORY`.
  - Faculty unavailabilities: $X_{s, c, f, r, d, p} = 0$ if faculty $f$ is unavailable at $(d, p)$.
