"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  Building2,
  BookOpen,
  DoorOpen,
  CalendarDays,
  ScanFace,
  BarChart3,
  FileSpreadsheet,
  Bell,
  ShieldCheck,
  Cpu,
  ChevronLeft,
  ChevronRight,
  Layers,
  Clock,
  Briefcase,
  UserCheck,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { UserRole } from "@/types/database";
import { isRouteAuthorized } from "@/lib/auth/roles";

interface NavItem {
  title: string;
  href: string;
  icon: React.ReactNode;
  badge?: string;
  badgeVariant?: "default" | "accent" | "success";
}

const allNavItems: NavItem[] = [
  {
    title: "Overview",
    href: "/",
    icon: <LayoutDashboard className="h-5 w-5" />,
  },
  {
    title: "Departments",
    href: "/departments",
    icon: <Building2 className="h-5 w-5" />,
  },
  {
    title: "Academic Structure",
    href: "/academic-structure",
    icon: <Layers className="h-5 w-5" />,
  },
  {
    title: "Classrooms & Labs",
    href: "/classrooms",
    icon: <DoorOpen className="h-5 w-5" />,
  },
  {
    title: "Faculty",
    href: "/faculty",
    icon: <Users className="h-5 w-5" />,
  },
  {
    title: "Faculty Availability",
    href: "/faculty/availability",
    icon: <Clock className="h-5 w-5" />,
  },
  {
    title: "Students",
    href: "/students",
    icon: <GraduationCap className="h-5 w-5" />,
  },
  {
    title: "Subjects",
    href: "/subjects",
    icon: <BookOpen className="h-5 w-5" />,
  },
  {
    title: "Assignments",
    href: "/assignments",
    icon: <Briefcase className="h-5 w-5" />,
  },
  {
    title: "Enrollments",
    href: "/enrollments",
    icon: <UserCheck className="h-5 w-5" />,
  },
  {
    title: "Timetable Config",
    href: "/timetable/configuration",
    icon: <CalendarDays className="h-5 w-5" />,
    badge: "Phase 4",
    badgeVariant: "accent",
  },
  {
    title: "Generate Timetable",
    href: "/timetable/generate",
    icon: <Sparkles className="h-5 w-5" />,
    badge: "AI Solve",
    badgeVariant: "accent",
  },
  {
    title: "Audit Logs",
    href: "/audit-logs",
    icon: <ShieldCheck className="h-5 w-5" />,
    badge: "Security",
    badgeVariant: "default",
  },
];

interface SidebarProps {
  role?: UserRole;
}

export function Sidebar({ role }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = React.useState(false);

  // Filter navigation items based on the authenticated user's role
  const visibleNavItems = React.useMemo(() => {
    if (!role) return allNavItems;
    return allNavItems.filter((item) => isRouteAuthorized(item.href, role));
  }, [role]);

  return (
    <aside
      className={cn(
        "relative flex flex-col border-r border-border bg-card transition-all duration-300 select-none z-30",
        collapsed ? "w-20" : "w-64"
      )}
    >
      {/* Brand Header */}
      <div className="flex h-16 items-center justify-between px-4 border-b border-border">
        {!collapsed ? (
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <GraduationCap className="h-5 w-5" />
            </div>
            <div className="flex flex-col truncate">
              <span className="text-sm font-bold tracking-tight text-foreground">
                SAMS Platform
              </span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                Academic 2026
              </span>
            </div>
          </div>
        ) : (
          <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <GraduationCap className="h-5 w-5" />
          </div>
        )}

        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-muted/50 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors",
            collapsed && "mx-auto mt-1"
          )}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Navigation Links */}
      <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        {visibleNavItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
                collapsed && "justify-center px-2"
              )}
              title={collapsed ? item.title : undefined}
            >
              <div className="shrink-0">{item.icon}</div>
              {!collapsed && (
                <div className="flex flex-1 items-center justify-between truncate">
                  <span className="truncate">{item.title}</span>
                  {item.badge && (
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                        isActive
                          ? "bg-primary-foreground/20 text-primary-foreground"
                          : item.badgeVariant === "accent"
                          ? "bg-accent/15 text-accent"
                          : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                      )}
                    >
                      {item.badge}
                    </span>
                  )}
                </div>
              )}
            </Link>
          );
        })}
      </div>

      {/* Footer System Pill */}
      {!collapsed && (
        <div className="p-3 border-t border-border">
          <div className="rounded-lg bg-muted/60 p-2.5 flex items-center gap-2.5">
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <div className="text-xs text-muted-foreground truncate">
              <span className="font-semibold text-foreground">RBAC Enforced</span>
              <p className="text-[10px] truncate capitalize">{role ? role.replace("_", " ") : "Authenticated"}</p>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
