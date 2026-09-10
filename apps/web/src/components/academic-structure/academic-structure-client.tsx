"use client";

import React, { useState } from "react";
import { AcademicYear, Semester, ClassSection, Department } from "@/types/database";
import { DataTable, ColumnDef } from "@/components/common/data-table";
import { StatusBadge } from "@/components/common/status-badge";
import { ModalDialog } from "@/components/common/modal-dialog";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  createAcademicYearAction,
  updateAcademicYearAction,
  toggleAcademicYearActiveAction,
  createSemesterAction,
  updateSemesterAction,
  toggleSemesterActiveAction,
  createClassSectionAction,
  updateClassSectionAction,
  toggleClassSectionActiveAction,
} from "@/server/actions/academic-structure";
import {
  Plus,
  Edit2,
  Power,
  Calendar,
  Layers,
  GraduationCap,
  CheckCircle2,
  Loader2,
  AlertCircle,
} from "lucide-react";

interface AcademicStructureClientProps {
  academicYears: AcademicYear[];
  semesters: (Semester & { academic_year?: AcademicYear })[];
  classSections: (ClassSection & {
    department?: Department;
    semester?: Semester;
    academic_year?: AcademicYear;
  })[];
  departments: Department[];
  canManage: boolean;
}

export function AcademicStructureClient({
  academicYears,
  semesters,
  classSections,
  departments,
  canManage,
}: AcademicStructureClientProps) {
  const [activeTab, setActiveTab] = useState<"years" | "semesters" | "sections">("years");

  // --- ACADEMIC YEAR MODAL STATE ---
  const [yearModalOpen, setYearModalOpen] = useState(false);
  const [editingYear, setEditingYear] = useState<AcademicYear | null>(null);
  const [yearName, setYearName] = useState("");
  const [yearStart, setYearStart] = useState("");
  const [yearEnd, setYearEnd] = useState("");
  const [yearIsCurrent, setYearIsCurrent] = useState(false);
  const [yearIsActive, setYearIsActive] = useState(true);

  // --- SEMESTER MODAL STATE ---
  const [semModalOpen, setSemModalOpen] = useState(false);
  const [editingSem, setEditingSem] = useState<Semester | null>(null);
  const [semYearId, setSemYearId] = useState("");
  const [semName, setSemName] = useState("");
  const [semNumber, setSemNumber] = useState(1);
  const [semTerm, setSemTerm] = useState<"ODD" | "EVEN">("ODD");
  const [semStart, setSemStart] = useState("");
  const [semEnd, setSemEnd] = useState("");
  const [semIsActive, setSemIsActive] = useState(true);

  // --- SECTION MODAL STATE ---
  const [secModalOpen, setSecModalOpen] = useState(false);
  const [editingSec, setEditingSec] = useState<ClassSection | null>(null);
  const [secDeptId, setSecDeptId] = useState("");
  const [secYearId, setSecYearId] = useState("");
  const [secSemId, setSecSemId] = useState("");
  const [secName, setSecName] = useState("");
  const [secCode, setSecCode] = useState("");
  const [secCapacity, setSecCapacity] = useState(60);
  const [secIsActive, setSecIsActive] = useState(true);

  // Loading & error states
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Confirm dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    type: "year" | "semester" | "section";
    id: string;
    title: string;
    targetActive: boolean;
  }>({
    open: false,
    type: "year",
    id: "",
    title: "",
    targetActive: false,
  });

  // ---------------------------------------------------------------------------
  // HANDLERS: ACADEMIC YEARS
  // ---------------------------------------------------------------------------
  const openCreateYear = () => {
    setEditingYear(null);
    setYearName("");
    setYearStart("");
    setYearEnd("");
    setYearIsCurrent(false);
    setYearIsActive(true);
    setErrorMsg(null);
    setYearModalOpen(true);
  };

  const openEditYear = (y: AcademicYear) => {
    setEditingYear(y);
    setYearName(y.name);
    setYearStart(y.start_date);
    setYearEnd(y.end_date);
    setYearIsCurrent(y.is_current);
    setYearIsActive(y.is_active);
    setErrorMsg(null);
    setYearModalOpen(true);
  };

  const handleYearSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    const res = editingYear
      ? await updateAcademicYearAction({
          id: editingYear.id,
          name: yearName,
          start_date: yearStart,
          end_date: yearEnd,
          is_current: yearIsCurrent,
          is_active: yearIsActive,
        })
      : await createAcademicYearAction({
          name: yearName,
          start_date: yearStart,
          end_date: yearEnd,
          is_current: yearIsCurrent,
          is_active: yearIsActive,
        });

    setLoading(false);
    if (!res.success) {
      setErrorMsg(res.error || "Action failed");
      return;
    }
    setYearModalOpen(false);
    window.location.reload();
  };

  // ---------------------------------------------------------------------------
  // HANDLERS: SEMESTERS
  // ---------------------------------------------------------------------------
  const openCreateSem = () => {
    setEditingSem(null);
    setSemYearId(academicYears[0]?.id || "");
    setSemName("");
    setSemNumber(1);
    setSemTerm("ODD");
    setSemStart("");
    setSemEnd("");
    setSemIsActive(true);
    setErrorMsg(null);
    setSemModalOpen(true);
  };

  const openEditSem = (s: Semester) => {
    setEditingSem(s);
    setSemYearId(s.academic_year_id);
    setSemName(s.name);
    setSemNumber(s.semester_number);
    setSemTerm(s.term_type);
    setSemStart(s.start_date);
    setSemEnd(s.end_date);
    setSemIsActive(s.is_active);
    setErrorMsg(null);
    setSemModalOpen(true);
  };

  const handleSemSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    const res = editingSem
      ? await updateSemesterAction({
          id: editingSem.id,
          academic_year_id: semYearId,
          name: semName,
          semester_number: semNumber,
          term_type: semTerm,
          start_date: semStart,
          end_date: semEnd,
          is_active: semIsActive,
        })
      : await createSemesterAction({
          academic_year_id: semYearId,
          name: semName,
          semester_number: semNumber,
          term_type: semTerm,
          start_date: semStart,
          end_date: semEnd,
          is_active: semIsActive,
        });

    setLoading(false);
    if (!res.success) {
      setErrorMsg(res.error || "Action failed");
      return;
    }
    setSemModalOpen(false);
    window.location.reload();
  };

  // ---------------------------------------------------------------------------
  // HANDLERS: CLASS SECTIONS
  // ---------------------------------------------------------------------------
  const openCreateSec = () => {
    setEditingSec(null);
    setSecDeptId(departments[0]?.id || "");
    setSecYearId(academicYears[0]?.id || "");
    setSecSemId(semesters[0]?.id || "");
    setSecName("A");
    setSecCode("");
    setSecCapacity(60);
    setSecIsActive(true);
    setErrorMsg(null);
    setSecModalOpen(true);
  };

  const openEditSec = (sec: ClassSection) => {
    setEditingSec(sec);
    setSecDeptId(sec.department_id);
    setSecYearId(sec.academic_year_id);
    setSecSemId(sec.semester_id);
    setSecName(sec.name);
    setSecCode(sec.code);
    setSecCapacity(sec.capacity);
    setSecIsActive(sec.is_active);
    setErrorMsg(null);
    setSecModalOpen(true);
  };

  const handleSecSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    const autoCode = secCode.trim() || `SEC-${secName}`;
    const res = editingSec
      ? await updateClassSectionAction({
          id: editingSec.id,
          department_id: secDeptId,
          academic_year_id: secYearId,
          semester_id: secSemId,
          name: secName.trim(),
          code: autoCode,
          capacity: secCapacity,
          is_active: secIsActive,
        })
      : await createClassSectionAction({
          department_id: secDeptId,
          academic_year_id: secYearId,
          semester_id: secSemId,
          name: secName.trim(),
          code: autoCode,
          capacity: secCapacity,
          is_active: secIsActive,
        });

    setLoading(false);
    if (!res.success) {
      setErrorMsg(res.error || "Action failed");
      return;
    }
    setSecModalOpen(false);
    window.location.reload();
  };

  const handleToggleConfirm = async () => {
    const { type, id, targetActive } = confirmDialog;
    let res;
    if (type === "year") res = await toggleAcademicYearActiveAction(id, targetActive);
    else if (type === "semester") res = await toggleSemesterActiveAction(id, targetActive);
    else res = await toggleClassSectionActiveAction(id, targetActive);

    if (!res.success) {
      alert(res.error || "Failed to update status");
      return;
    }
    window.location.reload();
  };

  // ---------------------------------------------------------------------------
  // COLUMNS DEFINITIONS
  // ---------------------------------------------------------------------------
  const yearColumns: ColumnDef<AcademicYear>[] = [
    {
      header: "Academic Year",
      accessorKey: "name",
      cell: (row) => (
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground">{row.name}</span>
          {row.is_current && (
            <Badge className="bg-primary/15 text-primary border-primary/20 text-[10px] py-0 px-2">
              Current Session
            </Badge>
          )}
        </div>
      ),
    },
    {
      header: "Start Date",
      accessorKey: "start_date",
    },
    {
      header: "End Date",
      accessorKey: "end_date",
    },
    {
      header: "Status",
      accessorKey: "is_active",
      cell: (row) => <StatusBadge status={row.is_active} />,
      className: "w-28",
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
              onClick={() => openEditYear(row)}
              className="h-8 w-8 p-0"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setConfirmDialog({
                  open: true,
                  type: "year",
                  id: row.id,
                  title: `Academic Year ${row.name}`,
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

  const semColumns: ColumnDef<Semester & { academic_year?: AcademicYear }>[] = [
    {
      header: "Semester",
      accessorKey: "name",
      cell: (row) => (
        <div>
          <span className="font-semibold text-foreground">{row.name}</span>
          <div className="text-xs text-muted-foreground mt-0.5">
            Sem #{row.semester_number} ({row.term_type} Term)
          </div>
        </div>
      ),
    },
    {
      header: "Academic Year",
      cell: (row) => row.academic_year?.name || "—",
    },
    {
      header: "Duration",
      cell: (row) => `${row.start_date} to ${row.end_date}`,
    },
    {
      header: "Status",
      accessorKey: "is_active",
      cell: (row) => <StatusBadge status={row.is_active} />,
      className: "w-28",
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
              onClick={() => openEditSem(row)}
              className="h-8 w-8 p-0"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setConfirmDialog({
                  open: true,
                  type: "semester",
                  id: row.id,
                  title: `Semester ${row.name}`,
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

  const secColumns: ColumnDef<
    ClassSection & { department?: Department; semester?: Semester; academic_year?: AcademicYear }
  >[] = [
    {
      header: "Section",
      accessorKey: "name",
      cell: (row) => (
        <div className="flex items-center gap-2">
          <span className="font-bold text-base text-foreground">{row.name}</span>
          <Badge variant="outline" className="text-xs font-mono">
            {row.code}
          </Badge>
        </div>
      ),
    },
    {
      header: "Department",
      cell: (row) => (
        <span className="text-xs font-medium text-foreground">
          {row.department?.code} — {row.department?.name}
        </span>
      ),
    },
    {
      header: "Academic Session",
      cell: (row) => (
        <div className="text-xs">
          <div className="font-medium text-foreground">{row.semester?.name}</div>
          <div className="text-muted-foreground">{row.academic_year?.name}</div>
        </div>
      ),
    },
    {
      header: "Capacity",
      accessorKey: "capacity",
      cell: (row) => `${row.capacity} students`,
    },
    {
      header: "Status",
      accessorKey: "is_active",
      cell: (row) => <StatusBadge status={row.is_active} />,
      className: "w-28",
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
              onClick={() => openEditSec(row)}
              className="h-8 w-8 p-0"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setConfirmDialog({
                  open: true,
                  type: "section",
                  id: row.id,
                  title: `Section ${row.name}`,
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
      {/* Tabs Switcher */}
      <div className="flex items-center gap-2 border-b border-border/60 pb-3">
        <button
          onClick={() => setActiveTab("years")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
            activeTab === "years"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
          }`}
        >
          <Calendar className="w-4 h-4" />
          Academic Years ({academicYears.length})
        </button>
        <button
          onClick={() => setActiveTab("semesters")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
            activeTab === "semesters"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
          }`}
        >
          <Layers className="w-4 h-4" />
          Semesters ({semesters.length})
        </button>
        <button
          onClick={() => setActiveTab("sections")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
            activeTab === "sections"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
          }`}
        >
          <GraduationCap className="w-4 h-4" />
          Class Sections ({classSections.length})
        </button>
      </div>

      {/* Tab: Academic Years */}
      {activeTab === "years" && (
        <DataTable
          data={academicYears}
          columns={yearColumns}
          title="Academic Sessions"
          description="Manage institutional academic years and mark the active session."
          searchPlaceholder="Search academic years..."
          actionSlot={
            canManage && (
              <Button onClick={openCreateYear} size="sm" className="gap-2">
                <Plus className="w-4 h-4" />
                Add Academic Year
              </Button>
            )
          }
          emptyMessage="No academic years created."
        />
      )}

      {/* Tab: Semesters */}
      {activeTab === "semesters" && (
        <DataTable
          data={semesters}
          columns={semColumns}
          title="Curriculum Semesters"
          description="Configure terms, numbering, and calendar schedules per academic year."
          searchPlaceholder="Search semesters..."
          actionSlot={
            canManage && (
              <Button onClick={openCreateSem} size="sm" className="gap-2">
                <Plus className="w-4 h-4" />
                Add Semester
              </Button>
            )
          }
          emptyMessage="No semesters configured."
        />
      )}

      {/* Tab: Class Sections */}
      {activeTab === "sections" && (
        <DataTable
          data={classSections}
          columns={secColumns}
          title="Class Sections"
          description="Manage cohort divisions within departments and semesters for timetable allocations."
          searchPlaceholder="Search sections by name, code, or department..."
          actionSlot={
            canManage && (
              <Button onClick={openCreateSec} size="sm" className="gap-2">
                <Plus className="w-4 h-4" />
                Add Section
              </Button>
            )
          }
          emptyMessage="No class sections created."
        />
      )}

      {/* ========================================================================= */}
      {/* ACADEMIC YEAR MODAL */}
      {/* ========================================================================= */}
      <ModalDialog
        open={yearModalOpen}
        onClose={() => !loading && setYearModalOpen(false)}
        title={editingYear ? "Edit Academic Year" : "Add Academic Year"}
        description="Must be in YYYY-YYYY format with end date after start date."
        maxWidth="md"
      >
        <form onSubmit={handleYearSubmit} className="space-y-4">
          {errorMsg && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/15 text-destructive text-sm border border-destructive/20">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Year Name (YYYY-YYYY) <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={yearName}
              onChange={(e) => setYearName(e.target.value)}
              placeholder="e.g. 2026-2027"
              pattern="^[0-9]{4}-[0-9]{4}$"
              className="w-full h-10 px-3 rounded-lg border border-border/70 bg-background text-sm font-mono"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Start Date <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                required
                value={yearStart}
                onChange={(e) => setYearStart(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-border/70 bg-background text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                End Date <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                required
                value={yearEnd}
                onChange={(e) => setYearEnd(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-border/70 bg-background text-sm"
              />
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={yearIsCurrent}
                onChange={(e) => setYearIsCurrent(e.target.checked)}
                className="rounded border-border text-primary h-4 w-4"
              />
              <span className="font-medium">Set as Current Active Institutional Session</span>
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={yearIsActive}
                onChange={(e) => setYearIsActive(e.target.checked)}
                className="rounded border-border text-primary h-4 w-4"
              />
              <span>Session is active</span>
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setYearModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Academic Year"}
            </Button>
          </div>
        </form>
      </ModalDialog>

      {/* ========================================================================= */}
      {/* SEMESTER MODAL */}
      {/* ========================================================================= */}
      <ModalDialog
        open={semModalOpen}
        onClose={() => !loading && setSemModalOpen(false)}
        title={editingSem ? "Edit Semester" : "Add Semester"}
        description="Map curriculum semester to an academic year session."
        maxWidth="md"
      >
        <form onSubmit={handleSemSubmit} className="space-y-4">
          {errorMsg && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/15 text-destructive text-sm border border-destructive/20">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Academic Year <span className="text-rose-500">*</span>
            </label>
            <select
              value={semYearId}
              onChange={(e) => setSemYearId(e.target.value)}
              required
              className="w-full h-10 px-3 rounded-lg border border-border/70 bg-background text-sm"
            >
              {academicYears.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name} {y.is_current ? "(Current)" : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Semester Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={semName}
              onChange={(e) => setSemName(e.target.value)}
              placeholder="e.g. 5th Semester (Odd 2026)"
              className="w-full h-10 px-3 rounded-lg border border-border/70 bg-background text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Semester Number (1-10) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                min={1}
                max={10}
                required
                value={semNumber}
                onChange={(e) => setSemNumber(Number(e.target.value))}
                className="w-full h-10 px-3 rounded-lg border border-border/70 bg-background text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Term Type <span className="text-rose-500">*</span>
              </label>
              <select
                value={semTerm}
                onChange={(e) => setSemTerm(e.target.value as "ODD" | "EVEN")}
                className="w-full h-10 px-3 rounded-lg border border-border/70 bg-background text-sm"
              >
                <option value="ODD">ODD Term</option>
                <option value="EVEN">EVEN Term</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Start Date <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                required
                value={semStart}
                onChange={(e) => setSemStart(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-border/70 bg-background text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                End Date <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                required
                value={semEnd}
                onChange={(e) => setSemEnd(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-border/70 bg-background text-sm"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setSemModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Semester"}
            </Button>
          </div>
        </form>
      </ModalDialog>

      {/* ========================================================================= */}
      {/* SECTION MODAL */}
      {/* ========================================================================= */}
      <ModalDialog
        open={secModalOpen}
        onClose={() => !loading && setSecModalOpen(false)}
        title={editingSec ? "Edit Class Section" : "Add Class Section"}
        description="Prevent duplicates within same department, academic year, and semester."
        maxWidth="md"
      >
        <form onSubmit={handleSecSubmit} className="space-y-4">
          {errorMsg && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/15 text-destructive text-sm border border-destructive/20">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Department <span className="text-rose-500">*</span>
            </label>
            <select
              value={secDeptId}
              onChange={(e) => setSecDeptId(e.target.value)}
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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Academic Year <span className="text-rose-500">*</span>
              </label>
              <select
                value={secYearId}
                onChange={(e) => setSecYearId(e.target.value)}
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
                value={secSemId}
                onChange={(e) => setSecSemId(e.target.value)}
                required
                className="w-full h-10 px-3 rounded-lg border border-border/70 bg-background text-sm"
              >
                {semesters.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Section Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={secName}
                onChange={(e) => setSecName(e.target.value)}
                placeholder="e.g. A"
                maxLength={10}
                className="w-full h-10 px-3 rounded-lg border border-border/70 bg-background text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Section Code
              </label>
              <input
                type="text"
                value={secCode}
                onChange={(e) => setSecCode(e.target.value.toUpperCase())}
                placeholder="e.g. 5-A"
                maxLength={50}
                className="w-full h-10 px-3 rounded-lg border border-border/70 bg-background text-sm font-mono uppercase"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Capacity <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                min={1}
                max={300}
                required
                value={secCapacity}
                onChange={(e) => setSecCapacity(Number(e.target.value))}
                className="w-full h-10 px-3 rounded-lg border border-border/70 bg-background text-sm"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setSecModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Section"}
            </Button>
          </div>
        </form>
      </ModalDialog>

      {/* Confirmation Dialog */}
      <ConfirmDialog
        open={confirmDialog.open}
        onClose={() =>
          setConfirmDialog({
            open: false,
            type: "year",
            id: "",
            title: "",
            targetActive: false,
          })
        }
        onConfirm={handleToggleConfirm}
        title={confirmDialog.targetActive ? `Activate ${confirmDialog.title}` : `Deactivate ${confirmDialog.title}`}
        description={`Are you sure you want to ${
          confirmDialog.targetActive ? "activate" : "deactivate"
        } this record? Historical linkages will remain intact.`}
        confirmText={confirmDialog.targetActive ? "Activate" : "Deactivate"}
        isDestructive={!confirmDialog.targetActive}
      />
    </div>
  );
}
