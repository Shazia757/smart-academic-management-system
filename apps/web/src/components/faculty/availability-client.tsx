"use client";

import React, { useState } from "react";
import { FacultyAvailability, Faculty, Department, Profile, AvailabilityStatus } from "@/types/database";
import { ModalDialog } from "@/components/common/modal-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  saveFacultyAvailabilityAction,
  deleteFacultyAvailabilityAction,
} from "@/server/actions/availability";
import { Clock, CheckCircle2, XCircle, AlertCircle, Loader2, User } from "lucide-react";

interface AvailabilityClientProps {
  facultyList: (Faculty & { department?: Department; profile?: Profile | null })[];
  initialAvailability: FacultyAvailability[];
  currentFacultyId?: string | null;
  isAdmin: boolean;
}

const DAYS = [
  { day: 1, label: "Monday" },
  { day: 2, label: "Tuesday" },
  { day: 3, label: "Wednesday" },
  { day: 4, label: "Thursday" },
  { day: 5, label: "Friday" },
  { day: 6, label: "Saturday" },
];

const PERIOD_SLOTS = [
  { slot: 1, time: "09:00 - 09:55", start: "09:00:00", end: "09:55:00" },
  { slot: 2, time: "09:55 - 10:50", start: "09:55:00", end: "10:50:00" },
  { slot: 3, time: "11:10 - 12:05", start: "11:10:00", end: "12:05:00" },
  { slot: 4, time: "12:05 - 13:00", start: "12:05:00", end: "13:00:00" },
  { slot: 5, time: "13:45 - 14:40", start: "13:45:00", end: "14:40:00" },
  { slot: 6, time: "14:40 - 15:35", start: "14:40:00", end: "15:35:00" },
  { slot: 7, time: "15:35 - 16:30", start: "15:35:00", end: "16:30:00" },
];

