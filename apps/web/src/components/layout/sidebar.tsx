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
  CalendarCheck,
  ScanFace,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Layers,
  Clock,
  Briefcase,
  UserCheck,
  Bell,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { UserRole } from "@/types/database";
import { isRouteAuthorized } from "@/lib/auth/roles";

interface NavItem {
  title: string;
  href: string;
  icon: React.ReactNode;
  badge?: string;
}

interface NavSection {
  heading?: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    items: [
      {
        title: "Dashboard Overview",
        href: "/",
        icon: <LayoutDashboard className="h-4 w-4 shrink-0" />,
      },
    ],
  },
  {
    heading: "Academic Structure",
    items: [
      {
        title: "Academic Structure",
        href: "/academic-structure",
        icon: <Layers className="h-4 w-4 shrink-0" />,
      },
      {
        title: "Departments",
        href: "/departments",
        icon: <Building2 className="h-4 w-4 shrink-0" />,
      },
      {
        title: "Classrooms & Labs",
        href: "/classrooms",
        icon: <DoorOpen className="h-4 w-4 shrink-0" />,
      },
    ],
  },
  {
    heading: "Faculty & Students",
    items: [
      {
        title: "Faculty Directory",
        href: "/faculty",
        icon: <Users className="h-4 w-4 shrink-0" />,
      },
      {
        title: "Faculty Availability",
        href: "/faculty/availability",
        icon: <Clock className="h-4 w-4 shrink-0" />,
      },
      {
        title: "Student Directory",
        href: "/students",
        icon: <GraduationCap className="h-4 w-4 shrink-0" />,
      },
      {
        title: "Course Assignments",
        href: "/assignments",
        icon: <Briefcase className="h-4 w-4 shrink-0" />,
      },
      {
        title: "Student Enrollments",
        href: "/enrollments",
        icon: <UserCheck className="h-4 w-4 shrink-0" />,
      },
    ],
  },
  {
    heading: "Curriculum & Timetable",
    items: [
      {
        title: "Curriculum Subjects",
        href: "/subjects",
        icon: <BookOpen className="h-4 w-4 shrink-0" />,
      },
      {
        title: "Timetable Configurations",
        href: "/timetable/configuration",
        icon: <CalendarDays className="h-4 w-4 shrink-0" />,
      },
      {
        title: "Generate Schedule",
        href: "/timetable/generate",
        icon: <CalendarCheck className="h-4 w-4 shrink-0" />,
      },
      {
        title: "Master Timetable",
        href: "/timetable",
        icon: <CalendarDays className="h-4 w-4 shrink-0" />,
      },
    ],
  },
  {
    heading: "Operations & Auditing",
    items: [
      {
        title: "Class Attendance",
        href: "/attendance",
        icon: <ScanFace className="h-4 w-4 shrink-0" />,
      },
      {
        title: "Notifications & Notices",
        href: "/notifications",
        icon: <Bell className="h-4 w-4 shrink-0" />,
      },
      {
        title: "Security Audit Ledger",
        href: "/audit-logs",
        icon: <ShieldCheck className="h-4 w-4 shrink-0" />,
      },
    ],
  },
];

interface SidebarProps {
  role?: UserRole;
  isMobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({ role, isMobileOpen = false, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = React.useState(false);

  // Close mobile drawer when route changes
  React.useEffect(() => {
    if (onMobileClose) {
      onMobileClose();
    }
  }, [pathname]);

  // Filter sections and items based on role authorization
  const visibleSections = React.useMemo(() => {
    if (!role) return navSections;
    return navSections
      .map((sec) => ({
        ...sec,
        items: sec.items.filter((item) => isRouteAuthorized(item.href, role)),
      }))
      .filter((sec) => sec.items.length > 0);
  }, [role]);

  const sidebarContent = (
    <div className="flex h-full flex-col justify-between select-none">
      {/* Brand Header */}
      <div>
        <div className="flex h-16 items-center justify-between border-b border-[#176477] px-4 bg-[#0F4C5C]">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[#0F4C5C] font-semibold shadow-xs">
              <GraduationCap className="h-5 w-5" />
            </div>
            {(!collapsed || isMobileOpen) && (
              <div className="flex flex-col truncate">
                <span className="text-sm font-bold tracking-tight text-white">
                  SAMS Academic
                </span>
                <span className="text-[10px] text-[#C4DDE1] font-medium tracking-wide">
                  Smart Academic Management
                </span>
              </div>
            )}
          </div>

          {/* Desktop collapse toggle */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:flex h-7 w-7 items-center justify-center rounded-lg border border-[#39717D] bg-[#176477] text-white hover:bg-[#245F6D] transition-all duration-150"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
          </button>

          {/* Mobile close button */}
          {isMobileOpen && (
            <button
              onClick={onMobileClose}
              className="lg:hidden flex h-8 w-8 items-center justify-center rounded-lg border border-[#39717D] bg-[#176477] text-white hover:bg-[#245F6D]"
              title="Close navigation"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Grouped Navigation Links */}
        <div className="overflow-y-auto px-3 py-4 space-y-4 max-h-[calc(100vh-9.5rem)]">
          {visibleSections.map((sec, secIdx) => (
            <div key={secIdx} className="space-y-1">
              {sec.heading && (!collapsed || isMobileOpen) && (
                <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[#C4DDE1]">
                  {sec.heading}
                </div>
              )}
              {sec.items.map((item) => {
                const isActive =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-medium transition-all duration-150",
                      isActive
                        ? "bg-white text-[#0F4C5C] font-semibold shadow-sm"
                        : "text-[#F1F7F8] hover:bg-[#176477] hover:text-white active:scale-[0.99]",
                      collapsed && !isMobileOpen && "justify-center px-2"
                    )}
                    title={collapsed && !isMobileOpen ? item.title : undefined}
                  >
                    <span
                      className={cn(
                        "shrink-0",
                        isActive ? "text-[#0F4C5C]" : "text-[#C4DDE1]"
                      )}
                    >
                      {item.icon}
                    </span>
                    {(!collapsed || isMobileOpen) && (
                      <span className="truncate">{item.title}</span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Footer Identity Indicator */}
      {(!collapsed || isMobileOpen) && (
        <div className="border-t border-[#176477] p-3 bg-[#0F4C5C]">
          <div className="rounded-xl border border-[#39717D] bg-[#176477] p-2.5 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white">Access Scope</span>
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] font-medium text-emerald-300">
                  Live
                </span>
              </span>
            </div>
            <p className="mt-1 text-[11px] font-medium capitalize text-[#C4DDE1] truncate">
              {role ? role.replace("_", " ") : "Institutional User"}
            </p>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside
        className={cn(
          "hidden lg:flex flex-col border-r border-[#2A6674] bg-[#0F4C5C] transition-all duration-200 shrink-0",
          collapsed ? "w-16" : "w-60"
        )}
      >
        {sidebarContent}
      </aside>

      {/* Mobile Slide-Over Drawer with Backdrop */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-background/80 backdrop-blur-xs transition-opacity"
            onClick={onMobileClose}
          />

          {/* Drawer Panel */}
          <div className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] border-r border-[#2A6674] bg-[#0F4C5C] shadow-xl">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}
