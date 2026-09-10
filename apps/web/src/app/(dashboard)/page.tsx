import * as React from "react";
import Link from "next/link";
import {
  GraduationCap,
  Users,
  DoorOpen,
  CalendarDays,
  ScanFace,
  BarChart3,
  Cpu,
  ArrowUpRight,
  Database,
  CheckCircle2,
  BookOpen,
  Clock,
  ShieldAlert,
} from "lucide-react";
import { MetricCard } from "@/components/common/metric-card";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { aiClient } from "@/lib/ai-client";
import { getCurrentProfile } from "@/lib/auth/session";
import { getRoleLabel } from "@/lib/auth/roles";
import { RoleBadge } from "@/components/common/status-badge";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const profile = await getCurrentProfile();
  const userRole = profile?.role ?? "student";
  const aiHealth = await aiClient.checkHealth();
  const supabase = await createServerSupabaseClient();

  const isSuperAdmin = userRole === "super_admin";
  const isCollegeAdmin = userRole === "college_admin";
  const isFaculty = userRole === "faculty";
  const isStudent = userRole === "student";

  // Phase 3 live database summary metrics
  const [
    { count: totalStudents },
    { count: totalFaculty },
    { count: totalDepartments },
    { count: totalSubjects },
    { count: totalClassrooms },
  ] = await Promise.all([
    supabase.from("students").select("*", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("faculty").select("*", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("departments").select("*", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("subjects").select("*", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("classrooms").select("*", { count: "exact", head: true }).eq("is_active", true),
  ]);

  return (
    <div className="space-y-8">
      {/* 1. Personalized Header Banner */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              {isStudent
                ? "Student Academic Portal"
                : isFaculty
                ? "Faculty Teaching Hub"
                : isSuperAdmin
                ? "Institution Operations Center"
                : "College Academic Operations Hub"}
            </h1>
            <Badge variant="success" className="gap-1.5 py-1">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              Fall Term Active
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {profile ? (
              <span>
                Welcome back, <strong className="text-foreground">{profile.first_name} {profile.last_name}</strong> •{" "}
                <span className="capitalize">{getRoleLabel(userRole)}</span>
              </span>
            ) : (
              "Smart Academic Management System • Production Baseline"
            )}
          </p>
        </div>

        {/* Action Buttons based on role */}
        <div className="flex items-center gap-3">
          {(isSuperAdmin || isCollegeAdmin) && (
            <Link
              href="/audit-logs"
              className={buttonVariants({ variant: "outline", size: "sm", className: "gap-2 text-xs" })}
            >
              <Database className="h-4 w-4 text-muted-foreground" />
              Audit Ledger
            </Link>
          )}
          {(isSuperAdmin || isCollegeAdmin) && (
            <Link
              href="/timetable"
              className={buttonVariants({ variant: "default", size: "sm", className: "gap-2 text-xs" })}
            >
              <CalendarDays className="h-4 w-4" />
              Generate Timetable
            </Link>
          )}
          {isFaculty && (
            <Link
              href="/attendance"
              className={buttonVariants({ variant: "default", size: "sm", className: "gap-2 text-xs" })}
            >
              <ScanFace className="h-4 w-4" />
              Start Attendance Session
            </Link>
          )}
          {isStudent && (
            <Link
              href="/timetable"
              className={buttonVariants({ variant: "default", size: "sm", className: "gap-2 text-xs" })}
            >
              <CalendarDays className="h-4 w-4" />
              View Class Schedule
            </Link>
          )}
        </div>
      </div>

      {/* 2. Microservice Real-time Diagnostics Banner (Admins & Faculty) */}
      {!isStudent && (
        <div className="relative overflow-hidden rounded-xl border border-border bg-gradient-to-r from-card via-card to-primary/5 p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3.5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Cpu className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground">
                    Python AI & Optimization Engine
                  </h3>
                  {aiHealth.online ? (
                    <Badge variant="success" className="text-[10px] uppercase tracking-wider">
                      Service Online
                    </Badge>
                  ) : (
                    <Badge variant="warning" className="text-[10px] uppercase tracking-wider">
                      Microservice Standby
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground max-w-2xl">
                  Google OR-Tools CP-SAT scheduler and OpenCV + InsightFace biometric engine are
                  running decoupled with server-to-server security verification.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs">
              <div className="rounded-lg border border-border/80 bg-background/80 px-3 py-2">
                <span className="text-[11px] text-muted-foreground block font-medium">
                  Face Match Threshold
                </span>
                <span className="font-mono font-semibold text-foreground">
                  {aiHealth.data?.calibration.match_threshold ?? "0.65 (Configurable)"}
                </span>
              </div>

              <div className="rounded-lg border border-border/80 bg-background/80 px-3 py-2">
                <span className="text-[11px] text-muted-foreground block font-medium">
                  Review Threshold
                </span>
                <span className="font-mono font-semibold text-foreground">
                  {aiHealth.data?.calibration.review_threshold ?? "0.45 (Configurable)"}
                </span>
              </div>

              <div className="rounded-lg border border-border/80 bg-background/80 px-3 py-2">
                <span className="text-[11px] text-muted-foreground block font-medium">
                  6th Sem RAG Ready
                </span>
                <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                  pgvector Enabled
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. Role-Tailored Operational KPI Cards */}
      {isStudent ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="Current Term"
            value="Semester 5"
            description="Computer Science & Engineering"
            icon={<GraduationCap className="h-5 w-5" />}
          />
          <MetricCard
            title="Class Section"
            value="Section 5-A"
            description="Roll: 24CSE01 • USN: 1MS24CS001"
            icon={<Users className="h-5 w-5" />}
          />
          <MetricCard
            title="Overall Attendance"
            value="92.4%"
            description="Above 75% institutional requirement"
            trend={{ value: "+1.8%", positive: true }}
            icon={<BarChart3 className="h-5 w-5" />}
          />
          <MetricCard
            title="Enrolled Subjects"
            value="6 Courses"
            description="4 Lectures + 2 Practical Labs"
            icon={<BookOpen className="h-5 w-5" />}
          />
        </div>
      ) : isFaculty ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="Department"
            value="CSE"
            description="Computer Science & Engineering"
            icon={<GraduationCap className="h-5 w-5" />}
          />
          <MetricCard
            title="Assigned Subjects"
            value="2 Subjects"
            description="DBMS (CS501) & AI/ML (CS504)"
            icon={<BookOpen className="h-5 w-5" />}
          />
          <MetricCard
            title="Weekly Teaching Load"
            value="14 Hours"
            description="Max configured: 16 hrs/week"
            trend={{ value: "Compliant", positive: true }}
            icon={<Clock className="h-5 w-5" />}
          />
          <MetricCard
            title="Class Average Attendance"
            value="89.1%"
            description="Aggregated across your lectures"
            trend={{ value: "Normal", positive: true }}
            icon={<BarChart3 className="h-5 w-5" />}
          />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="Students Enrolled"
            value={totalStudents !== null && totalStudents !== undefined ? String(totalStudents) : "—"}
            description={`${totalDepartments ?? 0} active departments`}
            trend={{ value: "Master Data Active", positive: true }}
            icon={<GraduationCap className="h-5 w-5" />}
          />
          <MetricCard
            title="Active Faculty"
            value={totalFaculty !== null && totalFaculty !== undefined ? String(totalFaculty) : "—"}
            description="Availability matrix ready"
            trend={{ value: "Verified", positive: true }}
            icon={<Users className="h-5 w-5" />}
          />
          <MetricCard
            title="Classrooms & Labs"
            value={totalClassrooms !== null && totalClassrooms !== undefined ? String(totalClassrooms) : "—"}
            description="Lecture halls & research labs"
            trend={{ value: "Schedulable", positive: true }}
            icon={<DoorOpen className="h-5 w-5" />}
          />
          <MetricCard
            title="Curriculum Subjects"
            value={totalSubjects !== null && totalSubjects !== undefined ? String(totalSubjects) : "—"}
            description="Credit courses configured"
            trend={{ value: "OR-Tools Ready", positive: true }}
            icon={<BookOpen className="h-5 w-5" />}
          />
        </div>
      )}

      {/* 4. Main Content Area */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Module Launchpad (2 cols) */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>
                  {isStudent ? "Academic Services" : isFaculty ? "Teaching Workspace" : "Academic Operations"}
                </CardTitle>
                <CardDescription>
                  {isStudent
                    ? "Your scheduled classes, attendance logs, and notices"
                    : isFaculty
                    ? "Manage class sessions, attendance verification, and schedules"
                    : "Administrative and constraint management modules"}
                </CardDescription>
              </div>
              <Badge variant="outline" className="text-xs">
                Role: <span className="ml-1 capitalize">{userRole.replace("_", " ")}</span>
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Link
              href="/timetable"
              className="group flex flex-col justify-between rounded-xl border border-border/80 bg-background/50 p-4 transition-all hover:border-primary/40 hover:bg-muted/40 hover:shadow-sm"
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    <CalendarDays className="h-5 w-5" />
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <h4 className="mt-3 text-sm font-semibold text-foreground">
                  {isStudent ? "My Academic Timetable" : isFaculty ? "My Teaching Schedule" : "AI Timetable Generator"}
                </h4>
                <p className="mt-1 text-xs text-muted-foreground">
                  {isStudent
                    ? "View your weekly class schedule, assigned rooms, and instructor details."
                    : isFaculty
                    ? "Review your weekly lecture periods, room locations, and lab sessions."
                    : "Google OR-Tools CP-SAT constraint solver for conflict-free institutional schedules."}
                </p>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Badge variant="accent" className="text-[10px]">
                  {isStudent || isFaculty ? "Weekly Grid" : "Constraint Solver"}
                </Badge>
              </div>
            </Link>

            <Link
              href="/attendance"
              className="group flex flex-col justify-between rounded-xl border border-border/80 bg-background/50 p-4 transition-all hover:border-primary/40 hover:bg-muted/40 hover:shadow-sm"
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                    <ScanFace className="h-5 w-5" />
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <h4 className="mt-3 text-sm font-semibold text-foreground">
                  {isStudent ? "My Attendance Records" : isFaculty ? "Facial Attendance Kiosk" : "Biometric Attendance"}
                </h4>
                <p className="mt-1 text-xs text-muted-foreground">
                  {isStudent
                    ? "Detailed subject-wise breakdown of your verified attendance and eligibility status."
                    : isFaculty
                    ? "Launch camera kiosk for live automated face detection and student verification."
                    : "Biometric face verification audit, session tracking, and exception overrides."}
                </p>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Badge variant="success" className="text-[10px]">
                  {isStudent ? "Threshold Check" : "OpenCV + InsightFace"}
                </Badge>
              </div>
            </Link>

            {(isSuperAdmin || isCollegeAdmin) && (
              <Link
                href="/students"
                className="group flex flex-col justify-between rounded-xl border border-border/80 bg-background/50 p-4 transition-all hover:border-primary/40 hover:bg-muted/40 hover:shadow-sm"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                      <GraduationCap className="h-5 w-5" />
                    </div>
                    <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                  <h4 className="mt-3 text-sm font-semibold text-foreground">
                    Student Life-Cycle
                  </h4>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Directory, semester enrollments, sections, and biometric enrollment status.
                  </p>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <Badge variant="secondary" className="text-[10px]">
                    Management
                  </Badge>
                </div>
              </Link>
            )}

            <Link
              href="/analytics"
              className="group flex flex-col justify-between rounded-xl border border-border/80 bg-background/50 p-4 transition-all hover:border-primary/40 hover:bg-muted/40 hover:shadow-sm"
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    <BarChart3 className="h-5 w-5" />
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <h4 className="mt-3 text-sm font-semibold text-foreground">
                  Attendance & Risk Analytics
                </h4>
                <p className="mt-1 text-xs text-muted-foreground">
                  Visual attendance distributions, trend alerts, and below-threshold flags.
                </p>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">
                  Recharts Analytics
                </Badge>
              </div>
            </Link>
          </CardContent>
        </Card>

        {/* Security & Access Profile Card (1 col) */}
        <Card>
          <CardHeader>
            <CardTitle>Session Security</CardTitle>
            <CardDescription>
              Authenticated profile & RBAC policies
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3.5">
            <div className="flex items-start gap-2.5 text-xs">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-foreground block">
                  Active User Role
                </span>
                <span className="text-muted-foreground text-[11px]">
                  {getRoleLabel(userRole)}
                </span>
              </div>
            </div>

            <div className="flex items-start gap-2.5 text-xs">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-foreground block">
                  Server-Side Authorization
                </span>
                <span className="text-muted-foreground text-[11px]">
                  Guarded in Next.js Server Components & Middleware
                </span>
              </div>
            </div>

            <div className="flex items-start gap-2.5 text-xs">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-foreground block">
                  PostgreSQL RLS Enforcement
                </span>
                <span className="text-muted-foreground text-[11px]">
                  Queries evaluated with auth.uid() at database level
                </span>
              </div>
            </div>

            <div className="flex items-start gap-2.5 text-xs">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-foreground block">
                  Biometric Privacy Protection
                </span>
                <span className="text-muted-foreground text-[11px]">
                  Zero cross-student vector exposure
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-border">
              <div className="rounded-lg bg-muted/50 p-3 text-xs flex items-center justify-between">
                <span className="text-muted-foreground">Session Status</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">Authenticated</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
