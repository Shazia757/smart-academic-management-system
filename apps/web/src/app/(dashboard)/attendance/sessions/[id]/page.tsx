import { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser, getCurrentFaculty } from "@/lib/auth/session";
import { hasAnyRole, ADMIN_ROLES } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { SessionAttendanceClient } from "@/components/attendance/session-attendance-client";
import { AttendanceSession, AttendanceRecord } from "@/types/attendance";
import { Student } from "@/types/database";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `Attendance Session | Smart Academic Management System`,
    description: `Record, verify, and finalize attendance roster for session ${id}.`,
  };
}

export default async function AttendanceSessionPage({ params }: PageProps) {
  const { id } = await params;
  const profile = await requireUser();
  const supabase = await createServerSupabaseClient();

  // 1. Fetch Attendance Session with relations
  const { data: session, error: sessErr } = await supabase
    .from("attendance_sessions")
    .select(`
      *,
      subject:subjects(*),
      section:class_sections(*),
      faculty:faculty(*, profile:profiles(*)),
      classroom:classrooms(*),
      academic_year:academic_years(*)
    `)
    .eq("id", id)
    .single();

  if (sessErr || !session) {
    notFound();
  }

  // 2. Authorization Check
  const isAdmin = hasAnyRole(profile.role, ADMIN_ROLES);
  let canEdit = isAdmin;

  if (profile.role === "faculty") {
    const currentFaculty = await getCurrentFaculty();
    if (currentFaculty && currentFaculty.id === session.faculty_id) {
      canEdit = true;
    }
  }

  // 3. Fetch Existing Attendance Records
  const { data: records } = await supabase
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
    .eq("session_id", id)
    .order("created_at", { ascending: true });

  const existingRecords = (records || []) as unknown as AttendanceRecord[];

  // 4. Roster Pre-population: If 0 records exist, fetch enrolled cohort for this section
  let enrolledStudents: Student[] = [];
  if (existingRecords.length === 0) {
    // Try student_enrollments first
    const { data: enrollments } = await supabase
      .from("student_enrollments")
      .select(`
        student:students(
          id,
          roll_number,
          usn,
          is_active,
          current_section_id,
          department_id,
          profile_id,
          created_at,
          updated_at,
          profile:profiles(first_name, last_name, email)
        )
      `)
      .eq("section_id", session.section_id)
      .eq("is_active", true);

    enrolledStudents = (enrollments || [])
      .map((e: any) => e.student)
      .filter((s): s is Student => Boolean(s && s.id));

    // Fallback: students directly in section
    if (enrolledStudents.length === 0) {
      const { data: fallbackStudents } = await supabase
        .from("students")
        .select(`
          id,
          roll_number,
          usn,
          is_active,
          current_section_id,
          department_id,
          profile_id,
          created_at,
          updated_at,
          profile:profiles(first_name, last_name, email)
        `)
        .eq("current_section_id", session.section_id)
        .eq("is_active", true);

      enrolledStudents = (fallbackStudents || []) as unknown as Student[];
    }
  }

  return (
    <SessionAttendanceClient
      initialSession={session as unknown as AttendanceSession}
      initialRecords={existingRecords}
      enrolledStudents={enrolledStudents}
      canEdit={canEdit}
      profile={profile}
    />
  );
}
