"use client";

import React, { useState } from "react";
import { Classroom, Department, RoomType } from "@/types/database";
import { DataTable, ColumnDef } from "@/components/common/data-table";
import { StatusBadge } from "@/components/common/status-badge";
import { ModalDialog } from "@/components/common/modal-dialog";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  createClassroomAction,
  updateClassroomAction,
  toggleClassroomActiveAction,
} from "@/server/actions/classrooms";
import { Plus, Edit2, Power, DoorOpen, Loader2, AlertCircle, Sparkles } from "lucide-react";

interface ClassroomClientProps {
  classrooms: (Classroom & { department?: Department | null })[];
  departments: Department[];
  canManage: boolean;
}

const ROOM_TYPE_LABELS: Record<RoomType, string> = {
  LECTURE_HALL: "Lecture Hall",
  LABORATORY: "Laboratory",
  SEMINAR_ROOM: "Seminar Room",
  AUDITORIUM: "Auditorium",
  TUTORIAL_ROOM: "Tutorial Room",
};

export function ClassroomClient({
  classrooms: initialClassrooms,
  departments,
  canManage,
}: ClassroomClientProps) {
  const [classrooms] = useState(initialClassrooms);
  const [selectedType, setSelectedType] = useState<string>("ALL");

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Classroom | null>(null);

  const [roomNumber, setRoomNumber] = useState("");
  const [building, setBuilding] = useState("");
  const [floor, setFloor] = useState(1);
  const [roomType, setRoomType] = useState<RoomType>("LECTURE_HALL");
  const [capacity, setCapacity] = useState(60);
  const [facilitiesText, setFacilitiesText] = useState("");
  const [deptId, setDeptId] = useState("");
  const [isAvailable, setIsAvailable] = useState(true);
  const [isActive, setIsActive] = useState(true);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Confirm state
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    room: Classroom | null;
    targetActive: boolean;
  }>({
    open: false,
    room: null,
    targetActive: false,
  });

  const openCreateModal = () => {
    setEditingRoom(null);
    setRoomNumber("");
    setBuilding("");
    setFloor(1);
    setRoomType("LECTURE_HALL");
    setCapacity(60);
    setFacilitiesText("PROJECTOR, AC, SMART_BOARD");
    setDeptId("");
    setIsAvailable(true);
    setIsActive(true);
    setErrorMsg(null);
    setModalOpen(true);
  };

  const openEditModal = (room: Classroom) => {
    setEditingRoom(room);
    setRoomNumber(room.room_number);
    setBuilding(room.building);
    setFloor(room.floor);
    setRoomType(room.room_type);
    setCapacity(room.capacity);
    setFacilitiesText(Array.isArray(room.facilities) ? room.facilities.join(", ") : "");
    setDeptId(room.department_id || "");
    setIsAvailable(room.is_available);
    setIsActive(room.is_active);
    setErrorMsg(null);
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    const facilities = facilitiesText
      .split(",")
      .map((f) => f.trim().toUpperCase())
      .filter(Boolean);

    try {
      const res = editingRoom
        ? await updateClassroomAction({
            id: editingRoom.id,
            room_number: roomNumber.trim(),
            building: building.trim(),
            floor,
            room_type: roomType,
            capacity,
            facilities,
            department_id: deptId || null,
            is_available: isAvailable,
            is_active: isActive,
          })
        : await createClassroomAction({
            room_number: roomNumber.trim(),
            building: building.trim(),
            floor,
            room_type: roomType,
            capacity,
            facilities,
            department_id: deptId || null,
            is_available: isAvailable,
            is_active: isActive,
          });

      if (!res.success) {
        setErrorMsg(res.error || "Failed to save classroom");
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
    if (!confirmState.room) return;
    const res = await toggleClassroomActiveAction(confirmState.room.id, confirmState.targetActive);
    if (!res.success) {
      alert(res.error || "Failed to change room status");
      return;
    }
    window.location.reload();
  };

  const filteredClassrooms =
    selectedType === "ALL"
      ? classrooms
      : classrooms.filter((r) => r.room_type === selectedType);

  const columns: ColumnDef<Classroom & { department?: Department | null }>[] = [
    {
      header: "Room #",
      accessorKey: "room_number",
      cell: (row) => (
        <span className="font-bold text-base tracking-wide text-foreground">
          {row.room_number}
        </span>
      ),
      className: "w-28",
    },
    {
      header: "Building & Floor",
      cell: (row) => (
        <div>
          <div className="font-medium text-foreground">{row.building}</div>
          <div className="text-xs text-muted-foreground">Floor {row.floor}</div>
        </div>
      ),
    },
    {
      header: "Type",
      accessorKey: "room_type",
      cell: (row) => {
        const isLab = row.room_type === "LABORATORY";
        return (
          <Badge
            variant="outline"
            className={`font-medium text-xs px-2.5 py-0.5 ${
              isLab
                ? "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20"
                : "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20"
            }`}
          >
            {ROOM_TYPE_LABELS[row.room_type] || row.room_type}
          </Badge>
        );
      },
    },
    {
      header: "Capacity",
      accessorKey: "capacity",
      cell: (row) => <span className="font-medium">{row.capacity} seats</span>,
    },
    {
      header: "Facilities",
      cell: (row) => {
        const facs = Array.isArray(row.facilities) ? row.facilities : [];
        if (facs.length === 0) return <span className="text-muted-foreground text-xs">—</span>;
        return (
          <div className="flex flex-wrap gap-1 max-w-xs">
            {facs.slice(0, 3).map((f, i) => (
              <span
                key={i}
                className="text-[10px] px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground border border-border/40 font-mono"
              >
                {f}
              </span>
            ))}
            {facs.length > 3 && (
              <span className="text-[10px] px-1 text-muted-foreground">
                +{facs.length - 3} more
              </span>
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
                  room: row,
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
        data={filteredClassrooms}
        columns={columns}
        title="Classrooms & Laboratories"
        description="Physical learning spaces available for timetable allocation and attendance sessions."
        searchPlaceholder="Search rooms by number, building..."
        filterSlot={
          <div className="flex items-center gap-1.5">
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="h-9 px-3 rounded-lg border border-border/70 bg-background text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="ALL">All Space Types</option>
              <option value="LECTURE_HALL">Lecture Halls</option>
              <option value="LABORATORY">Laboratories</option>
              <option value="SEMINAR_ROOM">Seminar Rooms</option>
              <option value="AUDITORIUM">Auditoriums</option>
              <option value="TUTORIAL_ROOM">Tutorial Rooms</option>
            </select>
          </div>
        }
        actionSlot={
          canManage && (
            <Button onClick={openCreateModal} size="sm" className="gap-2">
              <Plus className="w-4 h-4" />
              Add Room / Lab
            </Button>
          )
        }
        emptyMessage="No classrooms or laboratories configured."
      />

      {/* Modal Dialog */}
      <ModalDialog
        open={modalOpen}
        onClose={() => !loading && setModalOpen(false)}
        title={editingRoom ? "Edit Classroom / Lab" : "Add Classroom or Laboratory"}
        description="Physical resource parameters for timetable scheduling and capacity management."
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
                Room Number / Code <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={roomNumber}
                onChange={(e) => setRoomNumber(e.target.value.toUpperCase())}
                placeholder="e.g. LH-101 or LAB-CS1"
                className="w-full h-10 px-3 rounded-lg border border-border/70 bg-background text-sm font-mono uppercase"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Space Type <span className="text-rose-500">*</span>
              </label>
              <select
                value={roomType}
                onChange={(e) => setRoomType(e.target.value as RoomType)}
                className="w-full h-10 px-3 rounded-lg border border-border/70 bg-background text-sm"
              >
                <option value="LECTURE_HALL">Lecture Hall</option>
                <option value="LABORATORY">Laboratory</option>
                <option value="SEMINAR_ROOM">Seminar Room</option>
                <option value="AUDITORIUM">Auditorium</option>
                <option value="TUTORIAL_ROOM">Tutorial Room</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Building Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={building}
                onChange={(e) => setBuilding(e.target.value)}
                placeholder="e.g. Aryabhata Academic Block"
                className="w-full h-10 px-3 rounded-lg border border-border/70 bg-background text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                  Floor
                </label>
                <input
                  type="number"
                  min={0}
                  max={20}
                  value={floor}
                  onChange={(e) => setFloor(Number(e.target.value))}
                  className="w-full h-10 px-3 rounded-lg border border-border/70 bg-background text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                  Capacity <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  min={1}
                  max={1000}
                  required
                  value={capacity}
                  onChange={(e) => setCapacity(Number(e.target.value))}
                  className="w-full h-10 px-3 rounded-lg border border-border/70 bg-background text-sm"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Department Affiliation (Optional)
            </label>
            <select
              value={deptId}
              onChange={(e) => setDeptId(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-border/70 bg-background text-sm"
            >
              <option value="">-- Central / Shared Institutional Room --</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.code} — {d.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Facilities & Equipment (Comma-separated)
            </label>
            <input
              type="text"
              value={facilitiesText}
              onChange={(e) => setFacilitiesText(e.target.value)}
              placeholder="e.g. PROJECTOR, AC, SMART_BOARD, WORKSTATIONS"
              className="w-full h-10 px-3 rounded-lg border border-border/70 bg-background text-sm font-mono text-xs"
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="rounded border-border text-primary h-4 w-4"
              />
              <span>Room is active and schedulable</span>
            </label>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Room"}
              </Button>
            </div>
          </div>
        </form>
      </ModalDialog>

      {/* Confirmation Dialog */}
      <ConfirmDialog
        open={confirmState.open}
        onClose={() => setConfirmState({ open: false, room: null, targetActive: false })}
        onConfirm={handleToggleConfirm}
        title={confirmState.targetActive ? "Activate Classroom" : "Deactivate Classroom"}
        description={`Are you sure you want to ${
          confirmState.targetActive ? "activate" : "deactivate"
        } ${confirmState.room?.room_number}? Timetable session history will remain preserved.`}
        confirmText={confirmState.targetActive ? "Activate" : "Deactivate"}
        isDestructive={!confirmState.targetActive}
      />
    </div>
  );
}
