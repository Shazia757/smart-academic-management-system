import {
  AttendanceRecord,
  AttendanceSession,
  AttendanceStatus,
  AttendanceSessionStatus,
} from "../../types/attendance";
import { CreateAttendanceSessionSchema } from "../../server/validators/attendance";
import { calculateAttendancePercentage } from "./attendance-utils";

export interface SubjectAttendanceSummary {
  subject_id: string;
  subject_code: string;
  subject_name: string;
  total_classes: number;
  attended_classes: number;
  present_count: number;
  late_count: number;
  absent_count: number;
  excused_count: number;
  percentage: number;
  is_low_attendance: boolean;
}

export interface SessionFilterOptions {
  status?: AttendanceSessionStatus | "ALL" | "";
  sectionId?: string;
  subjectId?: string;
  academicYearId?: string;
  search?: string;
  fromDate?: string;
  toDate?: string;
}

export interface StudentHistoryFilterOptions {
  status?: AttendanceStatus | "ALL" | "";
  subjectId?: string;
  search?: string;
  fromDate?: string;
  toDate?: string;
}

/**
 * Groups a student's attendance records by subject and computes subject-wise stats.
 */
export function calculateSubjectWiseAttendance(
  records: AttendanceRecord[]
): SubjectAttendanceSummary[] {
  const map = new Map<string, {
    subject_id: string;
    subject_code: string;
    subject_name: string;
    total: number;
    present: number;
    late: number;
    absent: number;
    excused: number;
  }>();

  for (const record of records) {
    const session = (record as any).session;
    const subject = session?.subject || (record as any).subject;
    const subjectId = subject?.id || session?.subject_id || "unknown";
    const subjectCode = subject?.code || "SUBJ";
    const subjectName = subject?.name || "Academic Subject";

    if (!map.has(subjectId)) {
      map.set(subjectId, {
        subject_id: subjectId,
        subject_code: subjectCode,
        subject_name: subjectName,
        total: 0,
        present: 0,
        late: 0,
        absent: 0,
        excused: 0,
      });
    }

    const item = map.get(subjectId)!;
    item.total += 1;

    switch (record.status) {
      case "PRESENT":
        item.present += 1;
        break;
      case "LATE":
        item.late += 1;
        break;
      case "ABSENT":
        item.absent += 1;
        break;
      case "EXCUSED":
        item.excused += 1;
        break;
    }
  }

  return Array.from(map.values()).map((item) => {
    // Standard rule: PRESENT + LATE counts as attended class
    const attended = item.present + item.late;
    const percentage = calculateAttendancePercentage(attended, item.total);
    return {
      subject_id: item.subject_id,
      subject_code: item.subject_code,
      subject_name: item.subject_name,
      total_classes: item.total,
      attended_classes: attended,
      present_count: item.present,
      late_count: item.late,
      absent_count: item.absent,
      excused_count: item.excused,
      percentage,
      is_low_attendance: percentage < 75.0 && item.total > 0,
    };
  });
}

/**
 * Pure filtering for attendance sessions.
 */
export function filterAttendanceSessions(
  sessions: AttendanceSession[],
  filters: SessionFilterOptions
): AttendanceSession[] {
  return sessions.filter((s) => {
    if (filters.status && filters.status !== "ALL" && s.status !== filters.status) {
      return false;
    }
    if (filters.sectionId && s.section_id !== filters.sectionId) {
      return false;
    }
    if (filters.subjectId && s.subject_id !== filters.subjectId) {
      return false;
    }
    if (filters.academicYearId && s.academic_year_id !== filters.academicYearId) {
      return false;
    }
    if (filters.fromDate && s.session_date < filters.fromDate) {
      return false;
    }
    if (filters.toDate && s.session_date > filters.toDate) {
      return false;
    }
    if (filters.search) {
      const q = filters.search.toLowerCase().trim();
      const subjectName = s.subject?.name?.toLowerCase() || "";
      const subjectCode = s.subject?.code?.toLowerCase() || "";
      const sectionName = s.section?.name?.toLowerCase() || "";
      const facultyName =
        `${s.faculty?.profile?.first_name || ""} ${s.faculty?.profile?.last_name || ""}`.toLowerCase();
      const matches =
        subjectName.includes(q) ||
        subjectCode.includes(q) ||
        sectionName.includes(q) ||
        facultyName.includes(q);
      if (!matches) return false;
    }
    return true;
  });
}

