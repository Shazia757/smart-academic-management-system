import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-client";
import {
  getTimetableGenerationAction,
  updateTimetableDraftAction,
  deleteTimetableGenerationAction,
} from "@/server/actions/timetable-generation";
import { SavedTimetableEntrySchema } from "@/server/validators/timetable";
import { z } from "zod";

const UpdateDraftBodySchema = z.object({
  entries: z.array(SavedTimetableEntrySchema).min(1, "At least one scheduled entry is required"),
});

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ success: false, error: "Missing draft ID" }, { status: 400 });
    }

    const supabase = await createRouteHandlerSupabaseClient(request);

    // Authentication Guard
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    // Role Guard: Students cannot view private drafts
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, is_active")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile || !profile.is_active) {
      return NextResponse.json({ success: false, error: "Profile inactive" }, { status: 403 });
    }

    if (profile.role === "student") {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Students cannot inspect draft timetables" },
        { status: 403 }
      );
    }

    const actionResult = await getTimetableGenerationAction(id);
    if (!actionResult.success) {
      const isNotFound = actionResult.error?.toLowerCase().includes("not found");
      return NextResponse.json(
        { success: false, error: actionResult.error },
        { status: isNotFound ? 404 : 400 }
      );
    }

    return NextResponse.json({ success: true, data: actionResult.data }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error retrieving draft";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ success: false, error: "Missing draft ID" }, { status: 400 });
    }

    const supabase = await createRouteHandlerSupabaseClient(request);

    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, is_active")
      .eq("id", user.id)
      .maybeSingle();

    const allowedRoles = ["super_admin", "college_admin", "department_admin"];
    if (!profile || !profile.is_active || !allowedRoles.includes(profile.role)) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Only administrators can modify drafts" },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const validation = UpdateDraftBodySchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.errors[0]?.message || "Invalid update body" },
        { status: 400 }
      );
    }

    const actionResult = await updateTimetableDraftAction({
      generation_id: id,
      entries: validation.data.entries,
    });

    if (!actionResult.success) {
      const isPublished = actionResult.error?.toLowerCase().includes("published");
      const isNotFound = actionResult.error?.toLowerCase().includes("not found");
      const statusCode = isPublished ? 409 : isNotFound ? 404 : 400;

      return NextResponse.json({ success: false, error: actionResult.error }, { status: statusCode });
    }

    return NextResponse.json({ success: true, data: actionResult.data }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error updating draft";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ success: false, error: "Missing draft ID" }, { status: 400 });
    }

    const supabase = await createRouteHandlerSupabaseClient(request);

    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, is_active")
      .eq("id", user.id)
      .maybeSingle();

    const allowedRoles = ["super_admin", "college_admin", "department_admin"];
    if (!profile || !profile.is_active || !allowedRoles.includes(profile.role)) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Only administrators can delete drafts" },
        { status: 403 }
      );
    }

    const actionResult = await deleteTimetableGenerationAction({ generation_id: id });
    if (!actionResult.success) {
      const isPublished = actionResult.error?.toLowerCase().includes("published");
      const isNotFound = actionResult.error?.toLowerCase().includes("not found");
      const statusCode = isPublished ? 409 : isNotFound ? 404 : 400;

      return NextResponse.json({ success: false, error: actionResult.error }, { status: statusCode });
    }

    return NextResponse.json({ success: true, data: actionResult.data }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error deleting draft";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
