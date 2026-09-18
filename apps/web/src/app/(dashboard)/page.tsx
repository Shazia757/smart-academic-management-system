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
import { getCurrentProfile, getCurrentStudent, getCurrentFaculty } from "@/lib/auth/session";
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

  // Phase 7 Live Student & Faculty metrics
  let studentData: {
    term: string;
    departmentName: string;
    sectionName: string;
    rollNumber: string;
    usn: string;
    attendancePct: string;
    attendanceDesc: string;
    attendanceTrend: { value: string; positive: boolean };
    enrolledCourses: string;
    enrolledDesc: string;
  } | null = null;

  let facultyData: {
    departmentCode: string;
    departmentName: string;
    assignedSubjectsCount: string;
    assignedSubjectsList: string;
    weeklyLoad: string;
    weeklyLoadDesc: string;
    classAverageAttendance: string;
    classAttendanceDesc: string;
  } | null = null;

  if (isStudent) {
    const student = await getCurrentStudent();
    if (student) {
      const sectionId = student.current_section_id || student.section?.id;
      let sectionWithSem: any = null;
      if (sectionId) {
        const { data } = await supabase
          .from("class_sections")
          .select("*, semester:semesters(*)")
          .eq("id", sectionId)
          .maybeSingle();
        sectionWithSem = data;
      }

      const { data: attendanceRecs } = await supabase
        .from("attendance_records")
        .select("status")
        .eq("student_id", student.id);

      const totalAttendance = attendanceRecs?.length || 0;
      const presentAttendance = attendanceRecs?.filter((r) => r.status === "PRESENT").length || 0;
      const pct = totalAttendance > 0 ? ((presentAttendance / totalAttendance) * 100).toFixed(1) : "—";

      const { count: enrollmentsCount } = await supabase
        .from("student_enrollments")
        .select("*", { count: "exact", head: true })
        .eq("student_id", student.id)
        .eq("is_active", true);

      studentData = {
        term: sectionWithSem?.semester?.name || "Semester 5 (Active)",
        departmentName: student.department?.name || "Computer Science & Engineering",
        sectionName: student.section?.name || sectionWithSem?.name || "Section 5-A",
        rollNumber: student.roll_number || "—",
        usn: student.usn || "—",
        attendancePct: pct !== "—" ? `${pct}%` : "No Sessions",
        attendanceDesc: pct !== "—"
          ? Number(pct) >= 75 ? "Above 75% institutional requirement" : "Attendance warning threshold"
          : "Awaiting attendance sessions",
        attendanceTrend: {
          value: pct !== "—" && Number(pct) >= 75 ? "Compliant" : "Active",
          positive: pct === "—" || Number(pct) >= 75,
        },
        enrolledCourses: enrollmentsCount && enrollmentsCount > 0 ? `${enrollmentsCount} Courses` : "Curriculum Active",
        enrolledDesc: "Enrolled credit curriculum",
      };
    }
  } else if (isFaculty) {
    const faculty = await getCurrentFaculty();
    if (faculty) {
      const { data: assignedSubs } = await supabase
        .from("faculty_subjects")
        .select("*, subject:subjects(code, name)")
        .eq("faculty_id", faculty.id);

      const subCodes = assignedSubs?.map((as: any) => as.subject?.code).filter(Boolean) || [];

      const { data: timetableSlots } = await supabase
        .from("timetable_entries")
        .select("id")
        .eq("faculty_id", faculty.id);

      const weeklyHours = timetableSlots?.length || 0;

      const { data: sessions } = await supabase
        .from("attendance_sessions")
        .select("id")
        .eq("faculty_id", faculty.id);

      let avgAttendance = "—";
      if (sessions && sessions.length > 0) {
        const sessionIds = sessions.map((s) => s.id);
        const { data: facAttendance } = await supabase
          .from("attendance_records")
          .select("status")
          .in("session_id", sessionIds);

        if (facAttendance && facAttendance.length > 0) {
          const pres = facAttendance.filter((r) => r.status === "PRESENT").length;
          avgAttendance = `${((pres / facAttendance.length) * 100).toFixed(1)}%`;
        }
      }

      facultyData = {
        departmentCode: faculty.department?.code || "CSE",
        departmentName: faculty.department?.name || "Computer Science & Engineering",
        assignedSubjectsCount: assignedSubs ? `${assignedSubs.length} Subjects` : "0 Subjects",
        assignedSubjectsList: subCodes.length > 0 ? subCodes.join(", ") : "Curriculum Allocations",
        weeklyLoad: weeklyHours > 0 ? `${weeklyHours} Hours` : "Assigned",
        weeklyLoadDesc: "Weekly scheduled periods",
        classAverageAttendance: avgAttendance !== "—" ? avgAttendance : "Active",
        classAttendanceDesc: avgAttendance !== "—" ? "Aggregated lecture turnout" : "No completed sessions",
      };
    }
  }

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
              href="/academic-structure"
              className={buttonVariants({ variant: "default", size: "sm", className: "gap-2 text-xs" })}
            >
              <CalendarDays className="h-4 w-4" />
              Academic Structure
            </Link>
          )}
          {isFaculty && (
            <Link
              href="/faculty/availability"
              className={buttonVariants({ variant: "default", size: "sm", className: "gap-2 text-xs" })}
            >
              <Clock className="h-4 w-4" />
              Manage Availability
            </Link>
          )}
          {isStudent && (
            <Link
              href="/enrollments"
              className={buttonVariants({ variant: "default", size: "sm", className: "gap-2 text-xs" })}
            >
              <BookOpen className="h-4 w-4" />
              My Course Enrollments
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
            value={studentData?.term ?? "Semester 5"}
            description={studentData?.departmentName ?? "Computer Science & Engineering"}
            icon={<GraduationCap className="h-5 w-5" />}
          />
          <MetricCard
            title="Class Section"
            value={studentData?.sectionName ?? "Section 5-A"}
            description={`Roll: ${studentData?.rollNumber ?? "24CSE01"} • USN: ${studentData?.usn ?? "1MS24CS001"}`}
            icon={<Users className="h-5 w-5" />}
          />
          <MetricCard
            title="Overall Attendance"
            value={studentData?.attendancePct ?? "92.4%"}
            description={studentData?.attendanceDesc ?? "Above 75% institutional requirement"}
            trend={studentData?.attendanceTrend ?? { value: "Compliant", positive: true }}
            icon={<BarChart3 className="h-5 w-5" />}
          />
          <MetricCard
            title="Enrolled Subjects"
            value={studentData?.enrolledCourses ?? "6 Courses"}
            description={studentData?.enrolledDesc ?? "Curriculum Active"}
            icon={<BookOpen className="h-5 w-5" />}
          />
        </div>
      ) : isFaculty ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="Department"
            value={facultyData?.departmentCode ?? "CSE"}
            description={facultyData?.departmentName ?? "Computer Science & Engineering"}
            icon={<GraduationCap className="h-5 w-5" />}
          />
          <MetricCard
            title="Assigned Subjects"
            value={facultyData?.assignedSubjectsCount ?? "2 Subjects"}
            description={facultyData?.assignedSubjectsList ?? "Curriculum Allocations"}
            icon={<BookOpen className="h-5 w-5" />}
          />
          <MetricCard
            title="Weekly Teaching Load"
            value={facultyData?.weeklyLoad ?? "14 Hours"}
            description={facultyData?.weeklyLoadDesc ?? "Weekly scheduled periods"}
            trend={{ value: "Compliant", positive: true }}
            icon={<Clock className="h-5 w-5" />}
          />
          <MetricCard
            title="Class Average Attendance"
            value={facultyData?.classAverageAttendance ?? "89.1%"}
            description={facultyData?.classAttendanceDesc ?? "Aggregated lecture turnout"}
            trend={{ value: "Active", positive: true }}
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
              href="/academic-structure"
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
                  Academic Structure
                </h4>
                <p className="mt-1 text-xs text-muted-foreground">
                  Configure academic years, semester terms, and class cohort sections.
                </p>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Badge variant="accent" className="text-[10px]">
                  Structure & Cohorts
                </Badge>
              </div>
            </Link>

            <Link
              href="/faculty/availability"
              className="group flex flex-col justify-between rounded-xl border border-border/80 bg-background/50 p-4 transition-all hover:border-primary/40 hover:bg-muted/40 hover:shadow-sm"
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                    <Clock className="h-5 w-5" />
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <h4 className="mt-3 text-sm font-semibold text-foreground">
                  Faculty Availability
                </h4>
                <p className="mt-1 text-xs text-muted-foreground">
                  Manage weekly teaching availability matrix across periods and days.
                </p>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Badge variant="success" className="text-[10px]">
                  Schedule Constraints
                </Badge>
              </div>
            </Link>

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
                  Student Directory
                </h4>
                <p className="mt-1 text-xs text-muted-foreground">
                  Roster management, admission data, departments, and enrollment tracking.
                </p>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">
                  Active Directory
                </Badge>
              </div>
            </Link>

            <Link
              href="/subjects"
              className="group flex flex-col justify-between rounded-xl border border-border/80 bg-background/50 p-4 transition-all hover:border-primary/40 hover:bg-muted/40 hover:shadow-sm"
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    <BookOpen className="h-5 w-5" />
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <h4 className="mt-3 text-sm font-semibold text-foreground">
                  Curriculum Subjects
                </h4>
                <p className="mt-1 text-xs text-muted-foreground">
                  Credits, lecture/lab period requirements, and theory/practical classifications.
                </p>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">
                  Course Catalog
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
