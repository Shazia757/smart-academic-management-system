-- ==============================================================================
-- SMART ACADEMIC MANAGEMENT SYSTEM (SAMS)
-- DEVELOPMENT SEED DATA (Realistic demo data for rapid verification)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. FIXED PREDICTABLE UUID CONSTANTS
-- ------------------------------------------------------------------------------
-- Academic Year: 2026-2027
-- 'a0000000-0000-0000-0000-000000000001'
-- Semesters:
-- Sem 5: 'b0000000-0000-0000-0000-000000000005'
-- Sem 6: 'b0000000-0000-0000-0000-000000000006'
-- Departments:
-- CSE: 'd0000000-0000-0000-0000-000000000001'
-- ISE: 'd0000000-0000-0000-0000-000000000002'
-- ECE: 'd0000000-0000-0000-0000-000000000003'

-- ------------------------------------------------------------------------------
-- 2. ACADEMIC YEARS & SEMESTERS
-- ------------------------------------------------------------------------------
INSERT INTO public.academic_years (id, name, start_date, end_date, is_current)
VALUES 
    ('a0000000-0000-0000-0000-000000000001', '2026-2027', '2026-08-01', '2027-05-31', true)
ON CONFLICT (id) DO UPDATE SET is_current = true;

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
INSERT INTO public.class_sections (id, department_id, semester_id, name, capacity)
VALUES 
    ('c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000005', '5-A', 60),
    ('c0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000005', '5-B', 60),
    ('c0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000005', '5-ISE', 55)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 5. CLASSROOMS & LABORATORIES
-- ------------------------------------------------------------------------------
INSERT INTO public.classrooms (id, room_number, building, floor, room_type, capacity, facilities, is_available)
VALUES 
    ('e0000000-0000-0000-0000-000000000001', 'LH-101', 'Aryabhata Academic Block', 1, 'LECTURE_HALL', 70, '["PROJECTOR", "AC", "AUDIO_SYSTEM", "SMART_BOARD"]'::jsonb, true),
    ('e0000000-0000-0000-0000-000000000002', 'LH-102', 'Aryabhata Academic Block', 1, 'LECTURE_HALL', 70, '["PROJECTOR", "AUDIO_SYSTEM"]'::jsonb, true),
    ('e0000000-0000-0000-0000-000000000003', 'LH-201', 'Aryabhata Academic Block', 2, 'LECTURE_HALL', 65, '["PROJECTOR", "AC", "WHITEBOARD"]'::jsonb, true),
    ('e0000000-0000-0000-0000-000000000004', 'LH-202', 'Aryabhata Academic Block', 2, 'LECTURE_HALL', 65, '["PROJECTOR"]'::jsonb, true),
    ('e0000000-0000-0000-0000-000000000005', 'LAB-CS1', 'Turing Innovation Wing', 3, 'LABORATORY', 40, '["WORKSTATIONS", "GPU_SERVER", "AC", "PROJECTOR"]'::jsonb, true),
    ('e0000000-0000-0000-0000-000000000006', 'LAB-CS2', 'Turing Innovation Wing', 3, 'LABORATORY', 40, '["WORKSTATIONS", "HIGH_SPEED_LAN", "AC"]'::jsonb, true),
    ('e0000000-0000-0000-0000-000000000007', 'LAB-NW', 'Turing Innovation Wing', 4, 'LABORATORY', 35, '["CISCO_ROUTERS", "SWITCHES", "AC"]'::jsonb, true),
    ('e0000000-0000-0000-0000-000000000008', 'AUD-01', 'Dr. APJ Abdul Kalam Auditorium', 1, 'AUDITORIUM', 250, '["SURROUND_AUDIO", "STAGE_LIGHTING", "PROJECTOR", "AC"]'::jsonb, true)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 6. SUBJECTS (5th Semester Curriculum)
-- ------------------------------------------------------------------------------
INSERT INTO public.subjects (id, code, name, department_id, semester_id, credits, lecture_hours_per_week, lab_hours_per_week, total_weekly_periods, is_lab)
VALUES 
    ('f0000000-0000-0000-0000-000000000001', 'CS501', 'Database Management Systems', 'd0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000005', 4, 3, 0, 4, false),
    ('f0000000-0000-0000-0000-000000000002', 'CS502', 'Computer Networks', 'd0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000005', 4, 3, 0, 4, false),
    ('f0000000-0000-0000-0000-000000000003', 'CS503', 'Theory of Computation', 'd0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000005', 4, 4, 0, 4, false),
    ('f0000000-0000-0000-0000-000000000004', 'CS504', 'Artificial Intelligence & ML Basics', 'd0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000005', 3, 3, 0, 3, false),
    ('f0000000-0000-0000-0000-000000000005', 'CSL51', 'DBMS & SQL Laboratory', 'd0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000005', 2, 0, 3, 3, true),
    ('f0000000-0000-0000-0000-000000000006', 'CSL52', 'Computer Networks & Socket Lab', 'd0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000005', 2, 0, 3, 3, true)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 7. TIMETABLE CONFIGURATION (Default CSE Sem 5)
-- ------------------------------------------------------------------------------
INSERT INTO public.timetable_configs (id, academic_year_id, department_id, semester_id, working_days, periods_per_day, slot_duration_minutes, start_time, break_slots, is_active)
VALUES 
    ('90000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000005', '{1,2,3,4,5}', 7, 55, '09:00:00', '[{"period": 4, "duration": 50, "label": "Lunch Break"}]'::jsonb, true)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 8. AUTH USERS & PROFILES MOCK (Demonstration Super Admin, Faculty, Students)
