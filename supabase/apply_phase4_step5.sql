-- ==============================================================================
-- SMART ACADEMIC MANAGEMENT SYSTEM (SAMS)
-- PHASE 4 STEP 5: TIMETABLE PERSISTENCE & ATOMIC RPC
-- Execute in Supabase SQL Editor: https://supabase.com/dashboard/project/xlkhqimanlpuvstqcwti/sql
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 0. CANONICAL ENUM ALIGNMENT
-- Canonical subject_type_enum values: THEORY, LABORATORY, PRACTICAL, ELECTIVE, PROJECT
-- Shorthand 'LAB' is canonically normalized to 'LABORATORY' inside the RPC
-- ------------------------------------------------------------------------------

-- ------------------------------------------------------------------------------
-- 1. EXTEND / NORMALIZE ADMINISTRATOR ROLE CHECK
-- Supports super_admin, college_admin, and department_admin safely
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_timetable_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT (
    (auth.role() = 'service_role')
    OR EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
      AND (
        role IN ('super_admin', 'college_admin')
        OR role::text = 'department_admin'
      )
      AND is_active = true
    )
  );
$$;

-- Also harmonize public.is_admin() to safely recognize department_admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT (
    (auth.role() = 'service_role')
    OR EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
      AND (
        role IN ('super_admin', 'college_admin')
        OR role::text = 'department_admin'
      )
      AND is_active = true
    )
  );
$$;

