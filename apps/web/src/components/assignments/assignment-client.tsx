"use client";

import React, { useState } from "react";
import {
  FacultySubject,
  Faculty,
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
  assignFacultySubjectAction,
  revokeFacultyAssignmentAction,
} from "@/server/actions/assignments";
import { Plus, Trash2, Briefcase, Loader2, AlertCircle, ArrowRight } from "lucide-react";

interface AssignmentClientProps {
  assignments: (FacultySubject & {
    faculty?: Faculty & { profile?: Profile | null };
    subject?: Subject;
    section?: ClassSection & { department?: Department };
    academic_year?: AcademicYear;
    semester?: Semester;
  })[];
  facultyList: (Faculty & { profile?: Profile | null; department?: Department })[];
  subjects: (Subject & { department?: Department })[];
  sections: (ClassSection & { department?: Department })[];
  academicYears: AcademicYear[];
  semesters: Semester[];
  canManage: boolean;
}

export function AssignmentClient({
  assignments: initialAssignments,
  facultyList,
  subjects,
  sections,
  academicYears,
  semesters,
  canManage,
}: AssignmentClientProps) {
  const [assignments] = useState(initialAssignments);

  // Filters
  const [selectedFac, setSelectedFac] = useState<string>("ALL");
  const [selectedSub, setSelectedSub] = useState<string>("ALL");

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [facId, setFacId] = useState("");
  const [subId, setSubId] = useState("");
  const [secId, setSecId] = useState("");
  const [yearId, setYearId] = useState("");
  const [semId, setSemId] = useState("");
  const [isPrimary, setIsPrimary] = useState(true);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Revoke confirm state
  const [revokeState, setRevokeState] = useState<{
    open: boolean;
    assignmentId: string;
    label: string;
  }>({
    open: false,
    assignmentId: "",
    label: "",
  });

  const openAssignModal = () => {
    setFacId(facultyList[0]?.id || "");
    setSubId(subjects[0]?.id || "");
    setSecId(sections[0]?.id || "");
    setYearId(academicYears[0]?.id || "");
    setSemId(semesters[0]?.id || "");
    setIsPrimary(true);
    setErrorMsg(null);
    setModalOpen(true);
  };

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await assignFacultySubjectAction({
        faculty_id: facId,
        subject_id: subId,
        section_id: secId,
        academic_year_id: yearId,
        semester_id: semId,
        is_primary: isPrimary,
        status: "ASSIGNED",
      });

      if (!res.success) {
        setErrorMsg(res.error || "Failed to assign subject");
        setLoading(false);
        return;
      }

      setModalOpen(false);
      window.location.reload();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeConfirm = async () => {
    if (!revokeState.assignmentId) return;
    const res = await revokeFacultyAssignmentAction(revokeState.assignmentId);
    if (!res.success) {
      alert(res.error || "Failed to revoke assignment");
      return;
    }
    window.location.reload();
  };

  const filteredAssignments = assignments.filter((a) => {
    const matchesFac = selectedFac === "ALL" || a.faculty_id === selectedFac;
    const matchesSub = selectedSub === "ALL" || a.subject_id === selectedSub;
    return matchesFac && matchesSub;
  });

  const columns: ColumnDef<
    FacultySubject & {
      faculty?: Faculty & { profile?: Profile | null };
      subject?: Subject;
      section?: ClassSection & { department?: Department };
      academic_year?: AcademicYear;
      semester?: Semester;
    }
  >[] = [
    {
      header: "Instructor",
      cell: (row) => {
        const fac = row.faculty;
        return (
          <div>
            <div className="font-semibold text-foreground">
              {fac?.profile ? `${fac.profile.first_name} ${fac.profile.last_name}` : "Faculty"}
            </div>
            <div className="text-xs text-muted-foreground font-mono">
              {fac?.employee_id} • {fac?.designation}
            </div>
          </div>
        );
      },
    },
    {
      header: "Subject / Course",
      cell: (row) => (
        <div>
          <div className="font-semibold text-foreground flex items-center gap-1.5">
            <span className="font-mono text-xs font-bold text-primary">{row.subject?.code}</span>
            <span>—</span>
            <span>{row.subject?.name}</span>
          </div>
          <div className="text-xs text-muted-foreground">
            {row.subject?.total_weekly_periods} periods/wk • {row.subject?.credits} credits
          </div>
        </div>
      ),
    },
    {
      header: "Assigned Section",
      cell: (row) => (
        <div>
          <Badge variant="outline" className="font-bold text-xs">
            Section {row.section?.name} ({row.section?.code})
          </Badge>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            {row.section?.department?.code}
          </div>
        </div>
      ),
      className: "w-36",
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
      header: "Role",
      accessorKey: "is_primary",
      cell: (row) => (
        <Badge
          variant="secondary"
          className={`text-[10px] ${
            row.is_primary ? "bg-primary/10 text-primary border-primary/20" : "bg-muted text-muted-foreground"
          }`}
        >
          {row.is_primary ? "Primary Faculty" : "Supporting / Co-Faculty"}
        </Badge>
      ),
      className: "w-28",
    },
    {
      header: "Status",
      accessorKey: "status",
      cell: (row) => <StatusBadge status={row.status} />,
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
              setRevokeState({
                open: true,
                assignmentId: row.id,
                label: `${row.faculty?.employee_id} $\\to$ ${row.subject?.code} (${row.section?.name})`,
              })
            }
            className="h-8 w-8 p-0 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10"
            title="Revoke Assignment"
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
        data={filteredAssignments}
        columns={columns}
        title="Faculty Teaching Allocations"
        description="Pair instructors to course cohorts; directly feeds OR-Tools CP-SAT timetable generation."
        searchPlaceholder="Search allocations..."
        filterSlot={
          <div className="flex items-center gap-2">
            <select
              value={selectedFac}
              onChange={(e) => setSelectedFac(e.target.value)}
              className="h-9 px-3 rounded-lg border border-border/70 bg-background text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="ALL">All Instructors</option>
              {facultyList.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.profile ? `${f.profile.first_name} ${f.profile.last_name}` : f.employee_id} (
                  {f.employee_id})
                </option>
              ))}
            </select>

            <select
              value={selectedSub}
              onChange={(e) => setSelectedSub(e.target.value)}
              className="h-9 px-3 rounded-lg border border-border/70 bg-background text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="ALL">All Subjects</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} — {s.name}
                </option>
              ))}
            </select>
          </div>
        }
        actionSlot={
          canManage && (
            <Button onClick={openAssignModal} size="sm" className="gap-2">
              <Plus className="w-4 h-4" />
              New Assignment
            </Button>
          )
        }
        emptyMessage="No teaching assignments configured."
      />

      {/* Assignment Modal */}
      <ModalDialog
        open={modalOpen}
        onClose={() => !loading && setModalOpen(false)}
        title="Assign Faculty to Course & Section"
        description="Bind an instructor to a curriculum subject and student cohort."
        maxWidth="md"
      >
        <form onSubmit={handleAssignSubmit} className="space-y-4">
          {errorMsg && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/15 text-destructive text-sm border border-destructive/20">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Faculty Instructor <span className="text-rose-500">*</span>
            </label>
            <select
              value={facId}
              onChange={(e) => setFacId(e.target.value)}
              required
              className="w-full h-10 px-3 rounded-lg border border-border/70 bg-background text-sm"
            >
              {facultyList.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.profile ? `${f.profile.first_name} ${f.profile.last_name}` : f.employee_id} (
                  {f.employee_id} • {f.department?.code} • {f.designation})
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
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} — {s.name} ({s.department?.code} • {s.total_weekly_periods} periods)
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Class Section <span className="text-rose-500">*</span>
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

          <div className="flex items-center justify-between pt-2">
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={isPrimary}
                onChange={(e) => setIsPrimary(e.target.checked)}
                className="rounded border-border text-primary h-4 w-4"
              />
              <span>Assign as Primary Course Instructor</span>
            </label>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Assignment"}
              </Button>
            </div>
          </div>
        </form>
      </ModalDialog>

      {/* Confirmation Dialog */}
      <ConfirmDialog
        open={revokeState.open}
        onClose={() => setRevokeState({ open: false, assignmentId: "", label: "" })}
        onConfirm={handleRevokeConfirm}
        title="Revoke Teaching Assignment"
        description={`Are you sure you want to revoke assignment ${revokeState.label}? The instructor will be unlinked from this section cohort.`}
        confirmText="Revoke"
        isDestructive={true}
      />
    </div>
  );
}
