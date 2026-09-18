import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-client";
import { TimetableDataService } from "@/server/services/timetable-data";
import { SaveTimetableGenerationSchema } from "@/server/validators/timetable";
import { saveTimetableGenerationAction } from "@/server/actions/timetable-generation";

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
        { success: false, error: "Authentication required to view timetable drafts" },
        { status: 401 }
      );
    }

    // 2. Role Guard: Admins & Faculty can list drafts; Students are forbidden
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, is_active")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile || !profile.is_active) {
      return NextResponse.json({ success: false, error: "User profile inactive" }, { status: 403 });
    }

    if (profile.role === "student") {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Students cannot access timetable drafts" },
        { status: 403 }
      );
    }

    const configId = request.nextUrl.searchParams.get("configuration_id") || undefined;
    const res = await TimetableDataService.fetchTimetableDrafts(supabase, configId);

    if (!res.data) {
      return NextResponse.json({ success: false, error: res.error }, { status: res.status });
    }

    return NextResponse.json({ success: true, data: res.data }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error listing drafts";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createRouteHandlerSupabaseClient(request);

    // 1. Authentication Guard
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json(
        { success: false, error: "Authentication required to save timetable draft" },
        { status: 401 }
      );
    }

    // 2. Role Guard: Admins only
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, is_active")
      .eq("id", user.id)
      .maybeSingle();

    const allowedRoles = ["super_admin", "college_admin", "department_admin"];
    if (!profile || !profile.is_active || !allowedRoles.includes(profile.role)) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Only administrators can persist timetable drafts" },
        { status: 403 }
      );
    }

    // 3. Parse and validate body
    const body = await request.json().catch(() => ({}));
    const validation = SaveTimetableGenerationSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.errors[0]?.message || "Invalid timetable persistence payload" },
        { status: 400 }
      );
    }

    const actionResult = await saveTimetableGenerationAction(validation.data);
    if (!actionResult.success) {
      return NextResponse.json(
        { success: false, error: actionResult.error },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: true, data: actionResult.data },
      { status: 201 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error saving timetable draft";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