export function AvailabilityClient({
  facultyList,
  initialAvailability,
  currentFacultyId,
  isAdmin,
}: AvailabilityClientProps) {
  // Active faculty selection: default to current faculty or first faculty in list
  const defaultFacId = currentFacultyId || facultyList[0]?.id || "";
  const [selectedFacultyId, setSelectedFacultyId] = useState<string>(defaultFacId);
  const [availability, setAvailability] = useState<FacultyAvailability[]>(initialAvailability);

  // Edit slot modal
  const [modalOpen, setModalOpen] = useState(false);
  const [activeSlot, setActiveSlot] = useState<{
    day: number;
    slot: number;
    existing?: FacultyAvailability;
  } | null>(null);

  const [status, setStatus] = useState<AvailabilityStatus>("AVAILABLE");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [notes, setNotes] = useState("");

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const currentFaculty = facultyList.find((f) => f.id === selectedFacultyId);

  // Filter availability records for selected faculty
  const facultySlots = availability.filter((a) => a.faculty_id === selectedFacultyId);

  const getSlotRecord = (day: number, slot: number) => {
    return facultySlots.find((a) => a.day_of_week === day && a.period_slot === slot);
  };

  const handleCellClick = (day: number, slot: number) => {
    const record = getSlotRecord(day, slot);
    const standardTimes = PERIOD_SLOTS.find((p) => p.slot === slot);

    setActiveSlot({ day, slot, existing: record });
    setStatus(record ? record.availability_status : "AVAILABLE");
    setStartTime(record?.start_time || standardTimes?.start || "09:00:00");
    setEndTime(record?.end_time || standardTimes?.end || "09:55:00");
    setNotes(record?.notes || "");
    setErrorMsg(null);
    setModalOpen(true);
  };

  const handleSaveSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSlot || !selectedFacultyId) return;

    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await saveFacultyAvailabilityAction({
        faculty_id: selectedFacultyId,
        day_of_week: activeSlot.day,
        period_slot: activeSlot.slot,
        start_time: startTime || null,
        end_time: endTime || null,
        availability_status: status,
        is_available: status !== "UNAVAILABLE",
        notes: notes.trim() || null,
      });

      if (!res.success) {
        setErrorMsg(res.error || "Failed to save slot");
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

  const handleResetSlot = async () => {
    if (!activeSlot?.existing) return;
    setLoading(true);
    try {
      const res = await deleteFacultyAvailabilityAction(activeSlot.existing.id);
      if (!res.success) {
        alert(res.error || "Failed to reset slot");
        return;
      }
      setModalOpen(false);
      window.location.reload();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Selector & Legend Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-lg border border-border bg-card shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-md bg-primary/10 text-primary">
            <User className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Selected Instructor
            </div>
            {isAdmin ? (
              <select
                value={selectedFacultyId}
                onChange={(e) => setSelectedFacultyId(e.target.value)}
                className="font-semibold text-sm bg-transparent border-0 focus:outline-none focus:ring-0 cursor-pointer text-foreground underline decoration-primary/40 hover:decoration-primary"
              >
                {facultyList.map((f) => (
                  <option key={f.id} value={f.id} className="bg-background text-foreground">
                    {f.profile ? `${f.profile.first_name} ${f.profile.last_name}` : f.employee_id} (
                    {f.employee_id} • {f.department?.code})
                  </option>
                ))}
              </select>
            ) : (
              <div className="font-semibold text-sm text-foreground">
                {currentFaculty?.profile
                  ? `${currentFaculty.profile.first_name} ${currentFaculty.profile.last_name}`
                  : currentFaculty?.employee_id}{" "}
                <span className="text-xs text-muted-foreground font-normal">
                  ({currentFaculty?.employee_id})
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-emerald-500/30 border border-emerald-500" />
            <span className="text-muted-foreground">Available</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-amber-500/30 border border-amber-500" />
            <span className="text-muted-foreground">Preferred</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-rose-500/30 border border-rose-500" />
            <span className="text-muted-foreground">Unavailable</span>
          </div>
        </div>
      </div>

      {/* Weekly Schedule Grid */}
      <div className="rounded-lg border border-border bg-card shadow-xs overflow-hidden">
        <div className="p-4 border-b border-border/60 bg-muted/20 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              Weekly Recurring Availability Grid (Monday – Saturday)
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Click any period slot to configure availability status or wall-clock parameters for OR-Tools.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-center border-collapse">
            <thead>
              <tr className="bg-muted/40 border-b border-border/60 text-muted-foreground">
                <th className="p-3 font-semibold uppercase tracking-wider text-left w-32 border-r border-border/40">
                  Day of Week
                </th>
                {PERIOD_SLOTS.map((p) => (
                  <th key={p.slot} className="p-2.5 font-semibold min-w-[110px] border-r border-border/40 last:border-r-0">
                    <div className="font-bold text-foreground">Period {p.slot}</div>
                    <div className="text-[10px] text-muted-foreground font-normal">{p.time}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {DAYS.map((d) => (
                <tr key={d.day} className="hover:bg-muted/20 transition-colors">
                  <td className="p-3 text-left font-semibold text-foreground border-r border-border/40 bg-muted/10">
                    {d.label}
                  </td>
                  {PERIOD_SLOTS.map((p) => {
                    const record = getSlotRecord(d.day, p.slot);
                    const isUnavail = record?.availability_status === "UNAVAILABLE";
                    const isPref = record?.availability_status === "PREFERRED";

                    return (
                      <td
                        key={p.slot}
                        onClick={() => handleCellClick(d.day, p.slot)}
                        className={`p-2 border-r border-border/40 last:border-r-0 cursor-pointer transition-all hover:scale-[0.98] ${
                          isUnavail
                            ? "bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300"
                            : isPref
                            ? "bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300"
                            : "bg-emerald-500/5 hover:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                        }`}
                      >
                        <div className="py-1 px-1.5 rounded-lg text-[11px] font-medium flex flex-col items-center justify-center gap-0.5">
                          {isUnavail ? (
                            <>
                              <XCircle className="w-3.5 h-3.5 text-rose-500" />
                              <span className="font-semibold text-[10px]">UNAVAILABLE</span>
                            </>
                          ) : isPref ? (
                            <>
                              <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                              <span className="font-semibold text-[10px]">PREFERRED</span>
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                              <span className="text-[10px]">AVAILABLE</span>
                            </>
                          )}
                          {record?.notes && (
                            <span className="text-[9px] text-muted-foreground line-clamp-1 italic max-w-[95px]">
                              {record.notes}
                            </span>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Slot Modal */}
      <ModalDialog
        open={modalOpen}
        onClose={() => !loading && setModalOpen(false)}
        title={`Configure Period ${activeSlot?.slot} — ${
          DAYS.find((d) => d.day === activeSlot?.day)?.label
        }`}
        description="Weekly recurring constraint for OR-Tools timetable optimizer."
        maxWidth="sm"
      >
        <form onSubmit={handleSaveSlot} className="space-y-4">
          {errorMsg && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/15 text-destructive text-sm border border-destructive/20">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Availability Status
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setStatus("AVAILABLE")}
                className={`py-2 px-1 rounded-lg text-xs font-semibold border transition-all ${
                  status === "AVAILABLE"
                    ? "bg-emerald-500 text-white border-emerald-600 shadow-sm"
                    : "bg-muted/40 text-muted-foreground border-border/50 hover:bg-muted"
                }`}
              >
                Available
              </button>
              <button
                type="button"
                onClick={() => setStatus("PREFERRED")}
                className={`py-2 px-1 rounded-lg text-xs font-semibold border transition-all ${
                  status === "PREFERRED"
                    ? "bg-amber-500 text-white border-amber-600 shadow-sm"
                    : "bg-muted/40 text-muted-foreground border-border/50 hover:bg-muted"
                }`}
              >
                Preferred
              </button>
              <button
                type="button"
                onClick={() => setStatus("UNAVAILABLE")}
                className={`py-2 px-1 rounded-lg text-xs font-semibold border transition-all ${
                  status === "UNAVAILABLE"
                    ? "bg-rose-500 text-white border-rose-600 shadow-sm"
                    : "bg-muted/40 text-muted-foreground border-border/50 hover:bg-muted"
                }`}
              >
                Unavailable
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Start Time
              </label>
              <input
                type="time"
                step={60}
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-border/70 bg-background text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                End Time
              </label>
              <input
                type="time"
                step={60}
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-border/70 bg-background text-xs"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Reason / Constraint Notes (Optional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Lab supervision, Academic meeting"
              maxLength={150}
              className="w-full h-9 px-3 rounded-lg border border-border/70 bg-background text-xs"
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            {activeSlot?.existing ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleResetSlot}
                disabled={loading}
                className="text-rose-500 hover:text-rose-600 text-xs h-8"
              >
                Reset to Default
              </Button>
            ) : (
              <div />
            )}

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setModalOpen(false)}
                disabled={loading}
                className="h-8 text-xs"
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={loading} className="h-8 text-xs">
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save Slot"}
              </Button>
            </div>
          </div>
        </form>
      </ModalDialog>
    </div>
  );
}
