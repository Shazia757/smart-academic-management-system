# SAMS — Security, RBAC & Row Level Security (RLS) Architecture

**System**: Smart Academic Management System (SAMS)  
**Document**: Security Model, RLS Policies, Audit Logging & Access Controls  
**Date**: September 18, 2026  
**Status**: Verified & Hardened in Phase 7

---

## 1. Security Architecture Overview

SAMS implements a defense-in-depth security model across presentation, application, and database tiers. The foundational principle is **Zero Client-Side Trust**: frontend UI visibility controls are purely convenience layers; all authorization decisions are enforced by Next.js Server Components, server actions, and PostgreSQL Row-Level Security (RLS) policies.

```text
[ Browser Client ]
        |
        | 1. HttpOnly SameSite Cookie
        v
[ Next.js Middleware ] ──> 2. Validates session token & refreshes JWT
        |
        v
[ Server Component Guards ] ──> 3. Checks role hierarchy (requireRole / requireAnyRole)
        |
        v
[ Server Actions / REST API ] ──> 4. Validates identity via supabase.auth.getUser()
        |
        v
[ PostgreSQL 16 RLS Engine ] ──> 5. Evaluates auth.uid() & role against 100% table policies
        |
        v
[ Database Commit & Audit ] ──> 6. PostgreSQL triggers log mutations to public.audit_logs
```

---

## 2. Authentication & Session Management

- **Protocol**: Supabase Auth utilizing standard JSON Web Tokens (JWT) signed with HMAC-SHA256.
- **Cookie Security**: Session tokens are transmitted via HttpOnly, Secure, SameSite cookies managed by `@supabase/ssr`. Tokens are shielded from client-side JavaScript, preventing Cross-Site Scripting (XSS) token theft.
- **Session Refresh**: Handled transparently by `apps/web/src/middleware.ts` on every request.
- **Logout Invalidation**: Server action `logoutAction` terminates the session in Supabase Auth and clears the cookie headers immediately.

---

## 3. Role-Based Access Control (RBAC) Matrix

### 3.1 Role Hierarchy
Defined in `apps/web/src/lib/auth/roles.ts`:
1. `super_admin` (Rank 4): Complete institution access, audit ledgers, solver calibration, master catalogs.
2. `college_admin` (Rank 3): Academic structure, curriculum subjects, classrooms, timetable publishing.
3. `faculty` (Rank 2): Availability matrix, class attendance sessions, assigned schedules.
4. `student` (Rank 1): Enrolled cohort timetable, attendance history, academic notices.

### 3.2 Route-to-Role Permission Matrix

| Route | Minimum Permitted Role | Unauthenticated Behavior | Unauthorized Behavior |
| :--- | :--- | :--- | :--- |
| `/` | `ALL_ROLES` | Redirect to `/login` | N/A (Role-adaptive dashboard) |
| `/academic-structure` | `college_admin` | Redirect to `/login` | Server redirect to `/unauthorized` |
| `/departments` | `college_admin` | Redirect to `/login` | Server redirect to `/unauthorized` |
| `/classrooms` | `college_admin` | Redirect to `/login` | Server redirect to `/unauthorized` |
| `/subjects` | `college_admin` | Redirect to `/login` | Server redirect to `/unauthorized` |
| `/students` | `faculty` | Redirect to `/login` | Server redirect to `/unauthorized` |
| `/faculty` | `college_admin` | Redirect to `/login` | Server redirect to `/unauthorized` |
| `/faculty/availability` | `faculty` | Redirect to `/login` | Server redirect to `/unauthorized` |
| `/timetable/generate` | `college_admin` | Redirect to `/login` | Server redirect to `/unauthorized` |
| `/timetable` | `ALL_ROLES` | Redirect to `/login` | Filtered by enrolled section or faculty assignments |
| `/attendance` | `ALL_ROLES` | Redirect to `/login` | Role-adaptive (Faculty vs. Student view) |
| `/notifications` | `ALL_ROLES` | Redirect to `/login` | Isolated to user's notifications |
| `/audit-logs` | `college_admin` | Redirect to `/login` | Server redirect to `/unauthorized` |

---

## 4. PostgreSQL Row Level Security (RLS) Coverage

Row Level Security is enabled on **100% of public tables** in `supabase/migrations/20260910000002_rls_policies.sql`. Representative policies include:

### 4.1 Profiles Table (`public.profiles`)
- `Users view own profile`: `auth.uid() = id`
- `Admins view all profiles`: `EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'college_admin'))`

### 4.2 Students Table (`public.students`)
- `Students view own record`: `profile_id = auth.uid()`
- `Staff view all students`: `EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'college_admin', 'faculty'))`

### 4.3 Timetables Table (`public.timetable_generations`)
- `Students view published only`: `status = 'PUBLISHED' AND section_id IN (SELECT current_section_id FROM students WHERE profile_id = auth.uid())`
- `Admins manage all generations`: Role check for `super_admin` or `college_admin`.

### 4.4 Attendance Records Table (`public.attendance_records`)
- `Students read own attendance`: `student_id IN (SELECT id FROM students WHERE profile_id = auth.uid())`
- `Faculty manage assigned sessions`: Session foreign key links to `faculty.profile_id = auth.uid()`.
- Student writes are blocked: Zero `INSERT`/`UPDATE` policies granted to students.

### 4.5 Notifications Table (`public.notifications`)
- `Users read own notifications`: `user_id = auth.uid()`
- `Users update own notifications`: `user_id = auth.uid()` (allows setting `is_read = true`).

### 4.6 Audit Logs Table (`public.audit_logs`)
- `Admins view audit logs`: Restricted exclusively to `super_admin` and `college_admin`. Non-admin reads return 0 rows.

---

## 5. Security Audit Logging & Sensitive Key Redaction

### 5.1 Redaction Standard
The audit utility `recordAuditLog` (`apps/web/src/server/actions/audit.ts`) sanitizes every old and new JSON payload against a strict blacklist:
- `password`
- `token`
- `secret`
- `service_role`
- `api_key`
- `embedding`
- `encrypted_password`
- `raw_app_meta_data`

Any matching key is automatically converted to `"[REDACTED]"` before persistence into `public.audit_logs`.

### 5.2 Immutable Ledger Enforcement
Audit logs cannot be updated or deleted by application users. The table does not expose `UPDATE` or `DELETE` policies to any authenticated role.

---

## 6. Secret Hygiene & Environment Variable Isolation

- Server-only secrets (`SUPABASE_SERVICE_ROLE_KEY`, `AI_SERVICE_API_KEY`) are kept in server environment files (`.env.local`) and are never prefixed with `NEXT_PUBLIC_`.
- The frontend client bundle receives strictly public values:
  - `NEXT_PUBLIC_APP_URL`
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (subject to RLS policies).

---

## 7. Known Security Limitations & Operational Recommendations

1. **Biometric Data Storage**: Face embeddings in the database schema should be encrypted at rest with AES-256 keys managed outside the database layer.
2. **Internal API Microservice**: Ensure the server-to-server connection between Next.js and FastAPI uses mutual TLS (mTLS) or private VPC networking in cloud production environments.
3. **Login Rate Limiting**: Configure Supabase Auth rate limiting on the `/login` route to mitigate distributed credential stuffing attacks.
