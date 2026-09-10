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

  for (const userDef of SEED_USERS) {
    try {
      console.log(`\nProvisioning: ${userDef.email} [${userDef.role}]...`);

      // Attempt creation
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
          console.log(`  -> Account already exists. Ensuring correct app_metadata role [${userDef.role}]...`);
          // Find user id and update
          const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
          const existingUser = listData.users.find((u) => u.email === userDef.email);
          if (existingUser) {
            await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
              app_metadata: { role: userDef.role },
            });
            console.log(`  -> Role successfully synchronized.`);
          }
        } else {
          console.error(`  -> Failed: ${error.message}`);
        }
      } else {
        console.log(`  -> Successfully created with UUID: ${data.user?.id}`);
      }
    } catch (err: unknown) {
      console.error(`  -> Exception provisioning ${userDef.email}:`, err);
    }
  }

  console.log("\n==================================================================");
  console.log("PROVISIONING COMPLETED SAFELY.");
  console.log("==================================================================");
}

provisionUsers();
