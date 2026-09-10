"use client";

import React, { useState } from "react";
import { Student, Department, Semester, ClassSection, Profile } from "@/types/database";
import { DataTable, ColumnDef } from "@/components/common/data-table";
import { StatusBadge } from "@/components/common/status-badge";
import { ModalDialog } from "@/components/common/modal-dialog";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  createStudentAction,
  updateStudentAction,
  toggleStudentActiveAction,
} from "@/server/actions/students";
import { Plus, Edit2, Power, GraduationCap, Loader2, AlertCircle, UserCheck } from "lucide-react";

interface StudentClientProps {
  students: (Student & {
    department?: Department;
    section?: ClassSection;
    semester?: Semester;
    profile?: Profile | null;
  })[];
  departments: Department[];
  semesters: Semester[];
  sections: ClassSection[];
  unlinkedProfiles: Profile[];
  canManage: boolean;
}

export function StudentClient({
  students: initialStudents,
  departments,
  semesters,
  sections,
  unlinkedProfiles,
  canManage,
}: StudentClientProps) {
  const [students] = useState(initialStudents);

  // Filters
  const [selectedDept, setSelectedDept] = useState<string>("ALL");
  const [selectedSection, setSelectedSection] = useState<string>("ALL");

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);

  const [usn, setUsn] = useState("");
  const [rollNumber, setRollNumber] = useState("");
  const [deptId, setDeptId] = useState("");
  const [semId, setSemId] = useState("");
  const [secId, setSecId] = useState("");
  const [admissionYear, setAdmissionYear] = useState(new Date().getFullYear());
  const [admissionDate, setAdmissionDate] = useState(new Date().toISOString().split("T")[0]);
  const [guardianName, setGuardianName] = useState("");
  const [guardianContact, setGuardianContact] = useState("");
  const [profileId, setProfileId] = useState("");
  const [isActive, setIsActive] = useState(true);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Confirm state
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    student: Student | null;
    targetActive: boolean;
  }>({
    open: false,
    student: null,
    targetActive: false,
  });

  const openCreateModal = () => {
    setEditingStudent(null);
    setUsn("");
    setRollNumber("");
    setDeptId(departments[0]?.id || "");
    setSemId(semesters[0]?.id || "");
    setSecId(sections[0]?.id || "");
    setAdmissionYear(new Date().getFullYear());
    setAdmissionDate(new Date().toISOString().split("T")[0]);
    setGuardianName("");
    setGuardianContact("");
    setProfileId("");
    setIsActive(true);
    setErrorMsg(null);
    setModalOpen(true);
  };

  const openEditModal = (s: Student) => {
    setEditingStudent(s);
    setUsn(s.usn);
    setRollNumber(s.roll_number);
    setDeptId(s.department_id);
    setSemId(s.current_semester_id);
    setSecId(s.current_section_id);
    setAdmissionYear(s.admission_year);
    setAdmissionDate(s.admission_date || "");
    setGuardianName(s.guardian_name || "");
    setGuardianContact(s.guardian_contact || "");
    setProfileId(s.profile_id || "");
    setIsActive(s.is_active);
    setErrorMsg(null);
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    try {
      const res = editingStudent
        ? await updateStudentAction({
            id: editingStudent.id,
            usn: usn.trim().toUpperCase(),
            roll_number: rollNumber.trim(),
            department_id: deptId,
            current_semester_id: semId,
            current_section_id: secId,
            admission_year: admissionYear,
            admission_date: admissionDate,
            guardian_name: guardianName.trim() || null,
            guardian_contact: guardianContact.trim() || null,
            profile_id: profileId || null,
            is_active: isActive,
          })
        : await createStudentAction({
            usn: usn.trim().toUpperCase(),
            roll_number: rollNumber.trim(),
            department_id: deptId,
            current_semester_id: semId,
            current_section_id: secId,
            admission_year: admissionYear,
            admission_date: admissionDate,
            guardian_name: guardianName.trim() || null,
            guardian_contact: guardianContact.trim() || null,
            profile_id: profileId || null,
            is_active: isActive,
          });

      if (!res.success) {
        setErrorMsg(res.error || "Failed to save student record");
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
    if (!confirmState.student) return;
    const res = await toggleStudentActiveAction(confirmState.student.id, confirmState.targetActive);
    if (!res.success) {
      alert(res.error || "Failed to change student status");
      return;
    }
    window.location.reload();
  };

  const filteredStudents = students.filter((s) => {
    const matchesDept = selectedDept === "ALL" || s.department_id === selectedDept;
    const matchesSection = selectedSection === "ALL" || s.current_section_id === selectedSection;
    return matchesDept && matchesSection;
  });

  const columns: ColumnDef<
    Student & {
      department?: Department;
      section?: ClassSection;
      semester?: Semester;
      profile?: Profile | null;
    }
  >[] = [
    {
      header: "USN / Reg No.",
      accessorKey: "usn",
      cell: (row) => (
        <span className="font-mono font-bold text-xs tracking-wider px-2 py-1 rounded bg-primary/10 text-primary border border-primary/20">
          {row.usn}
        </span>
      ),
      className: "w-36",
    },
    {
      header: "Student Identity",
      cell: (row) => {
        const prof = row.profile;
        return (
          <div>
            <div className="font-semibold text-foreground flex items-center gap-1.5">
              {prof ? `${prof.first_name} ${prof.last_name}` : "Enrolled Student"}
              {prof && (
                <span title="Linked to Supabase Auth Student Account">
                  <UserCheck className="w-3.5 h-3.5 text-emerald-500 inline" />
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground font-mono">
              Roll #{row.roll_number}
            </div>
          </div>
        );
      },
    },
    {
      header: "Department",
      cell: (row) => (
        <span className="text-xs font-medium text-foreground">
          {row.department?.code}
        </span>
      ),
      className: "w-24",
    },
    {
      header: "Cohort Section",
      cell: (row) => (
        <div className="text-xs">
          <Badge variant="outline" className="font-semibold text-[11px] px-2">
            {row.section?.name || "Unassigned"}
          </Badge>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            Sem {row.semester?.semester_number}
          </div>
        </div>
      ),
      className: "w-32",
    },
    {
      header: "Admission",
      accessorKey: "admission_year",
      cell: (row) => (
        <div className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{row.admission_year}</span> Batch
        </div>
      ),
      className: "w-28",
    },
    {
      header: "Guardian",
      cell: (row) => {
        if (!row.guardian_name) return <span className="text-muted-foreground text-xs">—</span>;
        return (
          <div className="text-xs">
            <div className="text-foreground font-medium">{row.guardian_name}</div>
            {row.guardian_contact && (
              <div className="text-muted-foreground text-[10px]">{row.guardian_contact}</div>
            )}
          </div>
        );
      },
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
                  student: row,
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
        data={filteredStudents}
        columns={columns}
        title="Institutional Student Body"
        description="University Seat Numbers, departmental section allocations, and academic registrations."
        searchPlaceholder="Search students by USN, roll number, name..."
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
              value={selectedSection}
              onChange={(e) => setSelectedSection(e.target.value)}
              className="h-9 px-3 rounded-lg border border-border/70 bg-background text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="ALL">All Sections</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  Section {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>
        }
        actionSlot={
          canManage && (
            <Button onClick={openCreateModal} size="sm" className="gap-2">
              <Plus className="w-4 h-4" />
              Register Student
            </Button>
          )
        }
        emptyMessage="No students found matching your filters."
      />

      {/* Modal Dialog */}
      <ModalDialog
        open={modalOpen}
        onClose={() => !loading && setModalOpen(false)}
        title={editingStudent ? "Edit Student Record" : "Register New Student"}
        description="Ensure accurate USN registration to prevent enrollment and attendance record clashes."
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
                USN / University Reg. No. <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={usn}
                onChange={(e) => setUsn(e.target.value.toUpperCase())}
                placeholder="e.g. 1MS24CS001"
                className="w-full h-10 px-3 rounded-lg border border-border/70 bg-background text-sm font-mono uppercase"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Department Roll Number <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={rollNumber}
                onChange={(e) => setRollNumber(e.target.value)}
                placeholder="e.g. 24CSE01"
                className="w-full h-10 px-3 rounded-lg border border-border/70 bg-background text-sm font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
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
                    {d.code}
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
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Cohort Section <span className="text-rose-500">*</span>
              </label>
              <select
                value={secId}
                onChange={(e) => setSecId(e.target.value)}
                required
                className="w-full h-10 px-3 rounded-lg border border-border/70 bg-background text-sm"
              >
                {sections.map((sec) => (
                  <option key={sec.id} value={sec.id}>
                    Sec {sec.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Admission Year <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                min={2000}
                max={2100}
                required
                value={admissionYear}
                onChange={(e) => setAdmissionYear(Number(e.target.value))}
                className="w-full h-10 px-3 rounded-lg border border-border/70 bg-background text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Admission Date
              </label>
              <input
                type="date"
                value={admissionDate}
                onChange={(e) => setAdmissionDate(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-border/70 bg-background text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Guardian Name
              </label>
              <input
                type="text"
                value={guardianName}
                onChange={(e) => setGuardianName(e.target.value)}
                placeholder="Parent / Guardian full name"
                className="w-full h-10 px-3 rounded-lg border border-border/70 bg-background text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Guardian Contact Phone
              </label>
              <input
                type="text"
                value={guardianContact}
                onChange={(e) => setGuardianContact(e.target.value)}
                placeholder="+919876543210"
                className="w-full h-10 px-3 rounded-lg border border-border/70 bg-background text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Linked Student Portal Account (Optional)
            </label>
            <select
              value={profileId}
              onChange={(e) => setProfileId(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-border/70 bg-background text-sm"
            >
              <option value="">-- No Account Linked (Master Data Only) --</option>
              {unlinkedProfiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.first_name} {p.last_name} ({p.email})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between pt-2">
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="rounded border-border text-primary h-4 w-4"
              />
              <span>Student is actively enrolled</span>
            </label>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Student"}
              </Button>
            </div>
          </div>
        </form>
      </ModalDialog>

      {/* Confirmation Dialog */}
      <ConfirmDialog
        open={confirmState.open}
        onClose={() => setConfirmState({ open: false, student: null, targetActive: false })}
        onConfirm={handleToggleConfirm}
        title={confirmState.targetActive ? "Activate Student" : "Deactivate Student"}
        description={`Are you sure you want to ${
          confirmState.targetActive ? "activate" : "deactivate"
        } student ${confirmState.student?.usn}? Historical attendance and enrollment records will be preserved.`}
        confirmText={confirmState.targetActive ? "Activate" : "Deactivate"}
        isDestructive={!confirmState.targetActive}
      />
    </div>
  );
}
