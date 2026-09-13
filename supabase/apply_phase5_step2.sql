-- ==============================================================================
-- SMART ACADEMIC MANAGEMENT SYSTEM (SAMS)
-- PHASE 5 STEP 5.2: ATTENDANCE PERSISTENCE, CANONICAL ENUMS & ROW LEVEL SECURITY
-- Execute in Supabase SQL Editor: https://supabase.com/dashboard/project/xlkhqimanlpuvstqcwti/sql
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. GUARDED MIGRATION CHECK
-- Protect against destructive schema changes if any production rows exist.
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_sess_count INTEGER := 0;
    v_rec_count INTEGER := 0;
BEGIN
    IF to_regclass('public.attendance_sessions') IS NOT NULL THEN
        EXECUTE 'SELECT count(*) FROM public.attendance_sessions' INTO v_sess_count;
    END IF;
    IF to_regclass('public.attendance_records') IS NOT NULL THEN
        EXECUTE 'SELECT count(*) FROM public.attendance_records' INTO v_rec_count;
    END IF;

    IF v_sess_count > 0 OR v_rec_count > 0 THEN
        RAISE EXCEPTION 'Guarded migration aborted: attendance_sessions has % rows, attendance_records has % rows. Tables must be empty to proceed with clean schema alignment.', v_sess_count, v_rec_count;
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. CANONICAL ATTENDANCE ENUMS
-- Reuses existing public.attendance_status ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED')
-- Creates canonical attendance_session_status_enum and recognition_method_enum
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'attendance_session_status_enum') THEN
        CREATE TYPE public.attendance_session_status_enum AS ENUM ('OPEN', 'CLOSED', 'CANCELLED');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'recognition_method_enum') THEN
        CREATE TYPE public.recognition_method_enum AS ENUM ('MANUAL', 'FACIAL_RECOGNITION', 'IMPORT');
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 3. HARDEN AUDIT LOGGING FUNCTION
-- Sets search_path = public, pg_temp and ensures safe recording of all actions
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_audit_event()
RETURNS TRIGGER AS $$
DECLARE
    current_actor_id UUID;
    action_type TEXT;
    entity_id_val UUID;
    old_data JSONB := NULL;
    new_data JSONB := NULL;
BEGIN
    current_actor_id := auth.uid();
    action_type := TG_OP || '_' || TG_TABLE_NAME;

    IF (TG_OP = 'DELETE') THEN
        entity_id_val := OLD.id;
        old_data := to_jsonb(OLD);
    ELSIF (TG_OP = 'UPDATE') THEN
        entity_id_val := NEW.id;
        old_data := to_jsonb(OLD);
        new_data := to_jsonb(NEW);
    ELSIF (TG_OP = 'INSERT') THEN
        entity_id_val := NEW.id;
        new_data := to_jsonb(NEW);
    END IF;

    -- Insert into audit_logs
    INSERT INTO public.audit_logs (
        user_id,
        action,
        entity_name,
        entity_id,
        old_values,
        new_values,
        created_at
    ) VALUES (
        current_actor_id,
        action_type,
        TG_TABLE_NAME,
        entity_id_val,
        old_data,
        new_data,
        NOW()
    );

    IF (TG_OP = 'DELETE') THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ------------------------------------------------------------------------------
-- 4. DROP PROTOTYPE POLICIES & TRIGGERS BEFORE TABLE RECREATION
-- ------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS audit_attendance_sessions ON public.attendance_sessions;

DROP POLICY IF EXISTS "View attendance sessions" ON public.attendance_sessions;
DROP POLICY IF EXISTS "Faculty conduct sessions" ON public.attendance_sessions;
DROP POLICY IF EXISTS "admin_all_attendance_sessions" ON public.attendance_sessions;
DROP POLICY IF EXISTS "faculty_select_attendance_sessions" ON public.attendance_sessions;
DROP POLICY IF EXISTS "faculty_insert_attendance_sessions" ON public.attendance_sessions;
DROP POLICY IF EXISTS "faculty_update_attendance_sessions" ON public.attendance_sessions;
DROP POLICY IF EXISTS "student_select_attendance_sessions" ON public.attendance_sessions;

