-- ==============================================================================
-- SMART ACADEMIC MANAGEMENT SYSTEM (SAMS)
-- PHASE 4 STEP 1: TIMETABLE DOMAIN MIGRATION & SEED FOUNDATION
-- Execute in Supabase SQL Editor: https://supabase.com/dashboard/project/xlkhqimanlpuvstqcwti/sql
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. CUSTOM ENUMS
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'timetable_generation_status_enum') THEN
        CREATE TYPE public.timetable_generation_status_enum AS ENUM (
            'PENDING',
            'RUNNING',
            'COMPLETED',
            'FAILED',
            'CANCELLED'
        );
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. RETIRE PHASE 1 UNNORMALIZED PLACEHOLDER TABLES
-- ------------------------------------------------------------------------------
-- Safely drop legacy attendance session FK to old timetable_entries if present
ALTER TABLE IF EXISTS public.attendance_sessions 
    DROP CONSTRAINT IF EXISTS attendance_sessions_timetable_entry_id_fkey;

-- Drop legacy empty placeholder tables from Phase 1
DROP TABLE IF EXISTS public.timetable_entries CASCADE;
DROP TABLE IF EXISTS public.timetables CASCADE;
DROP TABLE IF EXISTS public.timetable_configs CASCADE;

-- ------------------------------------------------------------------------------
-- 3. TIMETABLE CONFIGURATIONS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.timetable_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE RESTRICT,
    semester_id UUID NOT NULL REFERENCES public.semesters(id) ON DELETE RESTRICT,
    section_id UUID NOT NULL REFERENCES public.class_sections(id) ON DELETE RESTRICT,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    working_days INTEGER NOT NULL DEFAULT 6,
    periods_per_day INTEGER NOT NULL DEFAULT 7,
    period_duration_minutes INTEGER NOT NULL DEFAULT 55,
    break_after_periods JSONB DEFAULT '[{"period": 4, "duration": 45, "label": "Lunch Break"}]'::jsonb,
    generation_status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_tt_working_days CHECK (working_days BETWEEN 1 AND 7),
    CONSTRAINT chk_tt_periods_per_day CHECK (periods_per_day BETWEEN 1 AND 12),
    CONSTRAINT chk_tt_period_duration CHECK (period_duration_minutes BETWEEN 15 AND 180),
    CONSTRAINT chk_tt_generation_status CHECK (generation_status IN ('DRAFT', 'GENERATING', 'GENERATED', 'PUBLISHED', 'ARCHIVED')),
    CONSTRAINT uq_tt_config_context UNIQUE (academic_year_id, semester_id, section_id, name)
);

-- ------------------------------------------------------------------------------
-- 4. TIMETABLE PERIODS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.timetable_periods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timetable_configuration_id UUID NOT NULL REFERENCES public.timetable_configurations(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL,
    period_number INTEGER NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_break BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_period_day_range CHECK (day_of_week BETWEEN 1 AND 7),
    CONSTRAINT chk_period_number_positive CHECK (period_number > 0),
    CONSTRAINT chk_period_time_order CHECK (end_time > start_time),
    CONSTRAINT uq_period_slot UNIQUE (timetable_configuration_id, day_of_week, period_number)
);

-- ------------------------------------------------------------------------------
-- 5. SUBJECT SCHEDULING REQUIREMENTS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subject_scheduling_requirements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    section_id UUID NOT NULL REFERENCES public.class_sections(id) ON DELETE RESTRICT,
    subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE RESTRICT,
    faculty_subject_assignment_id UUID REFERENCES public.faculty_subjects(id) ON DELETE RESTRICT,
    weekly_periods INTEGER NOT NULL,
    consecutive_periods INTEGER NOT NULL DEFAULT 1,
    room_type VARCHAR(50) NOT NULL DEFAULT 'LECTURE_HALL',
    preferred_capacity INTEGER,
    requires_lab BOOLEAN NOT NULL DEFAULT false,
    requires_consecutive_slots BOOLEAN NOT NULL DEFAULT false,
    preferred_days INTEGER[],
    max_periods_per_day INTEGER NOT NULL DEFAULT 2,
    min_period_gap INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_req_weekly_periods CHECK (weekly_periods > 0),
    CONSTRAINT chk_req_consecutive_periods CHECK (consecutive_periods > 0),
    CONSTRAINT chk_req_consecutive_le_weekly CHECK (consecutive_periods <= weekly_periods),
    CONSTRAINT chk_req_max_periods_per_day CHECK (max_periods_per_day > 0),
    CONSTRAINT chk_req_min_period_gap CHECK (min_period_gap >= 0),
    CONSTRAINT uq_section_subject_req UNIQUE (section_id, subject_id)
);

