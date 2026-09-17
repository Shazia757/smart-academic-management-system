import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: "apps/web/.env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const tables = [
    "timetable_configurations",
    "timetable_periods",
    "subject_scheduling_requirements",
    "timetable_generations",
    "timetable_entries",
    "faculty_availability",
    "classrooms",
    "faculty_subjects",
    "class_sections",
    "subjects",
    "classroom_availability",
  ];

  for (const table of tables) {
    const { data, error } = await supabase.from(table).select("*").limit(1);
    if (error) {
      console.log(`Table '${table}': ERROR -> ${error.message} (code: ${error.code})`);
    } else {
      const keys = data && data[0] ? Object.keys(data[0]) : "table empty, but exists";
      console.log(`Table '${table}': OK ->`, keys);
    }
  }
}

main().catch(console.error);
