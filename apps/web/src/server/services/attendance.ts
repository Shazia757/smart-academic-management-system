import { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  CreateAttendanceSessionSchema,
  CreateAttendanceSessionInput,
  BulkMarkAttendanceSchema,
  BulkMarkAttendanceInput,
  AttendanceQuerySchema,
  AttendanceQueryInput,
} from "../validators/attendance";
import type {
  AttendanceSession,
  AttendanceRecord,
  SessionAttendanceSummary,
  AttendanceSummary,
} from "../../types/attendance";
import {
  summarizeSessionAttendance,
  summarizeStudentAttendance,
} from "../../lib/attendance/attendance-utils";

export interface ServiceResult<T> {
  data: T | null;
  error: string | null;
  status: number;
}

export interface StudentAttendanceHistoryResult {
  student_id: string;
  summary: AttendanceSummary;
  records: AttendanceRecord[];
}

export interface SessionSummaryResult {
  session: AttendanceSession;
  summary: SessionAttendanceSummary;
  records: AttendanceRecord[];
}

export interface BatchSaveAttendanceResult {
  success: boolean;
  session_id: string;
  saved_count: number;
  status: string;
}

const UUID_SCHEMA = z.string().uuid("Invalid ID: must be a valid UUID");

/**
 * Maps database / RPC error codes and messages to safe HTTP statuses and client messages.
 */
function mapDatabaseError(error: any): { message: string; status: number } {
  const code = error?.code;
  const rawMsg = error?.message || "";

  if (code === "42501" || rawMsg.includes("not authorized") || rawMsg.includes("Authentication required")) {
    return { message: "You are not authorized to perform this attendance action", status: 403 };
  }
  if (code === "P0001" || rawMsg.includes("Cannot modify attendance for a")) {
    return { message: rawMsg || "Cannot modify attendance for a closed or cancelled session", status: 400 };
  }
  if (code === "P0002" || rawMsg.includes("not found")) {
    return { message: "Attendance session not found", status: 404 };
  }
  if (code === "P0003" || rawMsg.includes("not actively enrolled")) {
    return { message: rawMsg || "Student is not enrolled in the matching section, subject, or academic year", status: 400 };
  }
  if (code === "23503") {
    return { message: "Referenced academic record or student does not exist", status: 400 };
  }
  if (code === "23505" || rawMsg.includes("Duplicate student")) {
    return { message: "Duplicate student records detected in submission", status: 400 };
  }
  if (code === "23514") {
    return { message: "Value violates database constraints (check time window or confidence score bounds)", status: 400 };
  }
  if (code === "22023" || code === "22P02" || code === "22003") {
    return { message: rawMsg || "Invalid payload format or out-of-range value", status: 400 };
  }

  return { message: "An unexpected database error occurred while processing attendance", status: 500 };
}

/**
 * Attendance Service
 *
 * Provides domain-validated, RLS-enforced business logic for attendance management.
 */
export class AttendanceService {
  /**
   * Creates a new attendance session after validating inputs and caller permissions.
   */
  static async createAttendanceSession(
    supabase: SupabaseClient,
    rawInput: CreateAttendanceSessionInput
  ): Promise<ServiceResult<AttendanceSession>> {
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return { data: null, error: "Authentication required", status: 401 };
    }

    const parsed = CreateAttendanceSessionSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        data: null,
        error: parsed.error.errors[0]?.message || "Invalid session data",
        status: 400,
      };
    }

    const payload = parsed.data;

    // Fetch caller profile to check role
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, role, is_active")
      .eq("id", user.id)
      .single();

    if (!profile || !profile.is_active) {
      return { data: null, error: "Active user profile required", status: 403 };
    }

    const isAdmin =
      profile.role === "super_admin" ||
      profile.role === "college_admin" ||
      profile.role === "department_admin";

    if (profile.role === "student") {
      return { data: null, error: "Students are not permitted to create attendance sessions", status: 403 };
    }

    // If caller is faculty, enforce that faculty_id must correspond to caller's own faculty profile
    if (!isAdmin && profile.role === "faculty") {
      const { data: facultyRecord } = await supabase
        .from("faculty")
        .select("id")
        .or(`profile_id.eq.${user.id},id.eq.${user.id}`)
        .single();

      if (!facultyRecord || facultyRecord.id !== payload.faculty_id) {
        return {
          data: null,
          error: "Faculty members can only create attendance sessions for their own assignments",
          status: 403,
        };
      }
    }

    // Resolve academic_year_id if not provided
    let academicYearId = payload.academic_year_id;
    if (!academicYearId) {
      const { data: sectionData, error: sectionErr } = await supabase
        .from("class_sections")
        .select("semesters!inner(academic_year_id)")
        .eq("id", payload.section_id)
        .single();

      if (sectionErr || !sectionData) {
        return { data: null, error: "Unable to resolve academic year for the selected section", status: 400 };
      }
      academicYearId = (sectionData as any).semesters.academic_year_id;
    }

    // Insert session under RLS; created_by is derived strictly from user.id
    const { data, error } = await supabase
      .from("attendance_sessions")
      .insert({
        institution_id: payload.institution_id || null,
        academic_year_id: academicYearId,
        section_id: payload.section_id,
        subject_id: payload.subject_id,
        faculty_id: payload.faculty_id,
        classroom_id: payload.classroom_id || null,
        timetable_entry_id: payload.timetable_entry_id || null,
        session_date: payload.session_date,
        start_time: payload.start_time,
        end_time: payload.end_time || null,
        status: payload.status,
        created_by: user.id,
      })
      .select(`
        *,
        subject:subjects(*),
        section:class_sections(*),
        faculty:faculty(*),
        classroom:classrooms(*),
        academic_year:academic_years(*)
      `)
      .single();

    if (error) {
      const mapped = mapDatabaseError(error);
      return { data: null, error: mapped.message, status: mapped.status };
    }

    return { data: data as unknown as AttendanceSession, error: null, status: 201 };
  }

  /**
   * Retrieves a single attendance session by ID.
   */
  static async getAttendanceSession(
    supabase: SupabaseClient,
    sessionId: string
  ): Promise<ServiceResult<AttendanceSession>> {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { data: null, error: "Authentication required", status: 401 };
    }

    const idValidation = UUID_SCHEMA.safeParse(sessionId);
    if (!idValidation.success) {
      return { data: null, error: idValidation.error.errors[0].message, status: 400 };
    }

    const { data, error } = await supabase
      .from("attendance_sessions")
      .select(`
        *,
        subject:subjects(*),
        section:class_sections(*),
        faculty:faculty(*),
        classroom:classrooms(*),
        academic_year:academic_years(*)
      `)
      .eq("id", sessionId)
      .single();

    if (error || !data) {
      return { data: null, error: "Attendance session not found", status: 404 };
    }

    return { data: data as unknown as AttendanceSession, error: null, status: 200 };
  }

  /**
   * Lists attendance sessions matching optional query filters, governed by RLS.
   */
  static async listAttendanceSessions(
    supabase: SupabaseClient,
    rawQuery?: AttendanceQueryInput
  ): Promise<ServiceResult<AttendanceSession[]>> {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { data: null, error: "Authentication required", status: 401 };
    }

    let queryBuilder = supabase
      .from("attendance_sessions")
      .select(`
        *,
        subject:subjects(*),
        section:class_sections(*),
        faculty:faculty(*),
        classroom:classrooms(*),
        academic_year:academic_years(*)
      `);

    if (rawQuery) {
      const parsed = AttendanceQuerySchema.safeParse(rawQuery);
      if (!parsed.success) {
        return { data: null, error: parsed.error.errors[0]?.message || "Invalid query parameters", status: 400 };
      }
      const q = parsed.data;
      if (q.session_id) queryBuilder = queryBuilder.eq("id", q.session_id);
      if (q.section_id) queryBuilder = queryBuilder.eq("section_id", q.section_id);
      if (q.subject_id) queryBuilder = queryBuilder.eq("subject_id", q.subject_id);
      if (q.academic_year_id) queryBuilder = queryBuilder.eq("academic_year_id", q.academic_year_id);
      if (q.status) queryBuilder = queryBuilder.eq("status", q.status);
      if (q.from_date) queryBuilder = queryBuilder.gte("session_date", q.from_date);
      if (q.to_date) queryBuilder = queryBuilder.lte("session_date", q.to_date);
    }

    const { data, error } = await queryBuilder
      .order("session_date", { ascending: false })
      .order("start_time", { ascending: false });

    if (error) {
      const mapped = mapDatabaseError(error);
      return { data: null, error: mapped.message, status: mapped.status };
    }

    return { data: (data || []) as unknown as AttendanceSession[], error: null, status: 200 };
  }

  /**
   * Saves attendance records for a session using the atomic RPC function.
   */
  static async saveAttendanceRecords(
    supabase: SupabaseClient,
    rawInput: BulkMarkAttendanceInput,
    options?: { closeSession?: boolean }
  ): Promise<ServiceResult<BatchSaveAttendanceResult>> {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { data: null, error: "Authentication required", status: 401 };
    }

    const sessionId = rawInput.session_id;
    const rawRecords = Array.isArray(rawInput.records) ? rawInput.records : [];
    const normalizedRecords = rawRecords.map((r: any) =>
      typeof r === "object" && r !== null
        ? { ...r, session_id: r.session_id || sessionId }
        : r
    );

    const parsed = BulkMarkAttendanceSchema.safeParse({
      session_id: sessionId,
      records: normalizedRecords,
    });

    if (!parsed.success) {
      return {
        data: null,
        error: parsed.error.errors[0]?.message || "Invalid attendance submission payload",
        status: 400,
      };
    }

    const { records } = parsed.data;
    const closeSession = options?.closeSession ?? false;

    const { data, error } = await supabase.rpc("save_attendance_records_atomic", {
      p_session_id: sessionId,
      p_records: records,
      p_close_session: closeSession,
    });

    if (error) {
      const mapped = mapDatabaseError(error);
      return { data: null, error: mapped.message, status: mapped.status };
    }

    return { data: data as BatchSaveAttendanceResult, error: null, status: 200 };
  }

  /**
   * Closes an OPEN attendance session.
   */
  static async closeAttendanceSession(
    supabase: SupabaseClient,
    sessionId: string
  ): Promise<ServiceResult<AttendanceSession>> {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { data: null, error: "Authentication required", status: 401 };
    }

    const idValidation = UUID_SCHEMA.safeParse(sessionId);
    if (!idValidation.success) {
      return { data: null, error: idValidation.error.errors[0].message, status: 400 };
    }

    // Verify session exists and is OPEN under caller's RLS
    const { data: currentSess } = await supabase
      .from("attendance_sessions")
      .select("id, status, faculty_id")
      .eq("id", sessionId)
      .maybeSingle();

    if (!currentSess) {
      // Check if session exists in DB to distinguish 403 Forbidden from 404 Not Found
      const adminClient = createAdminSupabaseClient();
      const { data: adminSess } = await adminClient
        .from("attendance_sessions")
        .select("id, faculty_id, status")
        .eq("id", sessionId)
        .maybeSingle();

      if (adminSess) {
        return {
          data: null,
          error: "You are not authorized to close this attendance session",
          status: 403,
        };
      }

      return { data: null, error: "Attendance session not found", status: 404 };
    }

    if (currentSess.status !== "OPEN") {
      return { data: null, error: `Cannot close a session that is ${currentSess.status}`, status: 400 };
    }

    // Update status to CLOSED (RLS ensures only authorized faculty or admin can update)
    const { data, error } = await supabase
      .from("attendance_sessions")
      .update({ status: "CLOSED", updated_at: new Date().toISOString() })
      .eq("id", sessionId)
      .select(`
        *,
        subject:subjects(*),
        section:class_sections(*),
        faculty:faculty(*),
        classroom:classrooms(*),
        academic_year:academic_years(*)
      `)
      .single();

    if (error || !data) {
      const mapped = mapDatabaseError(error);
      return { data: null, error: mapped.message || "Failed to close attendance session", status: mapped.status };
    }

    return { data: data as unknown as AttendanceSession, error: null, status: 200 };
  }

  /**
   * Cancels an OPEN attendance session.
   */
  static async cancelAttendanceSession(
    supabase: SupabaseClient,
    sessionId: string
  ): Promise<ServiceResult<AttendanceSession>> {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { data: null, error: "Authentication required", status: 401 };
    }

    const idValidation = UUID_SCHEMA.safeParse(sessionId);
    if (!idValidation.success) {
      return { data: null, error: idValidation.error.errors[0].message, status: 400 };
    }

    const { data: currentSess } = await supabase
      .from("attendance_sessions")
      .select("id, status, faculty_id")
      .eq("id", sessionId)
      .maybeSingle();

    if (!currentSess) {
      const adminClient = createAdminSupabaseClient();
      const { data: adminSess } = await adminClient
        .from("attendance_sessions")
        .select("id, faculty_id, status")
        .eq("id", sessionId)
        .maybeSingle();

      if (adminSess) {
        return {
          data: null,
          error: "You are not authorized to cancel this attendance session",
          status: 403,
        };
      }

      return { data: null, error: "Attendance session not found", status: 404 };
    }

    if (currentSess.status !== "OPEN") {
      return { data: null, error: `Cannot cancel a session that is ${currentSess.status}`, status: 400 };
    }

    const { data, error } = await supabase
      .from("attendance_sessions")
      .update({ status: "CANCELLED", updated_at: new Date().toISOString() })
      .eq("id", sessionId)
      .select(`
        *,
        subject:subjects(*),
        section:class_sections(*),
        faculty:faculty(*),
        classroom:classrooms(*),
        academic_year:academic_years(*)
      `)
      .single();

    if (error || !data) {
      const mapped = mapDatabaseError(error);
      return { data: null, error: mapped.message || "Failed to cancel attendance session", status: mapped.status };
    }

    return { data: data as unknown as AttendanceSession, error: null, status: 200 };
  }

  /**
   * Retrieves summary statistics for a given attendance session.
   */
  static async getAttendanceSummary(
    supabase: SupabaseClient,
    sessionId: string
  ): Promise<ServiceResult<SessionSummaryResult>> {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { data: null, error: "Authentication required", status: 401 };
    }

    const idValidation = UUID_SCHEMA.safeParse(sessionId);
    if (!idValidation.success) {
      return { data: null, error: idValidation.error.errors[0].message, status: 400 };
    }

    // Fetch session
    const { data: session } = await supabase
      .from("attendance_sessions")
      .select(`
        *,
        subject:subjects(*),
        section:class_sections(*),
        faculty:faculty(*),
        classroom:classrooms(*),
        academic_year:academic_years(*)
      `)
      .eq("id", sessionId)
      .maybeSingle();

    if (!session) {
      const adminClient = createAdminSupabaseClient();
      const { data: adminSess } = await adminClient
        .from("attendance_sessions")
        .select("id")
        .eq("id", sessionId)
        .maybeSingle();

      if (adminSess) {
        return {
          data: null,
          error: "You are not authorized to view this attendance summary",
          status: 403,
        };
      }

      return { data: null, error: "Attendance session not found", status: 404 };
    }

    // Fetch records
    const { data: records, error: recErr } = await supabase
      .from("attendance_records")
      .select(`
        *,
        student:students(
          id,
          roll_number,
          usn,
          profile:profiles(first_name, last_name, email)
        )
      `)
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    if (recErr) {
      const mapped = mapDatabaseError(recErr);
      return { data: null, error: mapped.message, status: mapped.status };
    }

    const typedRecords = (records || []) as unknown as AttendanceRecord[];
    const summary = summarizeSessionAttendance(
      session.id,
      session.session_date,
      typedRecords
    );

    return {
      data: {
        session: session as unknown as AttendanceSession,
        summary,
        records: typedRecords,
      },
      error: null,
      status: 200,
    };
  }

  /**
   * Retrieves attendance history and statistics for a specific student.
   * Enforces that students can ONLY view their own attendance records.
   */
  static async getStudentAttendanceHistory(
    supabase: SupabaseClient,
    studentId: string,
    rawQuery?: AttendanceQueryInput
  ): Promise<ServiceResult<StudentAttendanceHistoryResult>> {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { data: null, error: "Authentication required", status: 401 };
    }

    const idValidation = UUID_SCHEMA.safeParse(studentId);
    if (!idValidation.success) {
      return { data: null, error: idValidation.error.errors[0].message, status: 400 };
    }

    // Check caller profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("id", user.id)
      .single();

    if (!profile) {
      return { data: null, error: "Profile not found", status: 403 };
    }

    // If caller is student, verify that studentId matches the caller's linked student profile
    if (profile.role === "student") {
      const { data: studentRecord } = await supabase
        .from("students")
        .select("id")
        .or(`profile_id.eq.${user.id},id.eq.${user.id}`)
        .single();

      if (!studentRecord || studentRecord.id !== studentId) {
        return {
          data: null,
          error: "Access denied: students can only access their own attendance history",
          status: 403,
        };
      }
    }

    let queryBuilder = supabase
      .from("attendance_records")
      .select(`
        *,
        session:attendance_sessions(
          *,
          subject:subjects(*),
          section:class_sections(*),
          faculty:faculty(*)
        )
      `)
      .eq("student_id", studentId);

    if (rawQuery) {
      const parsed = AttendanceQuerySchema.safeParse(rawQuery);
      if (!parsed.success) {
        return { data: null, error: parsed.error.errors[0]?.message || "Invalid query parameters", status: 400 };
      }
      const q = parsed.data;
      if (q.session_id) queryBuilder = queryBuilder.eq("session_id", q.session_id);
      if (q.status) queryBuilder = queryBuilder.eq("status", q.status);
    }

    const { data, error } = await queryBuilder.order("marked_at", { ascending: false });

    if (error) {
      const mapped = mapDatabaseError(error);
      return { data: null, error: mapped.message, status: mapped.status };
    }

    const typedRecords = (data || []) as unknown as AttendanceRecord[];
    const summary = summarizeStudentAttendance(typedRecords);

    return {
      data: {
        student_id: studentId,
        summary,
        records: typedRecords,
      },
      error: null,
      status: 200,
    };
  }
}
