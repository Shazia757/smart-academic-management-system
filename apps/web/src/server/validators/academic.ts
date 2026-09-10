import { z } from "zod";

// -----------------------------------------------------------------------------
// 1. DEPARTMENT
// -----------------------------------------------------------------------------
export const DepartmentSchema = z.object({
  code: z
    .string()
    .min(2, "Department code must be at least 2 characters")
    .max(20, "Department code cannot exceed 20 characters")
    .regex(/^[A-Z0-9_-]+$/, "Code must be uppercase alphanumeric (e.g. CSE, ECE)"),
  name: z
    .string()
    .min(2, "Department name must be at least 2 characters")
    .max(150, "Department name cannot exceed 150 characters"),
  description: z.string().max(500, "Description cannot exceed 500 characters").optional().nullable(),
  head_of_department_id: z.string().uuid("Invalid Head of Department ID").optional().nullable(),
  is_active: z.boolean().default(true),
});

export const UpdateDepartmentSchema = DepartmentSchema.partial().extend({
  id: z.string().uuid("Invalid department ID"),
});

export type DepartmentInput = z.infer<typeof DepartmentSchema>;
export type UpdateDepartmentInput = z.infer<typeof UpdateDepartmentSchema>;

// -----------------------------------------------------------------------------
// 2. ACADEMIC YEAR
// -----------------------------------------------------------------------------
export const AcademicYearSchema = z
  .object({
    name: z
      .string()
      .regex(/^[0-9]{4}-[0-9]{4}$/, "Academic year must follow YYYY-YYYY format (e.g. 2026-2027)"),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Start date must be in YYYY-MM-DD format"),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "End date must be in YYYY-MM-DD format"),
    is_current: z.boolean().default(false),
    is_active: z.boolean().default(true),
  })
  .refine((data) => new Date(data.end_date) > new Date(data.start_date), {
    message: "End date must be after start date",
    path: ["end_date"],
  });

export const UpdateAcademicYearSchema = AcademicYearSchema.innerType().partial().extend({
  id: z.string().uuid("Invalid academic year ID"),
}).refine(
  (data) => {
    if (data.start_date && data.end_date) {
      return new Date(data.end_date) > new Date(data.start_date);
    }
    return true;
  },
  {
    message: "End date must be after start date",
    path: ["end_date"],
  }
);

export type AcademicYearInput = z.infer<typeof AcademicYearSchema>;
export type UpdateAcademicYearInput = z.infer<typeof UpdateAcademicYearSchema>;

// -----------------------------------------------------------------------------
// 3. SEMESTER
// -----------------------------------------------------------------------------
export const SemesterSchema = z
  .object({
    academic_year_id: z.string().uuid("Academic year is required"),
    name: z.string().min(2, "Name must be at least 2 characters").max(100),
    semester_number: z.coerce.number().int().min(1, "Semester must be at least 1").max(10, "Semester cannot exceed 10"),
    term_type: z.enum(["ODD", "EVEN"]),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Start date must be in YYYY-MM-DD format"),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "End date must be in YYYY-MM-DD format"),
    is_active: z.boolean().default(true),
  })
  .refine((data) => new Date(data.end_date) > new Date(data.start_date), {
    message: "End date must be after start date",
    path: ["end_date"],
  });

export const UpdateSemesterSchema = SemesterSchema.innerType().partial().extend({
  id: z.string().uuid("Invalid semester ID"),
}).refine(
  (data) => {
    if (data.start_date && data.end_date) {
      return new Date(data.end_date) > new Date(data.start_date);
    }
    return true;
  },
  {
    message: "End date must be after start date",
    path: ["end_date"],
  }
);

export type SemesterInput = z.infer<typeof SemesterSchema>;
export type UpdateSemesterInput = z.infer<typeof UpdateSemesterSchema>;

// -----------------------------------------------------------------------------
// 4. CLASS SECTION
// -----------------------------------------------------------------------------
export const ClassSectionSchema = z.object({
  department_id: z.string().uuid("Department is required"),
  academic_year_id: z.string().uuid("Academic year is required"),
  semester_id: z.string().uuid("Semester is required"),
  name: z.string().min(1, "Section name is required").max(10, "Section name cannot exceed 10 characters"),
  code: z.string().min(2, "Code is required").max(50),
  capacity: z.coerce.number().int().positive("Capacity must be greater than 0").default(60),
  is_active: z.boolean().default(true),
});

