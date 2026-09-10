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
