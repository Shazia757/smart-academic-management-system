"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  GraduationCap,
  CalendarCheck,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  BookOpen,
  Filter,
  Search,
  RefreshCw,
  Camera,
  ShieldCheck,
  AlertCircle,
  Inbox,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { MetricCard } from "@/components/common/metric-card";
import { Student, Profile } from "@/types/database";
import { AttendanceRecord, AttendanceStatus } from "@/types/attendance";
import {
  calculateSubjectWiseAttendance,
  filterStudentHistory,
  formatAttendanceDate,
  formatSessionTimeWindow,
  sanitizeErrorMessage,
} from "@/lib/attendance/attendance-ui-helpers";

interface StudentAttendanceDashboardProps {
  student: Student;
  profile: Profile;
}

export function StudentAttendanceDashboard({
  student,
  profile,
}: StudentAttendanceDashboardProps) {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [summary, setSummary] = useState<{
    total_sessions: number;
    present_count: number;
    late_count: number;
    absent_count: number;
    excused_count: number;
    attendance_percentage: number;
    is_low_attendance: boolean;
  }>({
    total_sessions: 0,
    present_count: 0,
    late_count: 0,
    absent_count: 0,
    excused_count: 0,
    attendance_percentage: 100,
    is_low_attendance: false,
  });

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<AttendanceStatus | "ALL">("ALL");
  const [subjectFilter, setSubjectFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");

  const fetchHistory = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const res = await fetch(`/api/attendance/students/${student.id}/history`);
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to load attendance history");
      }

      setRecords(json.data.records || []);
      if (json.data.summary) {
        setSummary(json.data.summary);
      }
    } catch (err) {
      setError(sanitizeErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [student.id]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Subject-wise stats
  const subjectSummaries = useMemo(() => {
    return calculateSubjectWiseAttendance(records);
  }, [records]);

  // Unique subjects for filter
  const uniqueSubjects = useMemo(() => {
    const map = new Map<string, string>();
    records.forEach((r) => {
      const sess = (r as any).session;
      const sub = sess?.subject || (r as any).subject;
      if (sub?.id && sub?.name) {
        map.set(sub.id, `${sub.code} – ${sub.name}`);
      }
    });
    return Array.from(map.entries()).map(([id, label]) => ({ id, label }));
  }, [records]);

  // Filtered history records
  const filteredHistory = useMemo(() => {
    return filterStudentHistory(records, {
      status: statusFilter,
      subjectId: subjectFilter,
      search: searchQuery,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
    });
  }, [records, statusFilter, subjectFilter, searchQuery, fromDate, toDate]);

  return (
    <div className="space-y-6">
      {/* Student Welcome Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20">
            <GraduationCap className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                My Attendance
              </h1>
              <Badge variant="outline" className="text-xs font-mono">
                {student.roll_number}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Review personal attendance standing, course turnout, and session history records.
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={fetchHistory}
          disabled={isLoading}
          className="gap-1.5 self-start sm:self-auto"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Low Attendance Warning Banner if < 75% */}
      {summary.is_low_attendance && !isLoading && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-400 flex items-start gap-3 animate-in fade-in">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-semibold text-sm">Attendance Shortage Warning</h4>
            <p className="text-xs mt-0.5 leading-relaxed opacity-90">
              Your overall attendance is currently {summary.attendance_percentage}%, which is below
              the institutional minimum threshold of 75.0%. Please contact your course coordinator
              to avoid exam eligibility restrictions.
            </p>
          </div>
        </div>
      )}

      {/* Primary KPI Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Attendance Rate Card */}
        <Card
          className={`col-span-2 sm:col-span-1 border-2 ${
            summary.is_low_attendance
              ? "border-rose-500/40 bg-rose-500/5"
              : "border-emerald-500/40 bg-emerald-500/5"
          }`}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Aggregate Turnout
              </span>
              {summary.is_low_attendance ? (
                <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                  Critical
                </Badge>
              ) : (
                <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 text-[10px] px-1.5 py-0">
                  Good
                </Badge>
              )}
            </div>
            <div
              className={`text-3xl font-extrabold mt-2 ${
                summary.is_low_attendance
                  ? "text-rose-600 dark:text-rose-400"
                  : "text-emerald-600 dark:text-emerald-400"
              }`}
            >
              {summary.attendance_percentage}%
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Minimum 75% required
            </p>
          </CardContent>
        </Card>

        <MetricCard
          title="Total Classes"
          value={summary.total_sessions}
          description="Conducted to date"
          icon={<CalendarCheck className="w-5 h-5" />}
        />

        <MetricCard
          title="Present"
          value={summary.present_count}
          description="Regular attendance"
          icon={<CheckCircle2 className="w-5 h-5 text-emerald-600" />}
        />

        <MetricCard
          title="Late"
          value={summary.late_count}
          description="Recorded after start"
          icon={<Clock className="w-5 h-5 text-amber-600" />}
        />

        <MetricCard
          title="Absent"
          value={summary.absent_count}
          description="Missed sessions"
          icon={<XCircle className="w-5 h-5 text-rose-600" />}
        />
      </div>

      {/* Subject-Wise Turnout Breakdown */}
      {subjectSummaries.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-primary" />
            Course-Wise Attendance Breakdown
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {subjectSummaries.map((sub) => (
              <Card key={sub.subject_id} className="border-border/70 hover:shadow-sm transition-all">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-muted/60 text-muted-foreground">
                        {sub.subject_code}
                      </span>
                      <h4 className="font-semibold text-sm text-foreground mt-1 truncate max-w-[220px]">
                        {sub.subject_name}
                      </h4>
                    </div>
                    <div
                      className={`text-lg font-bold ${
                        sub.is_low_attendance
                          ? "text-rose-600 dark:text-rose-400"
                          : "text-emerald-600 dark:text-emerald-400"
                      }`}
                    >
                      {sub.percentage}%
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        sub.is_low_attendance ? "bg-rose-500" : "bg-emerald-500"
                      }`}
                      style={{ width: `${Math.min(sub.percentage, 100)}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                    <span>
                      Attended: <strong className="text-foreground">{sub.attended_classes}</strong> / {sub.total_classes}
                    </span>
                    {sub.is_low_attendance ? (
                      <span className="text-rose-600 font-medium">Shortage</span>
                    ) : (
                      <span className="text-emerald-600 font-medium">Eligible</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Filter Bar for Attendance History */}
      <Card className="border-border/70">
        <CardContent className="p-3.5 space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search history by subject, remarks..."
                className="w-full h-8 pl-8 pr-3 rounded-lg border border-border/70 bg-background text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              {(["ALL", "PRESENT", "LATE", "ABSENT", "EXCUSED"] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all whitespace-nowrap ${
                    statusFilter === st
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-muted/50 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          {uniqueSubjects.length > 0 && (
            <div className="pt-2 border-t border-border/40 flex flex-wrap gap-3">
              <select
                value={subjectFilter}
                onChange={(e) => setSubjectFilter(e.target.value)}
                className="h-8 px-2.5 rounded-md border border-border/60 bg-background text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="">All Subjects</option>
                {uniqueSubjects.map((sub) => (
                  <option key={sub.id} value={sub.id}>
                    {sub.label}
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-2 text-xs text-muted-foreground ml-auto">
                <span>From:</span>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="h-8 px-2 rounded border border-border/60 bg-background text-xs"
                />
                <span>To:</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="h-8 px-2 rounded border border-border/60 bg-background text-xs"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* History Log Table */}
      <Card className="border-border/70 overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="p-12 flex flex-col items-center justify-center gap-3">
            <RefreshCw className="w-7 h-7 text-primary animate-spin" />
            <p className="text-sm text-muted-foreground">Loading attendance history...</p>
          </div>
        ) : filteredHistory.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <Inbox className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm font-semibold">No attendance records found</p>
            <p className="text-xs mt-1">
              {records.length === 0
                ? "No classes have recorded your attendance yet."
                : "No records match the active filter criteria."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/40 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border/70">
                <tr>
                  <th className="py-3 px-4">Session Date & Time</th>
                  <th className="py-3 px-4">Subject</th>
                  <th className="py-3 px-4">Section</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Verification</th>
                  <th className="py-3 px-4">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredHistory.map((rec) => {
                  const sess = (rec as any).session;
                  const subj = sess?.subject || (rec as any).subject;
                  const sec = sess?.section || (rec as any).section;

                  return (
                    <tr key={rec.id} className="hover:bg-muted/20 transition-colors">
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-semibold text-foreground">
                          {formatAttendanceDate(sess?.session_date || rec.marked_at)}
                        </div>
                        {sess?.start_time && (
                          <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <Clock className="w-3 h-3" />
                            {formatSessionTimeWindow(sess.start_time, sess.end_time)}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-semibold text-foreground">{subj?.name || "Subject"}</div>
                        <div className="text-xs text-muted-foreground font-mono">{subj?.code}</div>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap text-xs text-muted-foreground">
                        Section {sec?.name || "A"}
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        {rec.status === "PRESENT" && (
                          <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 font-semibold gap-1 text-xs">
                            <CheckCircle2 className="w-3 h-3" />
                            PRESENT
                          </Badge>
                        )}
                        {rec.status === "LATE" && (
                          <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/20 font-semibold gap-1 text-xs">
                            <Clock className="w-3 h-3" />
                            LATE
                          </Badge>
                        )}
                        {rec.status === "ABSENT" && (
                          <Badge
                            variant="destructive"
                            className="bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/20 font-semibold gap-1 text-xs"
                          >
                            <XCircle className="w-3 h-3" />
                            ABSENT
                          </Badge>
                        )}
                        {rec.status === "EXCUSED" && (
                          <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-400 border border-blue-500/20 font-semibold gap-1 text-xs">
                            <AlertCircle className="w-3 h-3" />
                            EXCUSED
                          </Badge>
                        )}
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap text-xs">
                        {rec.recognition_method === "FACIAL_RECOGNITION" ? (
                          <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                            <Camera className="w-3.5 h-3.5" />
                            Face Match {rec.confidence_score ? `(${Math.round(rec.confidence_score * 100)}%)` : ""}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-[11px]">Manual Record</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-xs text-muted-foreground max-w-[200px] truncate">
                        {rec.remarks || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