DROP POLICY IF EXISTS "Students view own attendance records" ON public.attendance_records;
DROP POLICY IF EXISTS "Faculty and Admins mark attendance" ON public.attendance_records;
DROP POLICY IF EXISTS "admin_all_attendance_records" ON public.attendance_records;
DROP POLICY IF EXISTS "faculty_select_attendance_records" ON public.attendance_records;
DROP POLICY IF EXISTS "faculty_insert_attendance_records" ON public.attendance_records;
DROP POLICY IF EXISTS "faculty_update_attendance_records" ON public.attendance_records;
DROP POLICY IF EXISTS "student_select_own_attendance_records" ON public.attendance_records;

-- Guarded drop of prototype tables (verified empty above)
DROP TABLE IF EXISTS public.attendance_records CASCADE;
DROP TABLE IF EXISTS public.attendance_sessions CASCADE;

-- ------------------------------------------------------------------------------
-- 5. ATTENDANCE SESSIONS TABLE
-- Restrictive delete foreign keys protect academic master data and history.
-- ------------------------------------------------------------------------------
CREATE TABLE public.attendance_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NULL, -- Nullable; ready for future multi-tenancy without broken FK
    academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE RESTRICT,
    section_id UUID NOT NULL REFERENCES public.class_sections(id) ON DELETE RESTRICT,
    subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE RESTRICT,
    faculty_id UUID NOT NULL REFERENCES public.faculty(id) ON DELETE RESTRICT,
    classroom_id UUID NULL REFERENCES public.classrooms(id) ON DELETE RESTRICT,
    timetable_entry_id UUID NULL REFERENCES public.timetable_entries(id) ON DELETE SET NULL,
    session_date DATE NOT NULL DEFAULT CURRENT_DATE,
    start_time TIME NOT NULL,
    end_time TIME NULL, -- Nullable; end_time > start_time when provided
    status public.attendance_session_status_enum NOT NULL DEFAULT 'OPEN',
    created_by UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_session_time_window CHECK (end_time IS NULL OR end_time > start_time)
);

COMMENT ON TABLE public.attendance_sessions IS 'Attendance class sessions conducted by faculty for an enrolled cohort';
COMMENT ON COLUMN public.attendance_sessions.institution_id IS 'Optional institution reference; not yet bound to an institutions table';
COMMENT ON COLUMN public.attendance_sessions.end_time IS 'Nullable session end time; must strictly exceed start_time if present';

-- ------------------------------------------------------------------------------
-- 6. ATTENDANCE RECORDS TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE public.attendance_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.attendance_sessions(id) ON DELETE RESTRICT,
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE RESTRICT,
    status public.attendance_status NOT NULL DEFAULT 'PRESENT',
    confidence_score NUMERIC(4, 3) NULL CHECK (confidence_score IS NULL OR (confidence_score >= 0.0 AND confidence_score <= 1.0)),
    marked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    marked_by UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
    recognition_method public.recognition_method_enum NOT NULL DEFAULT 'MANUAL',
    remarks TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_attendance_session_student UNIQUE (session_id, student_id)
);

COMMENT ON TABLE public.attendance_records IS 'Student attendance status records tied to a specific attendance session';
COMMENT ON COLUMN public.attendance_records.marked_by IS 'Profile UUID of the authenticated actor or faculty who recorded attendance';
COMMENT ON COLUMN public.attendance_records.confidence_score IS 'Inclusive range 0.0 to 1.0 for facial recognition confidence';

-- ------------------------------------------------------------------------------
-- 7. INDEXES
-- ------------------------------------------------------------------------------
CREATE INDEX idx_attendance_sessions_institution ON public.attendance_sessions(institution_id);
CREATE INDEX idx_attendance_sessions_academic_year ON public.attendance_sessions(academic_year_id);
CREATE INDEX idx_attendance_sessions_section ON public.attendance_sessions(section_id);
CREATE INDEX idx_attendance_sessions_subject ON public.attendance_sessions(subject_id);
CREATE INDEX idx_attendance_sessions_faculty ON public.attendance_sessions(faculty_id);
CREATE INDEX idx_attendance_sessions_date ON public.attendance_sessions(session_date);

