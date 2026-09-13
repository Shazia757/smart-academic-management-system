"use client";

import React, { useState, useMemo, useTransition, useEffect, useCallback } from "react";
import {
  AcademicYear,
  Semester,
  ClassSection,
  TimetableConfiguration,
  TimetablePeriod,
  UserRole,
  GeneratedTimetableResult,
  TimetableGenerationHistoryItem,
} from "@/types/database";
import {
  generateTimetableAction,
  saveTimetableGenerationAction,
  getGenerationHistoryAction,
  getTimetableGenerationAction,
} from "@/server/actions/timetable-generation";
import { TimetableGridPreview } from "./timetable-grid-preview";
import { TimetableDiagnostics } from "./timetable-diagnostics";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Sparkles,
  Calendar,
  Layers,
  Clock,
  RotateCcw,
  Sliders,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  CalendarDays,
  Info,
  Building,
  Save,
  History,
  Eye,
  CheckCircle,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface TimetableGeneratorClientProps {
  academicYears: AcademicYear[];
  semesters: Semester[];
  classSections: (ClassSection & { department?: any })[];
  configurations: (TimetableConfiguration & { periods?: TimetablePeriod[]; periods_count?: number })[];
  userRole?: UserRole;
}

type GeneratorState = "idle" | "loading" | "success" | "infeasible" | "error";

