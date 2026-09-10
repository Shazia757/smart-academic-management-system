import * as React from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { ShieldAlert, ArrowLeft, LogOut } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { logoutAction } from "@/server/actions/auth";
import { getCurrentProfile } from "@/lib/auth/session";
import { getRoleLabel } from "@/lib/auth/roles";
import { RoleBadge } from "@/components/common/status-badge";

export const metadata: Metadata = {
  title: "403 Access Restricted | SAMS",
  description: "You do not have administrative permission to access this academic module.",
};

export default async function UnauthorizedPage() {
  const profile = await getCurrentProfile();

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10 text-destructive mb-4">
          <ShieldAlert className="h-8 w-8" />
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Access Restricted (403)
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your current academic role does not possess authorization to view or modify this module.
        </p>

        {profile && (
          <div className="my-6 rounded-xl border border-border bg-card p-4 text-left">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs text-muted-foreground block">Active Identity</span>
                <span className="text-sm font-semibold text-foreground">
                  {profile.first_name} {profile.last_name}
                </span>
                <span className="text-xs text-muted-foreground block">{profile.email}</span>
              </div>
              <div>
                <RoleBadge role={profile.role} />
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground border-t border-border pt-2.5">
              Assigned Permission Tier: <span className="font-medium text-foreground">{getRoleLabel(profile.role)}</span>
            </p>
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/"
            className={buttonVariants({ variant: "default", size: "default", className: "w-full sm:w-auto gap-2" })}
          >
            <ArrowLeft className="h-4 w-4" />
            Return to Dashboard
          </Link>

          <form action={logoutAction} className="w-full sm:w-auto">
            <button
              type="submit"
              className={buttonVariants({ variant: "outline", size: "default", className: "w-full gap-2 text-destructive hover:text-destructive" })}
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
