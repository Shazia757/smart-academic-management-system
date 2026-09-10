-- ==============================================================================
-- SMART ACADEMIC MANAGEMENT SYSTEM (SAMS) — CONSOLIDATED SETUP SCRIPT
-- Execute this entire script in Supabase Dashboard -> SQL Editor
-- URL: https://supabase.com/dashboard/project/xlkhqimanlpuvstqcwti/sql
-- ==============================================================================

-- ==============================================================================
-- SECTION: supabase/migrations/20260910000001_initial_schema.sql
-- ==============================================================================

-- ==============================================================================
-- SMART ACADEMIC MANAGEMENT SYSTEM (SAMS)
-- MIGRATION 001: INITIAL NORMALIZED SCHEMA
-- ==============================================================================

-- Enable UUID generation extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable pgcrypto for secure hashing if needed
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Attempt to enable pgvector extension if available in the PostgreSQL environment
-- (Future-proofed for 6th-semester RAG, semantic search, and biometric vector math)
DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS "vector";
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pgvector extension not installed or not supported in this environment. Falling back to native float8[] array for embeddings.';
END $$;

-- ------------------------------------------------------------------------------
-- 1. CUSTOM ENUMS
-- ------------------------------------------------------------------------------
CREATE TYPE user_role AS ENUM (
    'super_admin',
    'college_admin',
    'faculty',
    'student'
);

CREATE TYPE room_type_enum AS ENUM (
    'LECTURE_HALL',
    'LABORATORY',
    'SEMINAR_ROOM',
    'AUDITORIUM',
    'TUTORIAL_ROOM'
);

CREATE TYPE semester_term AS ENUM (
    'ODD',
    'EVEN'
);

CREATE TYPE timetable_status AS ENUM (
    'DRAFT',
    'OPTIMIZING',
    'GENERATED',
    'PUBLISHED',
    'ARCHIVED'
);

CREATE TYPE session_status AS ENUM (
    'SCHEDULED',
    'ACTIVE',
    'COMPLETED',
    'CANCELLED'
);

CREATE TYPE attendance_status AS ENUM (
    'PRESENT',
    'ABSENT',
    'LATE',
    'EXCUSED'
);

CREATE TYPE verification_method AS ENUM (
    'AI_FACE_RECOGNITION',
    'FACULTY_OVERRIDE',
    'MANUAL_ENTRY'
);

CREATE TYPE notification_type AS ENUM (
    'TIMETABLE_UPDATE',
    'ROOM_CHANGE',
    'CLASS_CANCELLED',
    'ATTENDANCE_WARNING',
    'ACADEMIC_ANNOUNCEMENT',
    'SYSTEM'
);

-- ------------------------------------------------------------------------------
-- 2. USER PROFILES (Linked 1:1 with auth.users)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    role user_role NOT NULL DEFAULT 'student',
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    avatar_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_profiles_role ON public.profiles(role);
CREATE INDEX idx_profiles_email ON public.profiles(email);

-- ------------------------------------------------------------------------------
-- 3. INSTITUTIONAL HIERARCHY
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    head_of_department_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.academic_years (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) UNIQUE NOT NULL, -- e.g. "2026-2027"
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_current BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_academic_year_dates CHECK (end_date > start_date)
);

CREATE TABLE IF NOT EXISTS public.semesters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL, -- e.g. "Semester 5 (Odd 2026)"
    semester_number INT NOT NULL CHECK (semester_number BETWEEN 1 AND 8),
    term_type semester_term NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_semester_dates CHECK (end_date > start_date),
    UNIQUE (academic_year_id, semester_number)
);

CREATE TABLE IF NOT EXISTS public.class_sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
    semester_id UUID NOT NULL REFERENCES public.semesters(id) ON DELETE CASCADE,
    name VARCHAR(10) NOT NULL, -- e.g. "A", "B", "C"
    capacity INT NOT NULL DEFAULT 60 CHECK (capacity > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (department_id, semester_id, name)
);

CREATE TABLE IF NOT EXISTS public.classrooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_number VARCHAR(50) UNIQUE NOT NULL,
    building VARCHAR(100) NOT NULL,
    floor INT NOT NULL DEFAULT 1,
    room_type room_type_enum NOT NULL DEFAULT 'LECTURE_HALL',
    capacity INT NOT NULL CHECK (capacity > 0),
    facilities JSONB NOT NULL DEFAULT '[]'::jsonb, -- e.g. ["PROJECTOR", "AC", "SMART_BOARD"]
    is_available BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_classrooms_type ON public.classrooms(room_type);
CREATE INDEX idx_classrooms_capacity ON public.classrooms(capacity);

-- ------------------------------------------------------------------------------
-- 4. FACULTY & SUBJECTS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.faculty (
    id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    employee_id VARCHAR(50) UNIQUE NOT NULL,
    department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE RESTRICT,
    designation VARCHAR(100) NOT NULL, -- e.g. "Associate Professor", "Assistant Professor"
    qualification VARCHAR(150) NOT NULL, -- e.g. "Ph.D in Computer Science"
    max_weekly_hours INT NOT NULL DEFAULT 20 CHECK (max_weekly_hours > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.faculty_availability (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    faculty_id UUID NOT NULL REFERENCES public.faculty(id) ON DELETE CASCADE,
    day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 1 AND 6), -- 1=Monday, 6=Saturday
    period_slot INT NOT NULL CHECK (period_slot BETWEEN 1 AND 10),
    is_available BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(faculty_id, day_of_week, period_slot)
);

CREATE TABLE IF NOT EXISTS public.subjects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(30) UNIQUE NOT NULL,
    name VARCHAR(150) NOT NULL,
    department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
    semester_id UUID NOT NULL REFERENCES public.semesters(id) ON DELETE CASCADE,
    credits INT NOT NULL CHECK (credits > 0),
    lecture_hours_per_week INT NOT NULL DEFAULT 3 CHECK (lecture_hours_per_week >= 0),
    lab_hours_per_week INT NOT NULL DEFAULT 0 CHECK (lab_hours_per_week >= 0),
    total_weekly_periods INT NOT NULL DEFAULT 4 CHECK (total_weekly_periods > 0),
    is_lab BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.faculty_subjects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    faculty_id UUID NOT NULL REFERENCES public.faculty(id) ON DELETE CASCADE,
    subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
    section_id UUID NOT NULL REFERENCES public.class_sections(id) ON DELETE CASCADE,
    academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
    is_primary BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (faculty_id, subject_id, section_id, academic_year_id)
);

-- ------------------------------------------------------------------------------
-- 5. STUDENTS & ENROLLMENTS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.students (
    id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    roll_number VARCHAR(50) UNIQUE NOT NULL,
    usn VARCHAR(50) UNIQUE NOT NULL, -- University Seat Number / Registration No.
    department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE RESTRICT,
    current_semester_id UUID NOT NULL REFERENCES public.semesters(id) ON DELETE RESTRICT,
    current_section_id UUID NOT NULL REFERENCES public.class_sections(id) ON DELETE RESTRICT,
    admission_year INT NOT NULL,
    guardian_name VARCHAR(100),
    guardian_contact VARCHAR(20),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_students_dept_section ON public.students(department_id, current_section_id);

CREATE TABLE IF NOT EXISTS public.student_enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
    section_id UUID NOT NULL REFERENCES public.class_sections(id) ON DELETE CASCADE,
    semester_id UUID NOT NULL REFERENCES public.semesters(id) ON DELETE CASCADE,
    academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (student_id, subject_id, semester_id)
);

