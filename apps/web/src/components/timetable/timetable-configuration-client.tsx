"use client";

import React, { useState, useMemo } from "react";
import {
  AcademicYear,
  Semester,
  ClassSection,
  TimetableConfiguration,
  TimetablePeriod,
  UserRole,
  BreakSlot,
} from "@/types/database";
import {
  createTimetableConfigurationAction,
  updateTimetableConfigurationAction,
  toggleConfigurationStatusAction,
  generatePeriodSlotsAction,
} from "@/server/actions/timetable";
import { extractConfigMetadata } from "@/lib/timetable/period-utils";
import { ModalDialog } from "@/components/common/modal-dialog";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import {
  CalendarDays,
  Clock,
  Coffee,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  Power,
  Layers,
  Sparkles,
  Info,
  Calendar,
} from "lucide-react";

interface TimetableConfigurationClientProps {
  canManage: boolean;
  userRole?: UserRole;
  academicYears: AcademicYear[];
  semesters: Semester[];
  classSections: (ClassSection & { department?: any })[];
  configurations: TimetableConfiguration[];
}

const DAY_NAMES: Record<number, { name: string; short: string }> = {
  1: { name: "Monday", short: "Mon" },
  2: { name: "Tuesday", short: "Tue" },
  3: { name: "Wednesday", short: "Wed" },
  4: { name: "Thursday", short: "Thu" },
  5: { name: "Friday", short: "Fri" },
  6: { name: "Saturday", short: "Sat" },
  7: { name: "Sunday", short: "Sun" },
};

function formatMinutesToTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function parseTimeToMinutes(timeStr: string): number {
  const [h, m] = (timeStr || "09:00").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function TimetableConfigurationClient({
  canManage,
  userRole,
  academicYears,
  semesters,
  classSections,
  configurations: initialConfigs,
}: TimetableConfigurationClientProps) {
  const [configurations, setConfigurations] = useState(initialConfigs);
  const [selectedConfigId, setSelectedConfigId] = useState<string>(
    initialConfigs[0]?.id || ""
  );

  // Active configuration selected
  const activeConfig = useMemo(() => {
    return configurations.find((c) => c.id === selectedConfigId) || configurations[0] || null;
  }, [configurations, selectedConfigId]);

  // Derived initial metadata for active configuration
  const activeMeta = useMemo(() => {
    return extractConfigMetadata(activeConfig?.break_after_periods);
  }, [activeConfig]);

  // Form states for currently viewed/edited configuration
  const [name, setName] = useState(activeConfig?.name || "");
  const [description, setDescription] = useState(activeConfig?.description || "");
  const [enabledDays, setEnabledDays] = useState<number[]>(activeMeta.enabled_days);
  const [periodsPerDay, setPeriodsPerDay] = useState<number>(activeConfig?.periods_per_day || 7);
  const [periodDuration, setPeriodDuration] = useState<number>(activeConfig?.period_duration_minutes || 55);
  const [startTime, setStartTime] = useState<string>(activeMeta.start_time.slice(0, 5) || "09:00");
  const [breaks, setBreaks] = useState<BreakSlot[]>(activeMeta.breaks);

  // Sync states whenever activeConfig changes
  React.useEffect(() => {
    if (activeConfig) {
      const meta = extractConfigMetadata(activeConfig.break_after_periods);
      setName(activeConfig.name);
      setDescription(activeConfig.description || "");
      setEnabledDays(meta.enabled_days);
      setPeriodsPerDay(activeConfig.periods_per_day);
      setPeriodDuration(activeConfig.period_duration_minutes);
      setStartTime(meta.start_time.slice(0, 5) || "09:00");
      setBreaks(meta.breaks);
    }
  }, [activeConfig]);

  // UI state
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Create Modal state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newYearId, setNewYearId] = useState(academicYears[0]?.id || "");
  const [newSemesterId, setNewSemesterId] = useState(semesters[0]?.id || "");
  const [newSectionId, setNewSectionId] = useState(classSections[0]?.id || "");
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Confirm Status Dialog state
  const [statusConfirmOpen, setStatusConfirmOpen] = useState(false);

  // Filter semesters based on selected year in create modal
  const filteredSemesters = useMemo(() => {
    return semesters.filter((s) => !newYearId || s.academic_year_id === newYearId);
  }, [semesters, newYearId]);

  // Filter sections based on selected semester in create modal
  const filteredSections = useMemo(() => {
    return classSections.filter((cs) => !newSemesterId || cs.semester_id === newSemesterId);
  }, [classSections, newSemesterId]);

  // Live Calculated Timeline preview
  const timelinePreview = useMemo(() => {
    const items: Array<
      | { type: "period"; number: number; start: string; end: string; duration: number }
      | { type: "break"; label: string; start: string; end: string; duration: number; afterPeriod: number }
    > = [];

    const breakMap = new Map<number, BreakSlot>();
    for (const b of breaks) {
      if (b.period < periodsPerDay) {
        breakMap.set(b.period, b);
      }
    }

    let currentMinutes = parseTimeToMinutes(startTime);

    for (let p = 1; p <= periodsPerDay; p++) {
      const slotStart = currentMinutes;
      const slotEnd = slotStart + periodDuration;

      items.push({
        type: "period",
        number: p,
        start: formatMinutesToTime(slotStart),
        end: formatMinutesToTime(slotEnd),
        duration: periodDuration,
      });

      currentMinutes = slotEnd;

      const brk = breakMap.get(p);
      if (brk) {
        const breakStart = currentMinutes;
        const breakEnd = breakStart + brk.duration;
        items.push({
          type: "break",
          label: brk.label,
          start: formatMinutesToTime(breakStart),
          end: formatMinutesToTime(breakEnd),
          duration: brk.duration,
          afterPeriod: p,
        });
        currentMinutes = breakEnd;
      }
    }

    return {
      items,
      totalDurationMinutes: currentMinutes - parseTimeToMinutes(startTime),
      endTime: formatMinutesToTime(currentMinutes),
    };
  }, [startTime, periodDuration, periodsPerDay, breaks]);

  // Handlers for working days
  const toggleDay = (dayNum: number) => {
    if (!canManage) return;
    if (enabledDays.includes(dayNum)) {
      if (enabledDays.length === 1) {
        setNotification({ type: "error", message: "At least one working day must remain enabled." });
        return;
      }
      setEnabledDays(enabledDays.filter((d) => d !== dayNum));
    } else {
      setEnabledDays([...enabledDays, dayNum].sort((a, b) => a - b));
    }
  };

  const applyDayPreset = (preset: "mon-fri" | "mon-sat") => {
    if (!canManage) return;
    if (preset === "mon-fri") setEnabledDays([1, 2, 3, 4, 5]);
    if (preset === "mon-sat") setEnabledDays([1, 2, 3, 4, 5, 6]);
  };

  // Handlers for breaks
  const addBreak = () => {
    if (!canManage) return;
    // Find first available period slot
    const usedPeriods = new Set(breaks.map((b) => b.period));
    let candidate = 2;
    while (candidate < periodsPerDay && usedPeriods.has(candidate)) {
      candidate++;
    }
    if (candidate >= periodsPerDay) {
      setNotification({ type: "error", message: "All valid break positions between periods are occupied." });
      return;
    }
    setBreaks([
      ...breaks,
      { period: candidate, duration: 15, label: candidate <= 2 ? "Tea Break" : "Lunch Break" },
    ]);
  };

  const removeBreak = (index: number) => {
    if (!canManage) return;
    setBreaks(breaks.filter((_, i) => i !== index));
  };

  const updateBreakField = (index: number, field: keyof BreakSlot, val: any) => {
    if (!canManage) return;
    const updated = [...breaks];
    updated[index] = { ...updated[index], [field]: val };
    setBreaks(updated);
  };

  // Save changes to configuration settings
  const handleSaveConfig = async () => {
    if (!canManage || !activeConfig) return;
    try {
      setSaving(true);
      setNotification(null);

      const res = await updateTimetableConfigurationAction({
        id: activeConfig.id,
        name,
        description,
        enabled_days: enabledDays,
        periods_per_day: periodsPerDay,
        period_duration_minutes: periodDuration,
        start_time: startTime + ":00",
        breaks,
      });

      if (!res.success) {
        setNotification({ type: "error", message: res.error || "Failed to update configuration." });
        return;
      }

      setNotification({ type: "success", message: "Configuration settings saved successfully!" });
    } catch (err: any) {
      setNotification({ type: "error", message: err.message || "An unexpected error occurred." });
    } finally {
      setSaving(false);
    }
  };

  // Generate / Regenerate period slots
  const handleGenerateSlots = async () => {
    if (!canManage || !activeConfig) return;
    try {
      setRegenerating(true);
      setNotification(null);

      // First save configuration parameters
      await updateTimetableConfigurationAction({
        id: activeConfig.id,
        name,
        description,
        enabled_days: enabledDays,
        periods_per_day: periodsPerDay,
        period_duration_minutes: periodDuration,
        start_time: startTime + ":00",
        breaks,
      });

      // Call period generation action
      const res = await generatePeriodSlotsAction({
        configuration_id: activeConfig.id,
      });

      if (!res.success) {
        setNotification({ type: "error", message: res.error || "Period generation failed." });
        return;
      }

      setNotification({
        type: "success",
        message: `Successfully generated ${res.data?.generated_count} period slots across ${enabledDays.length} active working days!`,
      });

      // Update local config period count
      setConfigurations((prev) =>
        prev.map((c) =>
          c.id === activeConfig.id
            ? { ...c, periods_count: res.data?.generated_count, periods: res.data?.slots }
            : c
        )
      );
    } catch (err: any) {
      setNotification({ type: "error", message: err.message || "An unexpected error occurred." });
    } finally {
      setRegenerating(false);
    }
  };

  // Toggle configuration active status
  const handleToggleActive = async () => {
    if (!canManage || !activeConfig) return;
    try {
      const nextActive = !activeConfig.is_active;
      const res = await toggleConfigurationStatusAction(activeConfig.id, nextActive);
      if (!res.success) {
        setNotification({ type: "error", message: res.error || "Failed to update status." });
        return;
      }
      setConfigurations((prev) =>
        prev.map((c) => (c.id === activeConfig.id ? { ...c, is_active: nextActive } : c))
      );
      setNotification({
        type: "success",
        message: `Configuration ${nextActive ? "activated" : "deactivated"} safely.`,
      });
    } catch (err: any) {
      setNotification({ type: "error", message: err.message || "Error toggling status." });
    }
  };

  // Create new configuration
  const handleCreateNew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;
    try {
      setCreateLoading(true);
      setCreateError(null);

      const res = await createTimetableConfigurationAction({
        academic_year_id: newYearId,
        semester_id: newSemesterId,
        section_id: newSectionId,
        name: newName,
        description: newDesc,
        enabled_days: [1, 2, 3, 4, 5, 6], // default 6 days
        periods_per_day: 7,
        period_duration_minutes: 55,
        start_time: "09:00:00",
        breaks: [
          { period: 2, duration: 20, label: "Tea Break" },
          { period: 4, duration: 45, label: "Lunch Break" },
        ],
        is_active: true,
      });

      if (!res.success || !res.data) {
        setCreateError(res.error || "Failed to create configuration.");
        return;
      }

      setConfigurations([res.data, ...configurations]);
      setSelectedConfigId(res.data.id);
      setCreateModalOpen(false);
      setNotification({ type: "success", message: "New timetable configuration created with standard period slots!" });
    } catch (err: any) {
      setCreateError(err.message || "Unexpected creation error.");
    } finally {
      setCreateLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Role Notice for Read-Only Users */}
      {!canManage && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-muted/50 border border-border text-muted-foreground text-sm">
          <Info className="w-5 h-5 text-primary shrink-0" />
          <div>
            <span className="font-semibold text-foreground">Read-Only Mode: </span>
            You are viewing the approved institutional timetable configuration. Period settings and working days are managed by academic administrators.
          </div>
        </div>
      )}

      {/* Notification Toast */}
      {notification && (
        <div
          className={`flex items-center justify-between p-4 rounded-xl text-sm border transition-all ${
            notification.type === "success"
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
              : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
          }`}
        >
          <div className="flex items-center gap-2.5">
            {notification.type === "success" ? (
              <CheckCircle2 className="w-5 h-5 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 shrink-0" />
            )}
            <span>{notification.message}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setNotification(null)}>
            Dismiss
          </Button>
        </div>
      )}

      {/* Top Configuration Selector Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-2xl bg-card border border-border/80 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full sm:w-auto">
          <label className="text-sm font-semibold text-foreground whitespace-nowrap">
            Selected Configuration:
          </label>
          <select
            value={selectedConfigId}
            onChange={(e) => setSelectedConfigId(e.target.value)}
            className="w-full sm:w-80 h-10 px-3 rounded-lg bg-background border border-border text-sm font-medium focus:ring-2 focus:ring-primary focus:outline-none"
          >
            {configurations.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.is_active ? "" : "(Inactive)"}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          {canManage && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStatusConfirmOpen(true)}
                className="gap-2"
                disabled={!activeConfig}
              >
                <Power className="w-4 h-4" />
                {activeConfig?.is_active ? "Deactivate" : "Activate"}
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setNewName("");
                  setNewDesc("");
                  setCreateError(null);
                  setCreateModalOpen(true);
                }}
                className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
              >
                <Plus className="w-4 h-4" />
                New Configuration
              </Button>
            </>
          )}
        </div>
      </div>

      {activeConfig ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* LEFT COLUMN: Configuration Controls (7 Cols) */}
          <div className="lg:col-span-7 space-y-6">
            {/* Header Metadata Card */}
            <div className="p-6 rounded-2xl bg-card border border-border/80 shadow-sm space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-bold text-foreground">
                    {activeConfig.name}
                  </h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {activeConfig.description || "No description provided."}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={activeConfig.is_active ? "ACTIVE" : "INACTIVE"} />
                  <span className="px-2.5 py-1 text-xs font-semibold rounded-md bg-muted text-muted-foreground border border-border">
                    {activeConfig.generation_status}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-border/60 text-xs">
                <div>
                  <span className="text-muted-foreground block">Academic Year</span>
                  <span className="font-semibold text-foreground">
                    {activeConfig.academic_year?.name || "2026-2027"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Semester</span>
                  <span className="font-semibold text-foreground">
                    {activeConfig.semester?.name || "5th Semester"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Class Section</span>
                  <span className="font-semibold text-foreground">
                    {activeConfig.section?.name || "Section A"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Persisted Slots</span>
                  <span className="font-semibold text-primary">
                    {activeConfig.periods_count || 0} Slots
                  </span>
                </div>
              </div>
            </div>

            {/* Working Days Selector Card */}
            <div className="p-6 rounded-2xl bg-card border border-border/80 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-primary" />
                    Working Days
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Select the weekly calendar days on which classes and period slots are active.
                  </p>
                </div>
                {canManage && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => applyDayPreset("mon-fri")}
                      className="text-xs text-primary hover:underline font-medium"
                    >
                      Mon–Fri (5d)
                    </button>
                    <span className="text-border">|</span>
                    <button
                      type="button"
                      onClick={() => applyDayPreset("mon-sat")}
                      className="text-xs text-primary hover:underline font-medium"
                    >
                      Mon–Sat (6d)
                    </button>
                  </div>
                )}
              </div>

              {/* Day Pills */}
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2.5 pt-1">
                {[1, 2, 3, 4, 5, 6, 7].map((dayNum) => {
                  const isEnabled = enabledDays.includes(dayNum);
                  const dayInfo = DAY_NAMES[dayNum];
                  return (
                    <button
                      key={dayNum}
                      type="button"
                      disabled={!canManage}
                      onClick={() => toggleDay(dayNum)}
                      className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all ${
                        isEnabled
                          ? "bg-primary/10 border-primary text-primary font-bold shadow-sm"
                          : "bg-muted/20 border-border/60 text-muted-foreground hover:bg-muted/40"
                      } ${!canManage ? "cursor-default" : "cursor-pointer"}`}
                    >
                      <span className="text-xs font-semibold">{dayInfo.short}</span>
                      <span className="text-[11px] font-normal opacity-80 mt-0.5">
                        {isEnabled ? "Enabled" : "Off"}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-1.5 pt-1">
                <Info className="w-3.5 h-3.5 text-primary" />
                <span>
                  {enabledDays.length} working days active ({enabledDays.map((d) => DAY_NAMES[d].short).join(", ")})
                </span>
              </div>
            </div>

            {/* Daily Period Settings Card */}
            <div className="p-6 rounded-2xl bg-card border border-border/80 shadow-sm space-y-4">
              <div>
                <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                  <Clock className="w-4 h-4 text-primary" />
                  Period Settings
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Establish daily start times, periods per day, and slot duration.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
                    Day Start Time
                  </label>
                  <input
                    type="time"
                    disabled={!canManage}
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg bg-background border border-border text-sm font-medium focus:ring-2 focus:ring-primary focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
                    Slot Duration (mins)
                  </label>
                  <input
                    type="number"
                    min={15}
                    max={180}
                    disabled={!canManage}
                    value={periodDuration}
                    onChange={(e) => setPeriodDuration(Number(e.target.value))}
                    className="w-full h-10 px-3 rounded-lg bg-background border border-border text-sm font-medium focus:ring-2 focus:ring-primary focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
                    Periods Per Day
                  </label>
                  <select
                    disabled={!canManage}
                    value={periodsPerDay}
                    onChange={(e) => setPeriodsPerDay(Number(e.target.value))}
                    className="w-full h-10 px-3 rounded-lg bg-background border border-border text-sm font-medium focus:ring-2 focus:ring-primary focus:outline-none"
                  >
                    {[4, 5, 6, 7, 8, 9, 10, 11, 12].map((num) => (
                      <option key={num} value={num}>
                        {num} Periods Daily
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Break Editor Card */}
            <div className="p-6 rounded-2xl bg-card border border-border/80 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                    <Coffee className="w-4 h-4 text-primary" />
                    Break Slots & Intermissions
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Configure tea breaks, lunch hours, or recesses positioned between period slots.
                  </p>
                </div>
                {canManage && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addBreak}
                    className="gap-1.5 text-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Break
                  </Button>
                )}
              </div>

              {breaks.length === 0 ? (
                <div className="p-4 rounded-xl bg-muted/20 border border-dashed border-border text-center text-xs text-muted-foreground">
                  No breaks scheduled. Period slots will run back-to-back.
                </div>
              ) : (
                <div className="space-y-3 pt-1">
                  {breaks.map((b, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-3 p-3.5 rounded-xl bg-muted/30 border border-border/60"
                    >
                      <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                        <Coffee className="w-4 h-4" />
                      </div>

                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div>
                          <label className="text-[10px] text-muted-foreground uppercase font-bold block mb-0.5">
                            Label
                          </label>
                          <input
                            type="text"
                            disabled={!canManage}
                            value={b.label}
                            onChange={(e) => updateBreakField(idx, "label", e.target.value)}
                            placeholder="e.g. Lunch Break"
                            className="w-full h-8 px-2.5 rounded-md bg-background border border-border text-xs focus:ring-1 focus:ring-primary focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] text-muted-foreground uppercase font-bold block mb-0.5">
                            After Period
                          </label>
                          <select
                            disabled={!canManage}
                            value={b.period}
                            onChange={(e) => updateBreakField(idx, "period", Number(e.target.value))}
                            className="w-full h-8 px-2 rounded-md bg-background border border-border text-xs focus:ring-1 focus:ring-primary focus:outline-none"
                          >
                            {Array.from({ length: periodsPerDay - 1 }, (_, i) => i + 1).map((pNum) => (
                              <option key={pNum} value={pNum}>
                                After Period {pNum}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="text-[10px] text-muted-foreground uppercase font-bold block mb-0.5">
                            Duration (mins)
                          </label>
                          <input
                            type="number"
                            min={5}
                            max={120}
                            disabled={!canManage}
                            value={b.duration}
                            onChange={(e) => updateBreakField(idx, "duration", Number(e.target.value))}
                            className="w-full h-8 px-2.5 rounded-md bg-background border border-border text-xs focus:ring-1 focus:ring-primary focus:outline-none"
                          />
                        </div>
                      </div>

                      {canManage && (
                        <button
                          type="button"
                          onClick={() => removeBreak(idx)}
                          className="p-1.5 text-muted-foreground hover:text-destructive transition-colors rounded-lg"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Action Bar */}
            {canManage && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 rounded-2xl bg-card border border-border/80 shadow-sm">
                <div className="text-xs text-muted-foreground">
                  Changes must be saved before slot regeneration can be performed.
                </div>
                <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                  <Button
                    variant="outline"
                    onClick={handleSaveConfig}
                    disabled={saving || regenerating}
                    className="gap-2"
                  >
                    {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                    Save Settings
                  </Button>
                  <Button
                    onClick={handleGenerateSlots}
                    disabled={saving || regenerating}
                    className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
                  >
                    {regenerating ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                    Generate Period Slots
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN: Live Schedule Timeline Preview (5 Cols) */}
          <div className="lg:col-span-5 space-y-6">
            <div className="p-6 rounded-2xl bg-card border border-border/80 shadow-sm sticky top-6">
              <div className="flex items-center justify-between pb-3 border-b border-border/60">
                <div>
                  <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-primary" />
                    Live Schedule Preview
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Calculated sequence for standard active days.
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-semibold text-primary block">
                    {startTime} – {timelinePreview.endTime}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {timelinePreview.totalDurationMinutes} mins total
                  </span>
                </div>
              </div>

              {/* Timeline slot list */}
              <div className="space-y-2.5 pt-4 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
                {timelinePreview.items.map((item, idx) => {
                  if (item.type === "period") {
                    return (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-3 rounded-xl bg-background border border-border/70 shadow-xs hover:border-primary/40 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
                            P{item.number}
                          </div>
                          <div>
                            <span className="text-xs font-semibold text-foreground block">
                              Period {item.number}
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              {item.duration} minutes instruction
                            </span>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="text-xs font-mono font-medium text-foreground">
                            {item.start} – {item.end}
                          </span>
                        </div>
                      </div>
                    );
                  } else {
                    return (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2.5 px-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300"
                      >
                        <div className="flex items-center gap-2.5">
                          <Coffee className="w-4 h-4" />
                          <span className="text-xs font-semibold">
                            {item.label} ({item.duration}m)
                          </span>
                        </div>
                        <span className="text-xs font-mono font-medium">
                          {item.start} – {item.end}
                        </span>
                      </div>
                    );
                  }
                })}
              </div>

              {/* Day Distribution Summary */}
              <div className="mt-4 pt-4 border-t border-border/60 text-xs text-muted-foreground flex justify-between items-center">
                <span>Total slots generated:</span>
                <span className="font-bold text-foreground">
                  {enabledDays.length * periodsPerDay} Slots ({enabledDays.length} days &times; {periodsPerDay} periods)
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-12 text-center rounded-2xl bg-card border border-border/80 space-y-3">
          <Layers className="w-10 h-10 text-muted-foreground mx-auto" />
          <h3 className="text-base font-bold text-foreground">No Timetable Configuration Found</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Create a configuration to establish the working days and period slots for your class sections.
          </p>
          {canManage && (
            <Button
              onClick={() => {
                setNewName("");
                setNewDesc("");
                setCreateError(null);
                setCreateModalOpen(true);
              }}
              className="gap-2 bg-primary text-primary-foreground"
            >
              <Plus className="w-4 h-4" />
              Create First Configuration
            </Button>
          )}
        </div>
      )}

      {/* CREATE NEW CONFIGURATION MODAL */}
      <ModalDialog
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Create Timetable Configuration"
        description="Establish scheduling configuration for an academic class section cohort."
      >
        <form onSubmit={handleCreateNew} className="space-y-4 pt-2">
          {createError && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-600 dark:text-rose-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{createError}</span>
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-foreground block mb-1">
              Configuration Name *
            </label>
            <input
              type="text"
              required
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. CSE-S5-A Master Schedule (Odd 2026)"
              className="w-full h-10 px-3 rounded-lg bg-background border border-border text-sm focus:ring-2 focus:ring-primary focus:outline-none"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-foreground block mb-1">
              Description
            </label>
            <textarea
              rows={2}
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Optional notes or details..."
              className="w-full p-2.5 rounded-lg bg-background border border-border text-sm focus:ring-2 focus:ring-primary focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-foreground block mb-1">
                Academic Year *
              </label>
              <select
                required
                value={newYearId}
                onChange={(e) => setNewYearId(e.target.value)}
                className="w-full h-10 px-3 rounded-lg bg-background border border-border text-sm focus:ring-2 focus:ring-primary focus:outline-none"
              >
                {academicYears.map((ay) => (
                  <option key={ay.id} value={ay.id}>
                    {ay.name} {ay.is_current ? "(Current)" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground block mb-1">
                Semester *
              </label>
              <select
                required
                value={newSemesterId}
                onChange={(e) => setNewSemesterId(e.target.value)}
                className="w-full h-10 px-3 rounded-lg bg-background border border-border text-sm focus:ring-2 focus:ring-primary focus:outline-none"
              >
                {filteredSemesters.map((sem) => (
                  <option key={sem.id} value={sem.id}>
                    {sem.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground block mb-1">
                Class Section *
              </label>
              <select
                required
                value={newSectionId}
                onChange={(e) => setNewSectionId(e.target.value)}
                className="w-full h-10 px-3 rounded-lg bg-background border border-border text-sm focus:ring-2 focus:ring-primary focus:outline-none"
              >
                {filteredSections.map((sec) => (
                  <option key={sec.id} value={sec.id}>
                    Section {sec.name} ({sec.code || sec.name})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createLoading}
              className="gap-2 bg-primary text-primary-foreground"
            >
              {createLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              Create & Generate Slots
            </Button>
          </div>
        </form>
      </ModalDialog>

      {/* CONFIRM STATUS TOGGLE DIALOG */}
      <ConfirmDialog
        open={statusConfirmOpen}
        onClose={() => setStatusConfirmOpen(false)}
        onConfirm={handleToggleActive}
        title={activeConfig?.is_active ? "Deactivate Configuration" : "Activate Configuration"}
        description={
          activeConfig?.is_active
            ? `Are you sure you want to deactivate '${activeConfig?.name}'? The configuration and its periods will remain preserved historically but inactive for future generation.`
            : `Activate '${activeConfig?.name}' for scheduling and solver consumption?`
        }
        confirmText={activeConfig?.is_active ? "Deactivate" : "Activate"}
        isDestructive={activeConfig?.is_active}
      />
    </div>
  );
}
