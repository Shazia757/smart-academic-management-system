import * as React from "react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { requireUser } from "@/lib/auth/session";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Server-side authentication guard
  const profile = await requireUser();

  return <DashboardShell profile={profile}>{children}</DashboardShell>;
}
