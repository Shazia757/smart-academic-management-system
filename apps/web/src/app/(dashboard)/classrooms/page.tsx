import { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { hasAnyRole, ADMIN_ROLES } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ClassroomClient } from "@/components/classrooms/classroom-client";
import { DoorOpen } from "lucide-react";

export const metadata: Metadata = {
  title: "Classrooms & Laboratories | Smart Academic Management System",
  description: "Manage lecture halls, smart classrooms, research laboratories, and room facilities.",
};

export default async function ClassroomsPage() {
  const profile = await requireUser();
  const canManage = hasAnyRole(profile.role, ADMIN_ROLES);

  const supabase = await createServerSupabaseClient();

  // Fetch all classrooms with department relation
  const { data: classrooms } = await supabase
    .from("classrooms")
    .select("*, department:departments(*)")
    .order("room_number", { ascending: true });

  // Fetch active departments for room assignment
  const { data: departments } = await supabase
    .from("departments")
    .select("*")
    .eq("is_active", true)
    .order("code", { ascending: true });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20">
          <DoorOpen className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Classrooms & Laboratories
          </h1>
          <p className="text-sm text-muted-foreground">
            Physical learning spaces, laboratory benches, and technological facilities for timetable scheduling.
          </p>
        </div>
      </div>

      <ClassroomClient
        classrooms={classrooms || []}
        departments={departments || []}
        canManage={canManage}
      />
    </div>
  );
}
