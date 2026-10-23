import { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { hasAnyRole, ADMIN_ROLES } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AcademicStructureClient } from "@/components/academic-structure/academic-structure-client";
import { Layers } from "lucide-react";

export const metadata: Metadata = {
  title: "Academic Structure | Smart Academic Management System",
  description: "Configure academic sessions, terms, semesters, and class section cohorts.",
};

export default async function AcademicStructurePage() {
  const profile = await requireUser();
  const canManage = hasAnyRole(profile.role, ADMIN_ROLES);

  const supabase = await createServerSupabaseClient();

  // Fetch academic years
  const { data: academicYears } = await supabase
    .from("academic_years")
    .select("*")
    .order("start_date", { ascending: false });

  // Fetch semesters with academic year
  const { data: semesters } = await supabase
    .from("semesters")
    .select("*, academic_year:academic_years(*)")
    .order("semester_number", { ascending: true });

  // Fetch class sections with department, semester, academic year
  const { data: classSections } = await supabase
    .from("class_sections")
    .select("*, department:departments(*), semester:semesters(*), academic_year:academic_years(*)")
    .order("name", { ascending: true });

  // Fetch active departments for section creation
  const { data: departments } = await supabase
    .from("departments")
    .select("*")
    .eq("is_active", true)
    .order("code", { ascending: true });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3.5">
        <div className="p-3 rounded-2xl bg-primary/10 text-primary border border-primary/20 shadow-xs">
          <Layers className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Academic Structure
          </h1>
          <p className="text-sm text-muted-foreground">
            Institutional timeline hierarchy: Academic Years → Semesters → Cohort Class Sections.
          </p>
        </div>
      </div>

      <AcademicStructureClient
        academicYears={academicYears || []}
        semesters={semesters || []}
        classSections={classSections || []}
        departments={departments || []}
        canManage={canManage}
      />
    </div>
  );
}
