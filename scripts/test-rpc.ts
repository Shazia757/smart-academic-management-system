import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), "apps/web/.env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const { data, error } = await supabase.rpc("save_timetable_generation_atomic", {
    p_configuration_id: "00000000-0000-0000-0000-000000000000",
    p_section_id: "00000000-0000-0000-0000-000000000000",
    p_solver_name: "test",
    p_solver_version: "1.0",
    p_hard_violations: 0,
    p_soft_violations: 0,
    p_solve_duration_ms: 0,
    p_diagnostics: [],
    p_entries: [],
  });
  console.log("Current RPC test error:", error);
}

main();
