export type UserRole = "super_admin" | "college_admin" | "faculty" | "student";

export type RoomType =
  | "LECTURE_HALL"
  | "LABORATORY"
  | "SEMINAR_ROOM"
  | "AUDITORIUM"
  | "TUTORIAL_ROOM";

export type SubjectType =
  | "THEORY"
  | "LABORATORY"
  | "PRACTICAL"
  | "ELECTIVE"
  | "PROJECT";

export type AvailabilityStatus = "AVAILABLE" | "UNAVAILABLE" | "PREFERRED";

export type SemesterTerm = "ODD" | "EVEN";

export type TimetableStatus =
  | "DRAFT"
  | "OPTIMIZING"
  | "GENERATED"
  | "PUBLISHED"
  | "ARCHIVED";

export type SessionStatus = "SCHEDULED" | "ACTIVE" | "COMPLETED" | "CANCELLED";

export type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";

export type VerificationMethod =
  | "AI_FACE_RECOGNITION"
  | "FACULTY_OVERRIDE"
  | "MANUAL_ENTRY";

export type NotificationType =
  | "TIMETABLE_UPDATE"
  | "ROOM_CHANGE"
  | "CLASS_CANCELLED"
  | "ATTENDANCE_WARNING"
  | "ACADEMIC_ANNOUNCEMENT"
  | "SYSTEM";

export interface Profile {
  id: string;
  email: string;
  role: UserRole;
  first_name: string;
  last_name: string;
  phone?: string | null;
  avatar_url?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Department {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  head_of_department_id?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  head_of_department?: Profile | null;
}

export interface AcademicYear {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Semester {
  id: string;
  academic_year_id: string;
  name: string;
  semester_number: number;
  term_type: SemesterTerm;
  start_date: string;
  end_date: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  academic_year?: AcademicYear;
}

export interface ClassSection {
  id: string;
  department_id: string;
  academic_year_id: string;
  semester_id: string;
  name: string;
  code: string;
  capacity: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  department?: Department;
  semester?: Semester;
  academic_year?: AcademicYear;
}

export interface Classroom {
  id: string;
  room_number: string;
  building: string;
  floor: number;
  room_type: RoomType;
  capacity: number;
  facilities: string[];
  department_id?: string | null;
  is_available: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  department?: Department | null;
}

export interface Faculty {
  id: string;
  profile_id?: string | null;
  employee_id: string;
  department_id: string;
  designation: string;
  qualification: string;
  specialization?: string | null;
  joining_date?: string | null;
  max_weekly_hours: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  profile?: Profile | null;
  department?: Department;
}

export interface FacultyAvailability {
  id: string;
  faculty_id: string;
  day_of_week: number;
  period_slot: number;
  start_time?: string | null;
  end_time?: string | null;
  availability_status: AvailabilityStatus;
  is_available: boolean;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  faculty?: Faculty;
}

export interface Student {
  id: string;
  profile_id?: string | null;
  roll_number: string;
  usn: string;
  department_id: string;
  current_semester_id: string;
  current_section_id: string;
  admission_year: number;
  admission_date: string;
  guardian_name?: string | null;
  guardian_contact?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  profile?: Profile | null;
  department?: Department;
  section?: ClassSection;
  semester?: Semester;
}

export interface Subject {
  id: string;
  code: string;
  name: string;
  department_id: string;
  semester_id: string;
  credits: number;
  lecture_hours_per_week: number;
  lab_hours_per_week: number;
  total_weekly_periods: number;
  is_lab: boolean;
  subject_type: SubjectType;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  department?: Department;
  semester?: Semester;
}

export interface FacultySubject {
  id: string;
  faculty_id: string;
  subject_id: string;
  section_id: string;
  academic_year_id: string;
  semester_id: string;
  is_primary: boolean;
  status: string;
  created_at: string;
  updated_at: string;
  faculty?: Faculty;
  subject?: Subject;
  section?: ClassSection;
  academic_year?: AcademicYear;
  semester?: Semester;
}

export interface StudentEnrollment {
  id: string;
  student_id: string;
  subject_id: string;
  section_id: string;
  semester_id: string;
  academic_year_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  student?: Student;
  subject?: Subject;
  section?: ClassSection;
  semester?: Semester;
  academic_year?: AcademicYear;
}

export interface TimetableConfig {
  id: string;
  academic_year_id: string;
  department_id: string;
  semester_id: string;
  working_days: number[];
  periods_per_day: number;
  slot_duration_minutes: number;
  start_time: string;
  break_slots: { period: number; duration: number; label: string }[];
  is_active: boolean;
  created_at: string;
}

export interface Timetable {
  id: string;
  config_id: string;
  section_id: string;
  name: string;
  status: TimetableStatus;
  solver_metadata?: Record<string, unknown>;
  published_at?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TimetableEntry {
  id: string;
  timetable_id: string;
  day_of_week: number;
  period_index: number;
  start_time: string;
  end_time: string;
  subject_id: string;
  faculty_id: string;
  classroom_id: string;
  created_at: string;
  subject?: Subject;
  faculty?: Faculty;
  classroom?: Classroom;
}

export interface FaceEmbedding {
  id: string;
  student_id: string;
  embedding: number[];
  dimension: number;
  model_name: string;
  quality_score: number;
  enrolled_by?: string | null;
  enrolled_at: string;
}

export interface AttendanceSession {
  id: string;
  subject_id: string;
  section_id: string;
  faculty_id: string;
  classroom_id: string;
  timetable_entry_id?: string | null;
  session_date: string;
  start_time: string;
  end_time?: string | null;
  status: SessionStatus;
  verification_method: VerificationMethod;
  created_at: string;
}

export interface AttendanceRecord {
  id: string;
  session_id: string;
  student_id: string;
  status: AttendanceStatus;
  confidence_score?: number | null;
  verification_timestamp: string;
  marked_by: VerificationMethod;
  override_reason?: string | null;
  created_at: string;
}

export interface NotificationItem {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: NotificationType;
  is_read: boolean;
  action_url?: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  user_id?: string | null;
  action: string;
  entity_name: string;
  entity_id?: string | null;
  old_values?: Record<string, unknown> | null;
  new_values?: Record<string, unknown> | null;
  ip_address?: string | null;
  user_agent?: string | null;
  created_at: string;
}
