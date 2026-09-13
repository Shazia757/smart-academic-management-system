import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-client";
import { AttendanceService } from "@/server/services/attendance";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createRouteHandlerSupabaseClient(request);
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Malformed JSON payload" },
        { status: 400 }
      );
    }

    const result = await AttendanceService.createAttendanceSession(supabase, body);
    if (result.error) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: result.status }
      );
    }

    return NextResponse.json(
      { success: true, data: result.data },
      { status: result.status }
    );
  } catch {
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createRouteHandlerSupabaseClient(request);
    const searchParams = request.nextUrl.searchParams;

    const queryInput = {
      session_id: searchParams.get("session_id") || undefined,
      section_id: searchParams.get("section_id") || undefined,
      subject_id: searchParams.get("subject_id") || undefined,
      academic_year_id: searchParams.get("academic_year_id") || undefined,
      from_date: searchParams.get("from_date") || undefined,
      to_date: searchParams.get("to_date") || undefined,
      status: (searchParams.get("status") as any) || undefined,
    };

    const result = await AttendanceService.listAttendanceSessions(supabase, queryInput);
    if (result.error) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: result.status }
      );
    }

    return NextResponse.json(
      { success: true, data: result.data },
      { status: result.status }
    );
  } catch {
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