-- In production/live Supabase, these users sign up via Supabase Auth.
-- ------------------------------------------------------------------------------
-- Insert mock profiles for development inspection
INSERT INTO public.profiles (id, email, role, first_name, last_name, phone, is_active)
VALUES
    -- Admins
    ('11111111-1111-1111-1111-111111111111', 'superadmin@sams.edu', 'super_admin', 'Dr. Vikram', 'Sarabhai', '+919876543210', true),
    ('22222222-2222-2222-2222-222222222222', 'dean.cse@sams.edu', 'college_admin', 'Prof. Radhika', 'Shenoy', '+919876543211', true),
    -- Faculty
    ('33333333-3333-3333-3333-333333333331', 'arun.kumar@sams.edu', 'faculty', 'Dr. Arun', 'Kumar', '+919876543221', true),
    ('33333333-3333-3333-3333-333333333332', 'priya.sharma@sams.edu', 'faculty', 'Dr. Priya', 'Sharma', '+919876543222', true),
    ('33333333-3333-3333-3333-333333333333', 'suresh.nair@sams.edu', 'faculty', 'Prof. Suresh', 'Nair', '+919876543223', true),
    ('33333333-3333-3333-3333-333333333334', 'ananya.deshmukh@sams.edu', 'faculty', 'Prof. Ananya', 'Deshmukh', '+919876543224', true),
    -- Students
    ('44444444-4444-4444-4444-444444444401', 'rohit.verma@student.sams.edu', 'student', 'Rohit', 'Verma', '+919876543301', true),
    ('44444444-4444-4444-4444-444444444402', 'sneha.patil@student.sams.edu', 'student', 'Sneha', 'Patil', '+919876543302', true),
    ('44444444-4444-4444-4444-444444444403', 'kavya.iyer@student.sams.edu', 'student', 'Kavya', 'Iyer', '+919876543303', true),
    ('44444444-4444-4444-4444-444444444404', 'aditya.reddy@student.sams.edu', 'student', 'Aditya', 'Reddy', '+919876543304', true),
    ('44444444-4444-4444-4444-444444444405', 'tanvi.joshi@student.sams.edu', 'student', 'Tanvi', 'Joshi', '+919876543305', true)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 9. FACULTY DETAILS & SUBJECT ALLOCATIONS
-- ------------------------------------------------------------------------------
INSERT INTO public.faculty (id, employee_id, department_id, designation, qualification, max_weekly_hours)
VALUES 
    ('33333333-3333-3333-3333-333333333331', 'FAC-CSE-001', 'd0000000-0000-0000-0000-000000000001', 'Professor & HOD', 'Ph.D in Distributed Systems', 16),
    ('33333333-3333-3333-3333-333333333332', 'FAC-CSE-002', 'd0000000-0000-0000-0000-000000000001', 'Associate Professor', 'Ph.D in Computer Networks', 18),
    ('33333333-3333-3333-3333-333333333333', 'FAC-CSE-003', 'd0000000-0000-0000-0000-000000000001', 'Assistant Professor', 'M.Tech in Theoretical Computer Science', 20),
    ('33333333-3333-3333-3333-333333333334', 'FAC-CSE-004', 'd0000000-0000-0000-0000-000000000001', 'Assistant Professor', 'M.Tech in Artificial Intelligence', 20)
ON CONFLICT (id) DO NOTHING;

-- Faculty Subjects Assignments
INSERT INTO public.faculty_subjects (faculty_id, subject_id, section_id, academic_year_id, is_primary)
VALUES 
    ('33333333-3333-3333-3333-333333333331', 'f0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', true), -- Dr. Arun -> DBMS (5-A)
    ('33333333-3333-3333-3333-333333333332', 'f0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', true), -- Dr. Priya -> CN (5-A)
    ('33333333-3333-3333-3333-333333333333', 'f0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', true), -- Prof Suresh -> TOC (5-A)
    ('33333333-3333-3333-3333-333333333334', 'f0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', true)  -- Prof Ananya -> AI/ML (5-A)
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------------------------
-- 10. STUDENTS DETAILS
-- ------------------------------------------------------------------------------
INSERT INTO public.students (id, roll_number, usn, department_id, current_semester_id, current_section_id, admission_year, guardian_name, guardian_contact)
VALUES 
    ('44444444-4444-4444-4444-444444444401', '24CSE01', '1MS24CS001', 'd0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000001', 2024, 'Ramesh Verma', '+919876500001'),
    ('44444444-4444-4444-4444-444444444402', '24CSE02', '1MS24CS002', 'd0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000001', 2024, 'Sanjay Patil', '+919876500002'),
    ('44444444-4444-4444-4444-444444444403', '24CSE03', '1MS24CS003', 'd0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000001', 2024, 'M. Iyer', '+919876500003'),
    ('44444444-4444-4444-4444-444444444404', '24CSE04', '1MS24CS004', 'd0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000001', 2024, 'Venkat Reddy', '+919876500004'),
    ('44444444-4444-4444-4444-444444444405', '24CSE05', '1MS24CS005', 'd0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000001', 2024, 'Dilip Joshi', '+919876500005')
ON CONFLICT (id) DO NOTHING;

-- Student Enrollments for Section 5-A
INSERT INTO public.student_enrollments (student_id, subject_id, section_id, semester_id, academic_year_id)
SELECT 
    s.id,
    sub.id,
    s.current_section_id,
    s.current_semester_id,
    'a0000000-0000-0000-0000-000000000001'
FROM public.students s
CROSS JOIN public.subjects sub
WHERE sub.semester_id = s.current_semester_id
ON CONFLICT (student_id, subject_id, semester_id) DO NOTHING;
