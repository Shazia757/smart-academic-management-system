"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  CalendarDays,
  Plus,
  RefreshCw,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Clock,
  BookOpen,
  Users,
  DoorOpen,
  ArrowRight,
  AlertCircle,
  Inbox,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { MetricCard } from "@/components/common/metric-card";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { CreateSessionDialog } from "./create-session-dialog";
import {
  AcademicYear,
  ClassSection,
  Subject,
  Faculty,
  Classroom,
  Profile,
} from "@/types/database";
import { AttendanceSession, AttendanceSessionStatus } from "@/types/attendance";
import {
  filterAttendanceSessions,
  formatAttendanceDate,
  formatSessionTimeWindow,
  sanitizeErrorMessage,
} from "@/lib/attendance/attendance-ui-helpers";

interface FacultyAttendanceDashboardProps {
  academicYears: AcademicYear[];
  classSections: ClassSection[];
  subjects: Subject[];
  facultyList: Faculty[];
  classrooms?: Classroom[];
  currentFaculty?: Faculty | null;
  profile: Profile;
  isAdmin: boolean;
}

export function FacultyAttendanceDashboard({
  academicYears,
  classSections,
  subjects,
  facultyList,
  classrooms = [],
  currentFaculty,
  profile,
  isAdmin,
}: FacultyAttendanceDashboardProps) {
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter state
  const [statusFilter, setStatusFilter] = useState<AttendanceSessionStatus | "ALL">("ALL");
  const [sectionFilter, setSectionFilter] = useState<string>("");
  const [subjectFilter, setSubjectFilter] = useState<string>("");
  const [yearFilter, setYearFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Dialog states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [actionSession, setActionSession] = useState<{
    id: string;
    action: "close" | "cancel";
    title: string;
  } | null>(null);

  // Fetch sessions from API
  const fetchSessions = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (statusFilter && statusFilter !== "ALL") params.set("status", statusFilter);
      if (sectionFilter) params.set("section_id", sectionFilter);
      if (subjectFilter) params.set("subject_id", subjectFilter);
      if (yearFilter) params.set("academic_year_id", yearFilter);

      const res = await fetch(`/api/attendance/sessions?${params.toString()}`);
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to load attendance sessions");
      }

      setSessions(json.data || []);
    } catch (err) {
      setError(sanitizeErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, sectionFilter, subjectFilter, yearFilter]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Client-side instant query filtering
  const filteredSessions = useMemo(() => {
    return filterAttendanceSessions(sessions, {
      status: statusFilter,
      sectionId: sectionFilter,
      subjectId: subjectFilter,
      academicYearId: yearFilter,
      search: searchQuery,
    });
  }, [sessions, statusFilter, sectionFilter, subjectFilter, yearFilter, searchQuery]);

  // Aggregate metrics
  const stats = useMemo(() => {
    const total = sessions.length;
    const open = sessions.filter((s) => s.status === "OPEN").length;
    const closed = sessions.filter((s) => s.status === "CLOSED").length;
    const cancelled = sessions.filter((s) => s.status === "CANCELLED").length;
    return { total, open, closed, cancelled };
  }, [sessions]);

  // Handle session status mutation (close or cancel)
  const handleConfirmAction = async () => {
    if (!actionSession) return;
    const { id, action } = actionSession;

    const res = await fetch(`/api/attendance/sessions/${id}/${action}`, {
      method: "POST",
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || `Failed to ${action} session`);
    }

    // Refresh list
    await fetchSessions();
  };

  const handleSessionCreated = (newSession: AttendanceSession) => {
    setSessions((prev) => [newSession, ...prev]);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20">
            <CalendarDays className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Attendance Management
            </h1>
            <p className="text-sm text-muted-foreground">
              Conduct, track, and review class attendance sessions for your academic cohorts.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchSessions}
            disabled={isLoading}
            className="gap-1.5"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => setIsCreateOpen(true)}
            className="gap-1.5 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            New Session
          </Button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          title="Total Sessions"
          value={stats.total}
          description="Academic period sessions"
          icon={<CalendarDays className="w-5 h-5" />}
        />
        <MetricCard
          title="Active Sessions"
          value={stats.open}
          description="Ready for marking"
          icon={<Clock className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />}
          trend={{ value: `${stats.open} active`, positive: stats.open > 0 }}
        />
        <MetricCard
          title="Completed"
          value={stats.closed}
          description="Marked & finalized"
          icon={<CheckCircle2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />}
        />
        <MetricCard
          title="Cancelled"
          value={stats.cancelled}
          description="Discontinued sessions"
          icon={<XCircle className="w-5 h-5 text-muted-foreground" />}
        />
      </div>

      {/* Filters & Search Control Bar */}
      <Card className="border-border/80 shadow-card">
        <CardContent className="p-4 sm:p-5 space-y-3.5">
          <div className="flex flex-col md:flex-row gap-3">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by subject code, name, section, or faculty..."
                className="w-full h-10 pl-10 pr-3 rounded-xl border border-border/80 bg-card text-sm placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary shadow-subtle"
              />
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-1.5 bg-muted/40 p-1 rounded-xl border border-border/80">
              {(["ALL", "OPEN", "CLOSED", "CANCELLED"] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                    statusFilter === st
                      ? "bg-card text-foreground shadow-xs border border-border/80"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          {/* Secondary Dropdown Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-border/60">
            <select
              value={sectionFilter}
              onChange={(e) => setSectionFilter(e.target.value)}
              className="w-full h-10 px-3 rounded-xl border border-border/80 bg-card text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 shadow-subtle"
            >
              <option value="">All Class Sections</option>
              {classSections.map((sec) => (
                <option key={sec.id} value={sec.id}>
                  Section {sec.name} {sec.code ? `(${sec.code})` : ""}
                </option>
              ))}
            </select>

            <select
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
              className="w-full h-10 px-3 rounded-xl border border-border/80 bg-card text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 shadow-subtle"
            >
              <option value="">All Subjects</option>
              {subjects.map((sub) => (
                <option key={sub.id} value={sub.id}>
                  {sub.code} – {sub.name}
                </option>
              ))}
            </select>

            <select
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              className="w-full h-8 px-2.5 rounded-md border border-border/60 bg-background text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="">All Academic Years</option>
              {academicYears.map((y) => (
                <option key={y.id} value={y.id}>
                  Academic Year {y.name}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Error Banner with Retry */}
      {error && (
        <div className="flex items-center justify-between p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-sm">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
          <Button variant="outline" size="sm" onClick={fetchSessions}>
            Retry
          </Button>
        </div>
      )}

      {/* Sessions List Table */}
      <Card className="border-border/70 overflow-hidden">
        {isLoading ? (
          <div className="p-12 flex flex-col items-center justify-center gap-3">
            <RefreshCw className="w-7 h-7 text-primary animate-spin" />
            <p className="text-sm text-muted-foreground">Loading attendance sessions...</p>
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="p-12 flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 rounded-2xl bg-muted/50 flex items-center justify-center text-muted-foreground mb-3">
              <Inbox className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-foreground">No sessions found</h3>
            <p className="text-xs text-muted-foreground max-w-sm mt-1 mb-4">
              {sessions.length === 0
                ? "No attendance sessions have been created yet. Click 'New Session' to start tracking attendance."
                : "No sessions matched your filter criteria. Try adjusting your filters or search terms."}
            </p>
            {sessions.length === 0 && (
              <Button size="sm" onClick={() => setIsCreateOpen(true)} className="gap-1.5">
                <Plus className="w-4 h-4" />
                Create Session
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/40 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border/70">
                <tr>
                  <th className="py-3 px-4">Date & Time</th>
                  <th className="py-3 px-4">Course & Section</th>
                  <th className="py-3 px-4">Faculty</th>
                  <th className="py-3 px-4">Classroom</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredSessions.map((session) => (
                  <tr
                    key={session.id}
                    className="hover:bg-muted/20 transition-colors group"
                  >
                    {/* Date & Time */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="font-semibold text-foreground">
                        {formatAttendanceDate(session.session_date)}
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Clock className="w-3 h-3" />
                        {formatSessionTimeWindow(session.start_time, session.end_time)}
                      </div>
                    </td>

                    {/* Course & Section */}
                    <td className="py-3.5 px-4">
                      <div className="font-medium text-foreground flex items-center gap-1.5">
                        <BookOpen className="w-4 h-4 text-primary shrink-0" />
                        <span className="font-semibold">{session.subject?.code}</span> –{" "}
                        <span className="truncate max-w-[200px]">{session.subject?.name}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Section <span className="font-medium text-foreground">{session.section?.name}</span>
                        {session.academic_year ? ` • AY ${session.academic_year.name}` : ""}
                      </div>
                    </td>

                    {/* Faculty */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="text-xs text-foreground font-medium">
                        {session.faculty?.profile?.first_name
                          ? `${session.faculty.profile.first_name} ${session.faculty.profile.last_name || ""}`
                          : session.faculty?.employee_id || "Assigned Faculty"}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {session.faculty?.designation || "Instructor"}
                      </div>
                    </td>

                    {/* Classroom */}
                    <td className="py-3.5 px-4 whitespace-nowrap text-xs text-muted-foreground">
                      {session.classroom ? (
                        <span className="flex items-center gap-1 text-foreground">
                          <DoorOpen className="w-3.5 h-3.5 text-muted-foreground" />
                          {session.classroom.room_number}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/60">—</span>
                      )}
                    </td>

                    {/* Status Badge */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {session.status === "OPEN" ? (
                        <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 font-semibold gap-1 text-xs px-2.5 py-0.5">
                          <Clock className="w-3 h-3" />
                          OPEN
                        </Badge>
                      ) : session.status === "CLOSED" ? (
                        <Badge
                          variant="secondary"
                          className="bg-muted text-muted-foreground border border-border/70 font-semibold gap-1 text-xs px-2.5 py-0.5"
                        >
                          <Lock className="w-3 h-3" />
                          CLOSED
                        </Badge>
                      ) : (
                        <Badge
                          variant="destructive"
                          className="bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/20 font-semibold gap-1 text-xs px-2.5 py-0.5"
                        >
                          <XCircle className="w-3 h-3" />
                          CANCELLED
                        </Badge>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Link href={`/attendance/sessions/${session.id}`}>
                          <Button
                            variant={session.status === "OPEN" ? "default" : "outline"}
                            size="sm"
                            className="h-8 text-xs gap-1"
                          >
                            {session.status === "OPEN" ? "Mark Attendance" : "View Details"}
                            <ArrowRight className="w-3.5 h-3.5" />
                          </Button>
                        </Link>

                        {session.status === "OPEN" && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setActionSession({
                                  id: session.id,
                                  action: "close",
                                  title: "Close Session",
                                })
                              }
                              className="h-8 text-xs text-muted-foreground hover:text-foreground"
                            >
                              Close
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setActionSession({
                                  id: session.id,
                                  action: "cancel",
                                  title: "Cancel Session",
                                })
                              }
                              className="h-8 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-500/10"
                            >
                              Cancel
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Create Session Dialog */}
      <CreateSessionDialog
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSessionCreated={handleSessionCreated}
        academicYears={academicYears}
        classSections={classSections}
        subjects={subjects}
        facultyList={facultyList}
        classrooms={classrooms}
        currentFaculty={currentFaculty}
        isAdmin={isAdmin}
      />

      {/* Status Transition Confirm Dialog */}
      {actionSession && (
        <ConfirmDialog
          open={!!actionSession}
          onClose={() => setActionSession(null)}
          onConfirm={handleConfirmAction}
          title={actionSession.title}
          description={
            actionSession.action === "close"
              ? "Are you sure you want to close this session? Closing the session finalizes attendance and locks all records from further modification."
              : "Are you sure you want to cancel this session? Cancelled sessions cannot receive attendance records."
          }
          confirmText={actionSession.action === "close" ? "Yes, Close Session" : "Yes, Cancel Session"}
          isDestructive={actionSession.action === "cancel"}
        />
      )}
    </div>
  );
}
