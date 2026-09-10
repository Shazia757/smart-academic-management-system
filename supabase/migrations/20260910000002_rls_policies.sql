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