export function TimetableGeneratorClient({
  academicYears,
  semesters,
  classSections,
  configurations,
  userRole,
}: TimetableGeneratorClientProps) {
  // Cascading Academic Filter States
  const [selectedYearId, setSelectedYearId] = useState<string>(
    academicYears[0]?.id || ""
  );

  // Semesters filtered by selected academic year
  const filteredSemesters = useMemo(() => {
    return semesters.filter((s) => s.academic_year_id === selectedYearId);
  }, [semesters, selectedYearId]);

  const [selectedSemesterId, setSelectedSemesterId] = useState<string>(
    filteredSemesters[0]?.id || semesters[0]?.id || ""
  );

  // Class sections filtered by selected semester
  const filteredSections = useMemo(() => {
    return classSections.filter((sec) => sec.semester_id === selectedSemesterId);
  }, [classSections, selectedSemesterId]);

  const [selectedSectionId, setSelectedSectionId] = useState<string>(
    filteredSections[0]?.id || classSections[0]?.id || ""
  );

  // Configurations matching the selected section
  const matchingConfigurations = useMemo(() => {
    return configurations.filter((cfg) => cfg.section_id === selectedSectionId);
  }, [configurations, selectedSectionId]);

  // Selected configuration ID (auto-select active config for section, or first matching)
  const [selectedConfigId, setSelectedConfigId] = useState<string>("");

  // Keep selectedConfigId in sync when matching configurations change
  React.useEffect(() => {
    const activeCfg = matchingConfigurations.find((c) => c.is_active) || matchingConfigurations[0];
    setSelectedConfigId(activeCfg ? activeCfg.id : "");
  }, [matchingConfigurations]);

  // Active configuration object
  const activeConfig = useMemo(() => {
    return configurations.find((c) => c.id === selectedConfigId) || null;
  }, [configurations, selectedConfigId]);

  // Active section object
  const activeSection = useMemo(() => {
    return classSections.find((s) => s.id === selectedSectionId) || null;
  }, [classSections, selectedSectionId]);

  // Active academic year object
  const activeYear = useMemo(() => {
    return academicYears.find((y) => y.id === selectedYearId) || null;
  }, [academicYears, selectedYearId]);

  // Active semester object
  const activeSemester = useMemo(() => {
    return semesters.find((s) => s.id === selectedSemesterId) || null;
  }, [semesters, selectedSemesterId]);

  // Solver options
  const [timeoutSeconds, setTimeoutSeconds] = useState<number>(15);
  const [randomSeed, setRandomSeed] = useState<number>(42);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState<boolean>(false);

  // Execution state machine
  const [state, setState] = useState<GeneratorState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [generatedResult, setGeneratedResult] = useState<GeneratedTimetableResult | null>(null);
  const [isPending, startTransition] = useTransition();

  // Generation History State
  const [history, setHistory] = useState<TimetableGenerationHistoryItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);
  const [loadingGenId, setLoadingGenId] = useState<string | null>(null);

  // Persistence State & Modal
  const [isSaveModalOpen, setIsSaveModalOpen] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  // History loader
  const loadHistory = useCallback(async (configId: string) => {
    if (!configId) {
      setHistory([]);
      return;
    }
    setIsLoadingHistory(true);
    try {
      const res = await getGenerationHistoryAction(configId);
      if (res.success && res.data) {
        setHistory(res.data);
      }
    } catch {
      // Safe swallow
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  // Fetch history whenever active configuration changes
  useEffect(() => {
    if (selectedConfigId) {
      loadHistory(selectedConfigId);
    } else {
      setHistory([]);
    }
  }, [selectedConfigId, loadHistory]);

  // Validate before submission
  const validationError = useMemo(() => {
    if (!selectedSectionId) {
      return "Please select a target class section.";
    }
    if (!selectedConfigId || !activeConfig) {
      return "No timetable configuration selected for this class section. Please create or select an active configuration.";
    }
    if (!activeConfig.is_active) {
      return "The selected configuration is inactive. Please activate it in Timetable Configuration.";
    }
    if ((activeConfig.periods_count || 0) === 0 && (!activeConfig.periods || activeConfig.periods.length === 0)) {
      return "The selected configuration has no active period slots. Please generate period slots first.";
    }
    if (timeoutSeconds < 5 || timeoutSeconds > 120) {
      return "Solver timeout must be between 5 and 120 seconds.";
    }
    return null;
  }, [selectedSectionId, selectedConfigId, activeConfig, timeoutSeconds]);

  // Handle Generate Timetable
  const handleGenerate = () => {
    if (validationError || isPending) return;

    setState("loading");
    setErrorMessage(null);
    setSaveSuccess(null);
    setSaveError(null);

    startTransition(async () => {
      try {
        const response = await generateTimetableAction({
          configuration_id: selectedConfigId,
          section_id: selectedSectionId,
          timeout_seconds: timeoutSeconds,
          random_seed: randomSeed,
        });

        if (!response.success || !response.data) {
          setState("error");
          setErrorMessage(response.error || "Failed to solve timetable.");
          setGeneratedResult(null);
          return;
        }

        const data = response.data;
        setGeneratedResult(data);

        if (data.status === "OPTIMAL" || data.status === "FEASIBLE") {
          setState("success");
        } else if (data.status === "INFEASIBLE" || data.status === "MODEL_INVALID" || data.status === "UNKNOWN") {
          setState("infeasible");
        } else {
          setState("error");
          setErrorMessage(data.error_message || `Solver returned unexpected status: ${data.status}`);
        }
      } catch (err: unknown) {
        setState("error");
        const msg = err instanceof Error ? err.message : "An unexpected client error occurred.";
        setErrorMessage(msg);
        setGeneratedResult(null);
      }
    });
  };

  // Handle Regenerate (increments random seed and re-runs)
  const handleRegenerate = () => {
    const nextSeed = randomSeed + 1;
    setRandomSeed(nextSeed);

    setState("loading");
    setErrorMessage(null);
    setSaveSuccess(null);
    setSaveError(null);

    startTransition(async () => {
      try {
        const response = await generateTimetableAction({
          configuration_id: selectedConfigId,
          section_id: selectedSectionId,
          timeout_seconds: timeoutSeconds,
          random_seed: nextSeed,
        });

        if (!response.success || !response.data) {
          setState("error");
          setErrorMessage(response.error || "Failed to regenerate timetable.");
          return;
        }

        const data = response.data;
        setGeneratedResult(data);

        if (data.status === "OPTIMAL" || data.status === "FEASIBLE") {
          setState("success");
        } else {
          setState("infeasible");
        }
      } catch (err: unknown) {
        setState("error");
        const msg = err instanceof Error ? err.message : "Failed to regenerate schedule.";
        setErrorMessage(msg);
      }
    });
  };

  // Handle Save Draft
  const handleSaveDraft = async () => {
    if (!generatedResult || !selectedConfigId || !selectedSectionId || isSaving) return;

    setIsSaving(true);
    setSaveError(null);

    try {
      const res = await saveTimetableGenerationAction({
        configuration_id: selectedConfigId,
        section_id: selectedSectionId,
        solver_metrics: {
          solver_name: generatedResult.solver_name,
          solver_version: generatedResult.solver_version,
          solve_duration_ms: generatedResult.solve_duration_ms,
          hard_constraint_violations: generatedResult.hard_constraint_violations,
          soft_constraint_violations: generatedResult.soft_constraint_violations,
          diagnostics: generatedResult.diagnostics,
        },
        entries: generatedResult.entries.map((e) => ({
          subject_id: e.subject_id,
          faculty_id: e.faculty_id,
          classroom_id: e.classroom_id,
          timetable_period_id: e.timetable_period_id,
          occurrence_index: e.occurrence_index,
          session_type: (e.session_type === "LAB" || e.session_type === "LABORATORY" || e.is_lab ? "LABORATORY" : "THEORY"),
          is_lab: e.is_lab,
          notes: e.notes || null,
        })),
      });

      if (!res.success || !res.data) {
        setSaveError(res.error || "Failed to persist timetable draft.");
        setIsSaving(false);
        return;
      }

      const { generation_id, generation_number, entries_count } = res.data;

      // Update in-memory result with returned generation details
      setGeneratedResult((prev) =>
        prev
          ? {
              ...prev,
              generation_id,
              generation_number,
              is_published: false,
            }
          : null
      );

      setSaveSuccess(
        `Schedule persisted successfully as Draft Generation #${generation_number} (${entries_count} slots).`
      );
      setIsSaveModalOpen(false);
      setIsSaving(false);

      // Refresh generation history
      await loadHistory(selectedConfigId);
    } catch (err: unknown) {
      setIsSaving(false);
      const msg = err instanceof Error ? err.message : "An unexpected client error occurred while saving.";
      setSaveError(msg);
    }
  };

  // Handle View Historical Generation
  const handleViewHistoryItem = async (genId: string) => {
    setLoadingGenId(genId);
    setSaveError(null);
    setSaveSuccess(null);

    try {
      const res = await getTimetableGenerationAction(genId);
      if (!res.success || !res.data) {
        setErrorMessage(res.error || "Failed to load generation schedule.");
        setState("error");
        return;
      }

      setGeneratedResult(res.data);
      setState("success");
      setSaveSuccess(`Viewing saved Draft Generation #${res.data.generation_number}.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load generation.";
      setErrorMessage(msg);
      setState("error");
    } finally {
      setLoadingGenId(null);
    }
  };

  // Handle Reset to Idle
  const handleReset = () => {
    setState("idle");
    setErrorMessage(null);
    setGeneratedResult(null);
    setSaveError(null);
    setSaveSuccess(null);
  };

  return (
    <div className="space-y-6">
      {/* ========================================================================= */}
      {/* 1. Academic Context & Solver Configuration Card                           */}
      {/* ========================================================================= */}
      <Card className="border-border/80 bg-card shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-primary" />
              <CardTitle className="text-lg">Academic Scheduling Parameters</CardTitle>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-md bg-accent/15 text-accent font-semibold border border-accent/30">
              OR-Tools Engine
            </span>
          </div>
          <CardDescription>
            Select the target academic section and scheduling configuration to run the constraint satisfaction solver.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Cascading Selectors: Year -> Semester -> Section */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Academic Year */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground uppercase tracking-wider">
                Academic Year
              </label>
              <select
                value={selectedYearId}
                onChange={(e) => {
                  setSelectedYearId(e.target.value);
                  const sems = semesters.filter((s) => s.academic_year_id === e.target.value);
                  if (sems.length > 0 && sems[0]) {
                    setSelectedSemesterId(sems[0].id);
                    const secs = classSections.filter((sec) => sec.semester_id === sems[0]?.id);
                    if (secs.length > 0 && secs[0]) {
                      setSelectedSectionId(secs[0].id);
                    }
                  }
                }}
                disabled={isPending}
                className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
              >
                {academicYears.map((ay) => (
                  <option key={ay.id} value={ay.id}>
                    {ay.name} {ay.is_active ? "(Active)" : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* Semester */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground uppercase tracking-wider">
                Semester
              </label>
              <select
                value={selectedSemesterId}
                onChange={(e) => {
                  setSelectedSemesterId(e.target.value);
                  const secs = classSections.filter((sec) => sec.semester_id === e.target.value);
                  if (secs.length > 0 && secs[0]) {
                    setSelectedSectionId(secs[0].id);
                  }
                }}
                disabled={isPending}
                className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
              >
                {filteredSemesters.map((sem) => (
                  <option key={sem.id} value={sem.id}>
                    {sem.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Class Section */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground uppercase tracking-wider">
                Class Section
              </label>
              <select
                value={selectedSectionId}
                onChange={(e) => setSelectedSectionId(e.target.value)}
                disabled={isPending}
                className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 font-medium"
              >
                {filteredSections.map((sec) => (
                  <option key={sec.id} value={sec.id}>
                    Section {sec.name} {sec.department?.code ? `(${sec.department.code})` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Configuration Selection & Summary */}
          <div className="p-3.5 rounded-xl bg-muted/40 border border-border/60 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-primary" />
                <span className="text-xs font-bold text-foreground">
                  Active Configuration:
                </span>
                {activeConfig ? (
                  <span className="text-xs text-foreground font-semibold">
                    {activeConfig.name}
                  </span>
                ) : (
                  <span className="text-xs text-rose-500 font-medium">
                    No configuration linked to section
                  </span>
                )}
              </div>

              {/* Configuration Dropdown if multiple exist */}
              {matchingConfigurations.length > 1 && (
                <select
                  value={selectedConfigId}
                  onChange={(e) => setSelectedConfigId(e.target.value)}
                  disabled={isPending}
                  className="px-2.5 py-1 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {matchingConfigurations.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.is_active ? "(Active)" : "(Inactive)"}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Configuration Attributes Metadata */}
            {activeConfig && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-muted-foreground pt-1 border-t border-border/40">
                <div>
                  <span className="block text-[10px] uppercase font-semibold text-muted-foreground/80">
                    Working Days
                  </span>
                  <span className="font-semibold text-foreground">
                    {activeConfig.working_days} Days / Week
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] uppercase font-semibold text-muted-foreground/80">
                    Daily Periods
                  </span>
                  <span className="font-semibold text-foreground">
                    {activeConfig.periods_per_day} Periods / Day
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] uppercase font-semibold text-muted-foreground/80">
                    Slot Duration
                  </span>
                  <span className="font-semibold text-foreground">
                    {activeConfig.period_duration_minutes} Minutes
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] uppercase font-semibold text-muted-foreground/80">
                    Active Slots
                  </span>
                  <span
                    className={cn(
                      "font-semibold",
                      (activeConfig.periods?.length || activeConfig.periods_count || 0) > 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-rose-500"
                    )}
                  >
                    {activeConfig.periods?.length || activeConfig.periods_count || 0} Slots Available
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Advanced Solver Controls Accordion */}
          <div className="border border-border/60 rounded-xl overflow-hidden bg-background/50">
            <button
              type="button"
              onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
              className="w-full flex items-center justify-between px-3.5 py-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              <div className="flex items-center gap-2">
                <Sliders className="w-3.5 h-3.5 text-primary" />
                <span>Solver Fine-Tuning (Timeout & Random Seed)</span>
              </div>
              <span className="text-[11px] text-muted-foreground">
                {showAdvancedOptions ? "Hide Options" : "Show Options"}
              </span>
            </button>

            {showAdvancedOptions && (
              <div className="p-4 border-t border-border/60 grid grid-cols-1 sm:grid-cols-2 gap-4 bg-muted/20">
                {/* Timeout Slider */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <label className="font-semibold text-foreground">
                      Solver Timeout: {timeoutSeconds}s
                    </label>
                    <span className="text-[10px] text-muted-foreground">
                      (Range: 5s – 120s)
                    </span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={120}
                    step={5}
                    value={timeoutSeconds}
                    onChange={(e) => setTimeoutSeconds(parseInt(e.target.value, 10))}
                    disabled={isPending}
                    className="w-full accent-primary"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Maximum wall-clock execution time allowed for CP-SAT search before returning best feasible solution.
                  </p>
                </div>

                {/* Random Seed */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground block">
                    Random Seed
                  </label>
                  <input
                    type="number"
                    value={randomSeed}
                    onChange={(e) => setRandomSeed(parseInt(e.target.value, 10) || 0)}
                    disabled={isPending}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Deterministic seed controlling CP-SAT branch search randomization. Changing the seed explores alternative assignments.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Validation Warning Alert */}
          {validationError && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-rose-50/70 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800/60 text-xs text-rose-700 dark:text-rose-300">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{validationError}</span>
            </div>
          )}

          {/* Server Action Error Banner */}
          {state === "error" && errorMessage && (
            <div className="flex items-start gap-2.5 p-3.5 rounded-lg bg-rose-50/90 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-200">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
              <div className="space-y-1 flex-1">
                <div className="font-bold">Timetable Generation Error</div>
                <div>{errorMessage}</div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerate}
                disabled={isPending}
                className="text-xs h-7 shrink-0"
              >
                Retry
              </Button>
            </div>
          )}

          {/* Save Success Banner */}
          {saveSuccess && (
            <div className="flex items-start gap-2.5 p-3.5 rounded-lg bg-emerald-50/90 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-200 animate-in fade-in duration-200">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
              <div className="space-y-0.5 flex-1">
                <div className="font-bold">Persistence Status</div>
                <div>{saveSuccess}</div>
              </div>
              <button
                onClick={() => setSaveSuccess(null)}
                className="text-emerald-700 hover:text-emerald-900 dark:text-emerald-300 p-0.5"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Save Error Banner */}
          {saveError && (
            <div className="flex items-start gap-2.5 p-3.5 rounded-lg bg-rose-50/90 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-200 animate-in fade-in duration-200">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
              <div className="space-y-0.5 flex-1">
                <div className="font-bold">Save Error</div>
                <div>{saveError}</div>
              </div>
              <button
                onClick={() => setSaveError(null)}
                className="text-rose-700 hover:text-rose-900 dark:text-rose-300 p-0.5"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Action Trigger Buttons */}
          <div className="flex items-center gap-3 pt-2 flex-wrap">
            {state === "idle" || state === "error" ? (
              <Button
                onClick={handleGenerate}
                disabled={Boolean(validationError) || isPending}
                className="flex items-center gap-2 shadow-sm font-semibold"
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Solving Timetable...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-accent" />
                    <span>Generate Timetable</span>
                  </>
                )}
              </Button>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  onClick={handleRegenerate}
                  disabled={Boolean(validationError) || isPending}
                  className="flex items-center gap-2 font-semibold shadow-sm"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Re-optimizing...</span>
                    </>
                  ) : (
                    <>
                      <RotateCcw className="w-4 h-4" />
                      <span>Regenerate (Seed #{randomSeed + 1})</span>
                    </>
                  )}
                </Button>

                {state === "success" && generatedResult && (
                  <>
                    {generatedResult.generation_number ? (
                      <div className="text-xs px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 font-semibold flex items-center gap-1.5 shadow-xs">
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>Saved as Draft #{generatedResult.generation_number}</span>
                      </div>
                    ) : (
                      <Button
                        onClick={() => {
                          setSaveError(null);
                          setIsSaveModalOpen(true);
                        }}
                        disabled={isSaving || isPending}
                        className="flex items-center gap-2 font-semibold text-xs shadow-sm bg-primary text-primary-foreground"
                      >
                        <Save className="w-3.5 h-3.5 text-accent" />
                        <span>Save Schedule as Draft</span>
                      </Button>
                    )}
                  </>
                )}

                <Button
                  variant="outline"
                  onClick={handleReset}
                  disabled={isPending || isSaving}
                  className="text-xs"
                >
                  Reset Form
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ========================================================================= */}
      {/* 2. LOADING STATE                                                          */}
      {/* ========================================================================= */}
      {state === "loading" && (
        <Card className="border-border/80 bg-card p-12 text-center shadow-sm">
          <div className="max-w-md mx-auto space-y-4">
            <div className="relative flex items-center justify-center w-16 h-16 mx-auto rounded-2xl bg-primary/10 text-primary border border-primary/20">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-foreground">
                Optimizing Timetable Constraints...
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Evaluating faculty availability windows, classroom capacities, subject lab requirements,
                and non-overlapping periods using Google OR-Tools CP-SAT.
              </p>
            </div>
            <div className="text-[11px] text-muted-foreground font-mono bg-muted/40 py-1.5 px-3 rounded-md inline-block">
              Timeout buffer: {timeoutSeconds}s • Random Seed: {randomSeed}
            </div>
          </div>
        </Card>
      )}

      {/* ========================================================================= */}
      {/* 3. INFEASIBLE OR INVALID STATE                                            */}
      {/* ========================================================================= */}
      {state === "infeasible" && generatedResult && (
        <div className="space-y-6">
          <TimetableDiagnostics result={generatedResult} />
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. SUCCESS STATE: PREVIEW GRID & DIAGNOSTICS                              */}
      {/* ========================================================================= */}
      {state === "success" && generatedResult && (
        <div className="space-y-6">
          {/* Solver Diagnostics Bar */}
          <TimetableDiagnostics result={generatedResult} />

          {/* Timetable Weekly Preview Grid */}
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-foreground tracking-tight">
                    Weekly Schedule Preview
                  </h3>
                  {generatedResult.generation_number ? (
                    <span className="text-xs px-2.5 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20 font-bold">
                      Draft Gen #{generatedResult.generation_number}
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold border border-amber-500/20">
                      Unsaved Preview
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Interactive schedule for Section {activeSection?.name || "A"}{" "}
                  {activeSemester ? `• ${activeSemester.name}` : ""}{" "}
                  {activeYear ? `• ${activeYear.name}` : ""}
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {!generatedResult.generation_number && (
                  <Button
                    size="sm"
                    onClick={() => {
                      setSaveError(null);
                      setIsSaveModalOpen(true);
                    }}
                    disabled={isPending || isSaving}
                    className="h-8 text-xs font-semibold flex items-center gap-1.5 shadow-xs"
                  >
                    <Save className="w-3.5 h-3.5 text-accent" />
                    <span>Save Schedule as Draft</span>
                  </Button>
                )}

                <div className="text-xs px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Zero Conflicts</span>
                </div>
              </div>
            </div>

            <TimetableGridPreview
              entries={generatedResult.entries}
              periods={activeConfig?.periods || []}
              sectionName={activeSection?.name}
              academicYearName={activeYear?.name}
              semesterName={activeSemester?.name}
            />
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. IDLE STATE HELP CARD                                                   */}
      {/* ========================================================================= */}
      {state === "idle" && (
        <Card className="border-border/60 bg-muted/15 border-dashed p-8 text-center">
          <div className="max-w-md mx-auto space-y-3">
            <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary mx-auto flex items-center justify-center">
              <Sparkles className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-foreground">
                Ready to Generate Timetable
              </h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Confirm your academic context and configuration above, then click{" "}
                <strong>Generate Timetable</strong>. The system will invoke the decoupled OR-Tools
                microservice and render a conflict-free schedule preview.
              </p>
            </div>
            <div className="text-[11px] text-muted-foreground/80 pt-1">
              Generated schedules can be previewed in memory and saved to the database as versioned drafts.
            </div>
          </div>
        </Card>
      )}

      {/* ========================================================================= */}
      {/* 6. GENERATION HISTORY PANEL                                               */}
      {/* ========================================================================= */}
      <Card className="border-border/80 bg-card shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-primary" />
              <CardTitle className="text-base">Generation History</CardTitle>
              <span className="text-xs px-2 py-0.5 rounded-full bg-muted font-mono font-semibold text-muted-foreground">
                {history.length}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => selectedConfigId && loadHistory(selectedConfigId)}
              disabled={isLoadingHistory || !selectedConfigId}
              className="text-xs h-7 text-muted-foreground hover:text-foreground"
            >
              {isLoadingHistory ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                "Refresh History"
              )}
            </Button>
          </div>
          <CardDescription className="text-xs">
            Persisted schedule drafts for {activeConfig?.name || "selected configuration"}. Older versions are preserved immutably.
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-0">
          {history.length === 0 ? (
            <div className="text-center py-8 text-xs text-muted-foreground">
              {isLoadingHistory ? (
                <div className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  <span>Loading history...</span>
                </div>
              ) : (
                "No previous generations saved for this configuration yet. Generate and save your first schedule above."
              )}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border/60">
              <table className="w-full text-xs text-left">
                <thead className="text-[11px] uppercase tracking-wider text-muted-foreground bg-muted/40 border-b border-border">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Version</th>
                    <th className="px-3 py-2 font-semibold">Saved Timestamp</th>
                    <th className="px-3 py-2 font-semibold">Author</th>
                    <th className="px-3 py-2 font-semibold">Slots</th>
                    <th className="px-3 py-2 font-semibold">Violations</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                    <th className="px-3 py-2 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {history.map((item) => {
                    const isCurrentlyViewing = generatedResult?.generation_id === item.id;
                    const dateFormatted = new Date(item.created_at).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    });

                    return (
                      <tr
                        key={item.id}
                        className={cn(
                          "hover:bg-muted/30 transition-colors",
                          isCurrentlyViewing && "bg-primary/5 font-medium"
                        )}
                      >
                        <td className="px-3 py-2.5 font-bold text-foreground">
                          <span className="px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                            Gen #{item.generation_number}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">
                          {dateFormatted}
                        </td>
                        <td className="px-3 py-2.5 text-foreground truncate max-w-[140px]">
                          {item.author_name || "Administrator"}
                        </td>
                        <td className="px-3 py-2.5 text-foreground font-mono">
                          {item.entries_count} slots
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={cn(
                              "font-semibold",
                              item.hard_constraint_violations === 0
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-rose-600 dark:text-rose-400"
                            )}
                          >
                            {item.hard_constraint_violations} hard
                          </span>{" "}
                          <span className="text-muted-foreground">/ {item.soft_constraint_violations} soft</span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
                            Draft (Unpublished)
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <Button
                            variant={isCurrentlyViewing ? "secondary" : "outline"}
                            size="sm"
                            onClick={() => handleViewHistoryItem(item.id)}
                            disabled={loadingGenId === item.id}
                            className="h-7 text-xs font-semibold flex items-center gap-1.5 ml-auto"
                          >
                            {loadingGenId === item.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Eye className="w-3.5 h-3.5" />
                            )}
                            <span>{isCurrentlyViewing ? "Viewing" : "View Schedule"}</span>
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ========================================================================= */}
      {/* 7. SAVE DRAFT CONFIRMATION DIALOG MODAL                                   */}
      {/* ========================================================================= */}
      {isSaveModalOpen && generatedResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg bg-card rounded-2xl border border-border shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/20">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-primary/10 text-primary border border-primary/20">
                  <Save className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">Save Schedule as Draft</h3>
                  <p className="text-xs text-muted-foreground">Confirm timetable persistence</p>
                </div>
              </div>
              <button
                onClick={() => !isSaving && setIsSaveModalOpen(false)}
                disabled={isSaving}
                className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4">
              <p className="text-xs text-muted-foreground leading-relaxed">
                You are about to persist this generated schedule into the database as an{" "}
                <strong className="text-foreground">unpublished draft</strong>. It will be assigned the next sequential generation number for this configuration.
              </p>

              {/* Summary Stats Grid */}
              <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl bg-muted/40 border border-border/60 text-xs">
                <div>
                  <span className="text-[11px] text-muted-foreground">Class Section:</span>
                  <div className="font-semibold text-foreground">{activeSection?.name || "A"}</div>
                </div>
                <div>
                  <span className="text-[11px] text-muted-foreground">Configuration:</span>
                  <div className="font-semibold text-foreground truncate">{activeConfig?.name || "Default"}</div>
                </div>
                <div>
                  <span className="text-[11px] text-muted-foreground">Scheduled Slots:</span>
                  <div className="font-semibold text-foreground">{generatedResult.entries.length} weekly sessions</div>
                </div>
                <div>
                  <span className="text-[11px] text-muted-foreground">Conflict Violations:</span>
                  <div className="font-semibold text-emerald-600 dark:text-emerald-400">
                    {generatedResult.hard_constraint_violations} hard / {generatedResult.soft_constraint_violations} soft
                  </div>
                </div>
              </div>

              {/* Security & Lifecycle Notice */}
              <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-300">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <span className="font-semibold">Unpublished Draft Notice</span>
                  <p className="text-[11px] opacity-90">
                    Faculty and students cannot see this schedule until official publishing. The configuration status will transition to <code>GENERATED</code>.
                  </p>
                </div>
              </div>

              {/* Error in modal if any */}
              {saveError && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-600 dark:text-rose-400 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{saveError}</span>
                </div>
              )}
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border bg-muted/10">
              <Button
                variant="outline"
                onClick={() => setIsSaveModalOpen(false)}
                disabled={isSaving}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveDraft}
                disabled={isSaving}
                className="text-xs font-semibold flex items-center gap-2"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Saving Draft...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Confirm & Save Draft</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
