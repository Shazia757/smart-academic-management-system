import * as React from "react";
import Link from "next/link";
import { GraduationCap, ArrowLeft, ShieldCheck } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { requireAnyRole } from "@/lib/auth/session";
import { ADMIN_ROLES } from "@/lib/auth/roles";

export default async function StudentsPage() {
  // Server-side RBAC Guard: Super Admin & College Admin only
  const profile = await requireAnyRole(ADMIN_ROLES);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Student Directory & Enrollment
            </h1>
            <Badge variant="accent">Phase 3 Module</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Administrative student lifecycle, department sections, and biometric enrollment.
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
              <CardTitle>Authorized Administrator Access</CardTitle>
              <CardDescription>
                Verified session for {profile.first_name} {profile.last_name} ({profile.role})
              </CardDescription>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
              <ShieldCheck className="h-4 w-4" />
              RBAC Verified
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-3">
              <GraduationCap className="h-6 w-6" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">
              Student Administration System
            </h3>
            <p className="mt-1 text-xs text-muted-foreground max-w-md mx-auto">
              This administrative module is guarded by server-side role validation.
              Student CRUD and enrollment forms will be implemented in Phase 3.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
