import * as React from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { requireUser } from "@/lib/auth/session";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Server-side authentication guard
  // Automatically redirects to /login if unauthenticated or inactive
  const profile = await requireUser();

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Dynamic Role-Filtered Sidebar */}
      <Sidebar role={profile.role} />

      {/* Main Content Pane */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar profile={profile} />
        <main className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
