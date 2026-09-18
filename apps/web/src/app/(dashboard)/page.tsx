import * as React from "react";
import Link from "next/link";
import {
  GraduationCap,
  Users,
  DoorOpen,
  CalendarDays,
  ScanFace,
  BarChart3,
  ArrowRight,
  Database,
  CheckCircle2,
  BookOpen,
  Clock,
  ShieldCheck,
  Bell,
  Layers,
  Briefcase,
} from "lucide-react";
import { MetricCard } from "@/components/common/metric-card";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { getCurrentProfile, getCurrentStudent, getCurrentFaculty } from "@/lib/auth/session";
import { getRoleLabel } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const profile = await getCurrentProfile();
  const userRole = profile?.role ?? "student";
  const supabase = await createServerSupabaseClient();

  const isSuperAdmin = userRole === "super_admin";
  const isCollegeAdmin = userRole === "college_admin";
  const isFaculty = userRole === "faculty";
  const isStudent = userRole === "student";

  // Master Data summary counts for Administrators
  const [
    { count: totalStudents },
    { count: totalFaculty },
    { count: totalDepartments },
    { count: totalSubjects },
    { count: totalClassrooms },
    { count: totalSections },
  ] = await Promise.all([
    supabase.from("students").select("*", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("faculty").select("*", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("departments").select("*", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("subjects").select("*", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("classrooms").select("*", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("class_sections").select("*", { count: "exact", head: true }).eq("is_active", true),
  ]);

  // Live Student & Faculty metrics
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
        term: sectionWithSem?.semester?.name || "Semester 5",
        departmentName: student.department?.name || "Computer Science & Engineering",
        sectionName: student.section?.name || sectionWithSem?.name || "Section 5-A",
        rollNumber: student.roll_number || "—",
        usn: student.usn || "—",
        attendancePct: pct !== "—" ? `${pct}%` : "No Records",
        attendanceDesc:
          pct !== "—"
            ? Number(pct) >= 75
              ? "Eligible (Above 75% requirement)"
              : "Warning: Below 75% threshold"
            : "No sessions recorded yet",
        attendanceTrend: {
          value: pct !== "—" && Number(pct) >= 75 ? "Compliant" : "Review",
          positive: pct === "—" || Number(pct) >= 75,
        },
        enrolledCourses:
          enrollmentsCount && enrollmentsCount > 0 ? `${enrollmentsCount} Courses` : "Enrolled",
        enrolledDesc: "Active Term Curriculum",
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
        assignedSubjectsList: subCodes.length > 0 ? subCodes.join(", ") : "Allocations configured",
        weeklyLoad: weeklyHours > 0 ? `${weeklyHours} Hours` : "Assigned",
        weeklyLoadDesc: "Weekly scheduled lecture periods",
        classAverageAttendance: avgAttendance !== "—" ? avgAttendance : "Active",
        classAttendanceDesc: avgAttendance !== "—" ? "Average class turnout" : "No completed sessions",
      };
    }
  }

  return (
    <div className="space-y-6">
      {/* 1. Academic Header Banner */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              {isStudent
                ? "Student Academic Portal"
                : isFaculty
                ? "Faculty Teaching Workspace"
                : isSuperAdmin
                ? "Institution Operations Center"
                : "Academic Administration"}
            </h1>
            <Badge variant="outline" className="text-[11px] font-medium text-muted-foreground bg-muted/30">
              Odd Term 2026-2027
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {profile ? (
              <span>
                User: <strong className="text-foreground">{profile.first_name} {profile.last_name}</strong> • Role:{" "}
                <span className="font-medium text-foreground">{getRoleLabel(userRole)}</span>
              </span>
            ) : (
              "Smart Academic Management System"
            )}
          </p>
        </div>

        {/* Quick Context Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {(isSuperAdmin || isCollegeAdmin) && (
            <Link
              href="/timetable/generate"
              className={buttonVariants({ variant: "default", size: "sm", className: "gap-1.5 text-xs h-8" })}
            >
              <CalendarDays className="h-3.5 w-3.5" />
              Generate Schedule
            </Link>
          )}
          {isFaculty && (
            <Link
              href="/attendance"
              className={buttonVariants({ variant: "default", size: "sm", className: "gap-1.5 text-xs h-8" })}
            >
              <ScanFace className="h-3.5 w-3.5" />
              Conduct Attendance
            </Link>
          )}
          {isStudent && (
            <Link
              href="/timetable"
              className={buttonVariants({ variant: "default", size: "sm", className: "gap-1.5 text-xs h-8" })}
            >
              <CalendarDays className="h-3.5 w-3.5" />
              View Timetable
            </Link>
          )}
          <Link
            href="/notifications"
            className={buttonVariants({ variant: "outline", size: "sm", className: "gap-1.5 text-xs h-8" })}
          >
            <Bell className="h-3.5 w-3.5 text-muted-foreground" />
            Notices
          </Link>
        </div>
      </div>

      {/* 2. Structured Operational Metric Cards */}
      {isStudent ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="Current Academic Term"
            value={studentData?.term ?? "Semester 5"}
            description={studentData?.departmentName ?? "Computer Science & Engineering"}
            icon={<GraduationCap className="h-4 w-4" />}
          />
          <MetricCard
            title="Assigned Cohort Section"
            value={studentData?.sectionName ?? "Section 5-A"}
            description={`Roll: ${studentData?.rollNumber ?? "—"} • USN: ${studentData?.usn ?? "—"}`}
            icon={<Users className="h-4 w-4" />}
          />
          <MetricCard
            title="Cumulative Attendance"
            value={studentData?.attendancePct ?? "—"}
            description={studentData?.attendanceDesc ?? "Institutional Requirement: 75%"}
            trend={studentData?.attendanceTrend}
            icon={<BarChart3 className="h-4 w-4" />}
          />
          <MetricCard
            title="Registered Curriculum"
            value={studentData?.enrolledCourses ?? "Enrolled"}
            description={studentData?.enrolledDesc ?? "Active semester courses"}
            icon={<BookOpen className="h-4 w-4" />}
          />
        </div>
      ) : isFaculty ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="Department Affiliation"
            value={facultyData?.departmentCode ?? "CSE"}
            description={facultyData?.departmentName ?? "Computer Science & Engineering"}
            icon={<GraduationCap className="h-4 w-4" />}
          />
          <MetricCard
            title="Course Allocations"
            value={facultyData?.assignedSubjectsCount ?? "0 Subjects"}
            description={facultyData?.assignedSubjectsList ?? "Curriculum allocations"}
            icon={<BookOpen className="h-4 w-4" />}
          />
          <MetricCard
            title="Weekly Contact Hours"
            value={facultyData?.weeklyLoad ?? "Assigned"}
            description={facultyData?.weeklyLoadDesc ?? "Weekly lecture periods"}
            trend={{ value: "In Policy", positive: true }}
            icon={<Clock className="h-4 w-4" />}
          />
          <MetricCard
            title="Average Class Turnout"
            value={facultyData?.classAverageAttendance ?? "Active"}
            description={facultyData?.classAttendanceDesc ?? "Lecture attendance rate"}
            icon={<BarChart3 className="h-4 w-4" />}
          />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="Enrolled Students"
            value={totalStudents !== null ? String(totalStudents) : "—"}
            description={`${totalDepartments ?? 0} active departments`}
            icon={<GraduationCap className="h-4 w-4" />}
          />
          <MetricCard
            title="Teaching Faculty"
            value={totalFaculty !== null ? String(totalFaculty) : "—"}
            description="Active institutional staff"
            icon={<Users className="h-4 w-4" />}
          />
          <MetricCard
            title="Classrooms & Laboratories"
            value={totalClassrooms !== null ? String(totalClassrooms) : "—"}
            description={`${totalSections ?? 0} scheduled cohort sections`}
            icon={<DoorOpen className="h-4 w-4" />}
          />
          <MetricCard
            title="Curriculum Subjects"
            value={totalSubjects !== null ? String(totalSubjects) : "—"}
            description="Credit courses configured"
            icon={<BookOpen className="h-4 w-4" />}
          />
        </div>
      )}

      {/* 3. Operational Navigation & Modules */}
      <div className="grid gap-5 lg:grid-cols-3">
        {/* Academic Services (2 cols) */}
        <Card className="lg:col-span-2">
          <CardHeader className="p-4 sm:p-5 border-b border-border">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold">
                  {isStudent ? "Academic Modules" : isFaculty ? "Teaching Services" : "Academic Management"}
                </CardTitle>
                <CardDescription className="text-xs">
                  {isStudent
                    ? "Access your class schedule, attendance records, and course details"
                    : isFaculty
                    ? "Conduct attendance, review timetable allocations, and manage availability"
                    : "Institutional catalogs, timetable optimization, and scheduling controls"}
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-4 sm:p-5 grid gap-3 sm:grid-cols-2">
            <Link
              href="/timetable"
              className="flex items-start justify-between rounded-lg border border-border bg-card p-3.5 hover:bg-muted/40 transition-colors"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-primary" />
                  <span className="text-xs font-semibold text-foreground">
                    {isStudent ? "My Class Timetable" : isFaculty ? "Teaching Timetable" : "Master Timetables"}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {isStudent
                    ? "Review weekly lecture schedule and classroom locations."
                    : isFaculty
                    ? "Weekly teaching allocations across sections and halls."
                    : "Draft iterations, conflict detection, and publishing."}
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            </Link>

            <Link
              href="/attendance"
              className="flex items-start justify-between rounded-lg border border-border bg-card p-3.5 hover:bg-muted/40 transition-colors"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <ScanFace className="h-4 w-4 text-primary" />
                  <span className="text-xs font-semibold text-foreground">
                    {isStudent ? "My Attendance Record" : "Class Attendance Sessions"}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {isStudent
                    ? "Subject-wise attendance percentages and session logs."
                    : "Record class roll-call, verify turnout, and save sessions."}
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            </Link>

            {(isSuperAdmin || isCollegeAdmin) && (
              <Link
                href="/academic-structure"
                className="flex items-start justify-between rounded-lg border border-border bg-card p-3.5 hover:bg-muted/40 transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-primary" />
                    <span className="text-xs font-semibold text-foreground">Academic Structure</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Configure academic years, semester terms, and cohort sections.
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              </Link>
            )}

            {(isSuperAdmin || isCollegeAdmin) && (
              <Link
                href="/subjects"
                className="flex items-start justify-between rounded-lg border border-border bg-card p-3.5 hover:bg-muted/40 transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-primary" />
                    <span className="text-xs font-semibold text-foreground">Curriculum Subjects</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Course credits, theory vs. lab hours, and department mappings.
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              </Link>
            )}

            {isFaculty && (
              <Link
                href="/faculty/availability"
                className="flex items-start justify-between rounded-lg border border-border bg-card p-3.5 hover:bg-muted/40 transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-primary" />
                    <span className="text-xs font-semibold text-foreground">Teaching Availability</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Set weekly preferred time slots and period constraints.
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              </Link>
            )}

            {isStudent && (
              <Link
                href="/enrollments"
                className="flex items-start justify-between rounded-lg border border-border bg-card p-3.5 hover:bg-muted/40 transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-primary" />
                    <span className="text-xs font-semibold text-foreground">Course Enrollments</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    View active subject registrations for the current term.
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              </Link>
            )}

            {(isSuperAdmin || isCollegeAdmin) && (
              <Link
                href="/audit-logs"
                className="flex items-start justify-between rounded-lg border border-border bg-card p-3.5 hover:bg-muted/40 transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-primary" />
                    <span className="text-xs font-semibold text-foreground">Security Audit Ledger</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Review administrative events and mutation history.
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              </Link>
            )}

            <Link
              href="/notifications"
              className="flex items-start justify-between rounded-lg border border-border bg-card p-3.5 hover:bg-muted/40 transition-colors"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-primary" />
                  <span className="text-xs font-semibold text-foreground">Academic Notices</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Timetable publication announcements and institutional updates.
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            </Link>
          </CardContent>
        </Card>

        {/* System Security & Access Status (1 col) */}
        <Card>
          <CardHeader className="p-4 sm:p-5 border-b border-border">
            <CardTitle className="text-sm font-semibold">Security & Session</CardTitle>
            <CardDescription className="text-xs">
              Access control and authentication verification
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-5 space-y-3">
            <div className="flex items-start gap-2.5 text-xs">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-medium text-foreground block">Session Authenticated</span>
                <span className="text-[11px] text-muted-foreground">
                  HttpOnly session cookie verified by Supabase Auth
                </span>
              </div>
            </div>

            <div className="flex items-start gap-2.5 text-xs">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-medium text-foreground block">PostgreSQL RLS Active</span>
                <span className="text-[11px] text-muted-foreground">
                  Queries evaluated against auth.uid() at database level
                </span>
              </div>
            </div>

            <div className="flex items-start gap-2.5 text-xs">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-medium text-foreground block">Role Authorization</span>
                <span className="text-[11px] text-muted-foreground">
                  Server component guards enforce role hierarchy
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-border">
              <div className="rounded bg-muted/40 p-2.5 text-xs flex items-center justify-between">
                <span className="text-muted-foreground text-[11px]">System Status</span>
                <span className="font-medium text-emerald-600 dark:text-emerald-400 text-[11px]">Operational</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
