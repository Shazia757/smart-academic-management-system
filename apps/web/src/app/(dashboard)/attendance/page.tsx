import { Metadata } from "next";
import {
  requireUser,
  getCurrentFaculty,
  getCurrentStudent,
} from "@/lib/auth/session";
import { hasAnyRole, ADMIN_ROLES } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { FacultyAttendanceDashboard } from "@/components/attendance/faculty-attendance-dashboard";
import { StudentAttendanceDashboard } from "@/components/attendance/student-attendance-dashboard";

export const metadata: Metadata = {
  title: "Attendance | Smart Academic Management System",
  description: "Conduct and review course attendance sessions, roster turnouts, and student history.",
};

export default async function AttendancePage() {
  const profile = await requireUser();
  const isAdmin = hasAnyRole(profile.role, ADMIN_ROLES);

  // 1. Role-Adaptive Dispatch: Student View
  if (profile.role === "student") {
    const student = await getCurrentStudent();
    if (!student) {
      return (
        <div className="p-8 rounded-2xl bg-card border border-border/70 text-center space-y-2">
          <h2 className="text-lg font-bold text-foreground">Student Record Not Found</h2>
          <p className="text-xs text-muted-foreground">
            No active student enrollment profile was found linked to your authenticated account.
            Please contact the administration office.
          </p>
        </div>
      );
    }

    return <StudentAttendanceDashboard student={student} profile={profile} />;
  }

  // 2. Role-Adaptive Dispatch: Faculty & Administrator View
  const currentFaculty = await getCurrentFaculty();
  const supabase = await createServerSupabaseClient();

  // Fetch active master data required for session filtering and creation
  const [
    { data: academicYears },
    { data: classSections },
    { data: subjects },
    { data: facultyList },
    { data: classrooms },
  ] = await Promise.all([
    supabase
      .from("academic_years")
      .select("*")
      .eq("is_active", true)
      .order("start_date", { ascending: false }),

    supabase
      .from("class_sections")
      .select("*, department:departments(*)")
      .eq("is_active", true)
      .order("name", { ascending: true }),

    supabase
      .from("subjects")
      .select("*, department:departments(*)")
      .eq("is_active", true)
      .order("code", { ascending: true }),

    supabase
      .from("faculty")
      .select("*, profile:profiles(*), department:departments(*)")
      .eq("is_active", true)
      .order("employee_id", { ascending: true }),

    supabase
      .from("classrooms")
      .select("*")
      .eq("is_active", true)
      .order("room_number", { ascending: true }),
  ]);

  return (
    <FacultyAttendanceDashboard
      academicYears={academicYears || []}
      classSections={classSections || []}
      subjects={subjects || []}
      facultyList={facultyList || []}
      classrooms={classrooms || []}
      currentFaculty={currentFaculty}
      profile={profile}
      isAdmin={isAdmin}
    />
  );
}
