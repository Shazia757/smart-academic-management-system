"use client";

import React, { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Clock,
  BookOpen,
  DoorOpen,
  User,
  Users,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Lock,
  Save,
  CheckCheck,
  Search,
  Camera,
  FileSpreadsheet,
  Edit3,
  Loader2,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import {
  AttendanceSession,
  AttendanceRecord,
  AttendanceStatus,
  RecognitionMethod,
} from "@/types/attendance";
import { Student, Profile } from "@/types/database";
import {
  formatAttendanceDate,
  formatSessionTimeWindow,
  sanitizeErrorMessage,
} from "@/lib/attendance/attendance-ui-helpers";
import { calculateAttendancePercentage } from "@/lib/attendance/attendance-utils";

export interface StudentRosterRow {
  student_id: string;
  roll_number: string;
  usn: string;
  name: string;
  email?: string;
  status: AttendanceStatus;
  remarks: string;
  confidence_score?: number | null;
  recognition_method: RecognitionMethod;
  is_existing_record: boolean;
  record_id?: string;
}

interface SessionAttendanceClientProps {
  initialSession: AttendanceSession;
  initialRecords: AttendanceRecord[];
  enrolledStudents?: Student[];
  canEdit: boolean;
  profile: Profile;
}

export function SessionAttendanceClient({
  initialSession,
  initialRecords,
  enrolledStudents = [],
  canEdit,
  profile,
}: SessionAttendanceClientProps) {
  const router = useRouter();
  const [session, setSession] = useState<AttendanceSession>(initialSession);

  // Initialize student rows: if records already exist, use them; otherwise, build from enrolled students defaulted to PRESENT
  const initialRows = useMemo<StudentRosterRow[]>(() => {
    if (initialRecords && initialRecords.length > 0) {
      return initialRecords.map((rec) => {
        const student = (rec as any).student;
        const studentProfile = student?.profile;
        const name = studentProfile
          ? `${studentProfile.first_name || ""} ${studentProfile.last_name || ""}`.trim()
          : student?.roll_number || "Student";

        return {
          student_id: rec.student_id,
          roll_number: student?.roll_number || "—",
          usn: student?.usn || "—",
          name,
          email: studentProfile?.email,
          status: rec.status,
          remarks: rec.remarks || "",
          confidence_score: rec.confidence_score,
          recognition_method: rec.recognition_method || "MANUAL",
          is_existing_record: true,
          record_id: rec.id,
        };
      });
    }

    // Newly created session with 0 records: pre-populate enrolled students defaulted to PRESENT
    return enrolledStudents.map((st) => {
      const stProfile = (st as any).profile;
      const name = stProfile
        ? `${stProfile.first_name || ""} ${stProfile.last_name || ""}`.trim()
        : st.roll_number || "Student";

      return {
        student_id: st.id,
        roll_number: st.roll_number || "—",
        usn: st.usn || "—",
        name,
        email: stProfile?.email,
        status: "PRESENT" as AttendanceStatus,
        remarks: "",
        confidence_score: null,
        recognition_method: "MANUAL" as RecognitionMethod,
        is_existing_record: false,
      };
    });
  }, [initialRecords, enrolledStudents]);

  const [roster, setRoster] = useState<StudentRosterRow[]>(initialRows);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<AttendanceStatus | "ALL">("ALL");

  // Action dialogs
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);

  const isSessionOpen = session.status === "OPEN";
  const isEditable = isSessionOpen && canEdit;

  // Handle single student status change
  const handleStatusChange = (studentId: string, newStatus: AttendanceStatus) => {
    if (!isEditable || isSaving) return;

    setRoster((prev) =>
      prev.map((row) =>
        row.student_id === studentId ? { ...row, status: newStatus } : row
      )
    );
    setHasUnsavedChanges(true);
    setFeedback(null);
  };

  // Handle single student remarks change
  const handleRemarksChange = (studentId: string, remarks: string) => {
    if (!isEditable || isSaving) return;

    setRoster((prev) =>
      prev.map((row) =>
        row.student_id === studentId ? { ...row, remarks } : row
      )
    );
    setHasUnsavedChanges(true);
  };

  // Quick action: Mark all students present
  const handleMarkAllPresent = () => {
    if (!isEditable || isSaving) return;

    setRoster((prev) => prev.map((row) => ({ ...row, status: "PRESENT" })));
    setHasUnsavedChanges(true);
  };

  // Save attendance records
  const handleSaveAttendance = async (closeAfterSave = false) => {
    if (!isEditable || isSaving) return;

    try {
      setIsSaving(true);
      setFeedback(null);

      // Construct normalized payload with duplicate safety
      const seenIds = new Set<string>();
      const payloadRecords = [];

      for (const row of roster) {
        if (seenIds.has(row.student_id)) continue;
        seenIds.add(row.student_id);

        payloadRecords.push({
          student_id: row.student_id,
          status: row.status,
          confidence_score: row.confidence_score,
          recognition_method: row.recognition_method,
          remarks: row.remarks.trim() || null,
        });
      }

      const url = `/api/attendance/sessions/${session.id}/records${
        closeAfterSave ? "?closeSession=true" : ""
      }`;

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: session.id,
          records: payloadRecords,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to save attendance records");
      }

      setHasUnsavedChanges(false);

      if (closeAfterSave) {
        setSession((prev) => ({ ...prev, status: "CLOSED" }));
        setFeedback({
          type: "success",
          message: `Saved ${payloadRecords.length} records and closed session successfully.`,
        });
      } else {
        setFeedback({
          type: "success",
          message: `Successfully saved attendance for ${payloadRecords.length} students.`,
        });
      }

      router.refresh();
    } catch (err) {
      setFeedback({
        type: "error",
        message: sanitizeErrorMessage(err),
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Close session action
  const handleCloseSession = async () => {
    try {
      setIsSaving(true);
      const res = await fetch(`/api/attendance/sessions/${session.id}/close`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to close session");
      }

      setSession((prev) => ({ ...prev, status: "CLOSED" }));
      setFeedback({
        type: "success",
        message: "Attendance session has been closed and locked.",
      });
      router.refresh();
    } catch (err) {
      setFeedback({
        type: "error",
        message: sanitizeErrorMessage(err),
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Cancel session action
  const handleCancelSession = async () => {
    try {
      setIsSaving(true);
      const res = await fetch(`/api/attendance/sessions/${session.id}/cancel`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to cancel session");
      }

      setSession((prev) => ({ ...prev, status: "CANCELLED" }));
      setFeedback({
        type: "success",
        message: "Attendance session has been cancelled.",
      });
      router.refresh();
    } catch (err) {
      setFeedback({
        type: "error",
        message: sanitizeErrorMessage(err),
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Filtered roster for table view
  const filteredRoster = useMemo(() => {
    return roster.filter((row) => {
      if (statusFilter !== "ALL" && row.status !== statusFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matches =
          row.name.toLowerCase().includes(q) ||
          row.roll_number.toLowerCase().includes(q) ||
          row.usn.toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [roster, statusFilter, searchQuery]);

  // Real-time summary statistics
  const metrics = useMemo(() => {
    const total = roster.length;
    const present = roster.filter((r) => r.status === "PRESENT").length;
    const late = roster.filter((r) => r.status === "LATE").length;
    const absent = roster.filter((r) => r.status === "ABSENT").length;
    const excused = roster.filter((r) => r.status === "EXCUSED").length;
    const attended = present + late;
    const percentage = calculateAttendancePercentage(attended, total);

    return { total, present, late, absent, excused, percentage };
  }, [roster]);

  return (
    <div className="space-y-6">
      {/* Navigation Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Link
          href="/attendance"
          className="flex items-center gap-1 hover:text-foreground transition-colors font-medium"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Sessions
        </Link>
        <span>/</span>
        <span className="text-foreground font-semibold">
          {session.subject?.code} – Section {session.section?.name}
        </span>
      </div>

      {/* Session Hero Header */}
      <div className="p-6 rounded-2xl bg-card border border-border/70 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2.5 mb-1.5">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                {session.subject?.name}
              </h1>
              <Badge variant="outline" className="font-mono text-xs font-semibold">
                {session.subject?.code}
              </Badge>

              {session.status === "OPEN" ? (
                <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 font-semibold gap-1 text-xs">
                  <Clock className="w-3 h-3" />
                  OPEN FOR MARKING
                </Badge>
              ) : session.status === "CLOSED" ? (
                <Badge
                  variant="secondary"
                  className="bg-muted text-muted-foreground border border-border/70 font-semibold gap-1 text-xs"
                >
                  <Lock className="w-3 h-3" />
                  CLOSED & LOCKED
                </Badge>
              ) : (
                <Badge
                  variant="destructive"
                  className="bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/20 font-semibold gap-1 text-xs"
                >
                  <XCircle className="w-3 h-3" />
                  CANCELLED
                </Badge>
              )}

              {hasUnsavedChanges && (
                <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/20 animate-pulse text-xs">
                  Unsaved Changes
                </Badge>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
              <span className="flex items-center gap-1 text-foreground font-medium">
                <Users className="w-3.5 h-3.5 text-primary" />
                Section {session.section?.name}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                {formatAttendanceDate(session.session_date)} •{" "}
                {formatSessionTimeWindow(session.start_time, session.end_time)}
              </span>
              <span className="flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-muted-foreground" />
                {session.faculty?.profile?.first_name
                  ? `${session.faculty.profile.first_name} ${session.faculty.profile.last_name || ""}`
                  : "Assigned Faculty"}
              </span>
              {session.classroom && (
                <span className="flex items-center gap-1">
                  <DoorOpen className="w-3.5 h-3.5 text-muted-foreground" />
                  Room {session.classroom.room_number}
                </span>
              )}
            </div>
          </div>

          {/* Header Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {isEditable && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleMarkAllPresent}
                  disabled={isSaving}
                  className="text-xs gap-1"
                >
                  <CheckCheck className="w-3.5 h-3.5 text-emerald-600" />
                  Mark All Present
                </Button>

                <Button
                  size="sm"
                  onClick={() => handleSaveAttendance(false)}
                  disabled={isSaving}
                  className="text-xs gap-1.5 shadow-sm min-w-[110px]"
                >
                  {isSaving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  Save Records
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSaveAttendance(true)}
                  disabled={isSaving}
                  className="text-xs gap-1.5 border-emerald-500/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10"
                >
                  <Lock className="w-3.5 h-3.5" />
                  Save & Close
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmCloseOpen(true)}
                  disabled={isSaving}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Close
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmCancelOpen(true)}
                  disabled={isSaving}
                  className="text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-500/10"
                >
                  Cancel
                </Button>
              </>
            )}

            {!isSessionOpen && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground py-1 px-2.5 rounded-lg bg-muted/50 border border-border/60">
                <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                <span>Read-only session</span>
              </div>
            )}
          </div>
        </div>

        {/* Read-Only Notice for Closed/Cancelled Sessions */}
        {!isSessionOpen && (
          <div className="p-3 rounded-xl bg-muted/40 border border-border/60 text-xs text-muted-foreground flex items-center gap-2">
            <Lock className="w-4 h-4 text-muted-foreground shrink-0" />
            <span>
              This attendance session is {session.status}. All attendance records are finalized
              and locked from further changes.
            </span>
          </div>
        )}

        {/* Status / Error feedback banners */}
        {feedback && (
          <div
            className={`p-3.5 rounded-xl border text-xs flex items-center justify-between animate-in fade-in ${
              feedback.type === "success"
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-400"
                : "bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400"
            }`}
          >
            <div className="flex items-center gap-2">
              {feedback.type === "success" ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{feedback.message}</span>
            </div>
            <button
              onClick={() => setFeedback(null)}
              className="text-xs font-semibold underline ml-3"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>

      {/* Real-time Summary Cards Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card className="border-border/70 p-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Total Cohort
          </p>
          <div className="mt-1 text-2xl font-bold text-foreground">{metrics.total}</div>
        </Card>

        <Card className="border-emerald-500/30 bg-emerald-500/5 p-3.5">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              Present
            </p>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <div className="mt-1 text-2xl font-bold text-emerald-700 dark:text-emerald-400">
            {metrics.present}
          </div>
        </Card>

        <Card className="border-amber-500/30 bg-amber-500/5 p-3.5">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
              Late
            </p>
            <Clock className="w-3.5 h-3.5 text-amber-600" />
          </div>
          <div className="mt-1 text-2xl font-bold text-amber-700 dark:text-amber-400">
            {metrics.late}
          </div>
        </Card>

        <Card className="border-rose-500/30 bg-rose-500/5 p-3.5">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-rose-700 dark:text-rose-400">
              Absent
            </p>
            <XCircle className="w-3.5 h-3.5 text-rose-600" />
          </div>
          <div className="mt-1 text-2xl font-bold text-rose-700 dark:text-rose-400">
            {metrics.absent}
          </div>
        </Card>

        <Card className="border-blue-500/30 bg-blue-500/5 p-3.5">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-400">
              Excused
            </p>
            <AlertCircle className="w-3.5 h-3.5 text-blue-600" />
          </div>
          <div className="mt-1 text-2xl font-bold text-blue-700 dark:text-blue-400">
            {metrics.excused}
          </div>
        </Card>

        <Card className="border-primary/30 bg-primary/5 p-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
            Turnout Rate
          </p>
          <div className="mt-1 text-2xl font-bold text-primary">
            {metrics.percentage}%
          </div>
        </Card>
      </div>

      {/* Search & Filter Bar */}
      <Card className="border-border/70">
        <CardContent className="p-3.5 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search student by name, USN, roll number..."
              className="w-full h-8 pl-8 pr-3 rounded-lg border border-border/70 bg-background text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
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
        </CardContent>
      </Card>

      {/* Student Roster Table */}
      <Card className="border-border/70 overflow-hidden shadow-sm">
        {filteredRoster.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm font-semibold">No students match your filter</p>
            <p className="text-xs mt-1">Try resetting the status filter or search query.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/40 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border/70">
                <tr>
                  <th className="py-3 px-4">Student Info</th>
                  <th className="py-3 px-4">USN / Roll</th>
                  <th className="py-3 px-4">Attendance Status</th>
                  <th className="py-3 px-4">Remarks / Notes</th>
                  <th className="py-3 px-4 text-right">Verification</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredRoster.map((row) => (
                  <tr key={row.student_id} className="hover:bg-muted/20 transition-colors">
                    {/* Student Name */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="font-semibold text-foreground">{row.name}</div>
                      {row.email && (
                        <div className="text-xs text-muted-foreground">{row.email}</div>
                      )}
                    </td>

                    {/* USN / Roll */}
                    <td className="py-3 px-4 whitespace-nowrap font-mono text-xs">
                      <div className="text-foreground font-semibold">{row.roll_number}</div>
                      <div className="text-muted-foreground">{row.usn}</div>
                    </td>

                    {/* 4-Way Status Button Group */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="inline-flex items-center p-1 rounded-lg bg-muted/60 border border-border/60 gap-1">
                        {(["PRESENT", "LATE", "ABSENT", "EXCUSED"] as const).map((st) => {
                          const isSelected = row.status === st;

                          let activeColor = "bg-primary text-primary-foreground";
                          if (st === "PRESENT")
                            activeColor = "bg-emerald-600 text-white shadow-sm";
                          if (st === "LATE")
                            activeColor = "bg-amber-500 text-white shadow-sm";
                          if (st === "ABSENT")
                            activeColor = "bg-rose-600 text-white shadow-sm";
                          if (st === "EXCUSED")
                            activeColor = "bg-blue-600 text-white shadow-sm";

                          return (
                            <button
                              key={st}
                              type="button"
                              onClick={() => handleStatusChange(row.student_id, st)}
                              disabled={!isEditable || isSaving}
                              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                                isSelected
                                  ? activeColor
                                  : "text-muted-foreground hover:text-foreground hover:bg-background/50 disabled:opacity-40"
                              }`}
                            >
                              {st}
                            </button>
                          );
                        })}
                      </div>
                    </td>

                    {/* Remarks Input */}
                    <td className="py-3 px-4">
                      <input
                        type="text"
                        value={row.remarks}
                        onChange={(e) => handleRemarksChange(row.student_id, e.target.value)}
                        placeholder="Optional remarks..."
                        disabled={!isEditable || isSaving}
                        className="w-full max-w-[240px] h-8 px-2.5 rounded-md border border-border/60 bg-background text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-50"
                      />
                    </td>

                    {/* Recognition / Verification Info */}
                    <td className="py-3 px-4 whitespace-nowrap text-right text-xs">
                      {row.recognition_method === "FACIAL_RECOGNITION" ? (
                        <div className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                          <Camera className="w-3.5 h-3.5" />
                          <span>
                            {row.confidence_score
                              ? `${Math.round(row.confidence_score * 100)}% Match`
                              : "Face Match"}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-[11px]">Manual</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Floating Save Toolbar when Unsaved Changes exist */}
      {hasUnsavedChanges && isEditable && (
        <div className="fixed bottom-6 right-8 z-40 p-4 rounded-2xl bg-card/95 backdrop-blur-md border border-primary/30 shadow-2xl flex items-center gap-4 animate-in slide-in-from-bottom-5">
          <div className="flex items-center gap-2 text-xs">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
            </span>
            <span className="font-semibold text-foreground">You have unsaved changes</span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => handleSaveAttendance(false)}
              disabled={isSaving}
              className="gap-1.5 shadow-sm"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Save Now
            </Button>
          </div>
        </div>
      )}

      {/* Confirmation Dialogs */}
      <ConfirmDialog
        open={confirmCloseOpen}
        onClose={() => setConfirmCloseOpen(false)}
        onConfirm={handleCloseSession}
        title="Close Attendance Session"
        description="Are you sure you want to close this session? This action finalizes student attendance and locks all records from further editing."
        confirmText="Yes, Close Session"
        isDestructive={false}
      />

      <ConfirmDialog
        open={confirmCancelOpen}
        onClose={() => setConfirmCancelOpen(false)}
        onConfirm={handleCancelSession}
        title="Cancel Attendance Session"
        description="Are you sure you want to cancel this session? Cancelled sessions cannot be modified or marked."
        confirmText="Yes, Cancel Session"
        isDestructive={true}
      />
    </div>
  );
}