-- ------------------------------------------------------------------------------
-- 6. TIMETABLE MANAGEMENT (OR-Tools Powered)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.timetable_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
    department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
    semester_id UUID NOT NULL REFERENCES public.semesters(id) ON DELETE CASCADE,
    working_days INT[] NOT NULL DEFAULT '{1,2,3,4,5}', -- 1=Monday, 5=Friday
    periods_per_day INT NOT NULL DEFAULT 7 CHECK (periods_per_day BETWEEN 4 AND 10),
    slot_duration_minutes INT NOT NULL DEFAULT 55,
    start_time TIME NOT NULL DEFAULT '09:00:00',
    break_slots JSONB NOT NULL DEFAULT '[{"period": 4, "duration": 45, "label": "Lunch Break"}]'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.timetables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    config_id UUID NOT NULL REFERENCES public.timetable_configs(id) ON DELETE CASCADE,
    section_id UUID NOT NULL REFERENCES public.class_sections(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    status timetable_status NOT NULL DEFAULT 'DRAFT',
    solver_metadata JSONB DEFAULT '{}'::jsonb, -- Solve time, objective value, soft constraint scores
    published_at TIMESTAMPTZ,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.timetable_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timetable_id UUID NOT NULL REFERENCES public.timetables(id) ON DELETE CASCADE,
    day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 1 AND 6),
    period_index INT NOT NULL CHECK (period_index BETWEEN 1 AND 10),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
    faculty_id UUID NOT NULL REFERENCES public.faculty(id) ON DELETE CASCADE,
    classroom_id UUID NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_entry_time CHECK (end_time > start_time),
    UNIQUE (timetable_id, day_of_week, period_index)
);

CREATE INDEX idx_entries_faculty ON public.timetable_entries(faculty_id, day_of_week, period_index);
CREATE INDEX idx_entries_room ON public.timetable_entries(classroom_id, day_of_week, period_index);

-- ------------------------------------------------------------------------------
-- 7. BIOMETRIC FACE EMBEDDINGS (Configurable, Secure Representation)
-- ------------------------------------------------------------------------------
-- Note: Designed for 512-dimensional ArcFace / InsightFace representations.
-- Stored as high-precision float8[] array with optional pgvector casting.
CREATE TABLE IF NOT EXISTS public.face_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    embedding DOUBLE PRECISION[] NOT NULL, -- 512-element normalized numerical array
    dimension INT NOT NULL DEFAULT 512,
    model_name VARCHAR(50) NOT NULL DEFAULT 'buffalo_l_arcface512',
    quality_score FLOAT NOT NULL CHECK (quality_score BETWEEN 0.0 AND 1.0),
    enrolled_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_embedding_dimension CHECK (array_length(embedding, 1) = dimension)
);

CREATE UNIQUE INDEX idx_student_face_embedding ON public.face_embeddings(student_id);

-- ------------------------------------------------------------------------------
-- 8. ATTENDANCE SESSIONS & RECORDS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.attendance_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
    section_id UUID NOT NULL REFERENCES public.class_sections(id) ON DELETE CASCADE,
    faculty_id UUID NOT NULL REFERENCES public.faculty(id) ON DELETE CASCADE,
    classroom_id UUID NOT NULL REFERENCES public.classrooms(id) ON DELETE RESTRICT,
    timetable_entry_id UUID REFERENCES public.timetable_entries(id) ON DELETE SET NULL,
    session_date DATE NOT NULL DEFAULT CURRENT_DATE,
    start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    end_time TIMESTAMPTZ,
    status session_status NOT NULL DEFAULT 'ACTIVE',
    verification_method verification_method NOT NULL DEFAULT 'AI_FACE_RECOGNITION',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.attendance_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.attendance_sessions(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    status attendance_status NOT NULL DEFAULT 'PRESENT',
    confidence_score FLOAT CHECK (confidence_score BETWEEN 0.0 AND 1.0),
    verification_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    marked_by verification_method NOT NULL DEFAULT 'AI_FACE_RECOGNITION',
    override_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (session_id, student_id)
);

CREATE INDEX idx_attendance_records_student ON public.attendance_records(student_id);
CREATE INDEX idx_attendance_records_session ON public.attendance_records(session_id);

-- ------------------------------------------------------------------------------
-- 9. NOTIFICATIONS & REALTIME
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title VARCHAR(150) NOT NULL,
    message TEXT NOT NULL,
    type notification_type NOT NULL DEFAULT 'SYSTEM',
    is_read BOOLEAN NOT NULL DEFAULT false,
    action_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_unread ON public.notifications(user_id, is_read);

-- ------------------------------------------------------------------------------
-- 10. SYSTEM AUDIT LOGS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL, -- e.g. "CREATE_STUDENT", "PUBLISH_TIMETABLE", "OVERRIDE_ATTENDANCE"
    entity_name VARCHAR(100) NOT NULL, -- e.g. "timetables", "students"
    entity_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_entity ON public.audit_logs(entity_name, entity_id);
CREATE INDEX idx_audit_logs_user ON public.audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs(created_at DESC);


-- ==============================================================================
-- SECTION: supabase/migrations/20260910000002_rls_policies.sql
-- ==============================================================================

-- ==============================================================================
-- SMART ACADEMIC MANAGEMENT SYSTEM (SAMS)
-- MIGRATION 002: ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

-- Enable RLS across all sensitive tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.semesters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classrooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faculty ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faculty_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faculty_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timetable_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timetables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timetable_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.face_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- HELPER FUNCTIONS FOR ROLE VERIFICATION
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS user_role AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
    AND role IN ('super_admin', 'college_admin')
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ------------------------------------------------------------------------------
-- 1. PROFILES POLICIES
-- ------------------------------------------------------------------------------
CREATE POLICY "Public profiles read for authenticated users"
ON public.profiles FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

CREATE POLICY "Admins can manage all profiles"
ON public.profiles FOR ALL
TO authenticated
USING (public.is_admin());

-- ------------------------------------------------------------------------------
-- 2. ACADEMIC STRUCTURE (Departments, Years, Semesters, Sections, Classrooms)
-- ------------------------------------------------------------------------------
CREATE POLICY "Read access for all authenticated users on academic structure"
ON public.departments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin write access on departments"
ON public.departments FOR ALL TO authenticated USING (public.is_admin());

CREATE POLICY "Read access on academic years"
ON public.academic_years FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin write access on academic years"
ON public.academic_years FOR ALL TO authenticated USING (public.is_admin());

CREATE POLICY "Read access on semesters"
ON public.semesters FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin write access on semesters"
ON public.semesters FOR ALL TO authenticated USING (public.is_admin());

