import { Metadata } from "next";
import { requireAnyRole } from "@/lib/auth/session";
import { ADMIN_ROLES } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { TimetableGeneratorClient } from "@/components/timetable/timetable-generator-client";
import { Sparkles } from "lucide-react";

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
        <div className="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20">
          <Sparkles className="w-6 h-6 text-primary" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Timetable Generation & Preview
            </h1>
            <span className="px-2 py-0.5 text-xs font-semibold rounded-md bg-accent/20 text-accent border border-accent/30">
              Phase 4.3
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Solve and preview conflict-free weekly schedules in memory using Google OR-Tools CP-SAT before publishing.
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
