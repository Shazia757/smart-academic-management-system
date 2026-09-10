const fs = require('fs');
const path = require('path');

const migrations = [
  'supabase/migrations/20260910000001_initial_schema.sql',
  'supabase/migrations/20260910000002_rls_policies.sql',
  'supabase/migrations/20260910000003_audit_triggers.sql',
  'supabase/migrations/20260910000004_auth_hooks_and_roles.sql',
  'supabase/migrations/20260910000005_phase3_academic_master_data.sql',
  'supabase/migrations/20260910000006_timetable_domain.sql',
  'supabase/seed.sql'
];

let fullSql = `-- ==============================================================================
-- SMART ACADEMIC MANAGEMENT SYSTEM (SAMS) — CONSOLIDATED SETUP SCRIPT
-- Execute this entire script in Supabase Dashboard -> SQL Editor
-- URL: https://supabase.com/dashboard/project/xlkhqimanlpuvstqcwti/sql
-- ==============================================================================
`;

for (const m of migrations) {
  const filePath = path.resolve(__dirname, '..', m);
  fullSql += `\n-- ==============================================================================\n`;
  fullSql += `-- SECTION: ${m}\n`;
  fullSql += `-- ==============================================================================\n\n`;
  fullSql += fs.readFileSync(filePath, 'utf8') + '\n';
}

fullSql += `
-- ==============================================================================
-- BACKFILL & LINK EXISTING AUTH USERS TO PROFILES & ACADEMIC MASTER RECORDS
-- ==============================================================================
INSERT INTO public.profiles (
    id,
    email,
    role,
    first_name,
    last_name,
    phone,
    is_active,
    created_at,
    updated_at
)
SELECT 
    u.id,
    u.email,
    COALESCE(
        (u.raw_app_meta_data->>'role')::public.user_role,
        'student'::public.user_role
    ) AS role,
    COALESCE(NULLIF(u.raw_user_meta_data->>'first_name', ''), 'User') AS first_name,
    COALESCE(NULLIF(u.raw_user_meta_data->>'last_name', ''), SPLIT_PART(u.email, '@', 1)) AS last_name,
    u.raw_user_meta_data->>'phone' AS phone,
    true AS is_active,
    NOW(),
    NOW()
FROM auth.users u
ON CONFLICT (id) DO UPDATE SET
    role = EXCLUDED.role,
    email = EXCLUDED.email,
    updated_at = NOW();

-- Link faculty master records to their auth profile
UPDATE public.faculty f
SET profile_id = p.id
FROM public.profiles p
WHERE p.email = 'arun.kumar@sams.edu' AND f.employee_id = 'FAC-CSE-001';

UPDATE public.faculty f
SET profile_id = p.id
FROM public.profiles p
WHERE p.email = 'priya.sharma@sams.edu' AND f.employee_id = 'FAC-CSE-002';

-- Link student master records to their auth profile
UPDATE public.students s
SET profile_id = p.id
FROM public.profiles p
WHERE p.email = 'rohit.verma@student.sams.edu' AND s.roll_number = '24CSE01';

UPDATE public.students s
SET profile_id = p.id
FROM public.profiles p
WHERE p.email = 'sneha.patil@student.sams.edu' AND s.roll_number = '24CSE02';
`;

const outputPath = path.resolve(__dirname, '..', 'supabase', 'setup_complete.sql');
fs.writeFileSync(outputPath, fullSql, 'utf8');
console.log('Successfully generated ' + outputPath + ' (' + fullSql.length + ' bytes)');
