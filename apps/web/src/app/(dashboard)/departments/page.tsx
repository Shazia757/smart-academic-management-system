import { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { hasAnyRole, ADMIN_ROLES } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { DepartmentClient } from "@/components/departments/department-client";
import { Building2 } from "lucide-react";

export const metadata: Metadata = {
  title: "Departments | Smart Academic Management System",
  description: "Manage academic departments, institutional codes, and faculty leadership.",
};

export default async function DepartmentsPage() {
  const profile = await requireUser();
  const canManage = hasAnyRole(profile.role, ADMIN_ROLES);

  const supabase = await createServerSupabaseClient();

  // Fetch all departments with head of department profile
  const { data: departments } = await supabase
    .from("departments")
    .select("*, head_of_department:profiles!departments_head_of_department_id_fkey(*)")
    .order("name", { ascending: true });

  // Fetch faculty profiles for HOD selection
  const { data: facultyProfiles } = await supabase
    .from("profiles")
    .select("*")
    .in("role", ["faculty", "college_admin"])
    .eq("is_active", true)
    .order("first_name", { ascending: true });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20">
          <Building2 className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Academic Departments
          </h1>
          <p className="text-sm text-muted-foreground">
            Configure branches of study, curriculum divisions, and department leadership.
          </p>
        </div>
      </div>

      <DepartmentClient
        departments={departments || []}
        facultyProfiles={facultyProfiles || []}
        canManage={canManage}
      />
    </div>
  );
}
