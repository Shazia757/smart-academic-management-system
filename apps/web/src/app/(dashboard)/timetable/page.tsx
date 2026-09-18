import { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { TimetablePublishedViewerClient } from "@/components/timetable/timetable-published-viewer-client";

export const metadata: Metadata = {
  title: "Published Timetable | Smart Academic Management System",
  description: "View verified, published weekly course timetables for sections and faculty.",
};

export default async function TimetablePublishedPage() {
  // 1. Role Guard: Any authenticated user (Student, Faculty, Admin)
  const profile = await requireUser();
  const supabase = await createServerSupabaseClient();

  // 2. Fetch Class Sections
  const { data: sections } = await supabase
    .from("class_sections")
    .select("*, department:departments(*), semester:semesters(*), academic_year:academic_years(*)")
    .order("name", { ascending: true });

  // 3. Fetch Faculty List
  const { data: facultyMembers } = await supabase
    .from("faculty")
    .select("id, profile_id, department_id, employee_id, profiles:profile_id(full_name, email)")
    .order("employee_id", { ascending: true });

  return (
    <div className="space-y-6">
      <TimetablePublishedViewerClient
        userRole={profile.role}
        userProfileName={`${profile.first_name || ""} ${profile.last_name || ""}`.trim() || profile.email}
        initialSections={(sections as any) || []}
        initialFaculty={(facultyMembers as any) || []}
      />
    </div>
  );
}
