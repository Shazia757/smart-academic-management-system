import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-client";
import { TimetableDataService } from "@/server/services/timetable-data";
import { GetPublishedTimetableQuerySchema } from "@/server/validators/timetable";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createRouteHandlerSupabaseClient(request);

    // 1. Authentication Guard
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json(
        { success: false, error: "Authentication required to access published timetable" },
        { status: 401 }
      );
    }

    // 2. Fetch User Profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, role, is_active")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile || !profile.is_active) {
      return NextResponse.json(
        { success: false, error: "User profile not found or inactive" },
        { status: 403 }
      );
    }

    // 3. Parse query params
    const searchParams = request.nextUrl.searchParams;
    const rawQuery = {
      section_id: searchParams.get("section_id") || undefined,
      faculty_id: searchParams.get("faculty_id") || undefined,
      configuration_id: searchParams.get("configuration_id") || undefined,
    };

    const validation = GetPublishedTimetableQuerySchema.safeParse(rawQuery);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.errors[0]?.message || "Invalid query parameters" },
        { status: 400 }
      );
    }

    const { section_id, faculty_id, configuration_id } = validation.data;
    const userRole = profile.role;

    // Student Role: strictly restricted to their own section
    if (userRole === "student") {
      const { data: student } = await supabase
        .from("students")
        .select("current_section_id")
        .eq("id", profile.id)
        .maybeSingle();

      const studentSectionId = student?.current_section_id;
      if (!studentSectionId) {
        return NextResponse.json(
          { success: false, error: "Student is not enrolled in any class section" },
          { status: 404 }
        );
      }

      // If student requested a different section, reject with 403
      if (section_id && section_id !== studentSectionId) {
        return NextResponse.json(
          { success: false, error: "Unauthorized: Students can only access their enrolled section timetable" },
          { status: 403 }
        );
      }

      const res = await TimetableDataService.fetchPublishedTimetableForSection(supabase, studentSectionId);
      if (!res.data) {
        return NextResponse.json(
          { success: false, error: res.error || "No published timetable found for this section" },
          { status: res.status }
        );
      }

      return NextResponse.json({ success: true, data: res.data }, { status: 200 });
    }

    // Faculty Role: can view their assignments or requested section
    if (userRole === "faculty") {
      if (section_id) {
        const res = await TimetableDataService.fetchPublishedTimetableForSection(supabase, section_id);
        if (!res.data) {
          return NextResponse.json({ success: false, error: res.error }, { status: res.status });
        }
        return NextResponse.json({ success: true, data: res.data }, { status: 200 });
      }

      // Default: fetch faculty personal schedule
      const { data: faculty } = await supabase
        .from("faculty")
        .select("id")
        .eq("id", profile.id)
        .maybeSingle();

      const targetFacultyId = faculty?.id || profile.id;
      const res = await TimetableDataService.fetchPublishedTimetableForFaculty(supabase, targetFacultyId);
      if (!res.data) {
        return NextResponse.json({ success: false, error: res.error }, { status: res.status });
      }
      return NextResponse.json({ success: true, data: res.data }, { status: 200 });
    }

    // Admin Roles: can query any section or faculty schedule
    if (faculty_id) {
      const res = await TimetableDataService.fetchPublishedTimetableForFaculty(supabase, faculty_id);
      if (!res.data) {
        return NextResponse.json({ success: false, error: res.error }, { status: res.status });
      }
      return NextResponse.json({ success: true, data: res.data }, { status: 200 });
    }

    let targetSectionId = section_id;
    if (!targetSectionId && configuration_id) {
      const { data: cfg } = await supabase
        .from("timetable_configurations")
        .select("section_id")
        .eq("id", configuration_id)
        .maybeSingle();
      if (cfg?.section_id) targetSectionId = cfg.section_id;
    }

    if (!targetSectionId) {
      // Find first section with published timetable
      const { data: pubConfig } = await supabase
        .from("timetable_configurations")
        .select("section_id")
        .eq("generation_status", "PUBLISHED")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (pubConfig?.section_id) targetSectionId = pubConfig.section_id;
    }

    if (!targetSectionId) {
      return NextResponse.json(
        { success: false, error: "No published timetables exist in the system" },
        { status: 404 }
      );
    }

    const res = await TimetableDataService.fetchPublishedTimetableForSection(supabase, targetSectionId);
    if (!res.data) {
      return NextResponse.json({ success: false, error: res.error }, { status: res.status });
    }

    return NextResponse.json({ success: true, data: res.data }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error retrieving published timetable";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
