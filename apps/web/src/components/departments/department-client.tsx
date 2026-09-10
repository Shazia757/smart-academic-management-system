"use client";

import React, { useState } from "react";
import { Department, Profile } from "@/types/database";
import { DataTable, ColumnDef } from "@/components/common/data-table";
import { StatusBadge } from "@/components/common/status-badge";
import { ModalDialog } from "@/components/common/modal-dialog";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  createDepartmentAction,
  updateDepartmentAction,
  toggleDepartmentActiveAction,
} from "@/server/actions/departments";
import { Plus, Edit2, Power, Building2, Loader2, AlertCircle } from "lucide-react";

interface DepartmentClientProps {
  departments: (Department & { head_of_department?: Profile | null })[];
  facultyProfiles: Profile[];
  canManage: boolean;
}

export function DepartmentClient({
  departments: initialDepartments,
  facultyProfiles,
  canManage,
}: DepartmentClientProps) {
  const [departments] = useState(initialDepartments);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);

  // Form states
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [hodId, setHodId] = useState("");
  const [isActive, setIsActive] = useState(true);

  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Confirm dialog state
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    dept: Department | null;
    targetActive: boolean;
  }>({
    open: false,
    dept: null,
    targetActive: false,
  });

  const openCreateModal = () => {
    setEditingDept(null);
    setCode("");
    setName("");
    setDescription("");
    setHodId("");
    setIsActive(true);
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (dept: Department) => {
    setEditingDept(dept);
    setCode(dept.code);
    setName(dept.name);
    setDescription(dept.description || "");
    setHodId(dept.head_of_department_id || "");
    setIsActive(dept.is_active);
    setFormError(null);
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormLoading(true);

    try {
      if (editingDept) {
        const res = await updateDepartmentAction({
          id: editingDept.id,
          code: code.trim().toUpperCase(),
          name: name.trim(),
          description: description.trim() || null,
          head_of_department_id: hodId || null,
          is_active: isActive,
        });

        if (!res.success) {
          setFormError(res.error || "Failed to update department");
          setFormLoading(false);
          return;
        }
      } else {
        const res = await createDepartmentAction({
          code: code.trim().toUpperCase(),
          name: name.trim(),
          description: description.trim() || null,
          head_of_department_id: hodId || null,
          is_active: isActive,
        });

        if (!res.success) {
          setFormError(res.error || "Failed to create department");
          setFormLoading(false);
          return;
        }
      }

      setModalOpen(false);
      window.location.reload();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setFormLoading(false);
    }
  };

  const handleToggleConfirm = async () => {
    if (!confirmState.dept) return;
    const res = await toggleDepartmentActiveAction(confirmState.dept.id, confirmState.targetActive);
    if (!res.success) {
      alert(res.error || "Failed to change department status");
      return;
    }
    window.location.reload();
  };

  const columns: ColumnDef<Department & { head_of_department?: Profile | null }>[] = [
    {
      header: "Code",
      accessorKey: "code",
      cell: (row) => (
        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold tracking-wide bg-primary/10 text-primary border border-primary/20">
          {row.code}
        </span>
      ),
      className: "w-28",
    },
    {
      header: "Department Name",
      accessorKey: "name",
      cell: (row) => (
        <div>
          <div className="font-medium text-foreground">{row.name}</div>
          {row.description && (
            <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
              {row.description}
            </div>
          )}
        </div>
      ),
    },
    {
      header: "Head of Dept (HOD)",
      cell: (row) => {
        const hod = row.head_of_department;
        if (!hod) return <span className="text-muted-foreground text-xs italic">Unassigned</span>;
        return (
          <span className="text-xs font-medium text-foreground">
            {hod.first_name} {hod.last_name}
          </span>
        );
      },
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
              onClick={() => openEditModal(row)}
              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
              title="Edit Department"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setConfirmState({
                  open: true,
                  dept: row,
                  targetActive: !row.is_active,
                })
              }
              className={`h-8 w-8 p-0 ${
                row.is_active
                  ? "text-rose-500 hover:text-rose-600 hover:bg-rose-500/10"
                  : "text-emerald-500 hover:text-emerald-600 hover:bg-emerald-500/10"
              }`}
              title={row.is_active ? "Deactivate Department" : "Activate Department"}
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
        data={departments}
        columns={columns}
        title="Institutional Departments"
        description="Manage academic branches, departmental codes, and faculty leadership."
        searchPlaceholder="Search departments by code or name..."
        actionSlot={
          canManage && (
            <Button onClick={openCreateModal} size="sm" className="gap-2 shadow-sm">
              <Plus className="w-4 h-4" />
              Add Department
            </Button>
          )
        }
        emptyMessage="No departments configured yet."
      />

      {/* Create / Edit Modal */}
      <ModalDialog
        open={modalOpen}
        onClose={() => !formLoading && setModalOpen(false)}
        title={editingDept ? "Edit Department" : "Create New Department"}
        description="Department codes must be unique and follow uppercase formatting (e.g. CSE, ECE)."
        maxWidth="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/15 text-destructive text-sm border border-destructive/20">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Department Code <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. CSE"
              maxLength={20}
              className="w-full h-10 px-3 rounded-lg border border-border/70 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary font-mono uppercase"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Department Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Computer Science and Engineering"
              maxLength={150}
              className="w-full h-10 px-3 rounded-lg border border-border/70 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Department specialization, focus areas, and laboratories..."
              rows={3}
              maxLength={500}
              className="w-full p-3 rounded-lg border border-border/70 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Head of Department (HOD)
            </label>
            <select
              value={hodId}
              onChange={(e) => setHodId(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-border/70 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              <option value="">-- No HOD Assigned --</option>
              {facultyProfiles.map((p) => (
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
                className="rounded border-border text-primary focus:ring-primary h-4 w-4"
              />
              <span>Department is active</span>
            </label>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setModalOpen(false)}
                disabled={formLoading}
                size="sm"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={formLoading} size="sm">
                {formLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : editingDept ? (
                  "Update Department"
                ) : (
                  "Create Department"
                )}
              </Button>
            </div>
          </div>
        </form>
      </ModalDialog>

      {/* Deactivation / Activation Confirmation Dialog */}
      <ConfirmDialog
        open={confirmState.open}
        onClose={() => setConfirmState({ open: false, dept: null, targetActive: false })}
        onConfirm={handleToggleConfirm}
        title={confirmState.targetActive ? "Activate Department" : "Deactivate Department"}
        description={
          confirmState.targetActive
            ? `Are you sure you want to activate ${confirmState.dept?.name}? It will become selectable for sections and course curricula.`
            : `Are you sure you want to deactivate ${confirmState.dept?.name}? Historical class sections, timetables, and enrollments will be preserved safely.`
        }
        confirmText={confirmState.targetActive ? "Activate" : "Deactivate"}
        isDestructive={!confirmState.targetActive}
      />
    </div>
  );
}
