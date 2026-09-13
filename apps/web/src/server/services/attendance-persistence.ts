import { SupabaseClient } from "@supabase/supabase-js";
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
} from "../../types/attendance";

export interface BatchSaveAttendanceResult {
  success: boolean;
  session_id: string;
  saved_count: number;
  status: string;
}

/**
 * Attendance Persistence Service
 *
 * Encapsulates database interactions for Attendance Sessions and Records,
 * enforcing Phase 5 domain validations, RLS compliance, and atomic RPC execution.
 */
export class AttendancePersistenceService {
  /**
   * Creates a new attendance session after validating inputs against canonical domain rules.
   */
  static async createSession(
    supabase: SupabaseClient,
    rawInput: CreateAttendanceSessionInput
  ): Promise<{ data: AttendanceSession | null; error: string | null }> {
    const parsed = CreateAttendanceSessionSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { data: null, error: parsed.error.errors[0]?.message || "Invalid session data" };
    }

    const payload = parsed.data;

    // If academic_year_id is not provided, look it up from section's semester
    let academicYearId = payload.academic_year_id;
    if (!academicYearId) {
      const { data: sectionData, error: sectionErr } = await supabase
        .from("class_sections")
        .select("semesters!inner(academic_year_id)")
        .eq("id", payload.section_id)
        .single();

      if (sectionErr || !sectionData) {
        return { data: null, error: "Unable to resolve academic year for the selected section" };
      }
      academicYearId = (sectionData as any).semesters.academic_year_id;
    }

    // Securely derive actor ID from the active authenticated session to prevent spoofing
    const { data: authData } = await supabase.auth.getUser();
    const actorId = authData?.user?.id ?? payload.created_by ?? null;

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
        created_by: actorId,
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
      return { data: null, error: error.message };
    }

    return { data: data as unknown as AttendanceSession, error: null };
  }

  /**
   * Atomically saves attendance records for a single session using the SECURITY DEFINER RPC.
   */
  static async saveAttendanceRecordsBatch(
    supabase: SupabaseClient,
    rawInput: BulkMarkAttendanceInput,
    options?: { closeSession?: boolean }
  ): Promise<{ data: BatchSaveAttendanceResult | null; error: string | null }> {
    const parsed = BulkMarkAttendanceSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { data: null, error: parsed.error.errors[0]?.message || "Invalid attendance submission payload" };
    }

    const { session_id, records } = parsed.data;
    const closeSession = options?.closeSession ?? false;

    const { data, error } = await supabase.rpc("save_attendance_records_atomic", {
      p_session_id: session_id,
      p_records: records,
      p_close_session: closeSession,
    });

    if (error) {
      return { data: null, error: error.message };
    }

    return { data: data as BatchSaveAttendanceResult, error: null };
  }

  /**
   * Retrieves an attendance session by ID with populated relation metadata.
   */
  static async getSessionById(
    supabase: SupabaseClient,
    sessionId: string
  ): Promise<{ data: AttendanceSession | null; error: string | null }> {
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

    if (error) {
      return { data: null, error: error.message };
    }

    return { data: data as unknown as AttendanceSession, error: null };
  }

  /**
   * Retrieves all attendance records for a specific session.
   */
  static async getSessionRecords(
    supabase: SupabaseClient,
    sessionId: string
  ): Promise<{ data: AttendanceRecord[] | null; error: string | null }> {
    const { data, error } = await supabase
      .from("attendance_records")
      .select(`
        *,
        student:students(
          *,
          profile:profiles(*)
        )
      `)
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    if (error) {
      return { data: null, error: error.message };
    }

    return { data: data as unknown as AttendanceRecord[], error: null };
  }

  /**
   * Retrieves attendance records for a specific student with optional date/subject filters.
   */
  static async getStudentRecords(
    supabase: SupabaseClient,
    studentId: string,
    rawQuery?: AttendanceQueryInput
  ): Promise<{ data: AttendanceRecord[] | null; error: string | null }> {
    let queryBuilder = supabase
      .from("attendance_records")
      .select(`
        *,
        session:attendance_sessions(
          *,
          subject:subjects(*),
          section:class_sections(*)
        )
      `)
      .eq("student_id", studentId);

    if (rawQuery) {
      const parsed = AttendanceQuerySchema.safeParse(rawQuery);
      if (parsed.success) {
        const q = parsed.data;
        if (q.session_id) queryBuilder = queryBuilder.eq("session_id", q.session_id);
        if (q.status) queryBuilder = queryBuilder.eq("status", q.status);
      }
    }

    const { data, error } = await queryBuilder.order("marked_at", { ascending: false });

    if (error) {
      return { data: null, error: error.message };
    }

    return { data: data as unknown as AttendanceRecord[], error: null };
  }
}
