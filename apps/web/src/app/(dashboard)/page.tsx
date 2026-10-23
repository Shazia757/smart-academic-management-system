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
      <div className="rounded-2xl border border-border/80 bg-card p-5 sm:p-6 shadow-card flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              {isStudent
                ? "Student Academic Portal"
                : isFaculty
                  ? "Faculty Teaching Workspace"
                  : isSuperAdmin
                    ? "Institution Operations Center"
                    : "Academic Administration"}
            </h1>
            <Badge variant="outline" className="text-[11px] font-semibold text-primary bg-primary/10 border-primary/20 py-0.5 px-2.5 rounded-full">
              Odd Term 2026-2027
            </Badge>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground font-medium">
            {profile ? (
              <span>
                User: <strong className="text-foreground">{profile.first_name} {profile.last_name}</strong> • Role:{" "}
                <span className="font-semibold text-primary">{getRoleLabel(userRole)}</span>
              </span>
            ) : (
              "Smart Academic Management System"
            )}
          </p>
        </div>

        {/* Quick Context Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          {(isSuperAdmin || isCollegeAdmin) && (
            <Link
              href="/timetable/generate"
              className={buttonVariants({ variant: "default", size: "sm", className: "gap-2 text-xs h-9 rounded-xl shadow-xs" })}
            >
              <CalendarDays className="h-4 w-4" />
              Generate Schedule
            </Link>
          )}
          {isFaculty && (
            <Link
              href="/attendance"
              className={buttonVariants({ variant: "default", size: "sm", className: "gap-2 text-xs h-9 rounded-xl shadow-xs" })}
            >
              <ScanFace className="h-4 w-4" />
              Conduct Attendance
            </Link>
          )}
          {isStudent && (
            <Link
              href="/timetable"
              className={buttonVariants({ variant: "default", size: "sm", className: "gap-2 text-xs h-9 rounded-xl shadow-xs" })}
            >
              <CalendarDays className="h-4 w-4" />
              View Timetable
            </Link>
          )}
          <Link
            href="/notifications"
            className={buttonVariants({ variant: "outline", size: "sm", className: "gap-2 text-xs h-9 rounded-xl shadow-subtle" })}
          >
            <Bell className="h-4 w-4 text-muted-foreground" />
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

          <CardContent className="p-4 sm:p-6 grid gap-3 sm:grid-cols-2">
            <Link
              href="/timetable"
              className="flex items-start justify-between rounded-xl border border-border/80 bg-card p-4 hover:border-primary/40 hover:bg-muted/30 shadow-subtle hover:shadow-card transition-all duration-150"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                    <CalendarDays className="h-4 w-4" />
                  </div>
                  <span className="text-xs font-bold text-foreground">
                    {isStudent ? "My Class Timetable" : isFaculty ? "Teaching Timetable" : "Master Timetables"}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground pt-0.5">
                  {isStudent
                    ? "Review weekly lecture schedule and classroom locations."
                    : isFaculty
                      ? "Weekly teaching allocations across sections and halls."
                      : "Draft iterations, conflict detection, and publishing."}
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
            </Link>

            <Link
              href="/attendance"
              className="flex items-start justify-between rounded-xl border border-border/80 bg-card p-4 hover:border-primary/40 hover:bg-muted/30 shadow-subtle hover:shadow-card transition-all duration-150"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    <ScanFace className="h-4 w-4" />
                  </div>
                  <span className="text-xs font-bold text-foreground">
                    {isStudent ? "My Attendance Record" : "Class Attendance Sessions"}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground pt-0.5">
                  {isStudent
                    ? "Subject-wise attendance percentages and session logs."
                    : "Record class roll-call, verify turnout, and save sessions."}
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
            </Link>

            {(isSuperAdmin || isCollegeAdmin) && (
              <Link
                href="/academic-structure"
                className="flex items-start justify-between rounded-xl border border-border/80 bg-card p-4 hover:border-primary/40 hover:bg-muted/30 shadow-subtle hover:shadow-card transition-all duration-150"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                      <Layers className="h-4 w-4" />
                    </div>
                    <span className="text-xs font-bold text-foreground">Academic Structure</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground pt-0.5">
                    Configure academic years, semester terms, and cohort sections.
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
              </Link>
            )}

            {(isSuperAdmin || isCollegeAdmin) && (
              <Link
                href="/subjects"
                className="flex items-start justify-between rounded-xl border border-border/80 bg-card p-4 hover:border-primary/40 hover:bg-muted/30 shadow-subtle hover:shadow-card transition-all duration-150"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                      <BookOpen className="h-4 w-4" />
                    </div>
                    <span className="text-xs font-bold text-foreground">Curriculum Subjects</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground pt-0.5">
                    Course credits, theory vs. lab hours, and department mappings.
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
              </Link>
            )}

            {isFaculty && (
              <Link
                href="/faculty/availability"
                className="flex items-start justify-between rounded-xl border border-border/80 bg-card p-4 hover:border-primary/40 hover:bg-muted/30 shadow-subtle hover:shadow-card transition-all duration-150"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                      <Clock className="h-4 w-4" />
                    </div>
                    <span className="text-xs font-bold text-foreground">Teaching Availability</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground pt-0.5">
                    Set weekly preferred time slots and period constraints.
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
              </Link>
            )}

            {isStudent && (
              <Link
                href="/enrollments"
                className="flex items-start justify-between rounded-xl border border-border/80 bg-card p-4 hover:border-primary/40 hover:bg-muted/30 shadow-subtle hover:shadow-card transition-all duration-150"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                      <BookOpen className="h-4 w-4" />
                    </div>
                    <span className="text-xs font-bold text-foreground">Course Enrollments</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground pt-0.5">
                    View active subject registrations for the current term.
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
              </Link>
            )}

            {(isSuperAdmin || isCollegeAdmin) && (
              <Link
                href="/audit-logs"
                className="flex items-start justify-between rounded-xl border border-border/80 bg-card p-4 hover:border-primary/40 hover:bg-muted/30 shadow-subtle hover:shadow-card transition-all duration-150"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                      <Database className="h-4 w-4" />
                    </div>
                    <span className="text-xs font-bold text-foreground">Security Audit Ledger</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground pt-0.5">
                    Review administrative events and mutation history.
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
              </Link>
            )}

            <Link
              href="/notifications"
              className="flex items-start justify-between rounded-xl border border-border/80 bg-card p-4 hover:border-primary/40 hover:bg-muted/30 shadow-subtle hover:shadow-card transition-all duration-150"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-accent text-accent-foreground">
                    <Bell className="h-4 w-4" />
                  </div>
                  <span className="text-xs font-bold text-foreground">Academic Notices</span>
                </div>
                <p className="text-[11px] text-muted-foreground pt-0.5">
                  Timetable publication announcements and institutional updates.
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
            </Link>
          </CardContent>
        </Card>


      </div>
    </div>
  );
}
