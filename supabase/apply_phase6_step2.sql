-- ==============================================================================
-- SMART ACADEMIC MANAGEMENT SYSTEM (SAMS)
-- PHASE 6 STEP 6.2: TIMETABLE CLASSROOM AVAILABILITY & CONSTRAINT ENHANCEMENTS
-- Execute in Supabase SQL Editor: https://supabase.com/dashboard/project/xlkhqimanlpuvstqcwti/sql
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. CLASSROOM AVAILABILITY TABLE
-- Models discrete availability / reservation status for classrooms per day and period
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.classroom_availability (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    classroom_id UUID NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL,
    period_number INTEGER NOT NULL,
    is_available BOOLEAN NOT NULL DEFAULT true,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_classroom_availability_day CHECK (day_of_week BETWEEN 1 AND 7),
    CONSTRAINT chk_classroom_availability_period CHECK (period_number BETWEEN 1 AND 12),
    CONSTRAINT uq_classroom_availability UNIQUE (classroom_id, day_of_week, period_number)
);

-- Performance and lookup index
CREATE INDEX IF NOT EXISTS idx_classroom_availability_lookup 
ON public.classroom_availability(classroom_id, day_of_week, period_number);

-- ------------------------------------------------------------------------------
-- 2. HARMONIZE FACULTY AVAILABILITY CHECK CONSTRAINTS
-- Safely allow period_slot up to 12 and day_of_week up to 7 (matching timetable_periods)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    -- Drop legacy period slot check if present (was 1..10)
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'faculty_availability_period_slot_check'
    ) THEN
        ALTER TABLE public.faculty_availability 
            DROP CONSTRAINT faculty_availability_period_slot_check;
    END IF;

    -- Add updated period slot check (1..12)
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'chk_faculty_avail_period_slot'
    ) THEN
        ALTER TABLE public.faculty_availability 
            ADD CONSTRAINT chk_faculty_avail_period_slot 
            CHECK (period_slot BETWEEN 1 AND 12);
    END IF;

    -- Drop legacy day_of_week check if present (was 1..6)
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'faculty_availability_day_of_week_check'
    ) THEN
        ALTER TABLE public.faculty_availability 
            DROP CONSTRAINT faculty_availability_day_of_week_check;
    END IF;

    -- Add updated day_of_week check (1..7)
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'chk_faculty_avail_day_range'
    ) THEN
        ALTER TABLE public.faculty_availability 
            ADD CONSTRAINT chk_faculty_avail_day_range 
            CHECK (day_of_week BETWEEN 1 AND 7);
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY (RLS) FOR CLASSROOM AVAILABILITY
-- ------------------------------------------------------------------------------
ALTER TABLE public.classroom_availability ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin manage classroom availability" ON public.classroom_availability;
CREATE POLICY "Admin manage classroom availability"
ON public.classroom_availability FOR ALL TO authenticated
USING (public.is_admin() OR public.is_timetable_admin())
WITH CHECK (public.is_admin() OR public.is_timetable_admin());

DROP POLICY IF EXISTS "Authenticated read classroom availability" ON public.classroom_availability;
CREATE POLICY "Authenticated read classroom availability"
ON public.classroom_availability FOR SELECT TO authenticated
USING (true);

-- ------------------------------------------------------------------------------
-- 4. ATTACH AUTOMATED TIMESTAMPS AND AUDIT TRIGGERS
-- ------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS set_updated_at ON public.classroom_availability;
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON public.classroom_availability
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS audit_log_trigger ON public.classroom_availability;
CREATE TRIGGER audit_log_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.classroom_availability
FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();
