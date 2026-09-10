"use client";

import React, { useState } from "react";
import { Faculty, Department, Profile } from "@/types/database";
import { DataTable, ColumnDef } from "@/components/common/data-table";
import { StatusBadge } from "@/components/common/status-badge";
import { ModalDialog } from "@/components/common/modal-dialog";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  createFacultyAction,
  updateFacultyAction,
  toggleFacultyActiveAction,
} from "@/server/actions/faculty";
import { Plus, Edit2, Power, Users, Loader2, AlertCircle, UserCheck } from "lucide-react";

interface FacultyClientProps {
  facultyList: (Faculty & { department?: Department; profile?: Profile | null })[];
  departments: Department[];
  unlinkedProfiles: Profile[];
  canManage: boolean;
}

export function FacultyClient({
  facultyList: initialFaculty,
  departments,
  unlinkedProfiles,
  canManage,
}: FacultyClientProps) {
  const [facultyList] = useState(initialFaculty);
  const [selectedDept, setSelectedDept] = useState<string>("ALL");

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingFaculty, setEditingFaculty] = useState<Faculty | null>(null);

  const [employeeId, setEmployeeId] = useState("");
  const [deptId, setDeptId] = useState("");
  const [designation, setDesignation] = useState("");
  const [qualification, setQualification] = useState("");
  const [specialization, setSpecialization] = useState("");
  const [joiningDate, setJoiningDate] = useState("");
  const [maxHours, setMaxHours] = useState(20);
  const [profileId, setProfileId] = useState("");
  const [isActive, setIsActive] = useState(true);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Confirm state
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    fac: Faculty | null;
    targetActive: boolean;
  }>({
    open: false,
    fac: null,
    targetActive: false,
  });

  const openCreateModal = () => {
    setEditingFaculty(null);
    setEmployeeId("");
    setDeptId(departments[0]?.id || "");
    setDesignation("Assistant Professor");
    setQualification("M.Tech in Computer Science");
    setSpecialization("");
    setJoiningDate(new Date().toISOString().split("T")[0]);
    setMaxHours(20);
    setProfileId("");
    setIsActive(true);
    setErrorMsg(null);
    setModalOpen(true);
  };

  const openEditModal = (f: Faculty) => {
    setEditingFaculty(f);
    setEmployeeId(f.employee_id);
    setDeptId(f.department_id);
    setDesignation(f.designation);
    setQualification(f.qualification);
    setSpecialization(f.specialization || "");
    setJoiningDate(f.joining_date || "");
    setMaxHours(f.max_weekly_hours);
    setProfileId(f.profile_id || "");
    setIsActive(f.is_active);
    setErrorMsg(null);
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    try {
      const res = editingFaculty
        ? await updateFacultyAction({
            id: editingFaculty.id,
            employee_id: employeeId.trim().toUpperCase(),
            department_id: deptId,
            designation: designation.trim(),
            qualification: qualification.trim(),
            specialization: specialization.trim() || null,
            joining_date: joiningDate || null,
            max_weekly_hours: maxHours,
            profile_id: profileId || null,
            is_active: isActive,
          })
        : await createFacultyAction({
            employee_id: employeeId.trim().toUpperCase(),
            department_id: deptId,
            designation: designation.trim(),
            qualification: qualification.trim(),
            specialization: specialization.trim() || null,
            joining_date: joiningDate || null,
            max_weekly_hours: maxHours,
            profile_id: profileId || null,
            is_active: isActive,
          });

      if (!res.success) {
        setErrorMsg(res.error || "Failed to save faculty record");
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
    if (!confirmState.fac) return;
    const res = await toggleFacultyActiveAction(confirmState.fac.id, confirmState.targetActive);
    if (!res.success) {
      alert(res.error || "Failed to change faculty status");
      return;
    }
    window.location.reload();
  };

  const filteredFaculty =
    selectedDept === "ALL"
      ? facultyList
      : facultyList.filter((f) => f.department_id === selectedDept);

  const columns: ColumnDef<Faculty & { department?: Department; profile?: Profile | null }>[] = [
    {
      header: "Employee ID",
      accessorKey: "employee_id",
      cell: (row) => (
        <span className="font-mono font-bold text-xs tracking-wider px-2 py-1 rounded bg-muted/60 text-foreground border border-border/50">
          {row.employee_id}
        </span>
      ),
      className: "w-32",
    },
    {
      header: "Faculty Name & Profile",
      cell: (row) => {
        const prof = row.profile;
        return (
          <div>
            <div className="font-semibold text-foreground flex items-center gap-1.5">
              {prof ? `${prof.first_name} ${prof.last_name}` : "Faculty Member"}
              {prof && (
                <span title="Linked to Supabase Auth Account">
                  <UserCheck className="w-3.5 h-3.5 text-emerald-500 inline" />
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground">{row.designation}</div>
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
      className: "w-28",
    },
    {
      header: "Qualification & Expertise",
      cell: (row) => (
        <div>
          <div className="text-xs text-foreground font-medium">{row.qualification}</div>
          {row.specialization && (
            <div className="text-[11px] text-muted-foreground italic line-clamp-1">
              {row.specialization}
            </div>
          )}
        </div>
      ),
    },
    {
      header: "Max Hours",
      accessorKey: "max_weekly_hours",
      cell: (row) => (
        <Badge variant="outline" className="text-xs">
          {row.max_weekly_hours} hrs/wk
        </Badge>
      ),
      className: "w-28",
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
                  fac: row,
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
        data={filteredFaculty}
        columns={columns}
        title="Teaching Faculty Directory"
        description="Institutional professors, workload quotas, and subject allocation linkages."
        searchPlaceholder="Search faculty by employee ID, designation..."
        filterSlot={
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
        }
        actionSlot={
          canManage && (
            <Button onClick={openCreateModal} size="sm" className="gap-2">
              <Plus className="w-4 h-4" />
              Register Faculty
            </Button>
          )
        }
        emptyMessage="No faculty records registered."
      />

      {/* Modal Dialog */}
      <ModalDialog
        open={modalOpen}
        onClose={() => !loading && setModalOpen(false)}
        title={editingFaculty ? "Edit Faculty Profile" : "Register Faculty Member"}
        description="Maintain academic credentials and workload thresholds for timetable optimization."
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
                Employee ID <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value.toUpperCase())}
                placeholder="e.g. FAC-CSE-005"
                className="w-full h-10 px-3 rounded-lg border border-border/70 bg-background text-sm font-mono uppercase"
              />
            </div>
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
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Designation <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={designation}
                onChange={(e) => setDesignation(e.target.value)}
                placeholder="e.g. Associate Professor"
                className="w-full h-10 px-3 rounded-lg border border-border/70 bg-background text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Qualification <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={qualification}
                onChange={(e) => setQualification(e.target.value)}
                placeholder="e.g. Ph.D in Computer Networks"
                className="w-full h-10 px-3 rounded-lg border border-border/70 bg-background text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Specialization / Research Areas
            </label>
            <input
              type="text"
              value={specialization}
              onChange={(e) => setSpecialization(e.target.value)}
              placeholder="e.g. Distributed Computing, Cloud Architectures"
              className="w-full h-10 px-3 rounded-lg border border-border/70 bg-background text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Max Weekly Hours (OR-Tools constraint)
              </label>
              <input
                type="number"
                min={1}
                max={50}
                value={maxHours}
                onChange={(e) => setMaxHours(Number(e.target.value))}
                className="w-full h-10 px-3 rounded-lg border border-border/70 bg-background text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Joining Date
              </label>
              <input
                type="date"
                value={joiningDate}
                onChange={(e) => setJoiningDate(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-border/70 bg-background text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Linked Supabase Auth Account (Optional)
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
              <span>Faculty member is active</span>
            </label>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Faculty"}
              </Button>
            </div>
          </div>
        </form>
      </ModalDialog>

      {/* Confirmation Dialog */}
      <ConfirmDialog
        open={confirmState.open}
        onClose={() => setConfirmState({ open: false, fac: null, targetActive: false })}
        onConfirm={handleToggleConfirm}
        title={confirmState.targetActive ? "Activate Faculty" : "Deactivate Faculty"}
        description={`Are you sure you want to ${
          confirmState.targetActive ? "activate" : "deactivate"
        } ${confirmState.fac?.employee_id}? Teaching assignments will remain safely archived.`}
        confirmText={confirmState.targetActive ? "Activate" : "Deactivate"}
        isDestructive={!confirmState.targetActive}
      />
    </div>
  );
}
