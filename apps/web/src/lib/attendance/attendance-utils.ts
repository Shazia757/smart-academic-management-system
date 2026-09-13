import type {
  AttendanceRecord,
  AttendanceSummary,
  AttendanceSummaryOptions,
  StudentAttendanceStats,
  SubjectAttendanceSummary,
  SessionAttendanceSummary,
} from "../../types/attendance";

const DEFAULT_THRESHOLD_PERCENTAGE = 75.0;
const DEFAULT_PRECISION = 2;

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


/**
 * Calculates the attendance percentage safely.
 *
 * Guarantees:
 * - Zero denominator safety: returns 0.00 (or 0 rounded to precision) when total <= 0, avoiding NaN or Infinity.
 * - Floating-point precision: rounds cleanly without floating-point artifacts (e.g. 66.6666666... -> 66.67).
 * - Bounded: clamps output strictly between 0.00 and 100.00.
 */
export function calculateAttendancePercentage(
  presentCount: number,
  totalCount: number,
  options?: {
    precision?: number;
  }
): number {
  if (!Number.isFinite(totalCount) || totalCount <= 0) {
    return 0.0;
  }

  const safePresent = Math.max(0, Number.isFinite(presentCount) ? presentCount : 0);
  const rawRatio = safePresent / totalCount;
  const rawPercentage = rawRatio * 100;

  // Clamp strictly between 0 and 100
  const clamped = Math.min(100.0, Math.max(0.0, rawPercentage));

  const precision = options?.precision ?? DEFAULT_PRECISION;
  const factor = Math.pow(10, precision);
  return Math.round((clamped + Number.EPSILON) * factor) / factor;
}

/**
 * Validates a session's start and end time window.
 * Returns valid status, error message, and duration in minutes when valid.
 */
export function validateSessionTimeWindow(
  startTime: string,
  endTime?: string | null
): {
  isValid: boolean;
  error?: string;
  durationMinutes?: number;
} {
  const timeRegex = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

  if (!startTime || !timeRegex.test(startTime)) {
    return { isValid: false, error: "Start time must follow HH:MM or HH:MM:SS format" };
  }

  if (!endTime) {
    return { isValid: true };
  }

  if (!timeRegex.test(endTime)) {
    return { isValid: false, error: "End time must follow HH:MM or HH:MM:SS format" };
  }

  const startSec = timeStringToSeconds(startTime);
  const endSec = timeStringToSeconds(endTime);

  if (endSec <= startSec) {
    return { isValid: false, error: "End time must be strictly after start time" };
  }

  const durationMinutes = Math.round((endSec - startSec) / 60);
  return { isValid: true, durationMinutes };
}

/**
 * Detects duplicate student IDs in a list of records.
 * Returns an array of duplicate student IDs (empty if all unique).
 */
export function detectDuplicateStudentRecords(
  records: Array<{ student_id: string }>
): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const record of records) {
    if (seen.has(record.student_id)) {
      duplicates.add(record.student_id);
    } else {
      seen.add(record.student_id);
    }
  }

  return Array.from(duplicates);
}

/**
 * Aggregates attendance statistics for a single student across a set of records.
 */
export function summarizeStudentAttendance(
  records: AttendanceRecord[],
  options?: AttendanceSummaryOptions
): AttendanceSummary {
  const threshold = options?.thresholdPercentage ?? DEFAULT_THRESHOLD_PERCENTAGE;
  const countLateAsHalf = options?.countLateAsHalf ?? false;
  const excludeExcused = options?.excludeExcusedFromTotal ?? false;
  const precision = options?.precision ?? DEFAULT_PRECISION;

  let presentCount = 0;
  let absentCount = 0;
  let lateCount = 0;
  let excusedCount = 0;

  for (const r of records) {
    switch (r.status) {
      case "PRESENT":
        presentCount++;
        break;
      case "ABSENT":
        absentCount++;
        break;
      case "LATE":
        lateCount++;
        break;
      case "EXCUSED":
        excusedCount++;
        break;
    }
  }

  const effectivePresent =
    presentCount + (countLateAsHalf ? lateCount * 0.5 : 0);

  const totalSessions = records.length;
  const effectiveTotal = excludeExcused
    ? totalSessions - excusedCount
    : totalSessions;

  const percentage = calculateAttendancePercentage(effectivePresent, effectiveTotal, {
    precision,
  });

  const isLowAttendance = totalSessions > 0 && percentage < threshold;

  return {
    total_sessions: totalSessions,
    present_count: presentCount,
    absent_count: absentCount,
    late_count: lateCount,
    excused_count: excusedCount,
    effective_present_count: Math.round((effectivePresent + Number.EPSILON) * 100) / 100,
    attendance_percentage: percentage,
    is_low_attendance: isLowAttendance,
    threshold_percentage: threshold,
  };
}

/**
 * Aggregates attendance metrics for an individual session.
 */
export function summarizeSessionAttendance(
  sessionId: string,
  sessionDate: string,
  records: AttendanceRecord[],
  options?: AttendanceSummaryOptions
): SessionAttendanceSummary {
  const summary = summarizeStudentAttendance(records, options);

  return {
    session_id: sessionId,
    session_date: sessionDate,
    total_students: summary.total_sessions,
    present_count: summary.present_count,
    absent_count: summary.absent_count,
    late_count: summary.late_count,
    excused_count: summary.excused_count,
    attendance_percentage: summary.attendance_percentage,
  };
}

/**
 * Aggregates overall class/subject attendance across multiple sessions and students.
 */
export function summarizeSubjectAttendance(
  subjectId: string,
  subjectMeta: { code?: string; name?: string },
  studentRecordsMap: Map<string, { name?: string; rollNumber?: string; records: AttendanceRecord[] }>,
  options?: AttendanceSummaryOptions
): SubjectAttendanceSummary {
  const studentStats: StudentAttendanceStats[] = [];
  let totalStudentSessions = 0;
  let totalEffectivePresents = 0;
  let lowAttendanceCount = 0;

  for (const [studentId, data] of studentRecordsMap.entries()) {
    const summary = summarizeStudentAttendance(data.records, options);
    studentStats.push({
      student_id: studentId,
      student_name: data.name,
      roll_number: data.rollNumber,
      summary,
    });

    totalStudentSessions += summary.total_sessions;
    totalEffectivePresents += summary.effective_present_count;

    if (summary.is_low_attendance) {
      lowAttendanceCount++;
    }
  }

  const overallPercentage = calculateAttendancePercentage(
    totalEffectivePresents,
    totalStudentSessions,
    { precision: options?.precision ?? DEFAULT_PRECISION }
  );

  return {
    subject_id: subjectId,
    subject_code: subjectMeta.code,
    subject_name: subjectMeta.name,
    total_sessions: studentRecordsMap.size > 0
      ? Math.max(...Array.from(studentRecordsMap.values()).map((v) => v.records.length))
      : 0,
    total_records: totalStudentSessions,
    overall_attendance_percentage: overallPercentage,
    low_attendance_students_count: lowAttendanceCount,
    student_stats: studentStats,
  };
}
