import * as React from "react";
import Link from "next/link";
import { ShieldCheck, ArrowLeft } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { requireAnyRole } from "@/lib/auth/session";
import { ROLES } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AuditLedgerClient, AuditLogEntry } from "@/components/audit/audit-ledger-client";

export const dynamic = "force-dynamic";

export default async function AuditLogsPage() {
  // Server-side Guard: Super Admin & College Admin only
  const profile = await requireAnyRole([ROLES.SUPER_ADMIN, ROLES.COLLEGE_ADMIN]);
  const supabase = await createServerSupabaseClient();

  const { data: rawLogs } = await supabase
    .from("audit_logs")
    .select(`
      id,
      user_id,
      action,
      entity_name,
      entity_id,
      old_values,
      new_values,
      ip_address,
      user_agent,
      created_at,
      profile:profiles(first_name, last_name, email, role)
    `)
    .order("created_at", { ascending: false })
    .limit(100);

  const logs = ((rawLogs || []) as unknown) as AuditLogEntry[];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-2xl bg-primary/10 text-primary border border-primary/20 shadow-xs">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Security Audit Ledger
              </h1>
              <Badge variant="destructive" className="rounded-full px-2.5 py-0.5 text-xs font-semibold">Restricted Access</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Immutable administrative event logging and mutation records.
            </p>
          </div>
        </div>

        <Link
          href="/"
          className={buttonVariants({ variant: "outline", size: "sm", className: "gap-2 rounded-xl shadow-subtle self-start sm:self-auto" })}
        >
          <ArrowLeft className="h-4 w-4" />
          Dashboard
        </Link>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Audit Trail Viewer</CardTitle>
              <CardDescription>
                Authenticated as {profile.first_name} {profile.last_name} ({profile.role})
              </CardDescription>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
              <ShieldCheck className="h-4 w-4" />
              Role Verified
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <AuditLedgerClient initialLogs={logs} />
        </CardContent>
      </Card>
    </div>
  );
}
