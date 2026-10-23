import { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { hasAnyRole, ADMIN_ROLES } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AssignmentClient } from "@/components/assignments/assignment-client";
import { Briefcase } from "lucide-react";

export const metadata: Metadata = {
  title: "Faculty Assignments | Smart Academic Management System",
  description: "Manage instructor-subject allocations across academic cohorts for timetable generation.",
};

export default async function AssignmentsPage() {
  const profile = await requireUser();
  const canManage = hasAnyRole(profile.role, ADMIN_ROLES);

  const supabase = await createServerSupabaseClient();

  // Fetch all assignments with deep relations
  const { data: assignments } = await supabase
    .from("faculty_subjects")
    .select(`
      *,
      faculty:faculty(*, profile:profiles(*), department:departments(*)),
      subject:subjects(*, department:departments(*)),
      section:class_sections(*, department:departments(*)),
      academic_year:academic_years(*),
      semester:semesters(*)
    `)
    .order("created_at", { ascending: false });

  // Fetch active faculty
  const { data: facultyList } = await supabase
    .from("faculty")
    .select("*, profile:profiles(*), department:departments(*)")
    .eq("is_active", true)
    .order("employee_id", { ascending: true });

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

  // Fetch active semesters
  const { data: semesters } = await supabase
    .from("semesters")
    .select("*")
    .eq("is_active", true)
    .order("semester_number", { ascending: true });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3.5">
        <div className="p-3 rounded-2xl bg-primary/10 text-primary border border-primary/20 shadow-xs">
          <Briefcase className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Faculty Teaching Assignments
          </h1>
          <p className="text-sm text-muted-foreground">
            Pair faculty instructors to curriculum subjects and section cohorts for OR-Tools timetable generation.
          </p>
        </div>
      </div>

      <AssignmentClient
        assignments={assignments || []}
        facultyList={facultyList || []}
        subjects={subjects || []}
        sections={sections || []}
        academicYears={academicYears || []}
        semesters={semesters || []}
        canManage={canManage}
      />
    </div>
  );
}
