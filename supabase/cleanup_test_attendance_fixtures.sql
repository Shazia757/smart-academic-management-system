-- ==============================================================================
-- SMART ACADEMIC MANAGEMENT SYSTEM (SAMS)
-- CLEANUP SCRIPT: TARGETED REMOVAL OF PROBE TEST FIXTURES
-- Execute in Supabase SQL Editor: https://supabase.com/dashboard/project/xlkhqimanlpuvstqcwti/sql
-- ==============================================================================
-- NOTE: This script is prepared for explicit human review and approval.
-- It strictly targets ONLY the confirmed probe test session and test records
-- created during the eligibility validation pass on 2026-09-13.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- Step 1: Pre-Execution Guard & Identity Verification
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_target_session_exists BOOLEAN;
    v_target_records_count INTEGER;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM public.attendance_sessions 
        WHERE id = 'e725a76f-9a55-4688-a773-5c3b52d57e57'
    ) INTO v_target_session_exists;

    IF NOT v_target_session_exists THEN
        RAISE EXCEPTION 'Target test session e725a76f-9a55-4688-a773-5c3b52d57e57 not found. Aborting cleanup.';
    END IF;

    SELECT count(*) INTO v_target_records_count
    FROM public.attendance_records
    WHERE session_id = 'e725a76f-9a55-4688-a773-5c3b52d57e57';

    IF v_target_records_count != 2 THEN
        RAISE EXCEPTION 'Expected exactly 2 test records for session, found %. Aborting cleanup.', v_target_records_count;
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- Step 2: Delete Identified Test Records (by Exact Primary Keys)
-- ------------------------------------------------------------------------------
DELETE FROM public.attendance_records
WHERE session_id = 'e725a76f-9a55-4688-a773-5c3b52d57e57'
  AND id IN (
      '8ea46ad4-e2a7-496f-a93f-46601136611e',
      '61ca18f1-342d-47de-b672-09a5ec18e368'
  );

-- ------------------------------------------------------------------------------
-- Step 3: Delete Identified Test Session (by Exact Primary Key)
-- ------------------------------------------------------------------------------
DELETE FROM public.attendance_sessions
WHERE id = 'e725a76f-9a55-4688-a773-5c3b52d57e57';

-- ------------------------------------------------------------------------------
-- Step 4: Delete Temporary Test Student Fixtures (by Exact IDs and Roll Numbers)
-- ------------------------------------------------------------------------------
DELETE FROM public.students
WHERE id IN (
    '4cce0c8e-52bf-4f47-8fd6-a33208a19b72',
    'ecd0d4a4-fbb4-4dbd-b757-ef160c5a4b85'
)
AND roll_number IN ('TEST-INACTIVE-01', 'TEST-CS502-01');

-- ------------------------------------------------------------------------------
-- Step 5: Post-Cleanup Verification Guard
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_sess_count INTEGER;
    v_rec_count INTEGER;
BEGIN
    SELECT count(*) INTO v_sess_count FROM public.attendance_sessions;
    SELECT count(*) INTO v_rec_count FROM public.attendance_records;

    IF v_sess_count != 0 OR v_rec_count != 0 THEN
        RAISE EXCEPTION 'Cleanup validation failed: attendance_sessions has % rows, attendance_records has % rows. Tables must have 0 rows. Aborting transaction.', v_sess_count, v_rec_count;
    END IF;

    RAISE NOTICE 'Cleanup successful: attendance_sessions=%, attendance_records=%. Migration guard will now succeed.', v_sess_count, v_rec_count;
END $$;

COMMIT;
