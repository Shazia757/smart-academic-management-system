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