CREATE INDEX idx_attendance_records_session ON public.attendance_records(session_id);
CREATE INDEX idx_attendance_records_student ON public.attendance_records(student_id);

-- ------------------------------------------------------------------------------
-- 8. REATTACH AUDIT LOG TRIGGER
-- ------------------------------------------------------------------------------
CREATE TRIGGER audit_attendance_sessions
AFTER INSERT OR UPDATE OR DELETE ON public.attendance_sessions
FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

-- ------------------------------------------------------------------------------
-- 9. ROW LEVEL SECURITY (RLS)
-- ------------------------------------------------------------------------------
ALTER TABLE public.attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

-- 9.1 ADMINISTRATOR POLICIES
CREATE POLICY "admin_all_attendance_sessions"
ON public.attendance_sessions FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "admin_all_attendance_records"
ON public.attendance_records FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 9.2 FACULTY POLICIES (Sessions)
-- Faculty can view sessions they are assigned to
CREATE POLICY "faculty_select_attendance_sessions"
ON public.attendance_sessions FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.faculty f
        WHERE f.id = attendance_sessions.faculty_id
        AND (f.profile_id = auth.uid() OR f.id = auth.uid())
    )
);

-- Faculty can create sessions only for permitted subjects, sections, and academic year
CREATE POLICY "faculty_insert_attendance_sessions"
ON public.attendance_sessions FOR INSERT TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.faculty f
        JOIN public.faculty_subjects fs ON fs.faculty_id = f.id
        WHERE f.id = attendance_sessions.faculty_id
        AND (f.profile_id = auth.uid() OR f.id = auth.uid())
        AND fs.subject_id = attendance_sessions.subject_id
        AND fs.section_id = attendance_sessions.section_id
        AND fs.academic_year_id = attendance_sessions.academic_year_id
    )
    AND (
        attendance_sessions.created_by IS NULL 
        OR attendance_sessions.created_by = auth.uid()
    )
);

-- Faculty can update their own OPEN sessions
CREATE POLICY "faculty_update_attendance_sessions"
ON public.attendance_sessions FOR UPDATE TO authenticated
USING (
    status = 'OPEN' AND EXISTS (
        SELECT 1 FROM public.faculty f
        WHERE f.id = attendance_sessions.faculty_id
        AND (f.profile_id = auth.uid() OR f.id = auth.uid())
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.faculty f
        WHERE f.id = attendance_sessions.faculty_id
        AND (f.profile_id = auth.uid() OR f.id = auth.uid())
    )
);

-- 9.3 FACULTY POLICIES (Records)
-- Faculty can view records for sessions they teach
CREATE POLICY "faculty_select_attendance_records"
ON public.attendance_records FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.attendance_sessions s
        JOIN public.faculty f ON f.id = s.faculty_id
        WHERE s.id = attendance_records.session_id
        AND (f.profile_id = auth.uid() OR f.id = auth.uid())
    )
);

-- Faculty can insert records into their own OPEN sessions
CREATE POLICY "faculty_insert_attendance_records"
ON public.attendance_records FOR INSERT TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.attendance_sessions s
        JOIN public.faculty f ON f.id = s.faculty_id
        WHERE s.id = attendance_records.session_id
        AND (f.profile_id = auth.uid() OR f.id = auth.uid())
        AND s.status = 'OPEN'
    )
);

-- Faculty can update records in their own OPEN sessions
CREATE POLICY "faculty_update_attendance_records"
ON public.attendance_records FOR UPDATE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.attendance_sessions s
        JOIN public.faculty f ON f.id = s.faculty_id
        WHERE s.id = attendance_records.session_id
        AND (f.profile_id = auth.uid() OR f.id = auth.uid())
        AND s.status = 'OPEN'
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.attendance_sessions s
        JOIN public.faculty f ON f.id = s.faculty_id
        WHERE s.id = attendance_records.session_id
        AND (f.profile_id = auth.uid() OR f.id = auth.uid())
        AND s.status = 'OPEN'
    )
);

