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
  getGenerationInputSummaryAction,
  GenerationInputSummary,
  saveTimetableGenerationAction,
  getGenerationHistoryAction,
  getTimetableGenerationAction,
  publishTimetableAction,
  unpublishTimetableAction,
  deleteTimetableGenerationAction,
} from "@/server/actions/timetable-generation";
import { TimetableGridPreview } from "./timetable-grid-preview";
import { TimetableDiagnostics } from "./timetable-diagnostics";
import { ModalDialog } from "@/components/common/modal-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
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
  ShieldAlert,
  ShieldCheck,
  Check,
  HelpCircle,
  Hourglass,
  XCircle,
  AlertOctagon,
  Users,
  BookOpen,
  DoorOpen,
  FlaskConical,
  Bookmark,
  Send,
  History,
  Trash2,
  ExternalLink,
  Eye,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface TimetableGeneratorClientProps {
  academicYears: AcademicYear[];
  semesters: Semester[];
  classSections: (ClassSection & { department?: any })[];
  configurations: (TimetableConfiguration & { periods?: TimetablePeriod[]; periods_count?: number })[];
  userRole?: UserRole;
}

type GeneratorState =
  | "idle"
  | "loading"
  | "success"
  | "partial"
  | "time_limit"
  | "infeasible"
  | "model_invalid"
  | "error";