CREATE POLICY "Read access on class sections"
ON public.class_sections FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin write access on class sections"
ON public.class_sections FOR ALL TO authenticated USING (public.is_admin());

CREATE POLICY "Read access on classrooms"
ON public.classrooms FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin write access on classrooms"
ON public.classrooms FOR ALL TO authenticated USING (public.is_admin());

-- ------------------------------------------------------------------------------
-- 3. FACULTY & AVAILABILITY
-- ------------------------------------------------------------------------------
CREATE POLICY "Read faculty profiles"
ON public.faculty FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin write faculty"
ON public.faculty FOR ALL TO authenticated USING (public.is_admin());

CREATE POLICY "Faculty read availability"
ON public.faculty_availability FOR SELECT TO authenticated USING (true);
CREATE POLICY "Faculty can edit own availability"
ON public.faculty_availability FOR ALL TO authenticated
USING (faculty_id = auth.uid() OR public.is_admin());

-- ------------------------------------------------------------------------------
-- 4. SUBJECTS & ASSIGNMENTS
-- ------------------------------------------------------------------------------
CREATE POLICY "Read subjects"
ON public.subjects FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin write subjects"
ON public.subjects FOR ALL TO authenticated USING (public.is_admin());

CREATE POLICY "Read faculty subjects"
ON public.faculty_subjects FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin write faculty subjects"
ON public.faculty_subjects FOR ALL TO authenticated USING (public.is_admin());

-- ------------------------------------------------------------------------------
-- 5. STUDENTS & ENROLLMENTS
-- ------------------------------------------------------------------------------
CREATE POLICY "Staff read all students, students read self"
ON public.students FOR SELECT TO authenticated
USING (
  public.is_admin() 
  OR public.current_user_role() = 'faculty' 
  OR id = auth.uid()
);

CREATE POLICY "Admin write students"
ON public.students FOR ALL TO authenticated USING (public.is_admin());

CREATE POLICY "Read enrollments"
ON public.student_enrollments FOR SELECT TO authenticated
USING (
  public.is_admin() 
  OR public.current_user_role() = 'faculty' 
  OR student_id = auth.uid()
);

CREATE POLICY "Admin write enrollments"
ON public.student_enrollments FOR ALL TO authenticated USING (public.is_admin());

-- ------------------------------------------------------------------------------
-- 6. TIMETABLE
-- ------------------------------------------------------------------------------
CREATE POLICY "Read published timetables"
ON public.timetables FOR SELECT TO authenticated
USING (
  status = 'PUBLISHED' 
  OR public.is_admin() 
  OR created_by = auth.uid()
);

CREATE POLICY "Admin write timetables"
ON public.timetables FOR ALL TO authenticated USING (public.is_admin());

CREATE POLICY "Read published timetable entries"
ON public.timetable_entries FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.timetables 
    WHERE public.timetables.id = public.timetable_entries.timetable_id 
    AND (public.timetables.status = 'PUBLISHED' OR public.is_admin())
  )
);

CREATE POLICY "Admin write timetable entries"
ON public.timetable_entries FOR ALL TO authenticated USING (public.is_admin());

-- ------------------------------------------------------------------------------
-- 7. BIOMETRIC FACE EMBEDDINGS (HIGH SECURITY)
-- Students must NEVER read other students' biometric embeddings!
-- ------------------------------------------------------------------------------
CREATE POLICY "Admins and Faculty can read face embeddings for recognition"
ON public.face_embeddings FOR SELECT TO authenticated
USING (
  public.is_admin() 
  OR public.current_user_role() = 'faculty'
);

CREATE POLICY "Only Admins can insert/update face embeddings during enrollment"
ON public.face_embeddings FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- ------------------------------------------------------------------------------
-- 8. ATTENDANCE SESSIONS & RECORDS
-- ------------------------------------------------------------------------------
CREATE POLICY "View attendance sessions"
ON public.attendance_sessions FOR SELECT TO authenticated
USING (
  public.is_admin() 
  OR faculty_id = auth.uid() 
  OR EXISTS (
    SELECT 1 FROM public.students 
    WHERE public.students.id = auth.uid() 
    AND public.students.current_section_id = public.attendance_sessions.section_id
  )
);

CREATE POLICY "Faculty conduct sessions"
ON public.attendance_sessions FOR ALL TO authenticated
USING (faculty_id = auth.uid() OR public.is_admin());

CREATE POLICY "Students view own attendance records"
ON public.attendance_records FOR SELECT TO authenticated
USING (
  student_id = auth.uid() 
  OR public.is_admin() 
  OR EXISTS (
    SELECT 1 FROM public.attendance_sessions s 
    WHERE s.id = public.attendance_records.session_id 
    AND s.faculty_id = auth.uid()
  )
);

CREATE POLICY "Faculty and Admins mark attendance"
ON public.attendance_records FOR ALL TO authenticated
USING (
  public.is_admin() 
  OR EXISTS (
    SELECT 1 FROM public.attendance_sessions s 
    WHERE s.id = public.attendance_records.session_id 
    AND s.faculty_id = auth.uid()
  )
);

-- ------------------------------------------------------------------------------
-- 9. NOTIFICATIONS
-- ------------------------------------------------------------------------------
CREATE POLICY "Users read own notifications"
ON public.notifications FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users update own notification read status"
ON public.notifications FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "System/Admins insert notifications"
ON public.notifications FOR INSERT TO authenticated
WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 10. AUDIT LOGS
-- ------------------------------------------------------------------------------
CREATE POLICY "Super Admins and College Admins view audit logs"
ON public.audit_logs FOR SELECT TO authenticated
USING (public.is_admin());

CREATE POLICY "System inserts audit logs"
ON public.audit_logs FOR INSERT TO authenticated
WITH CHECK (true);


-- ==============================================================================
-- SECTION: supabase/migrations/20260910000003_audit_triggers.sql
-- ==============================================================================

