import { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { hasAnyRole, ADMIN_ROLES } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { SubjectClient } from "@/components/subjects/subject-client";
import { BookOpen } from "lucide-react";

export const metadata: Metadata = {
  title: "Subjects & Curriculum | Smart Academic Management System",
  description: "Manage institutional course catalog, weekly credit loads, and laboratory configurations.",
};

export default async function SubjectsPage() {
  const profile = await requireUser();
  const canManage = hasAnyRole(profile.role, ADMIN_ROLES);

  const supabase = await createServerSupabaseClient();

  // Fetch all subjects with department and semester
  const { data: subjects } = await supabase
    .from("subjects")
    .select("*, department:departments(*), semester:semesters(*)")
    .order("code", { ascending: true });

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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20">
          <BookOpen className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Curriculum Course Catalog
          </h1>
          <p className="text-sm text-muted-foreground">
            Academic subjects, credit ratings, weekly period allocations, and laboratory configurations.
          </p>
        </div>
      </div>

      <SubjectClient
        subjects={subjects || []}
        departments={departments || []}
        semesters={semesters || []}
        canManage={canManage}
      />
    </div>
  );
}
