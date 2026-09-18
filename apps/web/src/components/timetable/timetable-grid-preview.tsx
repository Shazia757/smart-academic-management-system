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
  RotateCcw,
  Filter,
  CheckCircle2,
  X,
  Users,
  Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type TimetableViewMode = "grid" | "list" | "faculty" | "room";

export interface TimetableGridPreviewProps {
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
  // View mode
  const [viewMode, setViewMode] = useState<TimetableViewMode>("grid");

  // Filter States
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedSectionFilter, setSelectedSectionFilter] = useState<string>("ALL");
  const [selectedFacultyFilter, setSelectedFacultyFilter] = useState<string>("ALL");
  const [selectedRoomFilter, setSelectedRoomFilter] = useState<string>("ALL");
  const [selectedDayFilter, setSelectedDayFilter] = useState<number | "ALL">("ALL");
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<string>("ALL");

  // Determine active weekdays to render
  const weekdays = useMemo(() => {
    if (enabledDays && enabledDays.length > 0) {
      return ALL_WEEKDAYS.filter((w) => enabledDays.includes(w.day));
    }
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

  // Extract distinct period rows sorted sequentially
  const distinctPeriodRows = useMemo(() => {
    const periodMap = new Map<
      number,
      { periodNumber: number; startTime: string; endTime: string; isBreak: boolean }
    >();

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

  // Unique options for filters extracted from entries
  const filterOptions = useMemo(() => {
    const sections = new Set<string>();
    const faculty = new Set<string>();
    const rooms = new Set<string>();
    const subjects = new Map<string, string>(); // code -> name

    for (const e of entries) {
      if (e.section_name) sections.add(e.section_name);
      if (e.faculty_name) faculty.add(e.faculty_name);
      if (e.room_number) rooms.add(e.room_number);
      if (e.subject_code) subjects.set(e.subject_code, e.subject_name || e.subject_code);
    }

    return {
      sections: Array.from(sections).sort(),
      faculty: Array.from(faculty).sort(),
      rooms: Array.from(rooms).sort(),
      subjects: Array.from(subjects.entries()).sort((a, b) => a[0].localeCompare(b[0])),
    };
  }, [entries]);

  // Centralized filter logic
  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      // Section filter
      if (selectedSectionFilter !== "ALL" && e.section_name !== selectedSectionFilter && e.section_id !== selectedSectionFilter) {
        return false;
      }
      // Faculty filter
      if (selectedFacultyFilter !== "ALL" && e.faculty_name !== selectedFacultyFilter && e.faculty_id !== selectedFacultyFilter) {
        return false;
      }
      // Room filter
      if (selectedRoomFilter !== "ALL" && e.room_number !== selectedRoomFilter && e.classroom_id !== selectedRoomFilter) {
        return false;
      }
      // Day filter
      if (selectedDayFilter !== "ALL" && e.day_of_week !== selectedDayFilter) {
        return false;
      }
      // Subject filter
      if (selectedSubjectFilter !== "ALL" && e.subject_code !== selectedSubjectFilter && e.subject_id !== selectedSubjectFilter) {
        return false;
      }
      // Search text filter
      if (normalizedQuery) {
        const matchesQuery =
          (e.subject_code || "").toLowerCase().includes(normalizedQuery) ||
          (e.subject_name || "").toLowerCase().includes(normalizedQuery) ||
          (e.faculty_name || "").toLowerCase().includes(normalizedQuery) ||
          (e.faculty_id || "").toLowerCase().includes(normalizedQuery) ||
          (e.section_name || "").toLowerCase().includes(normalizedQuery) ||
          (e.room_number || "").toLowerCase().includes(normalizedQuery) ||
          (e.room_type || "").toLowerCase().includes(normalizedQuery) ||
          (e.session_type || "").toLowerCase().includes(normalizedQuery);
        if (!matchesQuery) return false;
      }
      return true;
    });
  }, [
    entries,
    selectedSectionFilter,
    selectedFacultyFilter,
    selectedRoomFilter,
    selectedDayFilter,
    selectedSubjectFilter,
    normalizedQuery,
  ]);

  // Active filters count
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (selectedSectionFilter !== "ALL") count++;
    if (selectedFacultyFilter !== "ALL") count++;
    if (selectedRoomFilter !== "ALL") count++;
    if (selectedDayFilter !== "ALL") count++;
    if (selectedSubjectFilter !== "ALL") count++;
    if (normalizedQuery) count++;
    return count;
  }, [
    selectedSectionFilter,
    selectedFacultyFilter,
    selectedRoomFilter,
    selectedDayFilter,
    selectedSubjectFilter,
    normalizedQuery,
  ]);

  // Reset all filters
  const handleResetFilters = () => {
    setSelectedSectionFilter("ALL");
    setSelectedFacultyFilter("ALL");
    setSelectedRoomFilter("ALL");
    setSelectedDayFilter("ALL");
    setSelectedSubjectFilter("ALL");
    setSearchQuery("");
  };

  // Fast entry lookup for Weekly Grid: key = `${day_of_week}-${period_number}`
  const entryLookup = useMemo(() => {
    const map = new Map<string, EnrichedScheduledEntry>();
    for (const e of filteredEntries) {
      map.set(`${e.day_of_week}-${e.period_number}`, e);
    }
    return map;
  }, [filteredEntries]);

  // Grouped entries for Chronological List View
  const listEntriesByDay = useMemo(() => {
    const grouped = new Map<number, EnrichedScheduledEntry[]>();
    for (const w of weekdays) {
      grouped.set(w.day, []);
    }
    for (const e of filteredEntries) {
      const list = grouped.get(e.day_of_week) || [];
      list.push(e);
      grouped.set(e.day_of_week, list);
    }
    for (const [day, dayEntries] of grouped.entries()) {
      dayEntries.sort((a, b) => a.period_number - b.period_number);
      grouped.set(day, dayEntries);
    }
    return grouped;
  }, [filteredEntries, weekdays]);

  // Grouped entries for Faculty View
  const entriesByFaculty = useMemo(() => {
    const grouped = new Map<string, EnrichedScheduledEntry[]>();
    for (const e of filteredEntries) {
      const facName = e.faculty_name || "Unassigned Faculty";
      const list = grouped.get(facName) || [];
      list.push(e);
      grouped.set(facName, list);
    }
    for (const [fac, list] of grouped.entries()) {
      list.sort((a, b) => {
        if (a.day_of_week !== b.day_of_week) return a.day_of_week - b.day_of_week;
        return a.period_number - b.period_number;
      });
      grouped.set(fac, list);
    }
    return grouped;
  }, [filteredEntries]);

  // Grouped entries for Room View
  const entriesByRoom = useMemo(() => {
    const grouped = new Map<string, EnrichedScheduledEntry[]>();
    for (const e of filteredEntries) {
      const roomKey = e.room_number ? `Room ${e.room_number}` : "Unassigned Room";
      const list = grouped.get(roomKey) || [];
      list.push(e);
      grouped.set(roomKey, list);
    }
    for (const [room, list] of grouped.entries()) {
      list.sort((a, b) => {
        if (a.day_of_week !== b.day_of_week) return a.day_of_week - b.day_of_week;
        return a.period_number - b.period_number;
      });
      grouped.set(room, list);
    }
    return grouped;
  }, [filteredEntries]);

  return (
    <div className="space-y-4">
      {/* ========================================================================= */}
      {/* 1. CONTROL BAR: View Mode Switcher & Top Row Summary                      */}
      {/* ========================================================================= */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 rounded-xl bg-card border border-border/70 shadow-xs">
        {/* View Mode Toggle Buttons */}
        <div className="flex items-center gap-1 p-1 rounded-lg bg-muted/60 border border-border/40 flex-wrap">
          <button
            type="button"
            onClick={() => setViewMode("grid")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all",
              viewMode === "grid"
                ? "bg-background text-foreground shadow-xs font-bold"
                : "text-muted-foreground hover:text-foreground"
            )}
            title="Weekly Days × Periods Grid"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>Weekly Grid</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode("list")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all",
              viewMode === "list"
                ? "bg-background text-foreground shadow-xs font-bold"
                : "text-muted-foreground hover:text-foreground"
            )}
            title="Chronological List by Day"
          >
            <List className="w-3.5 h-3.5" />
            <span>List View</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode("faculty")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all",
              viewMode === "faculty"
                ? "bg-background text-foreground shadow-xs font-bold"
                : "text-muted-foreground hover:text-foreground"
            )}
            title="Faculty-centric Schedule View"
          >
            <Users className="w-3.5 h-3.5" />
            <span>Faculty View</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode("room")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all",
              viewMode === "room"
                ? "bg-background text-foreground shadow-xs font-bold"
                : "text-muted-foreground hover:text-foreground"
            )}
            title="Room-centric Schedule View"
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Room View</span>
          </button>
        </div>

        {/* Section Context & Results Count */}
        <div className="flex items-center gap-2 text-xs">
          {sectionName && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 font-medium rounded-lg bg-primary/10 text-primary border border-primary/20">
              <Calendar className="w-3.5 h-3.5" />
              <span>Section: {sectionName}</span>
            </div>
          )}
          <span className="text-muted-foreground">
            Showing <strong className="text-foreground">{filteredEntries.length}</strong> of {entries.length} sessions
          </span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. FILTER BAR: Section, Faculty, Room, Day, Subject & Search              */}
      {/* ========================================================================= */}
      <div className="p-3.5 rounded-xl bg-card border border-border/70 shadow-xs space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-bold text-foreground uppercase tracking-wider">
              Filter Timetable
            </span>
            {activeFiltersCount > 0 && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5">
                {activeFiltersCount} active
              </Badge>
            )}
          </div>

          {activeFiltersCount > 0 && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset Filters</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
          {/* 1. Search Query */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search anything..."
              className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded-lg border border-border bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* 2. Section Filter */}
          <select
            value={selectedSectionFilter}
            onChange={(e) => setSelectedSectionFilter(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="ALL">All Sections</option>
            {filterOptions.sections.map((sec) => (
              <option key={sec} value={sec}>
                Section {sec}
              </option>
            ))}
          </select>

          {/* 3. Faculty Filter */}
          <select
            value={selectedFacultyFilter}
            onChange={(e) => setSelectedFacultyFilter(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="ALL">All Faculty</option>
            {filterOptions.faculty.map((fac) => (
              <option key={fac} value={fac}>
                {fac}
              </option>
            ))}
          </select>

          {/* 4. Classroom Filter */}
          <select
            value={selectedRoomFilter}
            onChange={(e) => setSelectedRoomFilter(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="ALL">All Rooms</option>
            {filterOptions.rooms.map((room) => (
              <option key={room} value={room}>
                Room {room}
              </option>
            ))}
          </select>

          {/* 5. Day Filter */}
          <select
            value={selectedDayFilter}
            onChange={(e) => {
              const val = e.target.value;
              setSelectedDayFilter(val === "ALL" ? "ALL" : parseInt(val, 10));
            }}
            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="ALL">All Days</option>
            {weekdays.map((w) => (
              <option key={w.day} value={w.day}>
                {w.name}
              </option>
            ))}
          </select>

          {/* 6. Subject Filter */}
          <select
            value={selectedSubjectFilter}
            onChange={(e) => setSelectedSubjectFilter(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="ALL">All Subjects</option>
            {filterOptions.subjects.map(([code, name]) => (
              <option key={code} value={code}>
                {code} - {name.length > 15 ? `${name.substring(0, 15)}...` : name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* EMPTY FILTERED RESULTS STATE                                              */}
      {/* ========================================================================= */}
      {filteredEntries.length === 0 && (
        <div className="p-8 rounded-xl border border-dashed border-border bg-card text-center space-y-3">
          <Search className="w-8 h-8 text-muted-foreground mx-auto opacity-50" />
          <h4 className="text-sm font-bold text-foreground">No matching sessions found</h4>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            No timetable slots match the current filter selection. Try adjusting or clearing your filters to see the full schedule.
          </p>
          <Button variant="outline" size="sm" onClick={handleResetFilters} className="text-xs">
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
            Reset All Filters
          </Button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW 1: WEEKLY GRID                                                       */}
      {/* ========================================================================= */}
      {viewMode === "grid" && filteredEntries.length > 0 && (
        <div className="rounded-xl border border-border/80 bg-card shadow-sm overflow-hidden">
          <div className="overflow-x-auto" role="region" aria-label="Weekly Timetable Grid">
            <table className="w-full border-collapse text-left min-w-[850px]" role="grid">
              <thead>
                <tr className="border-b border-border/80 bg-muted/40 text-xs font-semibold text-muted-foreground uppercase tracking-wider" role="row">
                  <th className="p-3 w-28 text-center border-r border-border/60 bg-muted/70" scope="col">
                    Period / Time
                  </th>
                  {weekdays.map((w) => (
                    <th
                      key={w.day}
                      className="p-3 text-center border-r border-border/60 last:border-r-0 min-w-[150px]"
                      scope="col"
                    >
                      <div className="font-bold text-foreground text-sm">{w.short}</div>
                      <div className="text-[11px] font-normal text-muted-foreground capitalize">
                        {w.name}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>

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
                      role="row"
                    >
                      {/* Period Row Header */}
                      <td
                        className="p-2.5 text-center align-middle border-r border-border/60 bg-muted/20 font-medium"
                        scope="row"
                      >
                        <div className="font-bold text-foreground text-xs">
                          {isBreakRow ? "Break" : `P${periodRow.periodNumber}`}
                        </div>
                        {periodRow.startTime && periodRow.endTime ? (
                          <div className="text-[10px] text-muted-foreground whitespace-nowrap mt-0.5 font-mono">
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

                      {/* Day Columns */}
                      {weekdays.map((w) => {
                        const cellKey = `${w.day}-${periodRow.periodNumber}`;
                        const entry = entryLookup.get(cellKey);

                        // If period is a break slot
                        if (isBreakRow) {
                          return (
                            <td
                              key={w.day}
                              className="p-2.5 text-center align-middle border-r border-border/60 last:border-r-0 bg-amber-50/50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300"
                              role="gridcell"
                              aria-label={`Break Period on ${w.name}`}
                            >
                              <div className="flex items-center justify-center gap-1.5 text-[11px] font-medium">
                                <Coffee className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                                <span>Recess</span>
                              </div>
                            </td>
                          );
                        }

                        // If no entry scheduled, render Free Period
                        if (!entry) {
                          return (
                            <td
                              key={w.day}
                              className="p-2 text-center align-middle border-r border-border/60 last:border-r-0 bg-card/40"
                              role="gridcell"
                              aria-label={`Free Period on ${w.name} during period ${periodRow.periodNumber}`}
                            >
                              <div className="h-20 flex items-center justify-center rounded-lg border border-dashed border-border/40 text-muted-foreground/50 text-[11px]">
                                Free Period
                              </div>
                            </td>
                          );
                        }

                        // Render scheduled session
                        const isLab = entry.is_lab || entry.session_type === "LAB" || entry.session_type === "LABORATORY";

                        return (
                          <td
                            key={w.day}
                            className="p-1.5 align-top border-r border-border/60 last:border-r-0"
                            role="gridcell"
                            aria-label={`${entry.subject_code}: ${entry.subject_name} with ${entry.faculty_name} in ${entry.room_number}`}
                          >
                            <div
                              className={cn(
                                "p-2 rounded-lg border transition-all h-full min-h-[5.5rem] flex flex-col justify-between shadow-xs",
                                isLab
                                  ? "bg-purple-50/70 dark:bg-purple-950/25 border-purple-200 dark:border-purple-800/60"
                                  : "bg-blue-50/70 dark:bg-blue-950/25 border-blue-200 dark:border-blue-800/60"
                              )}
                            >
                              <div>
                                <div className="flex items-center justify-between gap-1 mb-1">
                                  <div className="flex items-center gap-1 min-w-0">
                                    {isLab ? (
                                      <FlaskConical className="w-3 h-3 text-purple-600 dark:text-purple-400 shrink-0" />
                                    ) : (
                                      <BookOpen className="w-3 h-3 text-blue-600 dark:text-blue-400 shrink-0" />
                                    )}
                                    <span className="font-bold text-xs text-foreground tracking-tight truncate">
                                      {entry.subject_code}
                                    </span>
                                  </div>
                                  <span
                                    className={cn(
                                      "px-1 py-0.5 text-[8.5px] font-semibold rounded uppercase tracking-wider shrink-0",
                                      isLab
                                        ? "bg-purple-200/80 text-purple-900 dark:bg-purple-900/60 dark:text-purple-200"
                                        : "bg-blue-200/80 text-blue-900 dark:bg-blue-900/60 dark:text-blue-200"
                                    )}
                                  >
                                    {isLab ? "LAB" : "THEORY"}
                                  </span>
                                </div>

                                <div
                                  className="text-[11px] font-medium text-foreground/90 line-clamp-1 leading-tight"
                                  title={entry.subject_name}
                                >
                                  {entry.subject_name}
                                </div>
                              </div>

                              <div className="mt-1.5 pt-1 border-t border-border/40 space-y-0.5 text-[10px] text-muted-foreground">
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
                                  {entry.section_name && (
                                    <span className="text-[9px] px-1 rounded bg-muted/80 text-foreground/80 font-mono">
                                      {entry.section_name}
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
      {/* VIEW 2: CHRONOLOGICAL LIST VIEW                                           */}
      {/* ========================================================================= */}
      {viewMode === "list" && filteredEntries.length > 0 && (
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
                  <div className="flex items-center justify-between px-4 py-2.5 bg-muted/40 border-b border-border/70">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-primary" />
                      <span className="font-bold text-sm text-foreground">{w.name}</span>
                      <span className="text-xs text-muted-foreground">
                        ({dayEntries.length} {dayEntries.length === 1 ? "session" : "sessions"} scheduled)
                      </span>
                    </div>
                  </div>

                  {dayEntries.length === 0 ? (
                    <div className="p-4 text-center text-xs text-muted-foreground">
                      No classes scheduled for this day under current filters.
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
                              <div className="flex flex-col items-center justify-center w-12 h-12 rounded-lg bg-primary/10 text-primary border border-primary/20 shrink-0 font-bold">
                                <span className="text-xs">P{entry.period_number}</span>
                                <span className="text-[9px] font-normal opacity-80">Slot</span>
                              </div>

                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  {isLab ? (
                                    <FlaskConical className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                                  ) : (
                                    <BookOpen className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                                  )}
                                  <span className="font-bold text-sm text-foreground">
                                    {entry.subject_code}
                                  </span>
                                  <span className="text-xs text-muted-foreground font-medium">
                                    {entry.subject_name}
                                  </span>
                                  <span
                                    className={cn(
                                      "px-1.5 py-0.5 text-[9px] font-semibold rounded uppercase tracking-wider",
                                      isLab
                                        ? "bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300"
                                        : "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300"
                                    )}
                                  >
                                    {isLab ? "LAB" : "THEORY"}
                                  </span>
                                </div>

                                <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground flex-wrap">
                                  <div className="flex items-center gap-1 font-mono">
                                    <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                                    <span>
                                      {formatTime(entry.period_start_time)} – {formatTime(entry.period_end_time)}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-1">
                                    <User className="w-3.5 h-3.5 text-muted-foreground" />
                                    <span>{entry.faculty_name}</span>
                                  </div>

                                  <div className="flex items-center gap-1">
                                    <DoorOpen className="w-3.5 h-3.5 text-muted-foreground" />
                                    <span>Room: {entry.room_number}</span>
                                    {entry.room_type && (
                                      <span className="text-[10px] text-muted-foreground/75">
                                        ({entry.room_type})
                                      </span>
                                    )}
                                  </div>

                                  {entry.section_name && (
                                    <div className="flex items-center gap-1">
                                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-foreground font-medium">
                                        Section: {entry.section_name}
                                      </span>
                                    </div>
                                  )}
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

      {/* ========================================================================= */}
      {/* VIEW 3: FACULTY VIEW                                                      */}
      {/* ========================================================================= */}
      {viewMode === "faculty" && filteredEntries.length > 0 && (
        <div className="space-y-3">
          {Array.from(entriesByFaculty.entries()).map(([facultyName, facEntries]) => (
            <div
              key={facultyName}
              className="rounded-xl border border-border/80 bg-card overflow-hidden shadow-xs"
            >
              <div className="flex items-center justify-between px-4 py-2.5 bg-muted/40 border-b border-border/70">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-primary" />
                  <span className="font-bold text-sm text-foreground">{facultyName}</span>
                  <span className="text-xs text-muted-foreground">
                    ({facEntries.length} {facEntries.length === 1 ? "session" : "sessions"} assigned)
                  </span>
                </div>
              </div>

              <div className="divide-y divide-border/60">
                {facEntries.map((entry) => {
                  const weekdayObj = ALL_WEEKDAYS.find((d) => d.day === entry.day_of_week);
                  const isLab = entry.is_lab || entry.session_type === "LAB" || entry.session_type === "LABORATORY";

                  return (
                    <div
                      key={entry.id}
                      className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-muted/10 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-16 text-center font-bold text-xs px-2 py-1 rounded bg-muted/60 text-foreground">
                          {weekdayObj?.short || `Day ${entry.day_of_week}`} P{entry.period_number}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            {isLab ? (
                              <FlaskConical className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                            ) : (
                              <BookOpen className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                            )}
                            <span className="font-bold text-xs text-foreground">{entry.subject_code}</span>
                            <span className="text-xs text-muted-foreground">{entry.subject_name}</span>
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                            <span>Room: {entry.room_number}</span>
                            <span>•</span>
                            <span className="font-mono">
                              {formatTime(entry.period_start_time)} – {formatTime(entry.period_end_time)}
                            </span>
                            <span>•</span>
                            <span>Section: {entry.section_name}</span>
                          </div>
                        </div>
                      </div>

                      <span
                        className={cn(
                          "px-2 py-0.5 text-[9px] font-semibold rounded uppercase self-start sm:self-center",
                          isLab
                            ? "bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300"
                            : "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300"
                        )}
                      >
                        {isLab ? "LAB" : "THEORY"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW 4: ROOM VIEW                                                         */}
      {/* ========================================================================= */}
      {viewMode === "room" && filteredEntries.length > 0 && (
        <div className="space-y-3">
          {Array.from(entriesByRoom.entries()).map(([roomTitle, roomEntries]) => (
            <div
              key={roomTitle}
              className="rounded-xl border border-border/80 bg-card overflow-hidden shadow-xs"
            >
              <div className="flex items-center justify-between px-4 py-2.5 bg-muted/40 border-b border-border/70">
                <div className="flex items-center gap-2">
                  <DoorOpen className="w-4 h-4 text-primary" />
                  <span className="font-bold text-sm text-foreground">{roomTitle}</span>
                  <span className="text-xs text-muted-foreground">
                    ({roomEntries.length} {roomEntries.length === 1 ? "session" : "sessions"} hosted)
                  </span>
                </div>
              </div>

              <div className="divide-y divide-border/60">
                {roomEntries.map((entry) => {
                  const weekdayObj = ALL_WEEKDAYS.find((d) => d.day === entry.day_of_week);
                  const isLab = entry.is_lab || entry.session_type === "LAB" || entry.session_type === "LABORATORY";

                  return (
                    <div
                      key={entry.id}
                      className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-muted/10 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-16 text-center font-bold text-xs px-2 py-1 rounded bg-muted/60 text-foreground">
                          {weekdayObj?.short || `Day ${entry.day_of_week}`} P{entry.period_number}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            {isLab ? (
                              <FlaskConical className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                            ) : (
                              <BookOpen className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                            )}
                            <span className="font-bold text-xs text-foreground">{entry.subject_code}</span>
                            <span className="text-xs text-muted-foreground">{entry.subject_name}</span>
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                            <span>Faculty: {entry.faculty_name}</span>
                            <span>•</span>
                            <span className="font-mono">
                              {formatTime(entry.period_start_time)} – {formatTime(entry.period_end_time)}
                            </span>
                            <span>•</span>
                            <span>Section: {entry.section_name}</span>
                          </div>
                        </div>
                      </div>

                      <span
                        className={cn(
                          "px-2 py-0.5 text-[9px] font-semibold rounded uppercase self-start sm:self-center",
                          isLab
                            ? "bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300"
                            : "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300"
                        )}
                      >
                        {isLab ? "LAB" : "THEORY"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