-- ------------------------------------------------------------------------------
-- 2. ATOMIC RPC FOR TIMETABLE GENERATION PERSISTENCE
-- Locks configuration, calculates next generation number atomically,
-- validates all relationships, inserts timetable_generations and timetable_entries,
-- and updates configuration generation_status to GENERATED.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_timetable_generation_atomic(
    p_configuration_id UUID,
    p_section_id UUID,
    p_solver_name VARCHAR DEFAULT 'OR-Tools CP-SAT',
    p_solver_version VARCHAR DEFAULT '9.15.6755',
    p_objective_score NUMERIC DEFAULT NULL,
    p_hard_violations INTEGER DEFAULT 0,
    p_soft_violations INTEGER DEFAULT 0,
    p_solve_duration_ms NUMERIC DEFAULT 0,
    p_diagnostics JSONB DEFAULT '[]'::jsonb,
    p_entries JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_config RECORD;
    v_next_gen_num INTEGER;
    v_gen_id UUID;
    v_entry JSONB;
    v_period_id UUID;
    v_subject_id UUID;
    v_faculty_id UUID;
    v_classroom_id UUID;
    v_occurrence_index INTEGER;
    v_session_type TEXT;
    v_is_lab BOOLEAN;
    v_notes TEXT;
    v_entry_count INTEGER := 0;
BEGIN
    -- 1. Authorization Guard
    IF NOT (public.is_admin() OR public.is_timetable_admin()) THEN
        RAISE EXCEPTION 'Unauthorized: User is not an active administrator'
            USING ERRCODE = '42501';
    END IF;

    -- 2. Lock configuration row FOR UPDATE and validate
    SELECT * INTO v_config
    FROM public.timetable_configurations
    WHERE id = p_configuration_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Configuration not found: %', p_configuration_id
            USING ERRCODE = 'P0002';
    END IF;

    IF NOT v_config.is_active THEN
        RAISE EXCEPTION 'Configuration is inactive: %', p_configuration_id
            USING ERRCODE = '22000';
    END IF;

    IF v_config.section_id <> p_section_id THEN
        RAISE EXCEPTION 'Section mismatch: Configuration % belongs to section %, but % was provided',
            p_configuration_id, v_config.section_id, p_section_id
            USING ERRCODE = '22000';
    END IF;

    -- 3. Calculate next generation number atomically
    SELECT COALESCE(MAX(generation_number), 0) + 1
    INTO v_next_gen_num
    FROM public.timetable_generations
    WHERE timetable_configuration_id = p_configuration_id;

    -- 4. Get caller user ID safely from session
    v_user_id := auth.uid();

    -- 5. Insert generation record with status = COMPLETED and is_published = false
    INSERT INTO public.timetable_generations (
        timetable_configuration_id,
        generation_number,
        status,
        solver_name,
        solver_version,
        objective_score,
        hard_constraint_violations,
        soft_constraint_violations,
        generation_completed_at,
        generated_by,
        metadata
    ) VALUES (
        p_configuration_id,
        v_next_gen_num,
        'COMPLETED'::public.timetable_generation_status_enum,
        COALESCE(p_solver_name, 'OR-Tools CP-SAT'),
        COALESCE(p_solver_version, '9.15.6755'),
        p_objective_score,
        COALESCE(p_hard_violations, 0),
        COALESCE(p_soft_violations, 0),
        NOW(),
        v_user_id,
        jsonb_build_object(
            'solve_duration_ms', COALESCE(p_solve_duration_ms, 0),
            'diagnostics', COALESCE(p_diagnostics, '[]'::jsonb),
            'solver_config', jsonb_build_object(
                'working_days', v_config.working_days,
                'periods_per_day', v_config.periods_per_day,
                'period_duration_minutes', v_config.period_duration_minutes
            ),
            'section_id', p_section_id,
            'is_published', false
        )
    ) RETURNING id INTO v_gen_id;

    -- 6. Validate and insert entries
    IF p_entries IS NULL OR jsonb_typeof(p_entries) <> 'array' OR jsonb_array_length(p_entries) = 0 THEN
        RAISE EXCEPTION 'At least one timetable entry is required'
            USING ERRCODE = '22000';
    END IF;

    FOR v_entry IN SELECT * FROM jsonb_array_elements(p_entries)
    LOOP
        v_period_id := (v_entry->>'timetable_period_id')::UUID;
        v_subject_id := (v_entry->>'subject_id')::UUID;
        v_faculty_id := (v_entry->>'faculty_id')::UUID;
        v_classroom_id := (v_entry->>'classroom_id')::UUID;
        v_occurrence_index := COALESCE((v_entry->>'occurrence_index')::INTEGER, 1);
        v_session_type := UPPER(TRIM(COALESCE(v_entry->>'session_type', 'THEORY')));
        v_is_lab := COALESCE((v_entry->>'is_lab')::BOOLEAN, false);
        v_notes := v_entry->>'notes';

        -- Validate occurrence index
        IF v_occurrence_index <= 0 THEN
            RAISE EXCEPTION 'Invalid occurrence index % for subject %: must be positive',
                v_occurrence_index, v_subject_id
                USING ERRCODE = '22003';
        END IF;

        -- Canonical mapping: Map application solver shorthand 'LAB' to canonical enum value 'LABORATORY'
        IF v_session_type = 'LAB' THEN
            v_session_type := 'LABORATORY';
        END IF;

        -- Validate session type against canonical subject_type_enum values
        IF v_session_type NOT IN ('THEORY', 'LABORATORY', 'PRACTICAL', 'ELECTIVE', 'PROJECT') THEN
            RAISE EXCEPTION 'Invalid session type %: must be THEORY, LABORATORY, PRACTICAL, ELECTIVE, or PROJECT', v_session_type
                USING ERRCODE = '22000';
        END IF;

        -- Validate timetable period belongs to the locked configuration
        IF NOT EXISTS (
            SELECT 1 FROM public.timetable_periods
            WHERE id = v_period_id 
              AND timetable_configuration_id = p_configuration_id
              AND is_active = true
        ) THEN
            RAISE EXCEPTION 'Timetable period % does not exist or does not belong to configuration %',
                v_period_id, p_configuration_id
                USING ERRCODE = '23503';
        END IF;

        -- Validate subject existence
        IF NOT EXISTS (SELECT 1 FROM public.subjects WHERE id = v_subject_id) THEN
            RAISE EXCEPTION 'Subject % does not exist', v_subject_id
                USING ERRCODE = '23503';
        END IF;

        -- Validate faculty existence
        IF NOT EXISTS (SELECT 1 FROM public.faculty WHERE id = v_faculty_id) THEN
            RAISE EXCEPTION 'Faculty % does not exist', v_faculty_id
                USING ERRCODE = '23503';
        END IF;

        -- Validate classroom existence
        IF NOT EXISTS (SELECT 1 FROM public.classrooms WHERE id = v_classroom_id) THEN
            RAISE EXCEPTION 'Classroom % does not exist', v_classroom_id
                USING ERRCODE = '23503';
        END IF;

        -- Insert entry (conflict protection indexes will enforce multi-dimensional integrity)
        INSERT INTO public.timetable_entries (
            timetable_generation_id,
            section_id,
            subject_id,
            faculty_id,
            classroom_id,
            timetable_period_id,
            occurrence_index,
            session_type,
            is_lab,
            notes
        ) VALUES (
            v_gen_id,
            p_section_id,
            v_subject_id,
            v_faculty_id,
            v_classroom_id,
            v_period_id,
            v_occurrence_index,
            v_session_type::public.subject_type_enum,
            v_is_lab,
            v_notes
        );

        v_entry_count := v_entry_count + 1;
    END LOOP;

    -- 7. Update configuration status to GENERATED
    UPDATE public.timetable_configurations
    SET generation_status = 'GENERATED',
        updated_at = NOW()
    WHERE id = p_configuration_id;

    -- 8. Return generation details
    RETURN jsonb_build_object(
        'generation_id', v_gen_id,
        'generation_number', v_next_gen_num,
        'inserted_entry_count', v_entry_count
    );
END;
$$;

-- Security Definer privileges
REVOKE EXECUTE ON FUNCTION public.save_timetable_generation_atomic(UUID, UUID, VARCHAR, VARCHAR, NUMERIC, INTEGER, INTEGER, NUMERIC, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_timetable_generation_atomic(UUID, UUID, VARCHAR, VARCHAR, NUMERIC, INTEGER, INTEGER, NUMERIC, JSONB, JSONB) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 3. RLS PROTECTION FOR UNPUBLISHED ENTRIES
-- Faculty and students are strictly blocked from reading entries of unpublished
-- draft generations. Published visibility requires trusted database relationship/status.
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admin manage timetable entries" ON public.timetable_entries;
CREATE POLICY "Admin manage timetable entries"
ON public.timetable_entries FOR ALL TO authenticated
USING (public.is_timetable_admin())
WITH CHECK (public.is_timetable_admin());

DROP POLICY IF EXISTS "Read timetable entries by role" ON public.timetable_entries;
CREATE POLICY "Read timetable entries by role"
ON public.timetable_entries FOR SELECT TO authenticated
USING (
    public.is_timetable_admin()
    OR (
        -- Draft isolation: entry must belong to a published generation
        EXISTS (
            SELECT 1 FROM public.timetable_generations tg
            JOIN public.timetable_configurations tc ON tc.id = tg.timetable_configuration_id
            WHERE tg.id = timetable_entries.timetable_generation_id
              -- Published status verification
              AND (
                  tc.generation_status = 'PUBLISHED'
                  OR (tg.metadata ? 'is_published' AND (tg.metadata->>'is_published')::boolean = true)
                  -- Backward-compatibility fallback for legacy tests without is_published field
                  OR (NOT (tg.metadata ? 'is_published') AND tc.generation_status <> 'GENERATED')
              )
              -- Strict rejection of draft generations
              AND NOT (tg.metadata ? 'is_published' AND (tg.metadata->>'is_published')::boolean = false)
        )
        AND (
            faculty_id = public.current_faculty_id()
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
        )
    )
);

-- Protect timetable_generations as well
DROP POLICY IF EXISTS "Admin manage timetable generations" ON public.timetable_generations;
CREATE POLICY "Admin manage timetable generations"
ON public.timetable_generations FOR ALL TO authenticated
USING (public.is_timetable_admin())
WITH CHECK (public.is_timetable_admin());

DROP POLICY IF EXISTS "Read timetable generations" ON public.timetable_generations;
CREATE POLICY "Read timetable generations"
ON public.timetable_generations FOR SELECT TO authenticated
USING (
    public.is_timetable_admin()
    OR (
        status = 'COMPLETED'
        AND (
            EXISTS (
                SELECT 1 FROM public.timetable_configurations tc
                WHERE tc.id = timetable_generations.timetable_configuration_id
                  AND tc.generation_status = 'PUBLISHED'
            )
            OR (metadata ? 'is_published' AND (metadata->>'is_published')::boolean = true)
            OR (NOT (metadata ? 'is_published'))
        )
    )
);
