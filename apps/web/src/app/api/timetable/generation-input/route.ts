import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-client";
import { TimetableDataService } from "@/server/services/timetable-data";

const GenerationInputQuerySchema = z.object({
  configuration_id: z.string().uuid("Configuration ID must be a valid UUID"),
  section_id: z.string().uuid("Section ID must be a valid UUID"),
  timeout_seconds: z.coerce.number().int().min(1).max(300).optional().default(30),
  random_seed: z.coerce.number().int().optional().default(42),
});

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const rawQuery = {
      configuration_id: searchParams.get("configuration_id") || undefined,
      section_id: searchParams.get("section_id") || undefined,
      timeout_seconds: searchParams.get("timeout_seconds") || undefined,
      random_seed: searchParams.get("random_seed") || undefined,
    };

    const validation = GenerationInputQuerySchema.safeParse(rawQuery);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.errors[0]?.message || "Invalid generation input query parameters" },
        { status: 400 }
      );
    }

    const { configuration_id, section_id, timeout_seconds, random_seed } = validation.data;

    const supabase = await createRouteHandlerSupabaseClient(request);

    // 1. Authentication Guard
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json(
        { success: false, error: "Authentication required to access timetable generation data" },
        { status: 401 }
      );
    }

    // 2. Role-based Authorization Guard (Admins and Faculty only, not Students)
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
        { success: false, error: "Unauthorized: Students cannot access timetable generation input datasets" },
        { status: 403 }
      );
    }

    // 3. Assemble and validate timetable generation input dataset
    const result = await TimetableDataService.buildValidatedGenerationInput(supabase, {
      configuration_id,
      section_id,
      timeout_seconds,
      random_seed,
    });

    if (result.error || !result.data) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: result.status }
      );
    }

    return NextResponse.json(
      { success: true, data: result.data },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      { success: false, error: "Internal server error assembling timetable generation input" },
      { status: 500 }
    );
  }
}
