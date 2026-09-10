import { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { hasAnyRole, ADMIN_ROLES } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { EnrollmentClient } from "@/components/enrollments/enrollment-client";
import { UserCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "Student Enrollments | Smart Academic Management System",
  description: "Manage course enrollments, student cohort registrations, and academic rosters.",
};

export default async function EnrollmentsPage() {
  const profile = await requireUser();
  const canManage = hasAnyRole(profile.role, ADMIN_ROLES);

  const supabase = await createServerSupabaseClient();

  // Fetch all enrollments with relations
  const { data: enrollments } = await supabase
    .from("student_enrollments")
    .select(`
      *,
      student:students(*, profile:profiles(*), department:departments(*)),
      subject:subjects(*),
      section:class_sections(*, department:departments(*)),
      academic_year:academic_years(*),
      semester:semesters(*)
    `)
    .order("created_at", { ascending: false });

  // Fetch active students
  const { data: students } = await supabase
    .from("students")
    .select("*, profile:profiles(*), department:departments(*)")
    .eq("is_active", true)
    .order("usn", { ascending: true });

  // Fetch active subjects
  const { data: subjects } = await supabase
    .from("subjects")
    .select("*, department:departments(*)")
    .eq("is_active", true)
    .order("code", { ascending: true });

  // Fetch active sections
  const { data: sections } = await supabase
    .from("class_sections")
    .select("*, department:departments(*)")
    .eq("is_active", true)
    .order("name", { ascending: true });

  // Fetch academic years
  const { data: academicYears } = await supabase
    .from("academic_years")
    .select("*")
    .eq("is_active", true)
    .order("start_date", { ascending: false });

  // Fetch semesters
  const { data: semesters } = await supabase
    .from("semesters")
    .select("*")
    .eq("is_active", true)
    .order("semester_number", { ascending: true });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20">
          <UserCheck className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Student Course Enrollments
          </h1>
          <p className="text-sm text-muted-foreground">
            Curriculum subject rosters, cohort student registrations, and attendance eligibility records.
          </p>
        </div>
      </div>

      <EnrollmentClient
        enrollments={enrollments || []}
        students={students || []}
        subjects={subjects || []}
        sections={sections || []}
        academicYears={academicYears || []}
        semesters={semesters || []}
        canManage={canManage}
      />
    </div>
  );
}
