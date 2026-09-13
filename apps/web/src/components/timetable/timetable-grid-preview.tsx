"use client";

import React, { useState, useMemo } from "react";
import { EnrichedScheduledEntry, TimetablePeriod } from "@/types/database";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  LayoutGrid,
  List,
  Search,
  Clock,
  User,
  DoorOpen,
  FlaskConical,
  BookOpen,
  Coffee,
  Calendar,
  Layers,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface TimetableGridPreviewProps {
  entries: EnrichedScheduledEntry[];
  periods?: TimetablePeriod[];
  enabledDays?: number[];
  sectionName?: string;
  academicYearName?: string;
  semesterName?: string;
}

const ALL_WEEKDAYS = [
  { day: 1, name: "Monday", short: "Mon" },
  { day: 2, name: "Tuesday", short: "Tue" },
  { day: 3, name: "Wednesday", short: "Wed" },
  { day: 4, name: "Thursday", short: "Thu" },
  { day: 5, name: "Friday", short: "Fri" },
  { day: 6, name: "Saturday", short: "Sat" },
];

function formatTime(timeStr?: string): string {
  if (!timeStr) return "";
  const parts = timeStr.split(":");
  if (parts.length < 2) return timeStr;
  const hours = parseInt(parts[0] || "0", 10);
  const minutes = parts[1] || "00";
  const ampm = hours >= 12 ? "PM" : "AM";
  const formattedHours = hours % 12 === 0 ? 12 : hours % 12;
  return `${formattedHours}:${minutes} ${ampm}`;
}

