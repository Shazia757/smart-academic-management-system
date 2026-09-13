import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-client";
import { AttendanceService } from "@/server/services/attendance";

interface RouteContext {
  params: Promise<{ studentId: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { studentId } = await context.params;
    const supabase = await createRouteHandlerSupabaseClient(request);
    const searchParams = request.nextUrl.searchParams;

    const queryInput = {
      session_id: searchParams.get("session_id") || undefined,
      status: (searchParams.get("status") as any) || undefined,
      from_date: searchParams.get("from_date") || undefined,
      to_date: searchParams.get("to_date") || undefined,
    };

    const result = await AttendanceService.getStudentAttendanceHistory(
      supabase,
      studentId,
      queryInput
    );

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
