import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-client";
import { PublishTimetableSchema } from "@/server/validators/timetable";
import { publishTimetableAction } from "@/server/actions/timetable-generation";

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
        { success: false, error: "Authentication required to publish timetables" },
        { status: 401 }
      );
    }

    // 2. Role Guard (Administrators only)
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, is_active")
      .eq("id", user.id)
      .maybeSingle();

    const allowedRoles = ["super_admin", "college_admin", "department_admin"];
    if (!profile || !profile.is_active || !allowedRoles.includes(profile.role)) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Only academic administrators can publish timetables" },
        { status: 403 }
      );
    }

    // 3. Parse and validate body
    const body = await request.json().catch(() => ({}));
    const validation = PublishTimetableSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.errors[0]?.message || "Invalid publish request body" },
        { status: 400 }
      );
    }

    // 4. Delegate to publish server action
    const actionResult = await publishTimetableAction(validation.data);

    if (!actionResult.success) {
      const isConflict = actionResult.error?.toLowerCase().includes("conflict");
      const isNotFound = actionResult.error?.toLowerCase().includes("not found");
      const statusCode = isConflict ? 409 : isNotFound ? 404 : 400;

      return NextResponse.json(
        { success: false, error: actionResult.error },
        { status: statusCode }
      );
    }

    return NextResponse.json(
      { success: true, data: actionResult.data },
      { status: 200 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error publishing timetable";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
