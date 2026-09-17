import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-client";
import {
  ScheduledTimetableEntrySchema,
  TimetableGenerationConstraintsSchema,
  AcademicSubjectSchema,
  ClassSectionInfoSchema,
  FacultyAssignmentSchema,
  ClassroomInfoSchema,
  TimetablePeriodSlotSchema,
  FacultyAvailabilitySlotSchema,
  RoomAvailabilitySlotSchema,
  DEFAULT_TIMETABLE_CONSTRAINTS,
} from "@/types/timetable";
import { validateTimetableSchedule } from "@/lib/timetable/timetable-validation";
import { TimetableDataService } from "@/server/services/timetable-data";

const ValidateSchedulePayloadSchema = z.object({
  configuration_id: z.string().uuid().optional(),
  section_id: z.string().uuid().optional(),
  entries: z.array(ScheduledTimetableEntrySchema).min(1, "At least one scheduled timetable entry is required"),
  constraints: TimetableGenerationConstraintsSchema.optional(),
  subjects: z.array(AcademicSubjectSchema).optional(),
  sections: z.array(ClassSectionInfoSchema).optional(),
  faculty_assignments: z.array(FacultyAssignmentSchema).optional(),
  classrooms: z.array(ClassroomInfoSchema).optional(),
  periods: z.array(TimetablePeriodSlotSchema).optional(),
  faculty_availability: z.array(FacultyAvailabilitySlotSchema).optional(),
  classroom_availability: z.array(RoomAvailabilitySlotSchema).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const supabase = await createRouteHandlerSupabaseClient(request);

    // Authentication Guard
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json(
        { success: false, error: "Authentication required to validate timetable schedules" },
        { status: 401 }
      );
    }

    // Role Guard: Admins and Faculty only
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, is_active")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile || !profile.is_active) {
      return NextResponse.json(
        { success: false, error: "User profile not found or inactive" },
        { status: 403 }
      );
    }

    const allowedRoles = ["super_admin", "college_admin", "department_admin", "faculty"];
    if (!allowedRoles.includes(profile.role)) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Students cannot validate timetable schedules" },
        { status: 403 }
      );
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Malformed JSON payload in request body" },
        { status: 400 }
      );
    }

    const validation = ValidateSchedulePayloadSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.errors[0]?.message || "Invalid schedule validation payload" },
        { status: 400 }
      );
    }

    const payload = validation.data;

    // Determine domain datasets: from payload or fetched from database
    let subjects = payload.subjects;
    let sections = payload.sections;
    let facultyAssignments = payload.faculty_assignments;
    let classrooms = payload.classrooms;
    let periods = payload.periods;
    let facultyAvailability = payload.faculty_availability || [];
    let classroomAvailability = payload.classroom_availability || [];
    const constraints = payload.constraints || DEFAULT_TIMETABLE_CONSTRAINTS;

    if (
      (!subjects || !sections || !classrooms || !periods || !facultyAssignments) &&
      payload.configuration_id &&
      payload.section_id
    ) {
      const fetchRes = await TimetableDataService.buildValidatedGenerationInput(supabase, {
        configuration_id: payload.configuration_id,
        section_id: payload.section_id,
        constraints,
      });

      if (fetchRes.error || !fetchRes.data) {
        return NextResponse.json(
          { success: false, error: fetchRes.error },
          { status: fetchRes.status }
        );
      }

      subjects = subjects || fetchRes.data.subjects;
      sections = sections || [fetchRes.data.section];
      facultyAssignments = facultyAssignments || fetchRes.data.faculty_assignments;
      classrooms = classrooms || fetchRes.data.classrooms;
      periods = periods || fetchRes.data.periods;
      facultyAvailability = payload.faculty_availability || fetchRes.data.faculty_availability;
      classroomAvailability = payload.classroom_availability || fetchRes.data.classroom_availability;
    }

    if (!subjects || !sections || !classrooms || !periods || !facultyAssignments) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Incomplete domain context: provide configuration_id and section_id, or supply subjects, sections, classrooms, periods, and faculty_assignments directly in the payload.",
        },
        { status: 400 }
      );
    }

    // Run pure timetable conflict detection and schedule validation engine
    const report = validateTimetableSchedule({
      entries: payload.entries,
      constraints,
      subjects,
      sections,
      facultyAssignments,
      classrooms,
      validSlots: periods,
      facultyAvailabilities: facultyAvailability,
    });

    return NextResponse.json(
      {
        success: true,
        data: report,
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      { success: false, error: "Internal server error validating timetable schedule" },
      { status: 500 }
    );
  }
}
