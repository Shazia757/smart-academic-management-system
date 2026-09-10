/**
 * SAMS — Safe Test Account Provisioning Script
 * 
 * Safely provisions development test accounts via Supabase Admin API.
 * Never stores passwords or secrets in version-controlled SQL files.
 * 
 * Usage:
 *   npx ts-node scripts/provision-seed-users.ts
 *   or:
 *   node --loader ts-node/esm scripts/provision-seed-users.ts
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

// Load environment variables from apps/web/.env.local or root .env
dotenv.config({ path: path.resolve(process.cwd(), "apps/web/.env.local") });
dotenv.config();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEFAULT_DEV_PASSWORD = process.env.SEED_USER_PASSWORD || "SamsDev#2026!";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.");
  console.error("Please configure them in apps/web/.env.local before running this script.");
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface SeedUserDefinition {
  email: string;
  role: "super_admin" | "college_admin" | "faculty" | "student";
  firstName: string;
  lastName: string;
}

const SEED_USERS: SeedUserDefinition[] = [
  {
    email: "superadmin@sams.edu",
    role: "super_admin",
    firstName: "Dr. Vikram",
    lastName: "Sarabhai",
  },
  {
    email: "dean.cse@sams.edu",
    role: "college_admin",
    firstName: "Prof. Radhika",
    lastName: "Shenoy",
  },
  {
    email: "arun.kumar@sams.edu",
    role: "faculty",
    firstName: "Dr. Arun",
    lastName: "Kumar",
  },
  {
    email: "priya.sharma@sams.edu",
    role: "faculty",
    firstName: "Dr. Priya",
    lastName: "Sharma",
  },
  {
    email: "rohit.verma@student.sams.edu",
    role: "student",
    firstName: "Rohit",
    lastName: "Verma",
  },
  {
    email: "sneha.patil@student.sams.edu",
    role: "student",
    firstName: "Sneha",
    lastName: "Patil",
  },
];

async function provisionUsers() {
  console.log("==================================================================");
  console.log("SAMS — PROVISIONING DEVELOPMENT TEST ACCOUNTS VIA SUPABASE ADMIN API");
  console.log("==================================================================");

  // Check if public.profiles table exists in Supabase
  let hasProfilesTable = true;
  const { error: tableCheckErr } = await supabaseAdmin.from("profiles").select("id").limit(1);
  if (
    tableCheckErr &&
    ((tableCheckErr as { code?: string }).code === "PGRST205" ||
      tableCheckErr.message.includes("Could not find the table"))
  ) {
    hasProfilesTable = false;
    const projectRef = SUPABASE_URL ? SUPABASE_URL.replace("https://", "").split(".")[0] : "<project-ref>";
    console.warn("\n==================================================================");
    console.warn("WARNING: 'public.profiles' table does not exist in Supabase database!");
    console.warn("==================================================================");
    console.warn("The SQL schema migrations have not been applied to your Supabase project.");
    console.warn("Auth users will be created in auth.users, but profiles cannot be linked yet.");
    console.warn("\nTo initialize the complete database schema:");
    console.warn(`1. Open Supabase Dashboard: https://supabase.com/dashboard/project/${projectRef}/sql`);
    console.warn("2. Copy all content from 'supabase/setup_complete.sql'");
    console.warn("3. Paste into the SQL Editor and click 'Run'.");
    console.warn("4. Re-run this script to verify profile linkage.\n");
    console.warn("==================================================================\n");
  }

  for (const userDef of SEED_USERS) {
    try {
      console.log(`\nProvisioning: ${userDef.email} [${userDef.role}]...`);
      let userId: string | undefined;

      // Attempt creation in auth.users
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email: userDef.email,
        password: DEFAULT_DEV_PASSWORD,
        email_confirm: true,
        app_metadata: {
          role: userDef.role,
          provider: "email",
          providers: ["email"],
        },
        user_metadata: {
          first_name: userDef.firstName,
          last_name: userDef.lastName,
        },
      });

      if (error) {
        if (error.message.includes("already been registered") || error.message.includes("unique")) {
          console.log(`  -> Account already exists in auth.users. Ensuring correct role [${userDef.role}]...`);
          const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
          const existingUser = listData.users.find((u) => u.email === userDef.email);
          if (existingUser) {
            userId = existingUser.id;
            await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
              app_metadata: { role: userDef.role },
            });
            console.log(`  -> Role successfully synchronized in app_metadata.`);
          }
        } else {
          console.error(`  -> Failed in auth.users: ${error.message}`);
        }
      } else {
        userId = data.user?.id;
        console.log(`  -> Successfully created in auth.users with UUID: ${userId}`);
      }

      // If public.profiles exists, synchronize profile record
      if (userId && hasProfilesTable) {
        const { error: profileError } = await supabaseAdmin.from("profiles").upsert(
          {
            id: userId,
            email: userDef.email,
            role: userDef.role,
            first_name: userDef.firstName,
            last_name: userDef.lastName,
            is_active: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" }
        );

        if (profileError) {
          console.error(`  -> Failed to upsert public.profiles for ${userDef.email}:`, profileError.message);
        } else {
          console.log(`  -> Successfully linked in public.profiles [role: ${userDef.role}].`);
        }

        // Link academic master records for faculty and students
        if (userDef.role === "faculty") {
          const empId = userDef.email === "arun.kumar@sams.edu" ? "FAC-CSE-001" : "FAC-CSE-002";
          const { error: fErr } = await supabaseAdmin
            .from("faculty")
            .update({ profile_id: userId })
            .eq("employee_id", empId);
          if (!fErr) {
            console.log(`  -> Linked to academic faculty record [${empId}].`);
          }
        } else if (userDef.role === "student") {
          const rollNo = userDef.email === "rohit.verma@student.sams.edu" ? "24CSE01" : "24CSE02";
          const { error: sErr } = await supabaseAdmin
            .from("students")
            .update({ profile_id: userId })
            .eq("roll_number", rollNo);
          if (!sErr) {
            console.log(`  -> Linked to academic student record [${rollNo}].`);
          }
        }
      }
    } catch (err: unknown) {
      console.error(`  -> Exception provisioning ${userDef.email}:`, err);
    }
  }

  console.log("\n==================================================================");
  console.log("PROVISIONING COMPLETED.");
  if (!hasProfilesTable) {
    console.log("NOTE: Remember to apply 'supabase/setup_complete.sql' in Supabase SQL Editor");
    console.log("      and re-run this script to populate public.profiles.");
  }
  console.log("==================================================================");
}

provisionUsers();
