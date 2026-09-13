import type {
  Subject,
  ClassSection,
  Faculty,
  Classroom,
  TimetableEntry,
  AcademicYear,
  Student,
} from "./database";

// -----------------------------------------------------------------------------
// 1. CANONICAL DOMAIN ENUMS (STRICT)
// -----------------------------------------------------------------------------

export type AttendanceSessionStatus = "OPEN" | "CLOSED" | "CANCELLED";

export type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";

export type RecognitionMethod = "MANUAL" | "FACIAL_RECOGNITION" | "IMPORT";

// -----------------------------------------------------------------------------
// 2. LEGACY VALUE TYPES & NORMALIZATION HELPERS
// -----------------------------------------------------------------------------

export type LegacySessionStatus =
  | "SCHEDULED"
  | "ACTIVE"
  | "COMPLETED"
  | "CANCELLED";

export type LegacyVerificationMethod =
  | "AI_FACE_RECOGNITION"
  | "FACULTY_OVERRIDE"
  | "MANUAL_ENTRY";

/**
 * Normalizes legacy or raw session status string to canonical AttendanceSessionStatus.
 *
 * Mappings:
 * - SCHEDULED -> OPEN
 * - ACTIVE    -> OPEN
 * - COMPLETED -> CLOSED
 * - CANCELLED -> CANCELLED
 * - OPEN      -> OPEN
 * - CLOSED    -> CLOSED
 */
export function normalizeSessionStatus(rawStatus: string): AttendanceSessionStatus {
  const normalized = (rawStatus || "").trim().toUpperCase();
  switch (normalized) {
    case "OPEN":
    case "SCHEDULED":
    case "ACTIVE":
      return "OPEN";
    case "CLOSED":
    case "COMPLETED":
      return "CLOSED";
    case "CANCELLED":
      return "CANCELLED";
    default:
      throw new Error(`Invalid attendance session status: '${rawStatus}'`);
  }
}

/**
 * Normalizes legacy or raw recognition method string to canonical RecognitionMethod.
 *
 * Mappings:
 * - AI_FACE_RECOGNITION -> FACIAL_RECOGNITION
 * - FACIAL_RECOGNITION  -> FACIAL_RECOGNITION
 * - FACULTY_OVERRIDE    -> MANUAL
 * - MANUAL_ENTRY        -> MANUAL
 * - MANUAL              -> MANUAL
 * - IMPORT              -> IMPORT
 */
export function normalizeRecognitionMethod(rawMethod: string): RecognitionMethod {
  const normalized = (rawMethod || "").trim().toUpperCase();
  switch (normalized) {
    case "FACIAL_RECOGNITION":
    case "AI_FACE_RECOGNITION":
      return "FACIAL_RECOGNITION";
    case "MANUAL":
    case "MANUAL_ENTRY":
    case "FACULTY_OVERRIDE":
      return "MANUAL";
    case "IMPORT":
      return "IMPORT";
    default:
      throw new Error(`Invalid recognition method: '${rawMethod}'`);
  }
}

// -----------------------------------------------------------------------------
// 3. CORE DOMAIN INTERFACES
// -----------------------------------------------------------------------------

export interface AttendanceSession {
  id: string;
  institution_id?: string | null;
  academic_year_id?: string | null;
  section_id: string;
  subject_id: string;
  faculty_id: string;
  classroom_id?: string | null;
  timetable_entry_id?: string | null;
  session_date: string; // YYYY-MM-DD
  start_time: string; // HH:MM:SS or HH:MM
  end_time?: string | null; // HH:MM:SS or HH:MM
  status: AttendanceSessionStatus;
  created_by?: string | null;
  created_at: string;
  updated_at?: string;

  // Joined relations (optional)
  subject?: Subject;
  section?: ClassSection;
  faculty?: Faculty;
  classroom?: Classroom;
  timetable_entry?: TimetableEntry;
  academic_year?: AcademicYear;
}

export interface AttendanceRecord {
  id: string;
  session_id: string;
  student_id: string;
  status: AttendanceStatus;
  confidence_score?: number | null; // Inclusive 0.0 to 1.0
  marked_at: string; // ISO 8601 timestamp
  marked_by?: string | null; // UUID of caller or system identifier
  recognition_method: RecognitionMethod;
  remarks?: string | null;
  override_reason?: string | null; // Legacy compatibility alias for remarks
  created_at: string;
  updated_at?: string;

  // Joined relations (optional)
  session?: AttendanceSession;
  student?: Student;
}

// -----------------------------------------------------------------------------
// 4. STATISTICAL & SUMMARY TYPES
// -----------------------------------------------------------------------------

export interface AttendanceSummaryOptions {
  /**
   * Minimum required attendance percentage (default: 75.0)
   */
  thresholdPercentage?: number;

  /**
   * Decimal precision for percentages (default: 2)
   */
  precision?: number;

  /**
   * If true, LATE attendance counts as 0.5 present session (default: false)
   */
  countLateAsHalf?: boolean;

  /**
   * If true, EXCUSED absences are excluded from the total denominator (default: false)
   */
  excludeExcusedFromTotal?: boolean;
}

export interface AttendanceSummary {
  total_sessions: number;
  present_count: number;
  absent_count: number;
  late_count: number;
  excused_count: number;
  effective_present_count: number;
  attendance_percentage: number;
  is_low_attendance: boolean;
  threshold_percentage: number;
}

export interface StudentAttendanceStats {
  student_id: string;
  student_name?: string;
  roll_number?: string;
  summary: AttendanceSummary;
}

export interface SessionAttendanceSummary {
  session_id: string;
  session_date: string;
  total_students: number;
  present_count: number;
  absent_count: number;
  late_count: number;
  excused_count: number;
  attendance_percentage: number;
}

export interface SubjectAttendanceSummary {
  subject_id: string;
  subject_code?: string;
  subject_name?: string;
  total_sessions: number;
  total_records: number;
  overall_attendance_percentage: number;
  low_attendance_students_count: number;
  student_stats: StudentAttendanceStats[];
}
