import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), "apps/web/.env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function testVal(val: string) {
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
    console.log(`Value "${val}": INVALID ENUM (${error.message})`);
  } else if (error?.code === "23503") {
    console.log(`Value "${val}": VALID ENUM VALUE! (Failed only on foreign key: ${error.details || error.message})`);
  } else {
    console.log(`Value "${val}": Code ${error?.code}, Message: ${error?.message}`);
  }
}

async function main() {
  const candidates = ["THEORY", "LAB", "LABORATORY", "PRACTICAL", "ELECTIVE", "PROJECT", "SEMINAR"];
  for (const c of candidates) {
    await testVal(c);
  }
}

main().catch(console.error);
