"use client";

import React, { useState } from "react";
import {
  StudentEnrollment,
  Student,
  Subject,
  ClassSection,
  AcademicYear,
  Semester,
  Department,
  Profile,
} from "@/types/database";
import { DataTable, ColumnDef } from "@/components/common/data-table";
import { StatusBadge } from "@/components/common/status-badge";
import { ModalDialog } from "@/components/common/modal-dialog";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  enrollStudentAction,
  unenrollStudentAction,
  bulkEnrollCohortAction,
} from "@/server/actions/enrollments";
import { Plus, Trash2, UserCheck, Loader2, AlertCircle, Users } from "lucide-react";

interface EnrollmentClientProps {
  enrollments: (StudentEnrollment & {
    student?: Student & { profile?: Profile | null; department?: Department };
    subject?: Subject;
    section?: ClassSection & { department?: Department };
    academic_year?: AcademicYear;
    semester?: Semester;
  })[];
  students: (Student & { profile?: Profile | null; department?: Department })[];
  subjects: (Subject & { department?: Department })[];
  sections: (ClassSection & { department?: Department })[];
  academicYears: AcademicYear[];
  semesters: Semester[];
  canManage: boolean;
}

export function EnrollmentClient({
  enrollments: initialEnrollments,
  students,
  subjects,
  sections,
  academicYears,
  semesters,
  canManage,
}: EnrollmentClientProps) {
  const [enrollments] = useState(initialEnrollments);

  // Filters
  const [selectedSec, setSelectedSec] = useState<string>("ALL");
  const [selectedSub, setSelectedSub] = useState<string>("ALL");

  // Single Enroll Modal
  const [singleModalOpen, setSingleModalOpen] = useState(false);
  const [studentId, setStudentId] = useState("");
  const [subId, setSubId] = useState("");
  const [secId, setSecId] = useState("");
  const [yearId, setYearId] = useState("");
  const [semId, setSemId] = useState("");

  // Batch Enroll Modal
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [batchSecId, setBatchSecId] = useState("");
  const [batchSubId, setBatchSubId] = useState("");
  const [batchSemId, setBatchSemId] = useState("");
  const [batchYearId, setBatchYearId] = useState("");

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Unenroll confirm state
  const [unenrollState, setUnenrollState] = useState<{
    open: boolean;
    enrollmentId: string;
    label: string;
  }>({
    open: false,
    enrollmentId: "",
    label: "",
  });

  const openSingleModal = () => {
    setStudentId(students[0]?.id || "");
    setSubId(subjects[0]?.id || "");
    setSecId(sections[0]?.id || "");
    setYearId(academicYears[0]?.id || "");
    setSemId(semesters[0]?.id || "");
    setErrorMsg(null);
    setSingleModalOpen(true);
  };

  const openBatchModal = () => {
    setBatchSecId(sections[0]?.id || "");
    setBatchSubId(subjects[0]?.id || "");
    setBatchSemId(semesters[0]?.id || "");
    setBatchYearId(academicYears[0]?.id || "");
    setErrorMsg(null);
    setBatchModalOpen(true);
  };

  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await enrollStudentAction({
        student_id: studentId,
        subject_id: subId,
        section_id: secId,
        academic_year_id: yearId,
        semester_id: semId,
        is_active: true,
      });

      if (!res.success) {
        setErrorMsg(res.error || "Failed to enroll student");
        setLoading(false);
        return;
      }

      setSingleModalOpen(false);
      window.location.reload();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleBatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await bulkEnrollCohortAction(batchSecId, batchSubId, batchSemId, batchYearId);
      if (!res.success) {
        setErrorMsg(res.error || "Batch enrollment failed");
        setLoading(false);
        return;
      }

      alert(`Successfully enrolled ${res.data?.count || 0} students from this section!`);
      setBatchModalOpen(false);
      window.location.reload();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleUnenrollConfirm = async () => {
    if (!unenrollState.enrollmentId) return;
    const res = await unenrollStudentAction(unenrollState.enrollmentId);
    if (!res.success) {
      alert(res.error || "Failed to unenroll student");
      return;
    }
    window.location.reload();
  };

  const filteredEnrollments = enrollments.filter((e) => {
    const matchesSec = selectedSec === "ALL" || e.section_id === selectedSec;
    const matchesSub = selectedSub === "ALL" || e.subject_id === selectedSub;
    return matchesSec && matchesSub;
  });

  const columns: ColumnDef<
    StudentEnrollment & {
      student?: Student & { profile?: Profile | null; department?: Department };
      subject?: Subject;
      section?: ClassSection & { department?: Department };
      academic_year?: AcademicYear;
      semester?: Semester;
    }
  >[] = [
    {
      header: "Student USN & Name",
      cell: (row) => {
        const s = row.student;
        return (
          <div>
            <div className="font-mono font-bold text-xs text-primary">{s?.usn}</div>
            <div className="text-xs font-semibold text-foreground">
              {s?.profile ? `${s.profile.first_name} ${s.profile.last_name}` : "Enrolled Student"}
            </div>
          </div>
        );
      },
    },
    {
      header: "Enrolled Course",
      cell: (row) => (
        <div>
          <div className="font-semibold text-foreground flex items-center gap-1.5">
            <span className="font-mono text-xs font-bold">{row.subject?.code}</span>
            <span>—</span>
            <span>{row.subject?.name}</span>
          </div>
          <div className="text-xs text-muted-foreground">{row.subject?.credits} Credits</div>
        </div>
      ),
    },
    {
      header: "Cohort Section",
      cell: (row) => (
        <Badge variant="outline" className="font-medium text-xs">
          {row.section?.name} ({row.section?.department?.code})
        </Badge>
      ),
      className: "w-32",
    },
    {
      header: "Academic Session",
      cell: (row) => (
        <div className="text-xs">
          <div className="font-medium text-foreground">{row.semester?.name}</div>
          <div className="text-muted-foreground text-[10px]">{row.academic_year?.name}</div>
        </div>
      ),
      className: "w-36",
    },
    {
      header: "Status",
      accessorKey: "is_active",
      cell: (row) => <StatusBadge status={row.is_active} />,
      className: "w-24",
    },
    {
      header: "Actions",
      cell: (row) => {
        if (!canManage) return null;
        return (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setUnenrollState({
                open: true,
                enrollmentId: row.id,
                label: `${row.student?.usn} from ${row.subject?.code}`,
              })
            }
            className="h-8 w-8 p-0 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10"
            title="Unenroll Student"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        );
      },
      className: "w-16 text-right",
    },
  ];

  return (
    <div className="space-y-6">
      <DataTable
        data={filteredEnrollments}
        columns={columns}
        title="Student Subject Enrollments"
        description="Course registrations linking students to curriculum subjects for attendance tracking and academic reporting."
        searchPlaceholder="Search enrollments by USN, course..."
        filterSlot={
          <div className="flex items-center gap-2">
            <select
              value={selectedSec}
              onChange={(e) => setSelectedSec(e.target.value)}
              className="h-9 px-3 rounded-lg border border-border/70 bg-background text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="ALL">All Cohort Sections</option>
              {sections.map((sec) => (
                <option key={sec.id} value={sec.id}>
                  Section {sec.name} ({sec.department?.code})
                </option>
              ))}
            </select>

            <select
              value={selectedSub}
              onChange={(e) => setSelectedSub(e.target.value)}
              className="h-9 px-3 rounded-lg border border-border/70 bg-background text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="ALL">All Subjects</option>
              {subjects.map((sub) => (
                <option key={sub.id} value={sub.id}>
                  {sub.code} — {sub.name}
                </option>
              ))}
            </select>
          </div>
        }
        actionSlot={
          canManage && (
            <div className="flex items-center gap-2">
              <Button onClick={openBatchModal} variant="outline" size="sm" className="gap-2">
                <Users className="w-4 h-4" />
                Batch Enroll Section
              </Button>
              <Button onClick={openSingleModal} size="sm" className="gap-2">
                <Plus className="w-4 h-4" />
                Enroll Student
              </Button>
            </div>
          )
        }
        emptyMessage="No student course enrollments registered."
      />

      {/* Single Enroll Modal */}
      <ModalDialog
        open={singleModalOpen}
        onClose={() => !loading && setSingleModalOpen(false)}
        title="Enroll Student in Curriculum Subject"
        description="Register an individual student into a curriculum subject."
        maxWidth="md"
      >
        <form onSubmit={handleSingleSubmit} className="space-y-4">
          {errorMsg && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/15 text-destructive text-sm border border-destructive/20">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Select Student <span className="text-rose-500">*</span>
            </label>
            <select
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              required
              className="w-full h-10 px-3 rounded-lg border border-border/70 bg-background text-sm"
            >
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.usn} — {s.profile ? `${s.profile.first_name} ${s.profile.last_name}` : "Student"} (
                  {s.department?.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Curriculum Subject <span className="text-rose-500">*</span>
            </label>
            <select
              value={subId}
              onChange={(e) => setSubId(e.target.value)}
              required
              className="w-full h-10 px-3 rounded-lg border border-border/70 bg-background text-sm"
            >
              {subjects.map((sub) => (
                <option key={sub.id} value={sub.id}>
                  {sub.code} — {sub.name} ({sub.department?.code})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Section Cohort <span className="text-rose-500">*</span>
              </label>
              <select
                value={secId}
                onChange={(e) => setSecId(e.target.value)}
                required
                className="w-full h-10 px-3 rounded-lg border border-border/70 bg-background text-sm"
              >
                {sections.map((sec) => (
                  <option key={sec.id} value={sec.id}>
                    Sec {sec.name} ({sec.department?.code})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Academic Year <span className="text-rose-500">*</span>
              </label>
              <select
                value={yearId}
                onChange={(e) => setYearId(e.target.value)}
                required
                className="w-full h-10 px-3 rounded-lg border border-border/70 bg-background text-sm"
              >
                {academicYears.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Semester <span className="text-rose-500">*</span>
              </label>
              <select
                value={semId}
                onChange={(e) => setSemId(e.target.value)}
                required
                className="w-full h-10 px-3 rounded-lg border border-border/70 bg-background text-sm"
              >
                {semesters.map((s) => (
                  <option key={s.id} value={s.id}>
                    Sem {s.semester_number}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setSingleModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Enroll Student"}
            </Button>
          </div>
        </form>
      </ModalDialog>

      {/* Batch Enroll Modal */}
      <ModalDialog
        open={batchModalOpen}
        onClose={() => !loading && setBatchModalOpen(false)}
        title="Batch Enroll Section Cohort"
        description="Enroll all active students from an entire section into a curriculum subject simultaneously."
        maxWidth="md"
      >
        <form onSubmit={handleBatchSubmit} className="space-y-4">
          {errorMsg && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/15 text-destructive text-sm border border-destructive/20">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Target Section Cohort <span className="text-rose-500">*</span>
            </label>
            <select
              value={batchSecId}
              onChange={(e) => setBatchSecId(e.target.value)}
              required
              className="w-full h-10 px-3 rounded-lg border border-border/70 bg-background text-sm"
            >
              {sections.map((sec) => (
                <option key={sec.id} value={sec.id}>
                  Section {sec.name} ({sec.code}) — {sec.department?.code}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Curriculum Subject <span className="text-rose-500">*</span>
            </label>
            <select
              value={batchSubId}
              onChange={(e) => setBatchSubId(e.target.value)}
              required
              className="w-full h-10 px-3 rounded-lg border border-border/70 bg-background text-sm"
            >
              {subjects.map((sub) => (
                <option key={sub.id} value={sub.id}>
                  {sub.code} — {sub.name} ({sub.department?.code})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Academic Year <span className="text-rose-500">*</span>
              </label>
              <select
                value={batchYearId}
                onChange={(e) => setBatchYearId(e.target.value)}
                required
                className="w-full h-10 px-3 rounded-lg border border-border/70 bg-background text-sm"
              >
                {academicYears.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Semester <span className="text-rose-500">*</span>
              </label>
              <select
                value={batchSemId}
                onChange={(e) => setBatchSemId(e.target.value)}
                required
                className="w-full h-10 px-3 rounded-lg border border-border/70 bg-background text-sm"
              >
                {semesters.map((s) => (
                  <option key={s.id} value={s.id}>
                    Sem {s.semester_number}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setBatchModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Batch Enroll Students"}
            </Button>
          </div>
        </form>
      </ModalDialog>

      {/* Confirmation Dialog */}
      <ConfirmDialog
        open={unenrollState.open}
        onClose={() => setUnenrollState({ open: false, enrollmentId: "", label: "" })}
        onConfirm={handleUnenrollConfirm}
        title="Unenroll Student from Course"
        description={`Are you sure you want to unenroll ${unenrollState.label}? The student will no longer appear on the attendance roster for this course.`}
        confirmText="Unenroll"
        isDestructive={true}
      />
    </div>
  );
}
