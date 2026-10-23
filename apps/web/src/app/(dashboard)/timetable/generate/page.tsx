import { Metadata } from "next";
import { requireAnyRole } from "@/lib/auth/session";
import { ADMIN_ROLES } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { TimetableGeneratorClient } from "@/components/timetable/timetable-generator-client";
import { CalendarDays } from "lucide-react";

export const metadata: Metadata = {
  title: "Generate Timetable | Smart Academic Management System",
  description: "Generate and preview optimal conflict-free academic schedules using Google OR-Tools CP-SAT.",
};

export default async function TimetableGeneratePage() {
  // 1. Role Guard: Enforce academic administrator access
  const profile = await requireAnyRole(ADMIN_ROLES);
  const supabase = await createServerSupabaseClient();

  // 2. Fetch academic master data
  const { data: academicYears } = await supabase
    .from("academic_years")
    .select("*")
    .order("start_date", { ascending: false });

  const { data: semesters } = await supabase
    .from("semesters")
    .select("*, academic_year:academic_years(*)")
    .order("semester_number", { ascending: true });

  const { data: classSections } = await supabase
    .from("class_sections")
    .select("*, department:departments(*), semester:semesters(*), academic_year:academic_years(*)")
    .order("name", { ascending: true });

  const { data: rawConfigs } = await supabase
    .from("timetable_configurations")
    .select("*, section:class_sections(*), semester:semesters(*), academic_year:academic_years(*)")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  // 3. Load active periods for each active configuration
  const configs = await Promise.all(
    (rawConfigs || []).map(async (cfg) => {
      const { data: periods, count } = await supabase
        .from("timetable_periods")
        .select("*", { count: "exact" })
        .eq("timetable_configuration_id", cfg.id)
        .eq("is_active", true)
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
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <div className="p-3 rounded-2xl bg-primary/10 text-primary border border-primary/20 shadow-xs">
          <CalendarDays className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Timetable Generation & Management
          </h1>
          <p className="text-sm text-muted-foreground">
            Solve, review, and persist conflict-free weekly schedules before publishing to faculty and students.
          </p>
        </div>
      </div>

      {/* Interactive Client Workflow Component */}
      <TimetableGeneratorClient
        academicYears={academicYears || []}
        semesters={semesters || []}
        classSections={classSections || []}
        configurations={configs}
        userRole={profile.role}
      />
    </div>
  );
}