export function TimetableGridPreview({
  entries,
  periods = [],
  enabledDays,
  sectionName,
  academicYearName,
  semesterName,
}: TimetableGridPreviewProps) {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDayFilter, setSelectedDayFilter] = useState<number | "ALL">("ALL");

  // Determine active weekdays to render
  const weekdays = useMemo(() => {
    if (enabledDays && enabledDays.length > 0) {
      return ALL_WEEKDAYS.filter((w) => enabledDays.includes(w.day));
    }
    // Infer from periods or entries, defaulting to Mon-Sat (1..6)
    const activeDaySet = new Set<number>();
    for (const p of periods) {
      if (p.day_of_week >= 1 && p.day_of_week <= 6) activeDaySet.add(p.day_of_week);
    }
    for (const e of entries) {
      if (e.day_of_week >= 1 && e.day_of_week <= 6) activeDaySet.add(e.day_of_week);
    }
    if (activeDaySet.size > 0) {
      return ALL_WEEKDAYS.filter((w) => activeDaySet.has(w.day));
    }
    return ALL_WEEKDAYS;
  }, [enabledDays, periods, entries]);

  // Extract distinct period slots (sorted sequentially by period_number)
  const distinctPeriodRows = useMemo(() => {
    const periodMap = new Map<
      number,
      { periodNumber: number; startTime: string; endTime: string; isBreak: boolean }
    >();

    // Seed from configuration periods
    for (const p of periods) {
      if (!periodMap.has(p.period_number)) {
        periodMap.set(p.period_number, {
          periodNumber: p.period_number,
          startTime: p.start_time || "",
          endTime: p.end_time || "",
          isBreak: Boolean(p.is_break),
        });
      }
    }

    // Also inspect entries in case periods prop was omitted
    for (const e of entries) {
      if (!periodMap.has(e.period_number)) {
        periodMap.set(e.period_number, {
          periodNumber: e.period_number,
          startTime: e.period_start_time || "",
          endTime: e.period_end_time || "",
          isBreak: false,
        });
      }
    }

    // Default to standard 7 periods if nothing present
    if (periodMap.size === 0) {
      for (let i = 1; i <= 7; i++) {
        periodMap.set(i, {
          periodNumber: i,
          startTime: "",
          endTime: "",
          isBreak: false,
        });
      }
    }

    return Array.from(periodMap.values()).sort((a, b) => a.periodNumber - b.periodNumber);
  }, [periods, entries]);

  // Fast entry lookup: key = `${day_of_week}-${period_number}`
  const entryLookup = useMemo(() => {
    const map = new Map<string, EnrichedScheduledEntry>();
    for (const e of entries) {
      map.set(`${e.day_of_week}-${e.period_number}`, e);
    }
    return map;
  }, [entries]);

  // Search filtering
  const normalizedQuery = searchQuery.trim().toLowerCase();

  const isEntryMatchingQuery = (entry?: EnrichedScheduledEntry): boolean => {
    if (!entry) return false;
    if (!normalizedQuery) return true;
    return (
      (entry.subject_code || "").toLowerCase().includes(normalizedQuery) ||
      (entry.subject_name || "").toLowerCase().includes(normalizedQuery) ||
      (entry.faculty_name || "").toLowerCase().includes(normalizedQuery) ||
      (entry.room_number || "").toLowerCase().includes(normalizedQuery) ||
      (entry.session_type || "").toLowerCase().includes(normalizedQuery)
    );
  };

  // Grouped entries for List View
  const listEntriesByDay = useMemo(() => {
    const grouped = new Map<number, EnrichedScheduledEntry[]>();
    for (const w of weekdays) {
      grouped.set(w.day, []);
    }

    for (const e of entries) {
      if (isEntryMatchingQuery(e)) {
        const list = grouped.get(e.day_of_week) || [];
        list.push(e);
        grouped.set(e.day_of_week, list);
      }
    }

    // Sort entries within each day by period_number
    for (const [day, dayEntries] of grouped.entries()) {
      dayEntries.sort((a, b) => a.period_number - b.period_number);
      grouped.set(day, dayEntries);
    }

    return grouped;
  }, [entries, weekdays, normalizedQuery]);

  return (
    <div className="space-y-4">
      {/* Control Bar: View Toggle, Day Filter, Search */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 rounded-xl bg-card border border-border/70 shadow-sm">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {/* View Mode Toggle */}
          <div className="flex items-center p-1 rounded-lg bg-muted/60 border border-border/40">
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all",
                viewMode === "grid"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Grid View</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all",
                viewMode === "list"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <List className="w-3.5 h-3.5" />
              <span>List View</span>
            </button>
          </div>

          {/* Section badge indicator */}
          {sectionName && (
            <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg bg-primary/10 text-primary border border-primary/20">
              <Calendar className="w-3.5 h-3.5" />
              <span>Section: {sectionName}</span>
            </div>
          )}
        </div>

        {/* Search Input & List Filter */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search subject, faculty, room..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-border bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {viewMode === "list" && (
            <select
              value={selectedDayFilter}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedDayFilter(val === "ALL" ? "ALL" : parseInt(val, 10));
              }}
              className="px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="ALL">All Days</option>
              {weekdays.map((w) => (
                <option key={w.day} value={w.day}>
                  {w.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* GRID VIEW                                                                 */}
      {/* ========================================================================= */}
      {viewMode === "grid" && (
        <div className="rounded-xl border border-border/80 bg-card shadow-sm overflow-hidden">
          {/* Scrollable matrix container */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left min-w-[850px]">
              {/* Header Row: Days as Columns */}
              <thead>
                <tr className="border-b border-border/80 bg-muted/40 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  <th className="p-3 w-28 text-center border-r border-border/60 bg-muted/70">
                    Period / Time
                  </th>
                  {weekdays.map((w) => (
                    <th
                      key={w.day}
                      className="p-3 text-center border-r border-border/60 last:border-r-0 min-w-[150px]"
                    >
                      <div className="font-bold text-foreground text-sm">{w.short}</div>
                      <div className="text-[11px] font-normal text-muted-foreground capitalize">
                        {w.name}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>

              {/* Table Body: Periods as Rows */}
              <tbody className="divide-y divide-border/60 text-xs">
                {distinctPeriodRows.map((periodRow) => {
                  const isBreakRow = periodRow.isBreak;

                  return (
                    <tr
                      key={periodRow.periodNumber}
                      className={cn(
                        "transition-colors",
                        isBreakRow ? "bg-amber-50/40 dark:bg-amber-950/15" : "hover:bg-muted/15"
                      )}
                    >
                      {/* Period Time Slot Header (Row header) */}
                      <td className="p-2.5 text-center align-middle border-r border-border/60 bg-muted/20 font-medium">
                        <div className="font-bold text-foreground text-xs">
                          {isBreakRow ? "Break" : `P${periodRow.periodNumber}`}
                        </div>
                        {periodRow.startTime && periodRow.endTime ? (
                          <div className="text-[10px] text-muted-foreground whitespace-nowrap mt-0.5">
                            {formatTime(periodRow.startTime)}
                            <br />
                            <span className="text-[9px] opacity-75">to</span>{" "}
                            {formatTime(periodRow.endTime)}
                          </div>
                        ) : (
                          <div className="text-[10px] text-muted-foreground">
                            Slot {periodRow.periodNumber}
                          </div>
                        )}
                      </td>

                      {/* Day Columns for this period row */}
                      {weekdays.map((w) => {
                        const cellKey = `${w.day}-${periodRow.periodNumber}`;
                        const entry = entryLookup.get(cellKey);
                        const isMatch = isEntryMatchingQuery(entry);
                        const isDimmed = Boolean(normalizedQuery && entry && !isMatch);

                        // If period is a break slot, render break cell
                        if (isBreakRow) {
                          return (
                            <td
                              key={w.day}
                              className="p-2.5 text-center align-middle border-r border-border/60 last:border-r-0 bg-amber-50/50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300"
                            >
                              <div className="flex items-center justify-center gap-1 text-[11px] font-medium">
                                <Coffee className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                                <span>Recess</span>
                              </div>
                            </td>
                          );
                        }

                        // If no entry scheduled, render free period placeholder
                        if (!entry) {
                          return (
                            <td
                              key={w.day}
                              className="p-2 text-center align-middle border-r border-border/60 last:border-r-0 bg-card/40"
                            >
                              <div className="h-16 flex items-center justify-center rounded-lg border border-dashed border-border/40 text-muted-foreground/50 text-[11px]">
                                Free
                              </div>
                            </td>
                          );
                        }

                        // Render scheduled entry card
                        const isLab = entry.is_lab || entry.session_type === "LAB" || entry.session_type === "LABORATORY";

                        return (
                          <td
                            key={w.day}
                            className={cn(
                              "p-1.5 align-top border-r border-border/60 last:border-r-0 transition-opacity",
                              isDimmed && "opacity-25"
                            )}
                          >
                            <div
                              className={cn(
                                "p-2 rounded-lg border transition-all h-full flex flex-col justify-between shadow-xs",
                                isLab
                                  ? "bg-purple-50/70 dark:bg-purple-950/25 border-purple-200 dark:border-purple-800/60"
                                  : "bg-blue-50/70 dark:bg-blue-950/25 border-blue-200 dark:border-blue-800/60",
                                isMatch && normalizedQuery && "ring-2 ring-primary"
                              )}
                            >
                              {/* Top Bar: Subject Code & Session Badge */}
                              <div>
                                <div className="flex items-center justify-between gap-1 mb-1">
                                  <span className="font-bold text-xs text-foreground tracking-tight truncate">
                                    {entry.subject_code}
                                  </span>
                                  <span
                                    className={cn(
                                      "px-1.5 py-0.5 text-[9px] font-semibold rounded-md uppercase tracking-wider shrink-0",
                                      isLab
                                        ? "bg-purple-200/80 text-purple-900 dark:bg-purple-900/60 dark:text-purple-200"
                                        : "bg-blue-200/80 text-blue-900 dark:bg-blue-900/60 dark:text-blue-200"
                                    )}
                                  >
                                    {isLab ? "LAB" : "THEORY"}
                                  </span>
                                </div>

                                {/* Subject Name */}
                                <div
                                  className="text-[11px] font-medium text-foreground/90 line-clamp-1 leading-tight"
                                  title={entry.subject_name}
                                >
                                  {entry.subject_name}
                                </div>
                              </div>

                              {/* Bottom Details: Faculty & Room */}
                              <div className="mt-2 pt-1.5 border-t border-border/40 space-y-1 text-[10px] text-muted-foreground">
                                <div
                                  className="flex items-center gap-1 truncate"
                                  title={entry.faculty_name}
                                >
                                  <User className="w-2.5 h-2.5 shrink-0 text-muted-foreground" />
                                  <span className="truncate">{entry.faculty_name}</span>
                                </div>

                                <div className="flex items-center justify-between gap-1">
                                  <div
                                    className="flex items-center gap-1 truncate"
                                    title={`Room ${entry.room_number}`}
                                  >
                                    <DoorOpen className="w-2.5 h-2.5 shrink-0 text-muted-foreground" />
                                    <span className="font-semibold text-foreground/80 truncate">
                                      {entry.room_number}
                                    </span>
                                  </div>

                                  {entry.occurrence_index > 1 && (
                                    <span className="text-[9px] px-1 py-0.2 rounded bg-muted font-mono">
                                      Block #{entry.occurrence_index}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* LIST VIEW (Accessible / Mobile Fallback)                                   */}
      {/* ========================================================================= */}
      {viewMode === "list" && (
        <div className="space-y-3">
          {weekdays
            .filter((w) => selectedDayFilter === "ALL" || selectedDayFilter === w.day)
            .map((w) => {
              const dayEntries = listEntriesByDay.get(w.day) || [];

              return (
                <div
                  key={w.day}
                  className="rounded-xl border border-border/80 bg-card overflow-hidden shadow-xs"
                >
                  {/* Day Header Banner */}
                  <div className="flex items-center justify-between px-4 py-2.5 bg-muted/40 border-b border-border/70">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-primary" />
                      <span className="font-bold text-sm text-foreground">{w.name}</span>
                      <span className="text-xs text-muted-foreground">
                        ({dayEntries.length} {dayEntries.length === 1 ? "period" : "periods"} scheduled)
                      </span>
                    </div>
                  </div>

                  {/* Day Entries List */}
                  {dayEntries.length === 0 ? (
                    <div className="p-4 text-center text-xs text-muted-foreground">
                      No classes scheduled for this day.
                    </div>
                  ) : (
                    <div className="divide-y divide-border/60">
                      {dayEntries.map((entry) => {
                        const isLab = entry.is_lab || entry.session_type === "LAB" || entry.session_type === "LABORATORY";

                        return (
                          <div
                            key={entry.id}
                            className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-muted/10 transition-colors"
                          >
                            <div className="flex items-start gap-3">
                              {/* Period badge */}
                              <div className="flex flex-col items-center justify-center w-12 h-12 rounded-lg bg-primary/10 text-primary border border-primary/20 shrink-0 font-bold">
                                <span className="text-xs">P{entry.period_number}</span>
                                <span className="text-[9px] font-normal opacity-80">Slot</span>
                              </div>

                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-bold text-sm text-foreground">
                                    {entry.subject_code}
                                  </span>
                                  <span className="text-xs text-muted-foreground font-medium">
                                    {entry.subject_name}
                                  </span>
                                  <span
                                    className={cn(
                                      "px-1.5 py-0.5 text-[9px] font-semibold rounded-md uppercase tracking-wider",
                                      isLab
                                        ? "bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300"
                                        : "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300"
                                    )}
                                  >
                                    {isLab ? "LAB" : "THEORY"}
                                  </span>
                                </div>

                                <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground flex-wrap">
                                  <div className="flex items-center gap-1">
                                    <Clock className="w-3.5 h-3.5" />
                                    <span>
                                      {formatTime(entry.period_start_time)} –{" "}
                                      {formatTime(entry.period_end_time)}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-1">
                                    <User className="w-3.5 h-3.5" />
                                    <span>{entry.faculty_name}</span>
                                  </div>

                                  <div className="flex items-center gap-1">
                                    <DoorOpen className="w-3.5 h-3.5" />
                                    <span>Room: {entry.room_number}</span>
                                    {entry.room_type && (
                                      <span className="text-[10px] text-muted-foreground/75">
                                        ({entry.room_type})
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>

                            {entry.occurrence_index > 1 && (
                              <Badge variant="outline" className="self-start sm:self-center text-[10px]">
                                Consecutive #{entry.occurrence_index}
                              </Badge>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