export const UpdateClassSectionSchema = ClassSectionSchema.partial().extend({
  id: z.string().uuid("Invalid section ID"),
});

export type ClassSectionInput = z.infer<typeof ClassSectionSchema>;
export type UpdateClassSectionInput = z.infer<typeof UpdateClassSectionSchema>;

// -----------------------------------------------------------------------------
// 5. CLASSROOM
// -----------------------------------------------------------------------------
export const ClassroomSchema = z.object({
  room_number: z.string().min(1, "Room number is required").max(50),
  building: z.string().min(1, "Building name is required").max(100),
  floor: z.coerce.number().int().min(0, "Floor must be 0 (Ground) or higher").default(1),
  room_type: z.enum([
    "LECTURE_HALL",
    "LABORATORY",
    "SEMINAR_ROOM",
    "AUDITORIUM",
    "TUTORIAL_ROOM",
  ]),
  capacity: z.coerce.number().int().positive("Capacity must be positive").default(60),
  facilities: z.array(z.string()).default([]),
  department_id: z.string().uuid().optional().nullable(),
  is_available: z.boolean().default(true),
  is_active: z.boolean().default(true),
});

export const UpdateClassroomSchema = ClassroomSchema.partial().extend({
  id: z.string().uuid("Invalid classroom ID"),
});

export type ClassroomInput = z.infer<typeof ClassroomSchema>;
export type UpdateClassroomInput = z.infer<typeof UpdateClassroomSchema>;

// -----------------------------------------------------------------------------
// 6. FACULTY
// -----------------------------------------------------------------------------
export const FacultySchema = z.object({
  employee_id: z
    .string()
    .min(2, "Employee ID must be at least 2 characters")
    .max(50, "Employee ID cannot exceed 50 characters")
    .toUpperCase(),
  department_id: z.string().uuid("Department is required"),
  designation: z.string().min(2, "Designation is required").max(100),
  qualification: z.string().min(2, "Qualification is required").max(150),
  specialization: z.string().max(200).optional().nullable(),
  joining_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format").optional().nullable(),
  max_weekly_hours: z.coerce.number().int().min(1).max(50).default(20),
  profile_id: z.string().uuid().optional().nullable(),
  is_active: z.boolean().default(true),
});

export const UpdateFacultySchema = FacultySchema.partial().extend({
  id: z.string().uuid("Invalid faculty ID"),
});

export type FacultyInput = z.infer<typeof FacultySchema>;
export type UpdateFacultyInput = z.infer<typeof UpdateFacultySchema>;

// -----------------------------------------------------------------------------
// 7. FACULTY AVAILABILITY
// -----------------------------------------------------------------------------
export const FacultyAvailabilitySchema = z
  .object({
    faculty_id: z.string().uuid("Faculty selection is required"),
    day_of_week: z.coerce
      .number()
      .int()
      .min(1, "Day must be 1 (Monday)")
      .max(6, "Day must be 6 (Saturday)"),
    period_slot: z.coerce.number().int().min(1).max(10).default(1),
    start_time: z.string().optional().nullable(),
    end_time: z.string().optional().nullable(),
    availability_status: z.enum(["AVAILABLE", "UNAVAILABLE", "PREFERRED"]).default("AVAILABLE"),
    is_available: z.boolean().default(true),
    notes: z.string().max(250).optional().nullable(),
  })
  .refine(
    (data) => {
      if (data.start_time && data.end_time) {
        return data.end_time > data.start_time;
      }
      return true;
    },
    {
      message: "End time must be after start time",
      path: ["end_time"],
    }
  );

export const UpdateFacultyAvailabilitySchema = FacultyAvailabilitySchema.innerType().partial().extend({
  id: z.string().uuid("Invalid availability ID"),
});

export type FacultyAvailabilityInput = z.infer<typeof FacultyAvailabilitySchema>;
export type UpdateFacultyAvailabilityInput = z.infer<typeof UpdateFacultyAvailabilitySchema>;