-- 9.4 STUDENT POLICIES
-- Students can view sessions matching their enrolled section & academic year
CREATE POLICY "student_select_attendance_sessions"
ON public.attendance_sessions FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.students st
        JOIN public.student_enrollments se ON se.student_id = st.id
        WHERE (st.profile_id = auth.uid() OR st.id = auth.uid())
        AND se.section_id = attendance_sessions.section_id
        AND se.academic_year_id = attendance_sessions.academic_year_id
        AND se.is_active = true
    )
    OR EXISTS (
        SELECT 1 FROM public.students st
        WHERE (st.profile_id = auth.uid() OR st.id = auth.uid())
        AND st.current_section_id = attendance_sessions.section_id
    )
);

-- Students can read only their own attendance records
CREATE POLICY "student_select_own_attendance_records"
ON public.attendance_records FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.students st
        WHERE st.id = attendance_records.student_id
        AND (st.profile_id = auth.uid() OR st.id = auth.uid())
    )
);

-- ------------------------------------------------------------------------------
-- 10. ATOMIC TRANSACTION RPC: save_attendance_records_atomic
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_attendance_records_atomic(
    p_session_id UUID,
    p_records JSONB,
    p_close_session BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID;
    v_session RECORD;
    v_student RECORD;
    v_item JSONB;
    v_student_id UUID;
    v_status public.attendance_status;
    v_raw_status TEXT;
    v_method public.recognition_method_enum;
    v_raw_method TEXT;
    v_confidence NUMERIC;
    v_remarks TEXT;
    v_is_enrolled BOOLEAN;
    v_saved_count INTEGER := 0;
BEGIN
    -- 1. Authentication Check
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL AND auth.role() != 'service_role' THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;

    -- 2. Lock and Validate Attendance Session
    SELECT * INTO v_session
    FROM public.attendance_sessions
    WHERE id = p_session_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Attendance session % not found', p_session_id USING ERRCODE = 'P0002';
    END IF;

    -- 3. Session Status Check (Must be OPEN)
    IF v_session.status IN ('CLOSED', 'CANCELLED') THEN
        RAISE EXCEPTION 'Cannot modify attendance for a % session', v_session.status USING ERRCODE = 'P0001';
    END IF;

    -- 4. Caller Authorization Guard (Administrator OR Assigned Faculty)
    IF NOT (
        public.is_admin()
        OR EXISTS (
            SELECT 1 FROM public.faculty f
            WHERE f.id = v_session.faculty_id
            AND (f.profile_id = v_caller_id OR f.id = v_caller_id)
        )
    ) THEN
        RAISE EXCEPTION 'Caller is not authorized to manage attendance for this session' USING ERRCODE = '42501';
    END IF;

    -- 5. Payload Validation
    IF p_records IS NULL OR jsonb_typeof(p_records) != 'array' OR jsonb_array_length(p_records) = 0 THEN
        RAISE EXCEPTION 'Attendance records payload must be a non-empty JSON array' USING ERRCODE = '22023';
    END IF;

    -- Reject duplicate student IDs in the input payload
    IF (SELECT count(DISTINCT (item->>'student_id')) FROM jsonb_array_elements(p_records) AS item) < jsonb_array_length(p_records) THEN
        RAISE EXCEPTION 'Duplicate student IDs detected in bulk attendance submission' USING ERRCODE = '23505';
    END IF;

    -- 6. Process and Insert/Upsert Each Student Record Atomically
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_records)
    LOOP
        IF v_item->>'student_id' IS NULL OR trim(v_item->>'student_id') = '' THEN
            RAISE EXCEPTION 'Missing or empty student_id in record payload' USING ERRCODE = '22023';
        END IF;

        BEGIN
            v_student_id := (v_item->>'student_id')::UUID;
        EXCEPTION WHEN OTHERS THEN
            RAISE EXCEPTION 'Malformed student UUID: %', v_item->>'student_id' USING ERRCODE = '22P02';
        END;

        -- Verify Student Exists in Master Data
        SELECT * INTO v_student
        FROM public.students
        WHERE id = v_student_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Student % does not exist in student master data', v_student_id USING ERRCODE = '23503';
        END IF;

        -- Strict Student Eligibility Check:
        -- Active enrollment in student_enrollments matching subject, section, and academic_year
        SELECT EXISTS (
            SELECT 1 FROM public.student_enrollments se
            WHERE se.student_id = v_student_id
            AND se.subject_id = v_session.subject_id
            AND se.section_id = v_session.section_id
            AND se.academic_year_id = v_session.academic_year_id
            AND se.is_active = true
        ) INTO v_is_enrolled;

        IF NOT v_is_enrolled THEN
            RAISE EXCEPTION 'Student % is not actively enrolled in section % for subject % in academic year %', 
                v_student_id, v_session.section_id, v_session.subject_id, v_session.academic_year_id 
                USING ERRCODE = 'P0003';
        END IF;

        -- Validate Status
        IF v_item->>'status' IS NULL OR trim(v_item->>'status') = '' THEN
            RAISE EXCEPTION 'Missing or empty status in record payload' USING ERRCODE = '22023';
        END IF;

        v_raw_status := upper(trim(v_item->>'status'));
        IF v_raw_status NOT IN ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED') THEN
            RAISE EXCEPTION 'Invalid attendance status: %', v_raw_status USING ERRCODE = '22P02';
        END IF;
        v_status := v_raw_status::public.attendance_status;

        -- Validate & Normalize Recognition Method
        v_raw_method := upper(trim(coalesce(v_item->>'recognition_method', 'MANUAL')));
        IF v_raw_method = 'AI_FACE_RECOGNITION' THEN
            v_raw_method := 'FACIAL_RECOGNITION';
        ELSIF v_raw_method IN ('FACULTY_OVERRIDE', 'MANUAL_ENTRY') THEN
            v_raw_method := 'MANUAL';
        END IF;

        IF v_raw_method NOT IN ('MANUAL', 'FACIAL_RECOGNITION', 'IMPORT') THEN
            RAISE EXCEPTION 'Invalid recognition method: %', v_raw_method USING ERRCODE = '22P02';
        END IF;
        v_method := v_raw_method::public.recognition_method_enum;

        -- Validate Confidence Score (0.0 to 1.0 inclusive)
        IF v_item ? 'confidence_score' AND v_item->>'confidence_score' IS NOT NULL THEN
            v_confidence := (v_item->>'confidence_score')::NUMERIC;
            IF v_confidence < 0.0 OR v_confidence > 1.0 THEN
                RAISE EXCEPTION 'Confidence score must be between 0.0 and 1.0 inclusive (received %)', v_confidence USING ERRCODE = '22003';
            END IF;
        ELSE
            v_confidence := NULL;
        END IF;

        -- Remarks / Override Reason
        v_remarks := coalesce(v_item->>'remarks', v_item->>'override_reason');

        -- Upsert Record Atomically
        -- marked_by is derived securely from v_caller_id (auth.uid()), never trusting client payload
        INSERT INTO public.attendance_records (
            session_id,
            student_id,
            status,
            confidence_score,
            marked_at,
            marked_by,
            recognition_method,
            remarks,
            created_at,
            updated_at
        ) VALUES (
            p_session_id,
            v_student_id,
            v_status,
            v_confidence,
            NOW(),
            v_caller_id,
            v_method,
            v_remarks,
            NOW(),
            NOW()
        )
        ON CONFLICT (session_id, student_id) DO UPDATE SET
            status = EXCLUDED.status,
            confidence_score = EXCLUDED.confidence_score,
            marked_at = EXCLUDED.marked_at,
            marked_by = EXCLUDED.marked_by,
            recognition_method = EXCLUDED.recognition_method,
            remarks = EXCLUDED.remarks,
            updated_at = NOW();

        v_saved_count := v_saved_count + 1;
    END LOOP;

    -- 7. Optional Session Closure
    IF p_close_session = TRUE THEN
        UPDATE public.attendance_sessions
        SET status = 'CLOSED', updated_at = NOW()
        WHERE id = p_session_id;
        v_session.status := 'CLOSED';
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'session_id', p_session_id,
        'saved_count', v_saved_count,
        'status', v_session.status
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_attendance_records_atomic(UUID, JSONB, BOOLEAN) TO authenticated;
