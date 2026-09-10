import * as React from "react";
import Link from "next/link";
import { ShieldCheck, ArrowLeft, Database } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { requireAnyRole } from "@/lib/auth/session";
import { ROLES } from "@/lib/auth/roles";

export default async function AuditLogsPage() {
  // Server-side Guard: Super Admin & College Admin only
  const profile = await requireAnyRole([ROLES.SUPER_ADMIN, ROLES.COLLEGE_ADMIN]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Security Audit Ledger
            </h1>
            <Badge variant="destructive">Restricted Access</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Immutable administrative event logging and mutation records.
          </p>
        </div>

        <Link
          href="/"
          className={buttonVariants({ variant: "outline", size: "sm", className: "gap-2" })}
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
          <div className="rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive mb-3">
              <Database className="h-6 w-6" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">
              Audit Logs Security Ledger
            </h3>
            <p className="mt-1 text-xs text-muted-foreground max-w-md mx-auto">
              This module requires administrative privileges. PostgreSQL audit triggers configured in Migration 003 record administrative actions automatically into public.audit_logs.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
