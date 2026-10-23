import { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { hasAnyRole, ADMIN_ROLES } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AvailabilityClient } from "@/components/faculty/availability-client";
import { Clock } from "lucide-react";

export const metadata: Metadata = {
  title: "Faculty Availability | Smart Academic Management System",
  description: "Weekly recurring availability matrix and constraint scheduling for AI timetable generation.",
};

export default async function FacultyAvailabilityPage() {
  const profile = await requireUser();

  // Only Admins and Faculty can access this page
  const isAdmin = hasAnyRole(profile.role, ADMIN_ROLES);
  const isFaculty = profile.role === "faculty";

  if (!isAdmin && !isFaculty) {
    redirect("/unauthorized");
  }

  const supabase = await createServerSupabaseClient();

  // Fetch all active faculty with department and profile
  const { data: facultyList } = await supabase
    .from("faculty")
    .select("*, department:departments(*), profile:profiles(*)")
    .eq("is_active", true)
    .order("employee_id", { ascending: true });

  // Resolve current faculty record if caller is faculty
  let currentFacultyId: string | null = null;
  if (isFaculty) {
    const { data: ownFaculty } = await supabase
      .from("faculty")
      .select("id")
      .or(`profile_id.eq.${profile.id},id.eq.${profile.id}`)
      .eq("is_active", true)
      .maybeSingle();

    currentFacultyId = ownFaculty?.id || null;
  }

  // Fetch availability slots
  const { data: availability } = await supabase
    .from("faculty_availability")
    .select("*");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3.5">
        <div className="p-3 rounded-2xl bg-primary/10 text-primary border border-primary/20 shadow-xs">
          <Clock className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Faculty Availability Matrix
          </h1>
          <p className="text-sm text-muted-foreground">
            Recurring weekly availability schedules and period constraints for OR-Tools AI timetable generation.
          </p>
        </div>
      </div>

      <AvailabilityClient
        facultyList={facultyList || []}
        initialAvailability={availability || []}
        currentFacultyId={currentFacultyId}
        isAdmin={isAdmin}
      />
    </div>
  );
}