// -----------------------------------------------------------------------------
// 8. STUDENT
// -----------------------------------------------------------------------------
export const StudentSchema = z.object({
  roll_number: z.string().min(2, "Roll number is required").max(50),
  usn: z.string().min(3, "USN / Registration number is required").max(50).toUpperCase(),
  department_id: z.string().uuid("Department is required"),
  current_semester_id: z.string().uuid("Semester is required"),
  current_section_id: z.string().uuid("Class section is required"),
  admission_year: z.coerce.number().int().min(2000).max(2100),
  admission_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format").default(() => new Date().toISOString().split("T")[0]),
  guardian_name: z.string().max(100).optional().nullable(),
  guardian_contact: z.string().max(20).optional().nullable(),
  profile_id: z.string().uuid().optional().nullable(),
  is_active: z.boolean().default(true),
});

export const UpdateStudentSchema = StudentSchema.partial().extend({
  id: z.string().uuid("Invalid student ID"),
});

export type StudentInput = z.infer<typeof StudentSchema>;
export type UpdateStudentInput = z.infer<typeof UpdateStudentSchema>;

// -----------------------------------------------------------------------------
// 9. SUBJECT
// -----------------------------------------------------------------------------
export const SubjectSchema = z.object({
  code: z.string().min(2, "Subject code is required").max(30).toUpperCase(),
  name: z.string().min(2, "Subject name is required").max(150),
  department_id: z.string().uuid("Department is required"),
  semester_id: z.string().uuid("Semester is required"),
  credits: z.coerce.number().int().min(1, "Credits must be at least 1").max(10),
  lecture_hours_per_week: z.coerce.number().int().min(0).default(3),
  lab_hours_per_week: z.coerce.number().int().min(0).default(0),
  total_weekly_periods: z.coerce.number().int().min(1, "Weekly periods must be at least 1").default(4),
  is_lab: z.boolean().default(false),
  subject_type: z.enum([
    "THEORY",
    "LABORATORY",
    "PRACTICAL",
    "ELECTIVE",
    "PROJECT",
  ]).default("THEORY"),
  is_active: z.boolean().default(true),
});

export const UpdateSubjectSchema = SubjectSchema.partial().extend({
  id: z.string().uuid("Invalid subject ID"),
});

export type SubjectInput = z.infer<typeof SubjectSchema>;
export type UpdateSubjectInput = z.infer<typeof UpdateSubjectSchema>;

// -----------------------------------------------------------------------------
// 10. FACULTY-SUBJECT ASSIGNMENT
// -----------------------------------------------------------------------------
export const FacultySubjectSchema = z.object({
  faculty_id: z.string().uuid("Faculty is required"),
  subject_id: z.string().uuid("Subject is required"),
  section_id: z.string().uuid("Class section is required"),
  academic_year_id: z.string().uuid("Academic year is required"),
  semester_id: z.string().uuid("Semester is required"),
  is_primary: z.boolean().default(true),
  status: z.string().default("ASSIGNED"),
});

export const UpdateFacultySubjectSchema = FacultySubjectSchema.partial().extend({
  id: z.string().uuid("Invalid assignment ID"),
});

export type FacultySubjectInput = z.infer<typeof FacultySubjectSchema>;
export type UpdateFacultySubjectInput = z.infer<typeof UpdateFacultySubjectSchema>;

// -----------------------------------------------------------------------------
// 11. STUDENT ENROLLMENT
// -----------------------------------------------------------------------------
export const StudentEnrollmentSchema = z.object({
  student_id: z.string().uuid("Student is required"),
  subject_id: z.string().uuid("Subject is required"),
  section_id: z.string().uuid("Class section is required"),
  semester_id: z.string().uuid("Semester is required"),
  academic_year_id: z.string().uuid("Academic year is required"),
  is_active: z.boolean().default(true),
});

export const UpdateStudentEnrollmentSchema = StudentEnrollmentSchema.partial().extend({
  id: z.string().uuid("Invalid enrollment ID"),
});

export type StudentEnrollmentInput = z.infer<typeof StudentEnrollmentSchema>;
export type UpdateStudentEnrollmentInput = z.infer<typeof UpdateStudentEnrollmentSchema>;
