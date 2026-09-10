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