-- ==============================================================================
-- SMART ACADEMIC MANAGEMENT SYSTEM (SAMS)
-- MIGRATION 003: AUDIT LOGGING & UPDATED_AT TRIGGERS
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. UPDATED_AT AUTOMATION TRIGGER
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN 
        SELECT table_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND column_name = 'updated_at'
    LOOP
        EXECUTE format('
            DROP TRIGGER IF EXISTS trg_set_updated_at ON public.%I;
            CREATE TRIGGER trg_set_updated_at
            BEFORE UPDATE ON public.%I
            FOR EACH ROW
            EXECUTE FUNCTION public.handle_updated_at();
        ', t, t);
    END LOOP;
END $$;

-- ------------------------------------------------------------------------------
-- 2. AUTOMATIC AUDIT LOGGING TRIGGER FUNCTION
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach audit log triggers to critical tables
DROP TRIGGER IF EXISTS audit_timetables ON public.timetables;
CREATE TRIGGER audit_timetables
AFTER INSERT OR UPDATE OR DELETE ON public.timetables
FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

DROP TRIGGER IF EXISTS audit_attendance_sessions ON public.attendance_sessions;
CREATE TRIGGER audit_attendance_sessions
AFTER INSERT OR UPDATE OR DELETE ON public.attendance_sessions
FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

DROP TRIGGER IF EXISTS audit_faculty_subjects ON public.faculty_subjects;
CREATE TRIGGER audit_faculty_subjects
AFTER INSERT OR UPDATE OR DELETE ON public.faculty_subjects
FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

DROP TRIGGER IF EXISTS audit_students ON public.students;
CREATE TRIGGER audit_students
AFTER INSERT OR UPDATE OR DELETE ON public.students
FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();


-- ==============================================================================
-- SECTION: supabase/migrations/20260910000004_auth_hooks_and_roles.sql
-- ==============================================================================

-- ==============================================================================
-- SMART ACADEMIC MANAGEMENT SYSTEM (SAMS)
-- MIGRATION 004: AUTH HOOKS, AUTOMATIC PROFILE CREATION & PRIVILEGE ESCALATION GUARDS
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. AUTOMATIC PROFILE CREATION ON AUTH.USERS INSERTION
-- SECURITY ENFORCEMENT: Client-controlled metadata (raw_user_meta_data) can NEVER
-- assign an elevated role. Privileged roles (super_admin, college_admin, faculty)
-- must be explicitly set via server-controlled raw_app_meta_data.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    assigned_role public.user_role;
    trusted_role TEXT;
BEGIN
    -- Only read role from raw_app_meta_data (strictly server/admin controlled)
    -- Client-supplied raw_user_meta_data is ignored for role assignment
    trusted_role := NEW.raw_app_meta_data->>'role';

    IF trusted_role = 'super_admin' THEN
        assigned_role := 'super_admin'::public.user_role;
    ELSIF trusted_role = 'college_admin' THEN
        assigned_role := 'college_admin'::public.user_role;
    ELSIF trusted_role = 'faculty' THEN
        assigned_role := 'faculty'::public.user_role;
    ELSE
        -- Safe default role for all self-registered or standard accounts: student
        assigned_role := 'student'::public.user_role;
    END IF;

    INSERT INTO public.profiles (
        id,
        email,
        role,
        first_name,
        last_name,
        phone,
        avatar_url,
        is_active,
        created_at,
        updated_at
    ) VALUES (
        NEW.id,
        NEW.email,
        assigned_role,
        COALESCE(NULLIF(NEW.raw_user_meta_data->>'first_name', ''), 'User'),
        COALESCE(NULLIF(NEW.raw_user_meta_data->>'last_name', ''), SPLIT_PART(NEW.email, '@', 1)),
        NEW.raw_user_meta_data->>'phone',
        NEW.raw_user_meta_data->>'avatar_url',
        true,
        NOW(),
        NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        updated_at = NOW();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger firing on every new user in auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ------------------------------------------------------------------------------
-- 2. HELPER FUNCTIONS FOR ROLE AUTHORIZATION CHECKS
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_role(check_role public.user_role)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
    AND role = check_role
    AND is_active = true
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.has_any_role(VARIADIC check_roles public.user_role[])
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
    AND role = ANY(check_roles)
    AND is_active = true
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ------------------------------------------------------------------------------
-- 3. PREVENT PRIVILEGE ESCALATION ON PROFILES
-- Ensure standard authenticated users cannot modify their own role or active status!
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile details" ON public.profiles;

CREATE POLICY "Users can update their own profile details"
ON public.profiles FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (
    id = auth.uid()
    -- Prohibit non-admins from changing their role or active status
    AND (
        (role = (SELECT role FROM public.profiles WHERE id = auth.uid()))
        OR public.is_admin()
    )
    AND (
        (is_active = (SELECT is_active FROM public.profiles WHERE id = auth.uid()))
        OR public.is_admin()
    )
);


-- ==============================================================================
-- SECTION: supabase/migrations/20260910000005_phase3_academic_master_data.sql
-- ==============================================================================

-- ==============================================================================
-- SMART ACADEMIC MANAGEMENT SYSTEM (SAMS)
-- MIGRATION 005: PHASE 3 ACADEMIC MASTER DATA, FK HARDENING & DECOUPLED IDENTITIES
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. CUSTOM ENUMS
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subject_type_enum') THEN
        CREATE TYPE public.subject_type_enum AS ENUM (
            'THEORY',
            'LABORATORY',
            'PRACTICAL',
            'ELECTIVE',
            'PROJECT'
        );
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. DEPARTMENTS ENHANCEMENTS
-- ------------------------------------------------------------------------------
ALTER TABLE public.departments 
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_department_code_format'
    ) THEN
        ALTER TABLE public.departments 
            ADD CONSTRAINT chk_department_code_format 
            CHECK (code ~ '^[A-Z0-9_-]{2,20}$');
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 3. ACADEMIC YEARS ENHANCEMENTS
-- ------------------------------------------------------------------------------
ALTER TABLE public.academic_years 
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_academic_year_name'
    ) THEN
        ALTER TABLE public.academic_years 
            ADD CONSTRAINT chk_academic_year_name 
            CHECK (name ~ '^[0-9]{4}-[0-9]{4}$');
    END IF;
END $$;

-- Partial unique index: at most ONE academic year can be is_current = true
CREATE UNIQUE INDEX IF NOT EXISTS idx_academic_years_single_current 
ON public.academic_years (is_current) 
WHERE is_current = true;

-- ------------------------------------------------------------------------------
-- 4. SEMESTERS ENHANCEMENTS & FK HARDENING
-- ------------------------------------------------------------------------------
ALTER TABLE public.semesters 
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Harden FK: Prevent deleting an academic year if semesters are attached
ALTER TABLE public.semesters DROP CONSTRAINT IF EXISTS semesters_academic_year_id_fkey;
ALTER TABLE public.semesters ADD CONSTRAINT semesters_academic_year_id_fkey 
    FOREIGN KEY (academic_year_id) REFERENCES public.academic_years(id) ON DELETE RESTRICT;

-- ------------------------------------------------------------------------------
-- 5. CLASS SECTIONS ENHANCEMENTS & FK HARDENING
-- ------------------------------------------------------------------------------
ALTER TABLE public.class_sections 
    ADD COLUMN IF NOT EXISTS academic_year_id UUID,
    ADD COLUMN IF NOT EXISTS code VARCHAR(50),
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Backfill academic_year_id from semesters
UPDATE public.class_sections cs
SET academic_year_id = s.academic_year_id
FROM public.semesters s
WHERE cs.semester_id = s.id AND cs.academic_year_id IS NULL;

-- Backfill section code if missing
UPDATE public.class_sections
SET code = CONCAT('SEC-', name)
WHERE code IS NULL;

-- Enforce NOT NULL on academic_year_id
ALTER TABLE public.class_sections 
    ALTER COLUMN academic_year_id SET NOT NULL;

-- Harden FKs on class_sections
ALTER TABLE public.class_sections DROP CONSTRAINT IF EXISTS class_sections_academic_year_id_fkey;
ALTER TABLE public.class_sections ADD CONSTRAINT class_sections_academic_year_id_fkey 
    FOREIGN KEY (academic_year_id) REFERENCES public.academic_years(id) ON DELETE RESTRICT;

