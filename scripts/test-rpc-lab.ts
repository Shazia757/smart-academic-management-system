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
  // Let's inspect an existing timetable configuration, section, etc.
  const { data: configs, error: configErr } = await supabase
    .from("timetable_configurations")
    .select("id, section_id, is_active")
    .eq("is_active", true)
    .limit(1);

  console.log("Config sample:", configs, configErr);
  if (configs && configs.length > 0) {
    const config = configs[0];
    const { data: periods } = await supabase
      .from("timetable_periods")
      .select("id")
      .eq("timetable_configuration_id", config.id)
      .limit(1);

    const { data: subjects } = await supabase.from("subjects").select("id, code, subject_type").limit(5);
    const { data: faculty } = await supabase.from("faculty").select("id").limit(1);
    const { data: rooms } = await supabase.from("classrooms").select("id").limit(1);

    console.log("Sample subjects:", subjects);

    if (periods?.[0] && subjects?.[0] && faculty?.[0] && rooms?.[0]) {
      console.log("\n--- Testing RPC with session_type: 'LAB' ---");
      const { data: rpcLabRes, error: rpcLabErr } = await supabase.rpc(
        "save_timetable_generation_atomic",
        {
          p_configuration_id: config.id,
          p_section_id: config.section_id,
          p_solver_name: "Test",
          p_solver_version: "1.0",
          p_hard_violations: 0,
          p_soft_violations: 0,
          p_solve_duration_ms: 0,
          p_diagnostics: [],
          p_entries: [
            {
              subject_id: subjects[0].id,
              faculty_id: faculty[0].id,
              classroom_id: rooms[0].id,
              timetable_period_id: periods[0].id,
              occurrence_index: 9999, // use high occurrence index to avoid unique collision if any
              session_type: "LAB",
              is_lab: true,
              notes: "Enum test LAB",
            },
          ],
        }
      );
      console.log("RPC with 'LAB':", { rpcLabRes, rpcLabErr });

      console.log("\n--- Testing RPC with session_type: 'LABORATORY' ---");
      const { data: rpcLaboRes, error: rpcLaboErr } = await supabase.rpc(
        "save_timetable_generation_atomic",
        {
          p_configuration_id: config.id,
          p_section_id: config.section_id,
          p_solver_name: "Test",
          p_solver_version: "1.0",
          p_hard_violations: 0,
          p_soft_violations: 0,
          p_solve_duration_ms: 0,
          p_diagnostics: [],
          p_entries: [
            {
              subject_id: subjects[0].id,
              faculty_id: faculty[0].id,
              classroom_id: rooms[0].id,
              timetable_period_id: periods[0].id,
              occurrence_index: 9999,
              session_type: "LABORATORY",
              is_lab: true,
              notes: "Enum test LABORATORY",
            },
          ],
        }
      );
      console.log("RPC with 'LABORATORY':", { rpcLaboRes, rpcLaboErr });
    }
  }
}

main().catch(console.error);