-- ------------------------------------------------------------------------------
-- 6. TIMETABLE GENERATIONS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.timetable_generations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timetable_configuration_id UUID NOT NULL REFERENCES public.timetable_configurations(id) ON DELETE RESTRICT,
    generation_number INTEGER NOT NULL,
    status public.timetable_generation_status_enum NOT NULL DEFAULT 'PENDING',
    solver_name VARCHAR(100) NOT NULL DEFAULT 'OR-Tools CP-SAT',
    solver_version VARCHAR(50) DEFAULT '9.8',
    objective_score NUMERIC,
    hard_constraint_violations INTEGER NOT NULL DEFAULT 0,
    soft_constraint_violations INTEGER NOT NULL DEFAULT 0,
    generation_started_at TIMESTAMPTZ,
    generation_completed_at TIMESTAMPTZ,
    generated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    error_message TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_gen_number_positive CHECK (generation_number > 0),
    CONSTRAINT chk_gen_hard_violations CHECK (hard_constraint_violations >= 0),
    CONSTRAINT chk_gen_soft_violations CHECK (soft_constraint_violations >= 0),
    CONSTRAINT uq_config_generation_number UNIQUE (timetable_configuration_id, generation_number)
);

-- ------------------------------------------------------------------------------
-- 7. TIMETABLE ENTRIES
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.timetable_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timetable_generation_id UUID NOT NULL REFERENCES public.timetable_generations(id) ON DELETE RESTRICT,
    section_id UUID NOT NULL REFERENCES public.class_sections(id) ON DELETE RESTRICT,
    subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE RESTRICT,
    faculty_id UUID NOT NULL REFERENCES public.faculty(id) ON DELETE RESTRICT,
    classroom_id UUID NOT NULL REFERENCES public.classrooms(id) ON DELETE RESTRICT,
    timetable_period_id UUID NOT NULL REFERENCES public.timetable_periods(id) ON DELETE RESTRICT,
    occurrence_index INTEGER NOT NULL DEFAULT 1,
    session_type public.subject_type_enum NOT NULL DEFAULT 'THEORY',
    is_lab BOOLEAN NOT NULL DEFAULT false,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_entry_occurrence_positive CHECK (occurrence_index > 0)
);

-- Reconnect downstream attendance session foreign key to new timetable_entries table
ALTER TABLE IF EXISTS public.attendance_sessions 
    ADD CONSTRAINT attendance_sessions_timetable_entry_id_fkey 
    FOREIGN KEY (timetable_entry_id) REFERENCES public.timetable_entries(id) ON DELETE SET NULL;