ALTER TABLE public.class_sections DROP CONSTRAINT IF EXISTS class_sections_department_id_fkey;
ALTER TABLE public.class_sections ADD CONSTRAINT class_sections_department_id_fkey 
    FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE RESTRICT;

ALTER TABLE public.class_sections DROP CONSTRAINT IF EXISTS class_sections_semester_id_fkey;
ALTER TABLE public.class_sections ADD CONSTRAINT class_sections_semester_id_fkey 
    FOREIGN KEY (semester_id) REFERENCES public.semesters(id) ON DELETE RESTRICT;

-- Multi-attribute unique constraint to prevent duplicate sections within an academic context
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_section_context'
    ) THEN
        ALTER TABLE public.class_sections 
            ADD CONSTRAINT uq_section_context 
            UNIQUE (department_id, academic_year_id, semester_id, name);
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 6. CLASSROOMS ENHANCEMENTS
-- ------------------------------------------------------------------------------
ALTER TABLE public.classrooms 
    ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- ------------------------------------------------------------------------------
-- 7. FACULTY ENHANCEMENTS & IDENTITY DECOUPLING
-- ------------------------------------------------------------------------------
-- 1. Ensure default id is gen_random_uuid()
ALTER TABLE public.faculty 
    ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- 2. Drop the restrictive PK foreign key constraint to public.profiles
ALTER TABLE public.faculty DROP CONSTRAINT IF EXISTS faculty_id_fkey;

-- 3. Add decoupled profile_id column pointing to public.profiles
ALTER TABLE public.faculty 
    ADD COLUMN IF NOT EXISTS profile_id UUID UNIQUE REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS specialization TEXT,
    ADD COLUMN IF NOT EXISTS joining_date DATE,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- 4. Backfill profile_id from id for existing records that correspond to profiles
UPDATE public.faculty f
SET profile_id = f.id
WHERE f.profile_id IS NULL 
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = f.id);