/**
 * Pure filtering for student attendance history records.
 */
export function filterStudentHistory(
  records: AttendanceRecord[],
  filters: StudentHistoryFilterOptions
): AttendanceRecord[] {
  return records.filter((r) => {
    if (filters.status && filters.status !== "ALL" && r.status !== filters.status) {
      return false;
    }
    const session = (r as any).session;
    const subject = session?.subject || (r as any).subject;
    const subjectId = subject?.id || session?.subject_id;
    if (filters.subjectId && subjectId !== filters.subjectId) {
      return false;
    }
    const sessionDate = session?.session_date || (r as any).session_date;
    if (sessionDate) {
      if (filters.fromDate && sessionDate < filters.fromDate) return false;
      if (filters.toDate && sessionDate > filters.toDate) return false;
    }
    if (filters.search) {
      const q = filters.search.toLowerCase().trim();
      const subjectCode = subject?.code?.toLowerCase() || "";
      const subjectName = subject?.name?.toLowerCase() || "";
      const remarks = r.remarks?.toLowerCase() || "";
      const matches = subjectCode.includes(q) || subjectName.includes(q) || remarks.includes(q);
      if (!matches) return false;
    }
    return true;
  });
}

/**
 * Formats a 24-hr time string (e.g. "09:00:00") into "09:00 AM" or window "09:00 AM - 09:55 AM".
 */
export function formatSessionTimeWindow(
  startTime?: string | null,
  endTime?: string | null
): string {
  if (!startTime) return "Time not set";

  const formatSingle = (t: string) => {
    const parts = t.split(":");
    let hour = parseInt(parts[0], 10);
    const minute = parts[1] || "00";
    if (Number.isNaN(hour)) return t;
    const ampm = hour >= 12 ? "PM" : "AM";
    hour = hour % 12;
    hour = hour ? hour : 12;
    return `${String(hour).padStart(2, "0")}:${minute} ${ampm}`;
  };

  const startFormatted = formatSingle(startTime);
  if (!endTime) return startFormatted;
  return `${startFormatted} – ${formatSingle(endTime)}`;
}

/**
 * Formats YYYY-MM-DD into a localized friendly date (e.g. "Sep 20, 2026").
 */
export function formatAttendanceDate(dateStr?: string | null): string {
  if (!dateStr) return "N/A";
  try {
    const [year, month, day] = dateStr.split("-").map(Number);
    const d = new Date(year, month - 1, day);
    return d.toLocaleDateString("en-US", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

/**
 * Validates session creation form inputs, returning client-safe error messages.
 */
export function validateSessionFormInput(values: any): {
  isValid: boolean;
  errors: Record<string, string>;
} {
  const result = CreateAttendanceSessionSchema.safeParse(values);
  if (result.success) {
    return { isValid: true, errors: {} };
  }

  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const path = issue.path[0] ? String(issue.path[0]) : "form";
    if (!errors[path]) {
      errors[path] = issue.message;
    }
  }

  return { isValid: false, errors };
}

/**
 * Sanitizes errors for UI display so Postgres/Supabase SQL details are never shown.
 */
export function sanitizeErrorMessage(error: unknown): string {
  if (!error) return "An unexpected error occurred. Please try again.";

  let msg = typeof error === "string" ? error : (error as any).message || String(error);

  if (
    msg.includes("SELECT") ||
    msg.includes("INSERT") ||
    msg.includes("UPDATE") ||
    msg.includes("DELETE") ||
    msg.includes("public.") ||
    msg.includes("column") ||
    msg.includes("relation") ||
    msg.includes("violates foreign key") ||
    msg.includes("stack")
  ) {
    return "A system error occurred while processing your request. Please try again.";
  }

  if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
    return "Unable to connect to the server. Please check your internet connection.";
  }

  return msg;
}
