import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), "apps/web/.env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log("=== DB & RPC VERIFICATION ===");

  // 1. Check RPC existence by testing execution with dry parameters
  const { data: rpcTest, error: rpcError } = await supabase.rpc(
    "save_timetable_generation_atomic",
    {
      p_configuration_id: "00000000-0000-0000-0000-000000000000",
      p_section_id: "00000000-0000-0000-0000-000000000000",
      p_solver_name: "Verification",
      p_solver_version: "1.0",
      p_hard_violations: 0,
      p_soft_violations: 0,
      p_solve_duration_ms: 0,
      p_diagnostics: [],
      p_entries: [],
    }
  );

  console.log("RPC Call Error (expected P0002 not found since dummy config):", rpcError?.code, rpcError?.message);

  // 2. Enum values check
  const candidates = ["THEORY", "LABORATORY", "PRACTICAL", "ELECTIVE", "PROJECT", "LAB", "SEMINAR"];
  console.log("\nEnum Values test on timetable_entries.session_type:");
  for (const val of candidates) {
    const { error } = await supabase.from("timetable_entries").insert({
      timetable_generation_id: "00000000-0000-0000-0000-000000000000",
      section_id: "00000000-0000-0000-0000-000000000000",
      timetable_period_id: "00000000-0000-0000-0000-000000000000",
      subject_id: "00000000-0000-0000-0000-000000000000",
      faculty_id: "00000000-0000-0000-0000-000000000000",
      classroom_id: "00000000-0000-0000-0000-000000000000",
      session_type: val as any,
    });
    if (error?.code === "22P02") {
      console.log(`- ${val}: INVALID ENUM (${error.message})`);
    } else {
      console.log(`- ${val}: VALID ENUM (${error?.code === "23503" ? "Passed enum check, caught FK" : "Valid"})`);
    }
  }

  // 3. Columns check on public tables
  const { data: subSample } = await supabase.from("subjects").select("subject_type").limit(1);
  const { data: entrySample } = await supabase.from("timetable_entries").select("session_type").limit(1);
  console.log("\nColumns using subject_type_enum in public schema:");
  console.log("- public.subjects.subject_type:", subSample !== null ? "EXISTS" : "MISSING");
  console.log("- public.timetable_entries.session_type:", entrySample !== null ? "EXISTS" : "MISSING");
}

main().catch(console.error);