-- ------------------------------------------------------------------------------
-- 8. FACULTY AVAILABILITY ENHANCEMENTS
-- ------------------------------------------------------------------------------
ALTER TABLE public.faculty_availability 
    ADD COLUMN IF NOT EXISTS start_time TIME,
    ADD COLUMN IF NOT EXISTS end_time TIME,
    ADD COLUMN IF NOT EXISTS availability_status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE',
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_availability_status') THEN
        ALTER TABLE public.faculty_availability 
            ADD CONSTRAINT chk_availability_status 
            CHECK (availability_status IN ('AVAILABLE', 'UNAVAILABLE', 'PREFERRED'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_availability_time_order') THEN
        ALTER TABLE public.faculty_availability 
            ADD CONSTRAINT chk_availability_time_order 
            CHECK (end_time > start_time OR start_time IS NULL);
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 9. STUDENTS ENHANCEMENTS & IDENTITY DECOUPLING
-- ------------------------------------------------------------------------------
-- 1. Ensure default id is gen_random_uuid()
ALTER TABLE public.students 
    ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- 2. Drop restrictive PK foreign key constraint to public.profiles
ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_id_fkey;

-- 3. Add decoupled profile_id column pointing to public.profiles
ALTER TABLE public.students 
    ADD COLUMN IF NOT EXISTS profile_id UUID UNIQUE REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS admission_date DATE NOT NULL DEFAULT CURRENT_DATE,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- 4. Backfill profile_id from id for existing records
UPDATE public.students s
SET profile_id = s.id
WHERE s.profile_id IS NULL 
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = s.id);

-- ------------------------------------------------------------------------------
-- 10. SUBJECTS ENHANCEMENTS & FK HARDENING
-- ------------------------------------------------------------------------------
ALTER TABLE public.subjects 
    ADD COLUMN IF NOT EXISTS subject_type public.subject_type_enum NOT NULL DEFAULT 'THEORY',
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Harden FKs on subjects
ALTER TABLE public.subjects DROP CONSTRAINT IF EXISTS subjects_department_id_fkey;
ALTER TABLE public.subjects ADD CONSTRAINT subjects_department_id_fkey 
    FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE RESTRICT;

ALTER TABLE public.subjects DROP CONSTRAINT IF EXISTS subjects_semester_id_fkey;
ALTER TABLE public.subjects ADD CONSTRAINT subjects_semester_id_fkey 
    FOREIGN KEY (semester_id) REFERENCES public.semesters(id) ON DELETE RESTRICT;

-- ------------------------------------------------------------------------------
-- 11. FACULTY SUBJECT ASSIGNMENTS ENHANCEMENTS & FK HARDENING
-- ------------------------------------------------------------------------------
ALTER TABLE public.faculty_subjects 
    ADD COLUMN IF NOT EXISTS semester_id UUID,
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'ASSIGNED',
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Backfill semester_id from subjects
UPDATE public.faculty_subjects fs
SET semester_id = s.semester_id
FROM public.subjects s
WHERE fs.subject_id = s.id AND fs.semester_id IS NULL;

-- Enforce NOT NULL on semester_id
ALTER TABLE public.faculty_subjects 
    ALTER COLUMN semester_id SET NOT NULL;

-- Harden FKs on faculty_subjects
ALTER TABLE public.faculty_subjects DROP CONSTRAINT IF EXISTS faculty_subjects_faculty_id_fkey;
ALTER TABLE public.faculty_subjects ADD CONSTRAINT faculty_subjects_faculty_id_fkey 
    FOREIGN KEY (faculty_id) REFERENCES public.faculty(id) ON DELETE RESTRICT;

ALTER TABLE public.faculty_subjects DROP CONSTRAINT IF EXISTS faculty_subjects_subject_id_fkey;
ALTER TABLE public.faculty_subjects ADD CONSTRAINT faculty_subjects_subject_id_fkey 
    FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON DELETE RESTRICT;

ALTER TABLE public.faculty_subjects DROP CONSTRAINT IF EXISTS faculty_subjects_section_id_fkey;
ALTER TABLE public.faculty_subjects ADD CONSTRAINT faculty_subjects_section_id_fkey 
    FOREIGN KEY (section_id) REFERENCES public.class_sections(id) ON DELETE RESTRICT;

ALTER TABLE public.faculty_subjects DROP CONSTRAINT IF EXISTS faculty_subjects_academic_year_id_fkey;
ALTER TABLE public.faculty_subjects ADD CONSTRAINT faculty_subjects_academic_year_id_fkey 
    FOREIGN KEY (academic_year_id) REFERENCES public.academic_years(id) ON DELETE RESTRICT;

ALTER TABLE public.faculty_subjects DROP CONSTRAINT IF EXISTS faculty_subjects_semester_id_fkey;
ALTER TABLE public.faculty_subjects ADD CONSTRAINT faculty_subjects_semester_id_fkey 
    FOREIGN KEY (semester_id) REFERENCES public.semesters(id) ON DELETE RESTRICT;

-- ------------------------------------------------------------------------------
-- 12. STUDENT ENROLLMENTS ENHANCEMENTS & FK HARDENING
-- ------------------------------------------------------------------------------
ALTER TABLE public.student_enrollments 
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Harden FKs on student_enrollments
ALTER TABLE public.student_enrollments DROP CONSTRAINT IF EXISTS student_enrollments_student_id_fkey;
ALTER TABLE public.student_enrollments ADD CONSTRAINT student_enrollments_student_id_fkey 
    FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE RESTRICT;

ALTER TABLE public.student_enrollments DROP CONSTRAINT IF EXISTS student_enrollments_subject_id_fkey;
ALTER TABLE public.student_enrollments ADD CONSTRAINT student_enrollments_subject_id_fkey 
    FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON DELETE RESTRICT;

ALTER TABLE public.student_enrollments DROP CONSTRAINT IF EXISTS student_enrollments_section_id_fkey;
ALTER TABLE public.student_enrollments ADD CONSTRAINT student_enrollments_section_id_fkey 
    FOREIGN KEY (section_id) REFERENCES public.class_sections(id) ON DELETE RESTRICT;

ALTER TABLE public.student_enrollments DROP CONSTRAINT IF EXISTS student_enrollments_semester_id_fkey;
ALTER TABLE public.student_enrollments ADD CONSTRAINT student_enrollments_semester_id_fkey 
    FOREIGN KEY (semester_id) REFERENCES public.semesters(id) ON DELETE RESTRICT;

ALTER TABLE public.student_enrollments DROP CONSTRAINT IF EXISTS student_enrollments_academic_year_id_fkey;
ALTER TABLE public.student_enrollments ADD CONSTRAINT student_enrollments_academic_year_id_fkey 
    FOREIGN KEY (academic_year_id) REFERENCES public.academic_years(id) ON DELETE RESTRICT;

-- ------------------------------------------------------------------------------
-- 13. HARDEN DOWNSTREAM OPERATIONAL FKS (Attendance & Timetable)
-- ------------------------------------------------------------------------------
-- Attendance Sessions must never cascade delete legal attendance history!
ALTER TABLE public.attendance_sessions DROP CONSTRAINT IF EXISTS attendance_sessions_faculty_id_fkey;
ALTER TABLE public.attendance_sessions ADD CONSTRAINT attendance_sessions_faculty_id_fkey 
    FOREIGN KEY (faculty_id) REFERENCES public.faculty(id) ON DELETE RESTRICT;

ALTER TABLE public.attendance_sessions DROP CONSTRAINT IF EXISTS attendance_sessions_subject_id_fkey;
ALTER TABLE public.attendance_sessions ADD CONSTRAINT attendance_sessions_subject_id_fkey 
    FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON DELETE RESTRICT;

ALTER TABLE public.attendance_sessions DROP CONSTRAINT IF EXISTS attendance_sessions_section_id_fkey;
ALTER TABLE public.attendance_sessions ADD CONSTRAINT attendance_sessions_section_id_fkey 
    FOREIGN KEY (section_id) REFERENCES public.class_sections(id) ON DELETE RESTRICT;

-- Timetable Entries must never cascade delete without warning!
ALTER TABLE public.timetable_entries DROP CONSTRAINT IF EXISTS timetable_entries_faculty_id_fkey;
ALTER TABLE public.timetable_entries ADD CONSTRAINT timetable_entries_faculty_id_fkey 
    FOREIGN KEY (faculty_id) REFERENCES public.faculty(id) ON DELETE RESTRICT;

ALTER TABLE public.timetable_entries DROP CONSTRAINT IF EXISTS timetable_entries_subject_id_fkey;
ALTER TABLE public.timetable_entries ADD CONSTRAINT timetable_entries_subject_id_fkey 
    FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON DELETE RESTRICT;

ALTER TABLE public.timetable_entries DROP CONSTRAINT IF EXISTS timetable_entries_classroom_id_fkey;
ALTER TABLE public.timetable_entries ADD CONSTRAINT timetable_entries_classroom_id_fkey 
    FOREIGN KEY (classroom_id) REFERENCES public.classrooms(id) ON DELETE RESTRICT;

-- ------------------------------------------------------------------------------
-- 14. IDENTITY RESOLUTION HELPER FUNCTIONS
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_faculty_id()
RETURNS UUID AS $$
  SELECT f.id 
  FROM public.faculty f
  WHERE (f.profile_id = auth.uid() OR f.id = auth.uid())
    AND f.is_active = true
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.current_student_id()
RETURNS UUID AS $$
  SELECT s.id 
  FROM public.students s
  WHERE (s.profile_id = auth.uid() OR s.id = auth.uid())
    AND s.is_active = true
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ------------------------------------------------------------------------------
-- 15. REVISED RLS POLICIES (Preserve and Harden)
-- ------------------------------------------------------------------------------
-- Faculty Availability: Self-service for own availability only, or Admin
DROP POLICY IF EXISTS "Faculty can edit own availability" ON public.faculty_availability;
DROP POLICY IF EXISTS "Faculty read availability" ON public.faculty_availability;
DROP POLICY IF EXISTS "Faculty availability read for authenticated" ON public.faculty_availability;
DROP POLICY IF EXISTS "Faculty manage own availability or Admin" ON public.faculty_availability;

CREATE POLICY "Faculty availability read for authenticated"
ON public.faculty_availability FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Faculty manage own availability or Admin"
ON public.faculty_availability FOR ALL TO authenticated
USING (
  public.is_admin() OR 
  faculty_id = public.current_faculty_id()
)
WITH CHECK (
  public.is_admin() OR 
  faculty_id = public.current_faculty_id()
);

-- Students: Staff can read all, students read own record
DROP POLICY IF EXISTS "Staff read all students, students read self" ON public.students;
CREATE POLICY "Staff read all students, students read self"
ON public.students FOR SELECT TO authenticated
USING (
  public.is_admin() 
  OR public.current_user_role() = 'faculty' 
  OR id = public.current_student_id()
  OR profile_id = auth.uid()
);

-- Student Enrollments: Staff read all, student read own enrollments
DROP POLICY IF EXISTS "Read enrollments" ON public.student_enrollments;
CREATE POLICY "Read enrollments"
ON public.student_enrollments FOR SELECT TO authenticated
USING (
  public.is_admin() 
  OR public.current_user_role() = 'faculty' 
  OR student_id = public.current_student_id()
);

-- ------------------------------------------------------------------------------
-- 16. ATTACH AUTOMATED TIMESTAMPS AND AUDIT TRIGGERS
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN 
        SELECT unnest(ARRAY[
            'departments', 'academic_years', 'semesters', 'class_sections', 
            'classrooms', 'faculty', 'faculty_availability', 'subjects', 
            'faculty_subjects', 'students', 'student_enrollments'
        ])
    LOOP
        -- Updated_at trigger
        EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at ON public.%I;', t);
        EXECUTE format('
            CREATE TRIGGER set_updated_at
            BEFORE UPDATE ON public.%I
            FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
        ', t);

        -- Audit log trigger
        EXECUTE format('DROP TRIGGER IF EXISTS audit_log_trigger ON public.%I;', t);
        EXECUTE format('
            CREATE TRIGGER audit_log_trigger
            AFTER INSERT OR UPDATE OR DELETE ON public.%I
            FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();
        ', t);
    END LOOP;
END $$;


-- ==============================================================================
-- SECTION: supabase/seed.sql
-- ==============================================================================

-- ==============================================================================
-- SMART ACADEMIC MANAGEMENT SYSTEM (SAMS)
-- MIGRATION 005 & PHASE 3 COMPLIANT DETERMINISTIC SEED DATA
-- Pure Master Data Foundation: Zero Secrets / Passwords in SQL
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. FIXED PREDICTABLE UUID CONSTANTS
-- ------------------------------------------------------------------------------
-- Academic Year 2026-2027: 'a0000000-0000-0000-0000-000000000001'
-- Semesters:
--   Sem 5 (Odd 2026):     'b0000000-0000-0000-0000-000000000005'
--   Sem 6 (Even 2027):    'b0000000-0000-0000-0000-000000000006'
-- Departments:
--   CSE:                  'd0000000-0000-0000-0000-000000000001'
--   ISE:                  'd0000000-0000-0000-0000-000000000002'
--   ECE:                  'd0000000-0000-0000-0000-000000000003'

-- ------------------------------------------------------------------------------
-- 2. ACADEMIC YEARS & SEMESTERS
-- ------------------------------------------------------------------------------
INSERT INTO public.academic_years (id, name, start_date, end_date, is_current, is_active)
VALUES 
    ('a0000000-0000-0000-0000-000000000001', '2026-2027', '2026-08-01', '2027-05-31', true, true)
ON CONFLICT (id) DO UPDATE SET is_current = true, is_active = true;

INSERT INTO public.semesters (id, academic_year_id, name, semester_number, term_type, start_date, end_date, is_active)
VALUES 
    ('b0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', '5th Semester (Odd 2026)', 5, 'ODD', '2026-08-01', '2026-12-20', true),
    ('b0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', '6th Semester (Even 2027)', 6, 'EVEN', '2027-01-05', '2027-05-20', false)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 3. DEPARTMENTS
-- ------------------------------------------------------------------------------
INSERT INTO public.departments (id, code, name, description, is_active)
VALUES 
    ('d0000000-0000-0000-0000-000000000001', 'CSE', 'Computer Science & Engineering', 'Department of Computer Science & Engineering specializing in AI, Software Systems, and Cloud', true),
    ('d0000000-0000-0000-0000-000000000002', 'ISE', 'Information Science & Engineering', 'Department of Information Science focused on Data Engineering and Information Security', true),
    ('d0000000-0000-0000-0000-000000000003', 'ECE', 'Electronics & Communication', 'Department of Electronics & Communication Engineering covering Embedded Systems and Signal Processing', true)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 4. CLASS SECTIONS
-- ------------------------------------------------------------------------------
INSERT INTO public.class_sections (id, department_id, academic_year_id, semester_id, name, code, capacity, is_active)
VALUES 
    ('c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000005', 'A', 'CSE-S5-A', 60, true),
    ('c0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000005', 'B', 'CSE-S5-B', 60, true),
    ('c0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000005', 'ISE', 'ISE-S5-A', 55, true)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 5. CLASSROOMS & LABORATORIES
-- ------------------------------------------------------------------------------
INSERT INTO public.classrooms (id, room_number, building, floor, room_type, capacity, facilities, department_id, is_available, is_active)
VALUES 
    ('e0000000-0000-0000-0000-000000000001', 'LH-101', 'Aryabhata Academic Block', 1, 'LECTURE_HALL', 70, '["PROJECTOR", "AC", "AUDIO_SYSTEM", "SMART_BOARD"]'::jsonb, NULL, true, true),
    ('e0000000-0000-0000-0000-000000000002', 'LH-102', 'Aryabhata Academic Block', 1, 'LECTURE_HALL', 70, '["PROJECTOR", "AUDIO_SYSTEM"]'::jsonb, NULL, true, true),
    ('e0000000-0000-0000-0000-000000000003', 'LH-201', 'Aryabhata Academic Block', 2, 'LECTURE_HALL', 65, '["PROJECTOR", "AC", "WHITEBOARD"]'::jsonb, NULL, true, true),
    ('e0000000-0000-0000-0000-000000000004', 'LH-202', 'Aryabhata Academic Block', 2, 'LECTURE_HALL', 65, '["PROJECTOR"]'::jsonb, NULL, true, true),
    ('e0000000-0000-0000-0000-000000000005', 'LAB-CS1', 'Turing Innovation Wing', 3, 'LABORATORY', 40, '["WORKSTATIONS", "GPU_SERVER", "AC", "PROJECTOR"]'::jsonb, 'd0000000-0000-0000-0000-000000000001', true, true),
    ('e0000000-0000-0000-0000-000000000006', 'LAB-CS2', 'Turing Innovation Wing', 3, 'LABORATORY', 40, '["WORKSTATIONS", "HIGH_SPEED_LAN", "AC"]'::jsonb, 'd0000000-0000-0000-0000-000000000001', true, true),
    ('e0000000-0000-0000-0000-000000000007', 'LAB-NW', 'Turing Innovation Wing', 4, 'LABORATORY', 35, '["CISCO_ROUTERS", "SWITCHES", "AC"]'::jsonb, 'd0000000-0000-0000-0000-000000000001', true, true),
    ('e0000000-0000-0000-0000-000000000008', 'AUD-01', 'Dr. APJ Abdul Kalam Auditorium', 1, 'AUDITORIUM', 250, '["SURROUND_AUDIO", "STAGE_LIGHTING", "PROJECTOR", "AC"]'::jsonb, NULL, true, true)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 6. CURRICULUM SUBJECTS (5th Semester B.Tech Curriculum)
-- ------------------------------------------------------------------------------
INSERT INTO public.subjects (id, code, name, department_id, semester_id, credits, lecture_hours_per_week, lab_hours_per_week, total_weekly_periods, is_lab, subject_type, is_active)
VALUES 
    ('f0000000-0000-0000-0000-000000000001', 'CS501', 'Database Management Systems', 'd0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000005', 4, 3, 0, 4, false, 'THEORY', true),
    ('f0000000-0000-0000-0000-000000000002', 'CS502', 'Computer Networks', 'd0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000005', 4, 3, 0, 4, false, 'THEORY', true),
    ('f0000000-0000-0000-0000-000000000003', 'CS503', 'Theory of Computation', 'd0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000005', 4, 4, 0, 4, false, 'THEORY', true),
    ('f0000000-0000-0000-0000-000000000004', 'CS504', 'Artificial Intelligence & ML Basics', 'd0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000005', 3, 3, 0, 3, false, 'THEORY', true),
    ('f0000000-0000-0000-0000-000000000005', 'CSL51', 'DBMS & SQL Laboratory', 'd0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000005', 2, 0, 3, 3, true, 'LABORATORY', true),
    ('f0000000-0000-0000-0000-000000000006', 'CSL52', 'Computer Networks & Socket Lab', 'd0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000005', 2, 0, 3, 3, true, 'LABORATORY', true)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 7. FACULTY MASTER DATA (Decoupled from Auth secrets)
-- ------------------------------------------------------------------------------
INSERT INTO public.faculty (id, employee_id, department_id, designation, qualification, specialization, joining_date, max_weekly_hours, is_active)
VALUES 
    ('33333333-3333-3333-3333-333333333331', 'FAC-CSE-001', 'd0000000-0000-0000-0000-000000000001', 'Professor & HOD', 'Ph.D in Distributed Systems', 'Distributed Computing, Database Engines', '2015-07-01', 16, true),
    ('33333333-3333-3333-3333-333333333332', 'FAC-CSE-002', 'd0000000-0000-0000-0000-000000000001', 'Associate Professor', 'Ph.D in Computer Networks', 'Network Protocols, Cybersecurity', '2018-08-15', 18, true),
    ('33333333-3333-3333-3333-333333333333', 'FAC-CSE-003', 'd0000000-0000-0000-0000-000000000001', 'Assistant Professor', 'M.Tech in Theoretical Computer Science', 'Automata, Computational Complexity', '2021-01-10', 20, true),
    ('33333333-3333-3333-3333-333333333334', 'FAC-CSE-004', 'd0000000-0000-0000-0000-000000000001', 'Assistant Professor', 'M.Tech in Artificial Intelligence', 'Deep Learning, Computer Vision', '2022-06-01', 20, true)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 8. FACULTY RECURRING WEEKLY AVAILABILITY (Monday-Friday Slots 1-7)
-- ------------------------------------------------------------------------------
-- Populate default available slots for Dr. Arun Kumar (FAC-CSE-001) across working days
INSERT INTO public.faculty_availability (faculty_id, day_of_week, period_slot, start_time, end_time, availability_status, is_available)
SELECT 
    '33333333-3333-3333-3333-333333333331',
    day_num,
    slot_num,
    CASE slot_num
        WHEN 1 THEN '09:00:00'::time
        WHEN 2 THEN '09:55:00'::time
        WHEN 3 THEN '11:10:00'::time
        WHEN 4 THEN '12:05:00'::time
        WHEN 5 THEN '13:45:00'::time
        WHEN 6 THEN '14:40:00'::time
        WHEN 7 THEN '15:35:00'::time
    END,
    CASE slot_num
        WHEN 1 THEN '09:55:00'::time
        WHEN 2 THEN '10:50:00'::time
        WHEN 3 THEN '12:05:00'::time
        WHEN 4 THEN '13:00:00'::time
        WHEN 5 THEN '14:40:00'::time
        WHEN 6 THEN '15:35:00'::time
        WHEN 7 THEN '16:30:00'::time
    END,
    'AVAILABLE',
    true
FROM generate_series(1, 5) AS day_num
CROSS JOIN generate_series(1, 6) AS slot_num
ON CONFLICT (faculty_id, day_of_week, period_slot) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 9. FACULTY-SUBJECT TEACHING ASSIGNMENTS (Prepares Phase 4 OR-Tools)
-- ------------------------------------------------------------------------------
INSERT INTO public.faculty_subjects (faculty_id, subject_id, section_id, academic_year_id, semester_id, is_primary, status)
VALUES 
    ('33333333-3333-3333-3333-333333333331', 'f0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000005', true, 'ASSIGNED'), -- Dr. Arun -> DBMS (CSE-S5-A)
    ('33333333-3333-3333-3333-333333333332', 'f0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000005', true, 'ASSIGNED'), -- Dr. Priya -> CN (CSE-S5-A)
    ('33333333-3333-3333-3333-333333333333', 'f0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000005', true, 'ASSIGNED'), -- Prof Suresh -> TOC (CSE-S5-A)
    ('33333333-3333-3333-3333-333333333334', 'f0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000005', true, 'ASSIGNED')  -- Prof Ananya -> AI/ML (CSE-S5-A)
ON CONFLICT (faculty_id, subject_id, section_id, academic_year_id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 10. STUDENT MASTER RECORDS (Decoupled from Auth secrets)
-- ------------------------------------------------------------------------------
INSERT INTO public.students (id, roll_number, usn, department_id, current_semester_id, current_section_id, admission_year, admission_date, guardian_name, guardian_contact, is_active)
VALUES 
    ('44444444-4444-4444-4444-444444444401', '24CSE01', '1MS24CS001', 'd0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000001', 2024, '2024-08-01', 'Ramesh Verma', '+919876500001', true),
    ('44444444-4444-4444-4444-444444444402', '24CSE02', '1MS24CS002', 'd0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000001', 2024, '2024-08-01', 'Sanjay Patil', '+919876500002', true),
    ('44444444-4444-4444-4444-444444444403', '24CSE03', '1MS24CS003', 'd0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000001', 2024, '2024-08-01', 'M. Iyer', '+919876500003', true),
    ('44444444-4444-4444-4444-444444444404', '24CSE04', '1MS24CS004', 'd0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000001', 2024, '2024-08-01', 'Venkat Reddy', '+919876500004', true),
    ('44444444-4444-4444-4444-444444444405', '24CSE05', '1MS24CS005', 'd0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000001', 2024, '2024-08-01', 'Dilip Joshi', '+919876500005', true)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 11. STUDENT ENROLLMENTS (Section 5-A Courses)
-- ------------------------------------------------------------------------------
INSERT INTO public.student_enrollments (student_id, subject_id, section_id, semester_id, academic_year_id, is_active)
SELECT 
    s.id,
    sub.id,
    s.current_section_id,
    s.current_semester_id,
    'a0000000-0000-0000-0000-000000000001',
    true
FROM public.students s
CROSS JOIN public.subjects sub
WHERE sub.semester_id = s.current_semester_id
ON CONFLICT (student_id, subject_id, semester_id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 12. DYNAMIC PROFILE LINKAGE (Idempotent: runs if accounts exist in profiles)
-- ------------------------------------------------------------------------------
-- Safely link faculty records if matching profiles exist
UPDATE public.faculty f
SET profile_id = p.id
FROM public.profiles p
WHERE f.profile_id IS NULL
  AND (
    (f.employee_id = 'FAC-CSE-001' AND p.email = 'arun.kumar@sams.edu') OR
    (f.employee_id = 'FAC-CSE-002' AND p.email = 'priya.sharma@sams.edu') OR
    (f.employee_id = 'FAC-CSE-003' AND p.email = 'suresh.nair@sams.edu') OR
    (f.employee_id = 'FAC-CSE-004' AND p.email = 'ananya.deshmukh@sams.edu')
  );

-- Safely link student records if matching profiles exist
UPDATE public.students s
SET profile_id = p.id
FROM public.profiles p
WHERE s.profile_id IS NULL
  AND (
    (s.usn = '1MS24CS001' AND p.email = 'rohit.verma@student.sams.edu') OR
    (s.usn = '1MS24CS002' AND p.email = 'sneha.patil@student.sams.edu') OR
    (s.usn = '1MS24CS003' AND p.email = 'kavya.iyer@student.sams.edu') OR
    (s.usn = '1MS24CS004' AND p.email = 'aditya.reddy@student.sams.edu') OR
    (s.usn = '1MS24CS005' AND p.email = 'tanvi.joshi@student.sams.edu')
  );


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
