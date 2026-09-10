# SAMS Development & Test Accounts Guide

This document outlines the standard development accounts for each of the 4 roles in the Smart Academic Management System.

> [!NOTE]
> For security, real passwords are never committed to version control. When configuring local Supabase or your hosted project, create these test accounts using the Supabase Dashboard, Supabase CLI, or the development account provisioning script.

---

## 1. Test User Matrix

| Role | Email | Display Name | Purpose / Scope |
| :--- | :--- | :--- | :--- |
| **`super_admin`** | `superadmin@sams.edu` | Dr. Vikram Sarabhai | Full system control, audit ledger, and administrative management |
| **`college_admin`** | `dean.cse@sams.edu` | Prof. Radhika Shenoy | Academic departmental administration, timetables, and reports |
| **`faculty`** | `arun.kumar@sams.edu` | Dr. Arun Kumar | Teaching portal, DBMS & AI subjects, facial recognition attendance kiosk |
| **`faculty`** | `priya.sharma@sams.edu` | Dr. Priya Sharma | Teaching portal, Computer Networks subject, attendance management |
| **`student`** | `rohit.verma@student.sams.edu` | Rohit Verma | Student portal, personal timetable, attendance status (Section 5-A) |
| **`student`** | `sneha.patil@student.sams.edu` | Sneha Patil | Student portal, personal timetable, attendance status (Section 5-A) |

---

## 2. Recommended Development Password

For local testing convenience, use a standardized strong development password:
```text
SamsDev#2026!
```

---

## 3. Provisioning Accounts via Supabase SQL Editor

If running against a Supabase project where you have SQL access, you can provision the auth users and sync profiles directly with this query.

> [!IMPORTANT]
> In accordance with Migration 004, elevated roles (`super_admin`, `college_admin`, `faculty`) must be declared inside `raw_app_meta_data` (which is strictly protected from client manipulation). Client metadata (`raw_user_meta_data`) can only default to `student`.

```sql
-- Creates an auth user and automatically triggers profile insertion via Migration 004
-- Example for Super Admin:
INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
) VALUES (
    '00000000-0000-0000-0000-000000000000',
    '11111111-1111-1111-1111-111111111111',
    'authenticated',
    'authenticated',
    'superadmin@sams.edu',
    crypt('SamsDev#2026!', gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"],"role":"super_admin"}'::jsonb,
    '{"first_name":"Dr. Vikram","last_name":"Sarabhai"}'::jsonb,
    NOW(),
    NOW()
) ON CONFLICT (id) DO NOTHING;

-- Example for College Admin:
INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
) VALUES (
    '00000000-0000-0000-0000-000000000000',
    '22222222-2222-2222-2222-222222222222',
    'authenticated',
    'authenticated',
    'dean.cse@sams.edu',
    crypt('SamsDev#2026!', gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"],"role":"college_admin"}'::jsonb,
    '{"first_name":"Prof. Radhika","last_name":"Shenoy"}'::jsonb,
    NOW(),
    NOW()
) ON CONFLICT (id) DO NOTHING;
```

---

## 4. Provisioning via Supabase Dashboard UI

1. Open **Supabase Dashboard** $\to$ **Authentication** $\to$ **Users**.
2. Click **Add User** $\to$ **Create User**.
3. Fill in the **Email** and **Password** (e.g. `dean.cse@sams.edu` / `SamsDev#2026!`).
4. Set **Auto Confirm User** to `true`.
5. Under `User Metadata` (JSON), supply:
   ```json
   {
     "first_name": "Prof. Radhika",
     "last_name": "Shenoy"
   }
   ```
6. Set the administrative role in the user's `raw_app_meta_data` or update their role via SQL Editor to elevate above the safe default (`student`).
