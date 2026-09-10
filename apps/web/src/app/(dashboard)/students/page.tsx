import { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { hasAnyRole, ADMIN_ROLES } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { StudentClient } from "@/components/students/student-client";
import { GraduationCap } from "lucide-react";

export const metadata: Metadata = {
  title: "Students | Smart Academic Management System",
  description: "Manage institutional student master records, USN registrations, section cohorts, and enrollment status.",
};

export default async function StudentsPage() {
  const profile = await requireUser();
  const canManage = hasAnyRole(profile.role, ADMIN_ROLES);

  const supabase = await createServerSupabaseClient();

  // Fetch all students with relations
  const { data: students } = await supabase
    .from("students")
    .select("*, department:departments(*), section:class_sections(*), semester:semesters(*), profile:profiles(*)")
    .order("usn", { ascending: true });

  // Fetch departments
  const { data: departments } = await supabase
    .from("departments")
    .select("*")
    .eq("is_active", true)
    .order("code", { ascending: true });

  // Fetch semesters
  const { data: semesters } = await supabase
    .from("semesters")
    .select("*")
    .eq("is_active", true)
    .order("semester_number", { ascending: true });

  // Fetch class sections
  const { data: sections } = await supabase
    .from("class_sections")
    .select("*")
    .eq("is_active", true)
    .order("name", { ascending: true });

  // Fetch student profiles for linkage
  const { data: studentProfiles } = await supabase
    .from("profiles")
    .select("*")
    .eq("role", "student")
    .eq("is_active", true)
    .order("first_name", { ascending: true });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20">
          <GraduationCap className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Student Master Directory
          </h1>
          <p className="text-sm text-muted-foreground">
            University Seat Numbers (USN), departmental cohorts, admission batches, and section allocations.
          </p>
        </div>
      </div>

      <StudentClient
        students={students || []}
        departments={departments || []}
        semesters={semesters || []}
        sections={sections || []}
        unlinkedProfiles={studentProfiles || []}
        canManage={canManage}
      />
    </div>
  );
}
