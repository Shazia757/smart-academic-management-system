import { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { hasAnyRole, ADMIN_ROLES } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { TimetableConfigurationClient } from "@/components/timetable/timetable-configuration-client";
import { CalendarDays } from "lucide-react";

export const metadata: Metadata = {
  title: "Timetable Configuration | Smart Academic Management System",
  description: "Configure working days, period slots, breaks, and daily timing boundaries for academic sections.",
};

export default async function TimetableConfigurationPage() {
  const profile = await requireUser();
  const canManage = hasAnyRole(profile.role, ADMIN_ROLES);
  const supabase = await createServerSupabaseClient();

  // Fetch academic years
  const { data: academicYears } = await supabase
    .from("academic_years")
    .select("*")
    .order("start_date", { ascending: false });

  // Fetch semesters
  const { data: semesters } = await supabase
    .from("semesters")
    .select("*, academic_year:academic_years(*)")
    .order("semester_number", { ascending: true });

  // Fetch class sections
  const { data: classSections } = await supabase
    .from("class_sections")
    .select("*, department:departments(*), semester:semesters(*), academic_year:academic_years(*)")
    .order("name", { ascending: true });

  // Fetch all timetable configurations with relations
  const { data: rawConfigs } = await supabase
    .from("timetable_configurations")
    .select("*, section:class_sections(*), semester:semesters(*), academic_year:academic_years(*)")
    .order("created_at", { ascending: false });

  // Fetch period counts and periods for configurations
  const configs = await Promise.all(
    (rawConfigs || []).map(async (cfg) => {
      const { data: periods, count } = await supabase
        .from("timetable_periods")
        .select("*", { count: "exact" })
        .eq("timetable_configuration_id", cfg.id)
        .order("day_of_week", { ascending: true })
        .order("period_number", { ascending: true });

      return {
        ...cfg,
        periods: periods || [],
        periods_count: count || 0,
      };
    })
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 rounded-2xl bg-primary/10 text-primary border border-primary/20 shadow-xs">
          <CalendarDays className="w-6 h-6 text-primary" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Timetable Configuration
            </h1>
            <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-primary/10 text-primary border border-primary/20">
              OR-Tools Foundation
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Configure institutional working days, daily period slots, and tea/lunch breaks to establish the scheduling foundation for the OR-Tools optimization engine.
          </p>
        </div>
      </div>

      <TimetableConfigurationClient
        canManage={canManage}
        userRole={profile.role}
        academicYears={academicYears || []}
        semesters={semesters || []}
        classSections={classSections || []}
        configurations={configs}
      />
    </div>
  );
}