-- ------------------------------------------------------------------------------
-- 8. CONFLICT PROTECTION & PERFORMANCE INDEXES
-- ------------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_entries_section_period_gen 
ON public.timetable_entries (timetable_generation_id, section_id, timetable_period_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_entries_faculty_period_gen 
ON public.timetable_entries (timetable_generation_id, faculty_id, timetable_period_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_entries_classroom_period_gen 
ON public.timetable_entries (timetable_generation_id, classroom_id, timetable_period_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_entries_subject_occurrence_gen 
ON public.timetable_entries (timetable_generation_id, section_id, subject_id, occurrence_index);

CREATE INDEX IF NOT EXISTS idx_entries_generation ON public.timetable_entries(timetable_generation_id);
CREATE INDEX IF NOT EXISTS idx_entries_faculty ON public.timetable_entries(faculty_id);
CREATE INDEX IF NOT EXISTS idx_entries_classroom ON public.timetable_entries(classroom_id);
CREATE INDEX IF NOT EXISTS idx_entries_section ON public.timetable_entries(section_id);
CREATE INDEX IF NOT EXISTS idx_entries_period ON public.timetable_entries(timetable_period_id);
CREATE INDEX IF NOT EXISTS idx_periods_config ON public.timetable_periods(timetable_configuration_id, day_of_week, period_number);
CREATE INDEX IF NOT EXISTS idx_reqs_section ON public.subject_scheduling_requirements(section_id);
CREATE INDEX IF NOT EXISTS idx_generations_config ON public.timetable_generations(timetable_configuration_id);

-- ------------------------------------------------------------------------------
-- 9. ROW LEVEL SECURITY (RLS)
-- ------------------------------------------------------------------------------
ALTER TABLE public.timetable_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timetable_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subject_scheduling_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timetable_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timetable_entries ENABLE ROW LEVEL SECURITY;

-- Configurations
DROP POLICY IF EXISTS "Admin manage timetable configurations" ON public.timetable_configurations;
CREATE POLICY "Admin manage timetable configurations"
ON public.timetable_configurations FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Read timetable configurations" ON public.timetable_configurations;
CREATE POLICY "Read timetable configurations"
ON public.timetable_configurations FOR SELECT TO authenticated
USING (true);

-- Periods
DROP POLICY IF EXISTS "Admin manage timetable periods" ON public.timetable_periods;
CREATE POLICY "Admin manage timetable periods"
ON public.timetable_periods FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Read timetable periods" ON public.timetable_periods;
CREATE POLICY "Read timetable periods"
ON public.timetable_periods FOR SELECT TO authenticated
USING (true);

-- Requirements
DROP POLICY IF EXISTS "Admin manage subject scheduling requirements" ON public.subject_scheduling_requirements;
CREATE POLICY "Admin manage subject scheduling requirements"
ON public.subject_scheduling_requirements FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Read subject scheduling requirements" ON public.subject_scheduling_requirements;
CREATE POLICY "Read subject scheduling requirements"
ON public.subject_scheduling_requirements FOR SELECT TO authenticated
USING (true);

-- Generations
DROP POLICY IF EXISTS "Admin manage timetable generations" ON public.timetable_generations;
CREATE POLICY "Admin manage timetable generations"
ON public.timetable_generations FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Read timetable generations" ON public.timetable_generations;
CREATE POLICY "Read timetable generations"
ON public.timetable_generations FOR SELECT TO authenticated
USING (public.is_admin() OR status = 'COMPLETED');

-- Entries
DROP POLICY IF EXISTS "Admin manage timetable entries" ON public.timetable_entries;
CREATE POLICY "Admin manage timetable entries"
ON public.timetable_entries FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Read timetable entries by role" ON public.timetable_entries;
CREATE POLICY "Read timetable entries by role"
ON public.timetable_entries FOR SELECT TO authenticated
USING (
    public.is_admin()
    OR faculty_id = public.current_faculty_id()
    OR section_id IN (
        SELECT fs.section_id 
        FROM public.faculty_subjects fs 
        WHERE fs.faculty_id = public.current_faculty_id()
    )
    OR section_id = (
        SELECT s.current_section_id 
        FROM public.students s 
        WHERE s.id = public.current_student_id()
    )
    OR section_id IN (
        SELECT se.section_id 
        FROM public.student_enrollments se 
        WHERE se.student_id = public.current_student_id()
    )
);

-- ------------------------------------------------------------------------------
-- 10. ATTACH AUTOMATED TIMESTAMPS AND AUDIT TRIGGERS
-- ------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS set_updated_at ON public.timetable_configurations;
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON public.timetable_configurations
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON public.subject_scheduling_requirements;
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON public.subject_scheduling_requirements
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DO $$
DECLARE
    t text;
BEGIN
    FOR t IN 
        SELECT unnest(ARRAY[
            'timetable_configurations', 
            'timetable_periods', 
            'subject_scheduling_requirements', 
            'timetable_generations', 
            'timetable_entries'
        ])
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS audit_log_trigger ON public.%I;', t);
        EXECUTE format('
            CREATE TRIGGER audit_log_trigger
            AFTER INSERT OR UPDATE OR DELETE ON public.%I
            FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();
        ', t);
    END LOOP;
END $$;

-- ------------------------------------------------------------------------------
-- 11. DETERMINISTIC DOMAIN SEED DATA (Zero fake generation/entries)
-- ------------------------------------------------------------------------------
-- Assign faculty for laboratory courses in CSE 5-A
INSERT INTO public.faculty_subjects (faculty_id, subject_id, section_id, academic_year_id, semester_id, is_primary, status)
VALUES 
    ('33333333-3333-3333-3333-333333333331', 'f0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000005', true, 'ASSIGNED'),
    ('33333333-3333-3333-3333-333333333332', 'f0000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000005', true, 'ASSIGNED')
ON CONFLICT (faculty_id, subject_id, section_id, academic_year_id) DO NOTHING;

-- Timetable Configuration for CSE Section 5-A (Odd 2026)
INSERT INTO public.timetable_configurations (
    id,
    academic_year_id,
    semester_id,
    section_id,
    name,
    description,
    working_days,
    periods_per_day,
    period_duration_minutes,
    break_after_periods,
    generation_status,
    is_active
) VALUES (
    'e1000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000005',
    'c0000000-0000-0000-0000-000000000001',
    'CSE-S5-A Master Schedule Configuration (2026-2027)',
    'Standard 6-day academic schedule for 5th semester CSE Section A with 7 periods daily and dedicated lab blocks',
    6,
    7,
    55,
    '[{"period": 2, "duration": 20, "label": "Tea Break"}, {"period": 4, "duration": 45, "label": "Lunch Break"}]'::jsonb,
    'DRAFT',
    true
) ON CONFLICT (academic_year_id, semester_id, section_id, name) DO NOTHING;

-- Timetable Periods (42 discrete scheduling slots: Mon-Sat, Periods 1-7)
INSERT INTO public.timetable_periods (
    timetable_configuration_id,
    day_of_week,
    period_number,
    start_time,
    end_time,
    is_break,
    is_active
)
SELECT 
    'e1000000-0000-0000-0000-000000000001',
    day_num,
    period_num,
    CASE period_num
        WHEN 1 THEN '09:00:00'::time
        WHEN 2 THEN '09:55:00'::time
        WHEN 3 THEN '11:10:00'::time
        WHEN 4 THEN '12:05:00'::time
        WHEN 5 THEN '13:45:00'::time
        WHEN 6 THEN '14:40:00'::time
        WHEN 7 THEN '15:35:00'::time
    END,
    CASE period_num
        WHEN 1 THEN '09:55:00'::time
        WHEN 2 THEN '10:50:00'::time
        WHEN 3 THEN '12:05:00'::time
        WHEN 4 THEN '13:00:00'::time
        WHEN 5 THEN '14:40:00'::time
        WHEN 6 THEN '15:35:00'::time
        WHEN 7 THEN '16:30:00'::time
    END,
    false,
    true
FROM generate_series(1, 6) AS day_num
CROSS JOIN generate_series(1, 7) AS period_num
ON CONFLICT (timetable_configuration_id, day_of_week, period_number) DO NOTHING;

-- Subject Scheduling Requirements for CSE 5-A
INSERT INTO public.subject_scheduling_requirements (
    section_id,
    subject_id,
    faculty_subject_assignment_id,
    weekly_periods,
    consecutive_periods,
    room_type,
    preferred_capacity,
    requires_lab,
    requires_consecutive_slots,
    preferred_days,
    max_periods_per_day,
    min_period_gap,
    is_active
) VALUES 
    (
        'c0000000-0000-0000-0000-000000000001',
        'f0000000-0000-0000-0000-000000000001',
        (SELECT id FROM public.faculty_subjects WHERE subject_id = 'f0000000-0000-0000-0000-000000000001' AND section_id = 'c0000000-0000-0000-0000-000000000001' LIMIT 1),
        4, 1, 'LECTURE_HALL', 65, false, false, '{1,2,3,4}', 1, 0, true
    ),
    (
        'c0000000-0000-0000-0000-000000000001',
        'f0000000-0000-0000-0000-000000000002',
        (SELECT id FROM public.faculty_subjects WHERE subject_id = 'f0000000-0000-0000-0000-000000000002' AND section_id = 'c0000000-0000-0000-0000-000000000001' LIMIT 1),
        4, 1, 'LECTURE_HALL', 65, false, false, '{1,2,3,5}', 1, 0, true
    ),
    (
        'c0000000-0000-0000-0000-000000000001',
        'f0000000-0000-0000-0000-000000000003',
        (SELECT id FROM public.faculty_subjects WHERE subject_id = 'f0000000-0000-0000-0000-000000000003' AND section_id = 'c0000000-0000-0000-0000-000000000001' LIMIT 1),
        4, 1, 'LECTURE_HALL', 65, false, false, '{2,3,4,5}', 1, 0, true
    ),
    (
        'c0000000-0000-0000-0000-000000000001',
        'f0000000-0000-0000-0000-000000000004',
        (SELECT id FROM public.faculty_subjects WHERE subject_id = 'f0000000-0000-0000-0000-000000000004' AND section_id = 'c0000000-0000-0000-0000-000000000001' LIMIT 1),
        3, 1, 'LECTURE_HALL', 65, false, false, '{1,3,6}', 1, 0, true
    ),
    (
        'c0000000-0000-0000-0000-000000000001',
        'f0000000-0000-0000-0000-000000000005',
        (SELECT id FROM public.faculty_subjects WHERE subject_id = 'f0000000-0000-0000-0000-000000000005' AND section_id = 'c0000000-0000-0000-0000-000000000001' LIMIT 1),
        3, 3, 'LABORATORY', 40, true, true, '{4,5}', 3, 0, true
    ),
    (
        'c0000000-0000-0000-0000-000000000001',
        'f0000000-0000-0000-0000-000000000006',
        (SELECT id FROM public.faculty_subjects WHERE subject_id = 'f0000000-0000-0000-0000-000000000006' AND section_id = 'c0000000-0000-0000-0000-000000000001' LIMIT 1),
        3, 3, 'LABORATORY', 40, true, true, '{2,6}', 3, 0, true
    )
ON CONFLICT (section_id, subject_id) DO NOTHING;
