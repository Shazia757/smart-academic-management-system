import { z } from "zod";

// -----------------------------------------------------------------------------
// 1. CANONICAL DOMAIN ENUMS (STRICT)
// -----------------------------------------------------------------------------

export const AttendanceSessionStatusSchema = z.enum(["OPEN", "CLOSED", "CANCELLED"], {
  errorMap: () => ({ message: "Invalid session status: must be OPEN, CLOSED, or CANCELLED" }),
});

export const AttendanceStatusSchema = z.enum(["PRESENT", "ABSENT", "LATE", "EXCUSED"], {
  errorMap: () => ({ message: "Invalid attendance status: must be PRESENT, ABSENT, LATE, or EXCUSED" }),
});

export const RecognitionMethodSchema = z.enum(["MANUAL", "FACIAL_RECOGNITION", "IMPORT"], {
  errorMap: () => ({ message: "Invalid recognition method: must be MANUAL, FACIAL_RECOGNITION, or IMPORT" }),
});

// -----------------------------------------------------------------------------
// 2. TIME / DATE HELPERS & REGEX
// -----------------------------------------------------------------------------

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

/**
 * Validates a string as a real calendar date (e.g. rejects 2026-02-31).
 */
function isValidCalendarDate(dateStr: string): boolean {
  if (!DATE_REGEX.test(dateStr)) return false;
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

/**
 * Converts HH:MM or HH:MM:SS to total seconds from midnight.
 */
export function timeStringToSeconds(timeStr: string): number {
  const parts = timeStr.split(":").map(Number);
  const hours = parts[0] || 0;
  const minutes = parts[1] || 0;
  const seconds = parts[2] || 0;
  return hours * 3600 + minutes * 60 + seconds;
}

// -----------------------------------------------------------------------------
// 3. ATTENDANCE SESSION SCHEMAS
// -----------------------------------------------------------------------------

export const CreateAttendanceSessionSchema = z
  .object({
    institution_id: z.string().uuid("Invalid Institution ID").optional().nullable(),
    academic_year_id: z.string().uuid("Invalid Academic Year ID").optional().nullable(),
    section_id: z.string().uuid("Invalid Class Section ID"),
    subject_id: z.string().uuid("Invalid Subject ID"),
    faculty_id: z.string().uuid("Invalid Faculty ID"),
    classroom_id: z.string().uuid("Invalid Classroom ID").optional().nullable(),
    timetable_entry_id: z.string().uuid("Invalid Timetable Entry ID").optional().nullable(),
    session_date: z
      .string()
      .regex(DATE_REGEX, "Session date must follow YYYY-MM-DD format")
      .refine(isValidCalendarDate, { message: "Session date is not a valid calendar date" }),
    start_time: z
      .string()
      .regex(TIME_REGEX, "Start time must be in HH:MM or HH:MM:SS format"),
    end_time: z
      .string()
      .regex(TIME_REGEX, "End time must be in HH:MM or HH:MM:SS format")
      .optional()
      .nullable(),
    status: AttendanceSessionStatusSchema.default("OPEN"),
    created_by: z.string().uuid("Invalid Created By User ID").optional().nullable(),
  })
  .refine(
    (data) => {
      if (data.start_time && data.end_time) {
        return timeStringToSeconds(data.end_time) > timeStringToSeconds(data.start_time);
      }
      return true;
    },
    {
      message: "End time must be strictly after start time",
      path: ["end_time"],
    }
  );

export const UpdateAttendanceSessionSchema = z
  .object({
    id: z.string().uuid("Invalid Attendance Session ID"),
    classroom_id: z.string().uuid("Invalid Classroom ID").optional().nullable(),
    timetable_entry_id: z.string().uuid("Invalid Timetable Entry ID").optional().nullable(),
    session_date: z
      .string()
      .regex(DATE_REGEX, "Session date must follow YYYY-MM-DD format")
      .refine(isValidCalendarDate, { message: "Session date is not a valid calendar date" })
      .optional(),
    start_time: z
      .string()
      .regex(TIME_REGEX, "Start time must be in HH:MM or HH:MM:SS format")
      .optional(),
    end_time: z
      .string()
      .regex(TIME_REGEX, "End time must be in HH:MM or HH:MM:SS format")
      .optional()
      .nullable(),
    status: AttendanceSessionStatusSchema.optional(),
  })
  .refine(
    (data) => {
      if (data.start_time && data.end_time) {
        return timeStringToSeconds(data.end_time) > timeStringToSeconds(data.start_time);
      }
      return true;
    },
    {
      message: "End time must be strictly after start time",
      path: ["end_time"],
    }
  );

// -----------------------------------------------------------------------------
// 4. ATTENDANCE RECORD SCHEMAS
// -----------------------------------------------------------------------------

export const AttendanceRecordSchema = z.object({
  session_id: z.string().uuid("Invalid Session ID"),
  student_id: z.string().uuid("Invalid Student ID"),
  status: AttendanceStatusSchema,
  confidence_score: z
    .number({ invalid_type_error: "Confidence score must be a number" })
    .min(0, "Confidence score must be between 0.0 and 1.0 (inclusive)")
    .max(1, "Confidence score must be between 0.0 and 1.0 (inclusive)")
    .optional()
    .nullable(),
  marked_at: z
    .string()
    .datetime({ message: "Marked timestamp must be a valid ISO 8601 string" })
    .optional(),
  marked_by: z.string().uuid("Invalid Marked By User ID").optional().nullable(),
  recognition_method: RecognitionMethodSchema.default("MANUAL"),
  remarks: z.string().max(500, "Remarks cannot exceed 500 characters").optional().nullable(),
  override_reason: z.string().max(500).optional().nullable(),
});

export const BulkMarkAttendanceSchema = z
  .object({
    session_id: z.string().uuid("Invalid Attendance Session ID"),
    records: z
      .array(AttendanceRecordSchema)
      .min(1, "At least one attendance record is required"),
  })
  .refine(
    (data) => {
      const studentIds = data.records.map((r) => r.student_id);
      return new Set(studentIds).size === studentIds.length;
    },
    {
      message: "Duplicate student IDs detected in bulk attendance submission",
      path: ["records"],
    }
  )
  .refine(
    (data) => {
      // Ensure all records match the root session_id
      return data.records.every((r) => r.session_id === data.session_id);
    },
    {
      message: "All records must match the parent session ID",
      path: ["records"],
    }
  );

export const UpdateAttendanceRecordSchema = z.object({
  id: z.string().uuid("Invalid Attendance Record ID"),
  status: AttendanceStatusSchema.optional(),
  confidence_score: z
    .number()
    .min(0, "Confidence score must be between 0.0 and 1.0 (inclusive)")
    .max(1, "Confidence score must be between 0.0 and 1.0 (inclusive)")
    .optional()
    .nullable(),
  remarks: z.string().max(500, "Remarks cannot exceed 500 characters").optional().nullable(),
  override_reason: z.string().max(500).optional().nullable(),
});

// -----------------------------------------------------------------------------
// 5. QUERY / FILTER SCHEMA
// -----------------------------------------------------------------------------

export const AttendanceQuerySchema = z.object({
  session_id: z.string().uuid().optional(),
  student_id: z.string().uuid().optional(),
  subject_id: z.string().uuid().optional(),
  section_id: z.string().uuid().optional(),
  academic_year_id: z.string().uuid().optional(),
  from_date: z.string().regex(DATE_REGEX).refine(isValidCalendarDate).optional(),
  to_date: z.string().regex(DATE_REGEX).refine(isValidCalendarDate).optional(),
  status: AttendanceStatusSchema.optional(),
});

// Inferred TypeScript types
export type CreateAttendanceSessionInput = z.infer<typeof CreateAttendanceSessionSchema>;
export type UpdateAttendanceSessionInput = z.infer<typeof UpdateAttendanceSessionSchema>;
export type AttendanceRecordInput = z.infer<typeof AttendanceRecordSchema>;
export type BulkMarkAttendanceInput = z.infer<typeof BulkMarkAttendanceSchema>;
export type UpdateAttendanceRecordInput = z.infer<typeof UpdateAttendanceRecordSchema>;
export type AttendanceQueryInput = z.infer<typeof AttendanceQuerySchema>;
