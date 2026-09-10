"use client";

import React, { useState } from "react";
import { Subject, Department, Semester, SubjectType } from "@/types/database";
import { DataTable, ColumnDef } from "@/components/common/data-table";
import { StatusBadge } from "@/components/common/status-badge";
import { ModalDialog } from "@/components/common/modal-dialog";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  createSubjectAction,
  updateSubjectAction,
  toggleSubjectActiveAction,
} from "@/server/actions/subjects";
import { Plus, Edit2, Power, BookOpen, Loader2, AlertCircle, Sparkles } from "lucide-react";

interface SubjectClientProps {
  subjects: (Subject & { department?: Department; semester?: Semester })[];
  departments: Department[];
  semesters: Semester[];
  canManage: boolean;
}

const TYPE_BADGE_STYLES: Record<SubjectType, string> = {
  THEORY: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",
  LABORATORY: "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20",
  PRACTICAL: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
  ELECTIVE: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
  PROJECT: "bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-500/20",
};

export function SubjectClient({
  subjects: initialSubjects,
  departments,
  semesters,
  canManage,
}: SubjectClientProps) {
  const [subjects] = useState(initialSubjects);
  const [selectedDept, setSelectedDept] = useState<string>("ALL");
  const [selectedType, setSelectedType] = useState<string>("ALL");

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [deptId, setDeptId] = useState("");
  const [semId, setSemId] = useState("");
  const [credits, setCredits] = useState(4);
  const [lectureHours, setLectureHours] = useState(3);
  const [labHours, setLabHours] = useState(0);
  const [totalPeriods, setTotalPeriods] = useState(4);
  const [subjectType, setSubjectType] = useState<SubjectType>("THEORY");
  const [isActive, setIsActive] = useState(true);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Confirm state
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    subject: Subject | null;
    targetActive: boolean;
  }>({
    open: false,
    subject: null,
    targetActive: false,
  });

  const openCreateModal = () => {
    setEditingSubject(null);
    setCode("");
    setName("");
    setDeptId(departments[0]?.id || "");
    setSemId(semesters[0]?.id || "");
    setCredits(4);
    setLectureHours(3);
    setLabHours(0);
    setTotalPeriods(4);
    setSubjectType("THEORY");
    setIsActive(true);
    setErrorMsg(null);
    setModalOpen(true);
  };

  const openEditModal = (sub: Subject) => {
    setEditingSubject(sub);
    setCode(sub.code);
    setName(sub.name);
    setDeptId(sub.department_id);
    setSemId(sub.semester_id);
    setCredits(sub.credits);
    setLectureHours(sub.lecture_hours_per_week);
    setLabHours(sub.lab_hours_per_week);
    setTotalPeriods(sub.total_weekly_periods);
    setSubjectType(sub.subject_type);
    setIsActive(sub.is_active);
    setErrorMsg(null);
    setModalOpen(true);
  };

  const handleTypeChange = (type: SubjectType) => {
    setSubjectType(type);
    if (type === "LABORATORY") {
      setLectureHours(0);
      setLabHours(3);
      setCredits(2);
      setTotalPeriods(3);
    } else if (type === "THEORY") {
      setLectureHours(3);
      setLabHours(0);
      setCredits(4);
      setTotalPeriods(4);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    try {
      const isLab = subjectType === "LABORATORY";
      const res = editingSubject
        ? await updateSubjectAction({
            id: editingSubject.id,
            code: code.trim().toUpperCase(),
            name: name.trim(),
            department_id: deptId,
            semester_id: semId,
            credits,
            lecture_hours_per_week: lectureHours,
            lab_hours_per_week: labHours,
            total_weekly_periods: totalPeriods,
            is_lab: isLab,
            subject_type: subjectType,
            is_active: isActive,
          })
        : await createSubjectAction({
            code: code.trim().toUpperCase(),
            name: name.trim(),
            department_id: deptId,
            semester_id: semId,
            credits,
            lecture_hours_per_week: lectureHours,
            lab_hours_per_week: labHours,
            total_weekly_periods: totalPeriods,
            is_lab: isLab,
            subject_type: subjectType,
            is_active: isActive,
          });

      if (!res.success) {
        setErrorMsg(res.error || "Failed to save subject");
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

  const handleToggleConfirm = async () => {
    if (!confirmState.subject) return;
    const res = await toggleSubjectActiveAction(confirmState.subject.id, confirmState.targetActive);
    if (!res.success) {
      alert(res.error || "Failed to change subject status");
      return;
    }
    window.location.reload();
  };

  const filteredSubjects = subjects.filter((s) => {
    const matchesDept = selectedDept === "ALL" || s.department_id === selectedDept;
    const matchesType = selectedType === "ALL" || s.subject_type === selectedType;
    return matchesDept && matchesType;
  });

  const columns: ColumnDef<Subject & { department?: Department; semester?: Semester }>[] = [
    {
      header: "Code",
      accessorKey: "code",
      cell: (row) => (
        <span className="font-mono font-bold text-xs tracking-wider px-2 py-1 rounded bg-muted/60 text-foreground border border-border/50">
          {row.code}
        </span>
      ),
      className: "w-28",
    },
    {
      header: "Subject Title",
      accessorKey: "name",
      cell: (row) => (
        <div>
          <div className="font-semibold text-foreground">{row.name}</div>
          <div className="text-xs text-muted-foreground">
            {row.department?.code} • Sem {row.semester?.semester_number}
          </div>
        </div>
      ),
    },
    {
      header: "Type",
      accessorKey: "subject_type",
      cell: (row) => (
        <Badge
          variant="outline"
          className={`text-[11px] font-semibold px-2 py-0.5 ${
            TYPE_BADGE_STYLES[row.subject_type] || ""
          }`}
        >
          {row.subject_type}
        </Badge>
      ),
      className: "w-28",
    },
    {
      header: "Credits",
      accessorKey: "credits",
      cell: (row) => (
        <span className="font-semibold text-xs text-foreground">{row.credits} Credits</span>
      ),
      className: "w-24",
    },
    {
      header: "Weekly Load",
      cell: (row) => (
        <div className="text-xs">
          <span className="font-bold text-primary">{row.total_weekly_periods} periods/wk</span>
          <div className="text-[10px] text-muted-foreground">
            {row.lecture_hours_per_week}L + {row.lab_hours_per_week}P
          </div>
        </div>
      ),
      className: "w-32",
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
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => openEditModal(row)}
              className="h-8 w-8 p-0"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setConfirmState({
                  open: true,
                  subject: row,
                  targetActive: !row.is_active,
                })
              }
              className={`h-8 w-8 p-0 ${
                row.is_active ? "text-rose-500" : "text-emerald-500"
              }`}
            >
              <Power className="w-3.5 h-3.5" />
            </Button>
          </div>
        );
      },
      className: "w-24 text-right",
    },
  ];

  return (
    <div className="space-y-6">
      <DataTable
        data={filteredSubjects}
        columns={columns}
        title="Curriculum Course Catalog"
        description="Course definitions, credit weights, and weekly periods required for AI timetable generation."
        searchPlaceholder="Search subjects by code or title..."
        filterSlot={
          <div className="flex items-center gap-2">
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="h-9 px-3 rounded-lg border border-border/70 bg-background text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="ALL">All Departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.code} — {d.name}
                </option>
              ))}
            </select>

            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="h-9 px-3 rounded-lg border border-border/70 bg-background text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="ALL">All Subject Types</option>
              <option value="THEORY">Theory</option>
              <option value="LABORATORY">Laboratory</option>
              <option value="PRACTICAL">Practical</option>
              <option value="ELECTIVE">Elective</option>
              <option value="PROJECT">Project</option>
            </select>
          </div>
        }
        actionSlot={
          canManage && (
            <Button onClick={openCreateModal} size="sm" className="gap-2">
              <Plus className="w-4 h-4" />
              Add Subject
            </Button>
          )
        }
        emptyMessage="No subjects configured."
      />

      {/* Modal Dialog */}
      <ModalDialog
        open={modalOpen}
        onClose={() => !loading && setModalOpen(false)}
        title={editingSubject ? "Edit Curriculum Subject" : "Create Curriculum Subject"}
        description="Specify period loads accurately for Phase 4 OR-Tools CP-SAT optimizer."
        maxWidth="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {errorMsg && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/15 text-destructive text-sm border border-destructive/20">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Subject Code <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. CS501 or CSL51"
                className="w-full h-10 px-3 rounded-lg border border-border/70 bg-background text-sm font-mono uppercase"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Subject Type <span className="text-rose-500">*</span>
              </label>
              <select
                value={subjectType}
                onChange={(e) => handleTypeChange(e.target.value as SubjectType)}
                className="w-full h-10 px-3 rounded-lg border border-border/70 bg-background text-sm"
              >
                <option value="THEORY">Theory</option>
                <option value="LABORATORY">Laboratory</option>
                <option value="PRACTICAL">Practical</option>
                <option value="ELECTIVE">Elective</option>
                <option value="PROJECT">Project</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Subject Title <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Database Management Systems"
              className="w-full h-10 px-3 rounded-lg border border-border/70 bg-background text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Department <span className="text-rose-500">*</span>
              </label>
              <select
                value={deptId}
                onChange={(e) => setDeptId(e.target.value)}
                required
                className="w-full h-10 px-3 rounded-lg border border-border/70 bg-background text-sm"
              >
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.code} — {d.name}
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
                    Sem {s.semester_number} ({s.name})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Credits <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                min={1}
                max={10}
                required
                value={credits}
                onChange={(e) => setCredits(Number(e.target.value))}
                className="w-full h-9 px-3 rounded-lg border border-border/70 bg-background text-sm"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Lecture Hrs/Wk
              </label>
              <input
                type="number"
                min={0}
                max={10}
                value={lectureHours}
                onChange={(e) => setLectureHours(Number(e.target.value))}
                className="w-full h-9 px-3 rounded-lg border border-border/70 bg-background text-sm"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Lab Hrs/Wk
              </label>
              <input
                type="number"
                min={0}
                max={10}
                value={labHours}
                onChange={(e) => setLabHours(Number(e.target.value))}
                className="w-full h-9 px-3 rounded-lg border border-border/70 bg-background text-sm"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Total Periods <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                min={1}
                max={15}
                required
                value={totalPeriods}
                onChange={(e) => setTotalPeriods(Number(e.target.value))}
                className="w-full h-9 px-3 rounded-lg border border-border/70 bg-background text-sm font-bold text-primary"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="rounded border-border text-primary h-4 w-4"
              />
              <span>Subject is active in curriculum</span>
            </label>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Subject"}
              </Button>
            </div>
          </div>
        </form>
      </ModalDialog>

      {/* Confirmation Dialog */}
      <ConfirmDialog
        open={confirmState.open}
        onClose={() => setConfirmState({ open: false, subject: null, targetActive: false })}
        onConfirm={handleToggleConfirm}
        title={confirmState.targetActive ? "Activate Subject" : "Deactivate Subject"}
        description={`Are you sure you want to ${
          confirmState.targetActive ? "activate" : "deactivate"
        } ${confirmState.subject?.code} (${confirmState.subject?.name})? Student enrollments and teaching records will be preserved.`}
        confirmText={confirmState.targetActive ? "Activate" : "Deactivate"}
        isDestructive={!confirmState.targetActive}
      />
    </div>
  );
}
