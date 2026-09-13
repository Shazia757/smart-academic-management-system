import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-client";
import { AttendanceService } from "@/server/services/attendance";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
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

    // Support payload passing either array of records or object with records: [...]
    const sessionId = body.session_id || id;
    const rawRecords = Array.isArray(body) ? body : (body.records || []);
    const records = Array.isArray(rawRecords)
      ? rawRecords.map((r: any) =>
          typeof r === "object" && r !== null
            ? { ...r, session_id: r.session_id || sessionId }
            : r
        )
      : [];

    const payload = {
      session_id: sessionId,
      records,
    };

    // Ensure session_id matches URL route parameter
    if (payload.session_id !== id) {
      return NextResponse.json(
        { success: false, error: "Session ID in payload does not match route URL" },
        { status: 400 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const closeSession =
      searchParams.get("closeSession") === "true" || Boolean(body.close_session);

    const result = await AttendanceService.saveAttendanceRecords(supabase, payload, {
      closeSession,
    });

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
