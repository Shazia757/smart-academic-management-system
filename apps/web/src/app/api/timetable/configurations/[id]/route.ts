import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-client";
import { TimetableDataService } from "@/server/services/timetable-data";

const UUIDSchema = z.string().uuid("Invalid configuration ID format: must be a valid UUID");

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    const idValidation = UUIDSchema.safeParse(id);
    if (!idValidation.success) {
      return NextResponse.json(
        { success: false, error: idValidation.error.errors[0]?.message || "Invalid configuration ID" },
        { status: 400 }
      );
    }

    const supabase = await createRouteHandlerSupabaseClient(request);

    // Authentication Guard
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json(
        { success: false, error: "Authentication required to access timetable configuration" },
        { status: 401 }
      );
    }

    // Role check
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, is_active")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile || !profile.is_active) {
      return NextResponse.json(
        { success: false, error: "User profile is inactive or not found" },
        { status: 403 }
      );
    }

    // Fetch configuration
    const configResult = await TimetableDataService.fetchActiveTimetableConfiguration(supabase, id);
    if (configResult.error || !configResult.data) {
      return NextResponse.json(
        { success: false, error: configResult.error },
        { status: configResult.status }
      );
    }

    // Fetch periods
    const periodsResult = await TimetableDataService.fetchPeriods(supabase, id);
    if (periodsResult.error) {
      return NextResponse.json(
        { success: false, error: periodsResult.error },
        { status: periodsResult.status }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          configuration: configResult.data,
          periods: periodsResult.data || [],
        },
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      { success: false, error: "Internal server error retrieving timetable configuration" },
      { status: 500 }
    );
  }
}
