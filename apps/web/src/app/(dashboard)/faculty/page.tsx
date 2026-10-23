import { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { hasAnyRole, ADMIN_ROLES } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { FacultyClient } from "@/components/faculty/faculty-client";
import { Users } from "lucide-react";

export const metadata: Metadata = {
  title: "Faculty Directory | Smart Academic Management System",
  description: "Manage teaching faculty, credentials, departmental affiliations, and maximum teaching workloads.",
};

export default async function FacultyPage() {
  const profile = await requireUser();
  const canManage = hasAnyRole(profile.role, ADMIN_ROLES);

  const supabase = await createServerSupabaseClient();

  // Fetch all faculty with department and profile
  const { data: facultyList } = await supabase
    .from("faculty")
    .select("*, department:departments(*), profile:profiles(*)")
    .order("employee_id", { ascending: true });

  // Fetch departments
  const { data: departments } = await supabase
    .from("departments")
    .select("*")
    .eq("is_active", true)
    .order("code", { ascending: true });

  // Fetch unlinked or existing faculty profiles
  const { data: facultyProfiles } = await supabase
    .from("profiles")
    .select("*")
    .in("role", ["faculty", "college_admin"])
    .eq("is_active", true)
    .order("first_name", { ascending: true });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3.5">
        <div className="p-3 rounded-2xl bg-primary/10 text-primary border border-primary/20 shadow-xs">
          <Users className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Faculty Directory
          </h1>
          <p className="text-sm text-muted-foreground">
            Institutional instructors, academic qualifications, departmental branches, and weekly workload quotas.
          </p>
        </div>
      </div>

      <FacultyClient
        facultyList={facultyList || []}
        departments={departments || []}
        unlinkedProfiles={facultyProfiles || []}
        canManage={canManage}
      />
    </div>
  );
}