export function TimetableGeneratorClient({
  academicYears,
  semesters,
  classSections,
  configurations,
  userRole,
}: TimetableGeneratorClientProps) {
  // 1. Cascading Academic Filter States
  const [selectedYearId, setSelectedYearId] = useState<string>(
    academicYears[0]?.id || ""
  );

  const filteredSemesters = useMemo(() => {
    return semesters.filter((s) => s.academic_year_id === selectedYearId);
  }, [semesters, selectedYearId]);

  const [selectedSemesterId, setSelectedSemesterId] = useState<string>(
    filteredSemesters[0]?.id || semesters[0]?.id || ""
  );

  const filteredSections = useMemo(() => {
    return classSections.filter((sec) => sec.semester_id === selectedSemesterId);
  }, [classSections, selectedSemesterId]);

  const [selectedSectionId, setSelectedSectionId] = useState<string>(
    filteredSections[0]?.id || classSections[0]?.id || ""
  );

  const matchingConfigurations = useMemo(() => {
    return configurations.filter((cfg) => cfg.section_id === selectedSectionId);
  }, [configurations, selectedSectionId]);

  const [selectedConfigId, setSelectedConfigId] = useState<string>("");

  useEffect(() => {
    const activeCfg = matchingConfigurations.find((c) => c.is_active) || matchingConfigurations[0];
    setSelectedConfigId(activeCfg ? activeCfg.id : "");
  }, [matchingConfigurations]);

  const activeConfig = useMemo(() => {
    return configurations.find((c) => c.id === selectedConfigId) || null;
  }, [configurations, selectedConfigId]);

  const activeSection = useMemo(() => {
    return classSections.find((s) => s.id === selectedSectionId) || null;
  }, [classSections, selectedSectionId]);

  const activeYear = useMemo(() => {
    return academicYears.find((y) => y.id === selectedYearId) || null;
  }, [academicYears, selectedYearId]);

  const activeSemester = useMemo(() => {
    return semesters.find((s) => s.id === selectedSemesterId) || null;
  }, [semesters, selectedSemesterId]);

  // 2. Solver Options
  const [timeoutSeconds, setTimeoutSeconds] = useState<number>(30);
  const [randomSeed, setRandomSeed] = useState<number>(42);
  const [allowPartial, setAllowPartial] = useState<boolean>(false);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState<boolean>(false);

  // 3. Execution State Machine
  const [state, setState] = useState<GeneratorState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [generatedResult, setGeneratedResult] = useState<GeneratedTimetableResult | null>(null);
  const [isPending, startTransition] = useTransition();

  // 4. Pre-Solve Summary State
  const [inputSummary, setInputSummary] = useState<GenerationInputSummary | null>(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState<boolean>(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  // Load generation summary whenever selected configuration or section changes
  const loadSummary = useCallback(async (configId: string, sectionId: string) => {
    if (!configId || !sectionId) {
      setInputSummary(null);
      setSummaryError(null);
      return;
    }
    setIsLoadingSummary(true);
    setSummaryError(null);
    try {
      const res = await getGenerationInputSummaryAction(configId, sectionId);
      if (res.success && res.data) {
        setInputSummary(res.data);
      } else {
        setSummaryError(res.error || "Unable to load generation-input summary.");
        setInputSummary(null);
      }
    } catch {
      setSummaryError("Failed to fetch pre-solve generation summary.");
      setInputSummary(null);
    } finally {
      setIsLoadingSummary(false);
    }
  }, []);

  useEffect(() => {
    if (selectedConfigId && selectedSectionId) {
      loadSummary(selectedConfigId, selectedSectionId);
    } else {
      setInputSummary(null);
    }
  }, [selectedConfigId, selectedSectionId, loadSummary]);

  // Validate before submission
  const validationError = useMemo(() => {
    if (!selectedSectionId) {
      return "Please select a target class section.";
    }
    if (!selectedConfigId || !activeConfig) {
      return "No timetable configuration selected for this class section.";
    }
    if (!activeConfig.is_active) {
      return "The selected configuration is inactive. Please activate it in Timetable Configuration.";
    }
    if ((activeConfig.periods_count || 0) === 0 && (!activeConfig.periods || activeConfig.periods.length === 0)) {
      return "The selected configuration has no active period slots. Please generate period slots first.";
    }
    if (timeoutSeconds < 5 || timeoutSeconds > 300) {
      return "Solver timeout must be between 5 and 300 seconds.";
    }
    return null;
  }, [selectedSectionId, selectedConfigId, activeConfig, timeoutSeconds]);

  // Handle Generate Timetable (Preview)
  const handleGenerate = (seedToUse: number = randomSeed) => {
    if (validationError || isPending) return;

    setState("loading");
    setErrorMessage(null);

    startTransition(async () => {
      try {
        const response = await generateTimetableAction({
          configuration_id: selectedConfigId,
          section_id: selectedSectionId,
          timeout_seconds: timeoutSeconds,
          random_seed: seedToUse,
          allow_partial: allowPartial,
        });

        if (!response.success || !response.data) {
          setState("error");
          setErrorMessage(response.error || "Failed to solve timetable preview.");
          setGeneratedResult(null);
          return;
        }

        const data = response.data;
        setGeneratedResult(data);

        // Map status to typed state
        switch (data.status) {
          case "OPTIMAL":
          case "FEASIBLE":
            setState("success");
            break;
          case "PARTIAL":
            setState("partial");
            break;
          case "TIME_LIMIT":
            setState("time_limit");
            break;
          case "INFEASIBLE":
            setState("infeasible");
            break;
          case "MODEL_INVALID":
            setState("model_invalid");
            break;
          case "ERROR":
          default:
            setState("error");
            setErrorMessage(data.error_message || `Solver terminated with status: ${data.status}`);
            break;
        }
      } catch (err: unknown) {
        setState("error");
        const msg = err instanceof Error ? err.message : "An unexpected error occurred during timetable generation.";
        setErrorMessage(msg);
        setGeneratedResult(null);
      }
    });
  };

  // 5. Phase 6.5 Persistence & Publishing Lifecycle States
  const [savedGenId, setSavedGenId] = useState<string | null>(null);
  const [savedGenNumber, setSavedGenNumber] = useState<number | null>(null);
  const [isPublished, setIsPublished] = useState<boolean>(false);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [publisherName, setPublisherName] = useState<string | null>(null);

  const [isSavingDraft, setIsSavingDraft] = useState<boolean>(false);
  const [isPublishing, setIsPublishing] = useState<boolean>(false);
  const [isUnpublishing, setIsUnpublishing] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  const [showPublishModal, setShowPublishModal] = useState<boolean>(false);
  const [notifyUsers, setNotifyUsers] = useState<boolean>(true);

  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);
  const [historyItems, setHistoryItems] = useState<TimetableGenerationHistoryItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Sync state whenever generatedResult changes or is loaded
  useEffect(() => {
    if (generatedResult) {
      setSavedGenId(generatedResult.generation_id || null);
      setSavedGenNumber(generatedResult.generation_number || null);
      setIsPublished(generatedResult.is_published === true);
      setPublishedAt(generatedResult.published_at || null);
      setPublisherName(generatedResult.publisher_name || null);
    } else {
      setSavedGenId(null);
      setSavedGenNumber(null);
      setIsPublished(false);
      setPublishedAt(null);
      setPublisherName(null);
    }
  }, [generatedResult]);

  // Helper to build typed persistence payload
  const buildSavePayload = () => {
    if (!generatedResult || !selectedConfigId || !selectedSectionId) return null;
    return {
      configuration_id: selectedConfigId,
      section_id: selectedSectionId,
      solver_metrics: {
        solver_name: generatedResult.solver_name,
        solver_version: generatedResult.solver_version,
        solve_duration_ms: generatedResult.solve_duration_ms,
        hard_constraint_violations: generatedResult.hard_constraint_violations,
        soft_constraint_violations: generatedResult.soft_constraint_violations,
        objective_score: generatedResult.objective_score,
        diagnostics: generatedResult.diagnostics,
      },
      entries: generatedResult.entries.map((e) => ({
        subject_id: e.subject_id,
        faculty_id: e.faculty_id,
        classroom_id: e.classroom_id,
        timetable_period_id: e.timetable_period_id,
        occurrence_index: e.occurrence_index || 1,
        session_type: (e.session_type as any) || "THEORY",
        is_lab: e.is_lab ?? false,
        notes: e.notes || null,
      })),
    };
  };

  // Handle Save Draft Action
  const handleSaveDraft = async () => {
    const payload = buildSavePayload();
    if (!payload || isSavingDraft) return;
    setIsSavingDraft(true);
    setFeedback(null);
    try {
      const res = await saveTimetableGenerationAction(payload);

      if (res.success && res.data) {
        setSavedGenId(res.data.generation_id);
        setSavedGenNumber(res.data.generation_number);
        setIsPublished(false);
        setFeedback({
          type: "success",
          message: `Timetable saved successfully as Draft Generation #${res.data.generation_number} (${res.data.entries_count} entries persisted).`,
        });
      } else {
        setFeedback({
          type: "error",
          message: res.error || "Failed to persist draft timetable.",
        });
      }
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Unexpected error while saving draft.",
      });
    } finally {
      setIsSavingDraft(false);
    }
  };

  // Handle Open Publish Confirmation
  const handleOpenPublishModal = async () => {
    if (!generatedResult) return;
    setFeedback(null);
    // If not saved yet, save draft first
    if (!savedGenId) {
      const payload = buildSavePayload();
      if (!payload) return;
      setIsSavingDraft(true);
      try {
        const res = await saveTimetableGenerationAction(payload);
        if (res.success && res.data) {
          setSavedGenId(res.data.generation_id);
          setSavedGenNumber(res.data.generation_number);
          setShowPublishModal(true);
        } else {
          setFeedback({
            type: "error",
            message: res.error || "Cannot publish: failed to automatically save draft first.",
          });
        }
      } catch (err: unknown) {
        setFeedback({
          type: "error",
          message: err instanceof Error ? err.message : "Failed to prepare timetable for publishing.",
        });
      } finally {
        setIsSavingDraft(false);
      }
    } else {
      setShowPublishModal(true);
    }
  };

  // Handle Confirm Publish
  const handleConfirmPublish = async () => {
    if (!savedGenId || isPublishing) return;
    setIsPublishing(true);
    setFeedback(null);
    try {
      const res = await publishTimetableAction({
        generation_id: savedGenId,
        notify: notifyUsers,
      });

      if (res.success && res.data) {
        setIsPublished(true);
        setPublishedAt(res.data.published_at);
        setPublisherName(res.data.publisher_name || null);
        setShowPublishModal(false);
        setFeedback({
          type: "success",
          message: `Timetable published successfully! Enrolled students and faculty can now view this official schedule (${res.data.notifications_sent} notifications sent).`,
        });
      } else {
        setFeedback({
          type: "error",
          message: res.error || "Failed to publish timetable.",
        });
      }
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Unexpected error during publishing.",
      });
    } finally {
      setIsPublishing(false);
    }
  };

  // Handle Unpublish
  const handleUnpublish = async () => {
    if (!savedGenId || isUnpublishing) return;
    setIsUnpublishing(true);
    setFeedback(null);
    try {
      const res = await unpublishTimetableAction({
        generation_id: savedGenId,
      });

      if (res.success) {
        setIsPublished(false);
        setFeedback({
          type: "success",
          message: "Timetable has been unpublished and reverted to Draft status.",
        });
      } else {
        setFeedback({
          type: "error",
          message: res.error || "Failed to unpublish timetable.",
        });
      }
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Unexpected error unpublishing timetable.",
      });
    } finally {
      setIsUnpublishing(false);
    }
  };

  // Load Generation History
  const loadHistory = async (cfgId: string) => {
    if (!cfgId) return;
    setIsLoadingHistory(true);
    setHistoryError(null);
    try {
      const res = await getGenerationHistoryAction(cfgId);
      if (res.success && res.data) {
        setHistoryItems(res.data);
      } else {
        setHistoryError(res.error || "Failed to load generation history.");
      }
    } catch {
      setHistoryError("Failed to fetch timetable generation history.");
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleOpenHistoryModal = () => {
    if (selectedConfigId) {
      loadHistory(selectedConfigId);
    }
    setShowHistoryModal(true);
  };

  // Load an existing generation into the active preview
  const handleLoadGeneration = async (genId: string) => {
    setFeedback(null);
    try {
      const res = await getTimetableGenerationAction(genId);
      if (res.success && res.data) {
        setGeneratedResult(res.data);
        setSavedGenId(res.data.generation_id || genId);
        setSavedGenNumber(res.data.generation_number || null);
        setIsPublished(res.data.is_published === true);
        setPublishedAt(res.data.published_at || null);
        setPublisherName(res.data.publisher_name || null);
        setState("success");
        setShowHistoryModal(false);
        setFeedback({
          type: "success",
          message: `Loaded Generation #${res.data.generation_number || 1} into preview.`,
        });
      } else {
        setFeedback({
          type: "error",
          message: res.error || "Failed to load timetable generation.",
        });
      }
    } catch {
      setFeedback({
        type: "error",
        message: "Failed to load timetable generation.",
      });
    }
  };

  // Delete a draft generation
  const handleDeleteDraft = async (genId: string) => {
    if (!genId || isDeleting) return;
    setIsDeleting(true);
    setFeedback(null);
    try {
      const res = await deleteTimetableGenerationAction({ generation_id: genId });
      if (res.success) {
        if (savedGenId === genId) {
          setSavedGenId(null);
          setSavedGenNumber(null);
        }
        if (selectedConfigId) {
          loadHistory(selectedConfigId);
        }
        setFeedback({
          type: "success",
          message: "Draft timetable deleted successfully.",
        });
      } else {
        setFeedback({
          type: "error",
          message: res.error || "Failed to delete draft timetable.",
        });
      }
    } catch {
      setFeedback({
        type: "error",
        message: "Failed to delete draft timetable.",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Handle Retry Generation safely (increments random seed and re-runs)
  const handleRetry = () => {
    const nextSeed = randomSeed + 1;
    setRandomSeed(nextSeed);
    handleGenerate(nextSeed);
  };

  // Reset view to idle
  const handleReset = () => {
    setState("idle");
    setErrorMessage(null);
    setGeneratedResult(null);
    setSavedGenId(null);
    setSavedGenNumber(null);
    setIsPublished(false);
    setFeedback(null);
  };

  return (
    <div className="space-y-6">
      {/* ========================================================================= */}
      {/* 1. DYNAMIC TIMETABLE LIFECYCLE & SAFEGUARD BANNER                         */}
      {/* ========================================================================= */}
      {isPublished ? (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-900 dark:text-emerald-200 shadow-xs gap-3">
          <div className="flex items-center gap-3">
            <span className="px-2.5 py-1 rounded-md bg-emerald-500/20 font-mono font-bold text-xs border border-emerald-500/30 text-emerald-900 dark:text-emerald-200 shrink-0 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              Official Published Schedule
            </span>
            <span className="text-xs font-medium">
              {publishedAt
                ? `Published on ${new Date(publishedAt).toLocaleString()}${publisherName ? ` by ${publisherName}` : ""}`
                : "Active and visible to all enrolled students and assigned instructors."}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/timetable"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-xs"
            >
              <Eye className="w-3.5 h-3.5" />
              View Official Timetable
            </Link>
            <Button
              variant="outline"
              size="sm"
              onClick={handleUnpublish}
              disabled={isUnpublishing}
              className="text-xs h-8 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200"
            >
              {isUnpublishing ? (
                <Loader2 className="w-3 h-3 animate-spin mr-1" />
              ) : null}
              Revert to Draft
            </Button>
          </div>
        </div>
      ) : savedGenId ? (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-900 dark:text-blue-200 shadow-xs gap-3">
          <div className="flex items-center gap-3">
            <span className="px-2.5 py-1 rounded-md bg-blue-500/20 font-mono font-bold text-xs border border-blue-500/30 text-blue-900 dark:text-blue-200 shrink-0 flex items-center gap-1.5">
              <Bookmark className="w-3.5 h-3.5 text-blue-600" />
              Saved Draft (Gen #{savedGenNumber || 1})
            </span>
            <span className="text-xs font-medium">
              This draft is safely stored in the database. Review diagnostics and publish when ready.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleOpenPublishModal}
              disabled={isPublishing || (generatedResult?.entries?.length || 0) === 0}
              className="text-xs h-8 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              Publish Schedule
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenHistoryModal}
              className="text-xs h-8"
            >
              <History className="w-3.5 h-3.5 mr-1" />
              All Drafts
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 shadow-xs gap-3">
          <div className="flex items-center gap-3">
            <span className="px-2.5 py-1 rounded-md bg-amber-500/20 font-mono font-bold text-xs border border-amber-500/30 text-amber-900 dark:text-amber-200 shrink-0">
              Preview Mode: In-Memory
            </span>
            <span className="text-xs font-medium">
              Solve and preview schedules in memory. Click &apos;Save Draft&apos; to persist to database or &apos;Publish&apos; when verified.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenHistoryModal}
              className="text-xs h-7 border-amber-500/40 text-amber-800 dark:text-amber-300"
            >
              <History className="w-3.5 h-3.5 mr-1" />
              Saved Drafts
            </Button>
          </div>
        </div>
      )}

      {/* Global Feedback Toast / Banner */}
      {feedback && (
        <div
          className={cn(
            "p-3.5 rounded-xl border flex items-center justify-between gap-2 text-xs transition-all",
            feedback.type === "success"
              ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200"
              : "bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200"
          )}
        >
          <div className="flex items-center gap-2">
            {feedback.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-xs font-bold opacity-60 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. ACADEMIC CONTEXT & SELECTION CARD                                      */}
      {/* ========================================================================= */}
      <Card className="border-border/80 bg-card shadow-xs">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-primary" />
              <CardTitle className="text-lg">Academic Scheduling Parameters</CardTitle>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-md bg-accent/15 text-accent font-semibold border border-accent/30">
              OR-Tools CP-SAT
            </span>
          </div>
          <CardDescription>
            Select the target academic section and scheduling configuration to run the constraint satisfaction solver preview.
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

          {/* Configuration Selection */}
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
          </div>

          {/* ========================================================================= */}
          {/* 3. PRE-SOLVE GENERATION INPUT SUMMARY CARD                                */}
          {/* ========================================================================= */}
          {isLoadingSummary && (
            <div className="p-6 rounded-xl border border-border/60 bg-muted/20 flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <span>Analyzing academic configuration and domain constraints...</span>
            </div>
          )}

          {summaryError && !isLoadingSummary && (
            <div className="flex items-center gap-2 p-3.5 rounded-xl bg-rose-50/70 dark:bg-rose-950/20 border border-rose-300 dark:border-rose-800/80 text-xs text-rose-800 dark:text-rose-200">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{summaryError}</span>
            </div>
          )}

          {inputSummary && !isLoadingSummary && (
            <div className="p-4 rounded-xl border border-border/70 bg-card/80 space-y-4 shadow-xs">
              <div className="flex items-center justify-between border-b border-border/60 pb-2">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-primary" />
                  <span className="text-xs font-bold text-foreground uppercase tracking-wider">
                    Generation-Input Summary
                  </span>
                </div>
                <span className="text-[11px] text-muted-foreground">
                  {inputSummary.academic_year_name} • {inputSummary.semester_name}
                </span>
              </div>

              {/* Summary Stats Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3 text-xs">
                <div className="p-2.5 rounded-lg bg-muted/40 border border-border/40">
                  <span className="block text-[10px] uppercase font-semibold text-muted-foreground">
                    Working Days
                  </span>
                  <span className="text-sm font-bold text-foreground">
                    {inputSummary.working_days_count} Days/Wk
                  </span>
                  <span className="block text-[10px] text-muted-foreground mt-0.5">
                    {inputSummary.daily_period_count} periods/day ({inputSummary.period_duration_minutes}m)
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-muted/40 border border-border/40">
                  <span className="block text-[10px] uppercase font-semibold text-muted-foreground">
                    Cohort Size
                  </span>
                  <span className="text-sm font-bold text-foreground">
                    {inputSummary.student_count} Students
                  </span>
                  <span className="block text-[10px] text-muted-foreground mt-0.5">
                    Section {inputSummary.section_names[0] || "1"}
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-muted/40 border border-border/40">
                  <span className="block text-[10px] uppercase font-semibold text-muted-foreground">
                    Subjects
                  </span>
                  <span className="text-sm font-bold text-foreground">
                    {inputSummary.subjects_count} Subjects
                  </span>
                  <span className="block text-[10px] text-muted-foreground mt-0.5">
                    {inputSummary.total_required_weekly_periods} weekly periods req
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-muted/40 border border-border/40">
                  <span className="block text-[10px] uppercase font-semibold text-muted-foreground">
                    Faculty Assigned
                  </span>
                  <span className="text-sm font-bold text-foreground">
                    {inputSummary.assigned_faculty_count} Members
                  </span>
                  <span className="block text-[10px] text-muted-foreground mt-0.5">
                    {inputSummary.faculty_availability_coverage.available_slots} avail slots
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-muted/40 border border-border/40">
                  <span className="block text-[10px] uppercase font-semibold text-muted-foreground">
                    Lecture Rooms
                  </span>
                  <span className="text-sm font-bold text-foreground">
                    {inputSummary.lecture_rooms_count} Rooms
                  </span>
                  <span className="block text-[10px] text-muted-foreground mt-0.5">
                    Theory capacity
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-muted/40 border border-border/40">
                  <span className="block text-[10px] uppercase font-semibold text-muted-foreground">
                    Lab Rooms
                  </span>
                  <span className="text-sm font-bold text-foreground">
                    {inputSummary.lab_rooms_count} Labs
                  </span>
                  <span className="block text-[10px] text-muted-foreground mt-0.5">
                    Laboratory capacity
                  </span>
                </div>
              </div>

              {/* Active Constraints Checklist */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                  <span>Active Constraints Checklist</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {inputSummary.active_constraints.map((c, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        "p-2 rounded-lg border text-xs flex items-start gap-2",
                        c.status === "active"
                          ? "bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-200"
                          : "bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200"
                      )}
                    >
                      {c.status === "active" ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <div className="font-bold text-[11px] leading-tight">{c.name}</div>
                        <div className="text-[10px] opacity-80 leading-snug mt-0.5">{c.description}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* 4. SOLVER CONTROLS: Timeout, Allow Partial, Random Seed                   */}
          {/* ========================================================================= */}
          <div className="border border-border/60 rounded-xl overflow-hidden bg-background/50">
            <button
              type="button"
              onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
              className="w-full flex items-center justify-between px-3.5 py-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              <div className="flex items-center gap-2">
                <Sliders className="w-3.5 h-3.5 text-primary" />
                <span>Solver Controls (Timeout: {timeoutSeconds}s, Seed: #{randomSeed}, Partial: {allowPartial ? "On" : "Off"})</span>
              </div>
              <span className="text-[11px] text-muted-foreground">
                {showAdvancedOptions ? "Hide Options" : "Show Options"}
              </span>
            </button>

            {showAdvancedOptions && (
              <div className="p-4 border-t border-border/60 grid grid-cols-1 sm:grid-cols-3 gap-4 bg-muted/20">
                {/* 1. Timeout Selector (5s, 15s, 30s, 60s) */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground block">
                    Solver Timeout
                  </label>
                  <select
                    value={timeoutSeconds}
                    onChange={(e) => setTimeoutSeconds(parseInt(e.target.value, 10))}
                    disabled={isPending}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value={5}>5 seconds (Fast check)</option>
                    <option value={15}>15 seconds (Standard)</option>
                    <option value={30}>30 seconds (Recommended)</option>
                    <option value={60}>60 seconds (Deep search)</option>
                  </select>
                  <p className="text-[10px] text-muted-foreground">
                    Maximum execution time allowed for CP-SAT search.
                  </p>
                </div>

                {/* 2. Allow Partial Solution Toggle */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground block">
                    Allow Partial Solution
                  </label>
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="checkbox"
                      id="allowPartialToggle"
                      checked={allowPartial}
                      onChange={(e) => setAllowPartial(e.target.checked)}
                      disabled={isPending}
                      className="rounded border-border text-primary focus:ring-primary h-4 w-4"
                    />
                    <label htmlFor="allowPartialToggle" className="text-xs text-foreground cursor-pointer">
                      Allow incomplete schedule on timeout
                    </label>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    If enabled, solver returns best feasible subset when a full schedule cannot be placed.
                  </p>
                </div>

                {/* 3. Random Seed Input */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground block">
                    Random Seed
                  </label>
                  <input
                    type="number"
                    value={randomSeed}
                    onChange={(e) => setRandomSeed(parseInt(e.target.value, 10) || 0)}
                    disabled={isPending}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Deterministic seed controlling CP-SAT branch randomization.
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

          {/* ========================================================================= */}
          {/* 5. STATUS BANNERS FOR ALL 7 SOLVER STATUSES                               */}
          {/* ========================================================================= */}
          {state === "error" && errorMessage && (
            <div className="flex items-start gap-2.5 p-3.5 rounded-lg bg-rose-50/90 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-200">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
              <div className="space-y-1 flex-1">
                <div className="font-bold">Solver Execution Error</div>
                <div>{errorMessage}</div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleGenerate()}
                disabled={isPending}
                className="text-xs h-7 shrink-0"
              >
                Retry
              </Button>
            </div>
          )}

          {state === "partial" && (
            <div className="flex items-start gap-2.5 p-3.5 rounded-lg bg-amber-50/90 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
              <div className="space-y-1 flex-1">
                <div className="font-bold">Partial Schedule Generated</div>
                <div>
                  The solver produced an incomplete preview with{" "}
                  <strong>{generatedResult?.entries.length || 0}</strong> assigned sessions out of{" "}
                  <strong>{generatedResult?.total_required_sessions || 0}</strong> required. Unassigned sessions are listed in the diagnostics panel below.
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRetry}
                disabled={isPending}
                className="text-xs h-7 shrink-0"
              >
                Retry with Seed #{randomSeed + 1}
              </Button>
            </div>
          )}

          {state === "time_limit" && (
            <div className="flex items-start gap-2.5 p-3.5 rounded-lg bg-purple-50/90 dark:bg-purple-950/40 border border-purple-300 dark:border-purple-800 text-xs text-purple-900 dark:text-purple-200">
              <Hourglass className="w-4 h-4 shrink-0 mt-0.5 text-purple-600 dark:text-purple-400" />
              <div className="space-y-1 flex-1">
                <div className="font-bold">Solver Time Limit Reached</div>
                <div>
                  The solver reached the {timeoutSeconds}s wall-clock time limit. A feasible solution was returned, but optimality could not be mathematically proven within the allotted time.
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRetry}
                disabled={isPending}
                className="text-xs h-7 shrink-0"
              >
                Retry (New Seed)
              </Button>
            </div>
          )}

          {state === "infeasible" && (
            <div className="flex items-start gap-2.5 p-3.5 rounded-lg bg-rose-50/90 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-xs text-rose-900 dark:text-rose-200">
              <XCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
              <div className="space-y-1 flex-1">
                <div className="font-bold">Timetable Is Infeasible</div>
                <div>
                  Conflicting hard constraints prevented the generation of a valid timetable. Review faculty availability, room capacities, and required weekly periods.
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRetry}
                disabled={isPending}
                className="text-xs h-7 shrink-0"
              >
                Retry
              </Button>
            </div>
          )}

          {state === "model_invalid" && (
            <div className="flex items-start gap-2.5 p-3.5 rounded-lg bg-rose-50/90 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-xs text-rose-900 dark:text-rose-200">
              <AlertOctagon className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
              <div className="space-y-1 flex-1">
                <div className="font-bold">Invalid Model Parameters</div>
                <div>
                  The input data or reference parameters contain inconsistencies. Please verify section configurations and faculty assignments.
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRetry}
                disabled={isPending}
                className="text-xs h-7 shrink-0"
              >
                Retry
              </Button>
            </div>
          )}

          {/* ========================================================================= */}
          {/* 6. GENERATION & PERSISTENCE BUTTON CONTROLS                               */}
          {/* ========================================================================= */}
          <div className="flex items-center gap-3 pt-2 flex-wrap">
            {state === "idle" || state === "error" ? (
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  onClick={() => handleGenerate()}
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
                      <CalendarDays className="w-4 h-4 text-primary-foreground" />
                      <span>Generate Timetable (Preview)</span>
                    </>
                  )}
                </Button>

                <Button
                  variant="outline"
                  onClick={handleOpenHistoryModal}
                  disabled={!selectedConfigId}
                  className="text-xs flex items-center gap-1.5"
                >
                  <History className="w-3.5 h-3.5" />
                  <span>Drafts & History</span>
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                {/* Save Draft Button */}
                <Button
                  onClick={handleSaveDraft}
                  disabled={isSavingDraft || isPending || isPublished || !generatedResult}
                  variant={savedGenId ? "outline" : "default"}
                  className="flex items-center gap-1.5 text-xs font-semibold shadow-xs"
                >
                  {isSavingDraft ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving Draft...</span>
                    </>
                  ) : (
                    <>
                      <Bookmark className="w-3.5 h-3.5" />
                      <span>{savedGenId ? "Update / Save Draft" : "Save as Draft"}</span>
                    </>
                  )}
                </Button>

                {/* Publish Button */}
                {!isPublished && (
                  <Button
                    onClick={handleOpenPublishModal}
                    disabled={isPublishing || isPending || !generatedResult}
                    className="flex items-center gap-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                  >
                    {isPublishing ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Publishing...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        <span>Publish Timetable</span>
                      </>
                    )}
                  </Button>
                )}

                {/* Re-optimize / Retry */}
                {!isPublished && (
                  <Button
                    variant="outline"
                    onClick={handleRetry}
                    disabled={Boolean(validationError) || isPending}
                    className="flex items-center gap-1.5 text-xs font-semibold"
                  >
                    {isPending ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Re-optimizing...</span>
                      </>
                    ) : (
                      <>
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Retry (Seed #{randomSeed + 1})</span>
                      </>
                    )}
                  </Button>
                )}

                {/* History Drawer */}
                <Button
                  variant="outline"
                  onClick={handleOpenHistoryModal}
                  className="text-xs flex items-center gap-1.5"
                >
                  <History className="w-3.5 h-3.5" />
                  <span>Drafts & History</span>
                </Button>

                {/* Clear Preview */}
                <Button
                  variant="ghost"
                  onClick={handleReset}
                  disabled={isPending}
                  className="text-xs text-muted-foreground"
                >
                  Clear Preview
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ========================================================================= */}
      {/* 7. GENERATED TIMETABLE PREVIEW & DIAGNOSTICS                              */}
      {/* ========================================================================= */}
      {generatedResult && (
        <div className="space-y-6">
          {/* Diagnostics Panel */}
          <TimetableDiagnostics result={generatedResult} />

          {/* Grid Preview (only if entries exist) */}
          {generatedResult.entries && generatedResult.entries.length > 0 && (
            <TimetableGridPreview
              entries={generatedResult.entries}
              periods={activeConfig?.periods || []}
              enabledDays={inputSummary?.enabled_working_days}
              sectionName={activeSection?.name}
              academicYearName={activeYear?.name}
              semesterName={activeSemester?.name}
            />
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 8. PUBLISH CONFIRMATION MODAL                                             */}
      {/* ========================================================================= */}
      <ModalDialog
        open={showPublishModal}
        onClose={() => setShowPublishModal(false)}
        title="Publish Official Timetable"
        description="Verify details before publishing. Once published, this becomes the official active schedule."
        maxWidth="md"
      >
        <div className="space-y-4 py-2">
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Important Notice:</span> Publishing will make this timetable the active schedule for Section {activeSection?.name}. All students and faculty in this section will see this schedule immediately.
            </div>
          </div>

          <div className="space-y-2 text-xs border border-border rounded-xl p-3 bg-muted/20">
            <div className="flex justify-between py-1 border-b border-border/60">
              <span className="text-muted-foreground">Class Section:</span>
              <span className="font-semibold text-foreground">Section {activeSection?.name}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-border/60">
              <span className="text-muted-foreground">Configuration:</span>
              <span className="font-semibold text-foreground">{activeConfig?.name}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-border/60">
              <span className="text-muted-foreground">Total Scheduled Entries:</span>
              <span className="font-semibold text-foreground">{generatedResult?.entries?.length || 0} slots</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-muted-foreground">Hard Constraint Violations:</span>
              <span className="font-semibold text-emerald-600">
                {generatedResult?.hard_constraint_violations || 0} conflicts
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="notify-users-checkbox"
              checked={notifyUsers}
              onChange={(e) => setNotifyUsers(e.target.checked)}
              className="rounded border-border text-primary focus:ring-primary w-4 h-4"
            />
            <label htmlFor="notify-users-checkbox" className="text-xs text-foreground cursor-pointer">
              Send in-app notifications to enrolled students and assigned instructors
            </label>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPublishModal(false)}
              disabled={isPublishing}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleConfirmPublish}
              disabled={isPublishing}
              className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center gap-1.5"
            >
              {isPublishing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Publishing Schedule...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Confirm & Publish</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </ModalDialog>

      {/* ========================================================================= */}
      {/* 9. SAVED DRAFTS & HISTORY MODAL                                           */}
      {/* ========================================================================= */}
      <ModalDialog
        open={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        title="Saved Timetable Drafts & History"
        description={`Saved generations for configuration: ${activeConfig?.name || "Selected Config"}`}
        maxWidth="xl"
      >
        <div className="space-y-4 py-2">
          {isLoadingHistory ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <span>Loading saved timetable drafts...</span>
            </div>
          ) : historyError ? (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-900 dark:text-rose-200">
              {historyError}
            </div>
          ) : historyItems.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-foreground space-y-2">
              <History className="w-8 h-8 mx-auto text-muted-foreground/40" />
              <p>No saved timetable drafts found for this configuration.</p>
              <p className="text-[11px]">Generate a timetable and click &apos;Save as Draft&apos; to persist it.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/60 max-h-[420px] overflow-y-auto pr-1">
              {historyItems.map((item) => (
                <div
                  key={item.id}
                  className="py-3 px-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hover:bg-muted/30 rounded-lg transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-foreground">
                        Generation #{item.generation_number}
                      </span>
                      {item.is_published ? (
                        <Badge className="text-[10px] bg-emerald-500/20 text-emerald-800 dark:text-emerald-200 border-emerald-500/30">
                          PUBLISHED
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">
                          DRAFT
                        </Badge>
                      )}
                      <span className="text-[11px] text-muted-foreground">
                        {item.entries_count} entries
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Created: {new Date(item.created_at).toLocaleString()} • Status: {item.status}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleLoadGeneration(item.id)}
                      className="text-xs h-7 flex items-center gap-1"
                    >
                      <Eye className="w-3 h-3" />
                      <span>Preview</span>
                    </Button>

                    {!item.is_published && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDeleteDraft(item.id)}
                        disabled={isDeleting}
                        className="text-xs h-7 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-end pt-3 border-t border-border">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowHistoryModal(false)}
              className="text-xs"
            >
              Close
            </Button>
          </div>
        </div>
      </ModalDialog>
    </div>
  );
}
