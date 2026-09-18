"use client";

import React from "react";
import { GeneratedTimetableResult } from "@/types/database";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Clock,
  Cpu,
  Layers,
  ShieldCheck,
  Zap,
  Info,
  SlidersHorizontal,
  XCircle,
  HelpCircle,
  AlertCircle,
  Hourglass,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface TimetableDiagnosticsProps {
  result: GeneratedTimetableResult;
}

export function TimetableDiagnostics({ result }: TimetableDiagnosticsProps) {
  const isOptimal = result.status === "OPTIMAL";
  const isFeasible = result.status === "FEASIBLE";
  const isPartial = result.status === "PARTIAL";
  const isTimeLimit = result.status === "TIME_LIMIT";
  const isInfeasible = result.status === "INFEASIBLE";
  const isInvalid = result.status === "MODEL_INVALID";
  const isError = result.status === "ERROR";

  const getStatusBadge = () => {
    switch (result.status) {
      case "OPTIMAL":
        return {
          label: "Optimal",
          description: "All hard & soft constraints satisfied",
          badgeClass:
            "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800",
          icon: <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />,
        };
      case "FEASIBLE":
        return {
          label: "Feasible",
          description: "All hard constraints satisfied without conflicts (optimality not proven)",
          badgeClass:
            "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border-blue-300 dark:border-blue-800",
          icon: <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />,
        };
      case "PARTIAL":
        return {
          label: "Partial",
          description: "Incomplete timetable — unassigned sessions remain",
          badgeClass:
            "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300 dark:border-amber-800",
          icon: <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />,
        };
      case "TIME_LIMIT":
        return {
          label: "Time limit reached",
          description: "Solver reached timeout limit before completing optimal proof",
          badgeClass:
            "bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border-purple-300 dark:border-purple-800",
          icon: <Hourglass className="w-4 h-4 text-purple-600 dark:text-purple-400" />,
        };
      case "INFEASIBLE":
        return {
          label: "Infeasible",
          description: "Conflicting constraints prevented a valid timetable",
          badgeClass:
            "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-300 dark:border-rose-800",
          icon: <XCircle className="w-4 h-4 text-rose-600 dark:text-rose-400" />,
        };
      case "MODEL_INVALID":
        return {
          label: "Invalid model",
          description: "Scheduling requirement schema or input parameters inconsistent",
          badgeClass:
            "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-300 dark:border-rose-800",
          icon: <AlertOctagon className="w-4 h-4 text-rose-600 dark:text-rose-400" />,
        };
      case "ERROR":
        return {
          label: "Error",
          description: "Solver execution failed due to an internal error",
          badgeClass:
            "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-300 dark:border-rose-800",
          icon: <AlertOctagon className="w-4 h-4 text-rose-600 dark:text-rose-400" />,
        };
      default:
        return {
          label: result.status,
          description: "Solver terminated with status: " + result.status,
          badgeClass: "bg-muted text-muted-foreground border-border",
          icon: <HelpCircle className="w-4 h-4 text-muted-foreground" />,
        };
    }
  };

  const statusInfo = getStatusBadge();

  const assignedCount = result.total_assigned_sessions ?? result.entries.length;
  const requiredCount = result.total_required_sessions ?? assignedCount;
  const unassignedCount = result.unassigned_sessions?.length || Math.max(0, requiredCount - assignedCount);
  const warningsCount = result.warnings?.length || 0;
  const validationErrorsCount = result.validation_errors?.length || 0;

  const isFullyComplete =
    (isOptimal || isFeasible) &&
    unassignedCount === 0 &&
    result.hard_constraint_violations === 0 &&
    (result.is_complete !== false);

  return (
    <div className="space-y-4">
      {/* Metric Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Status Card */}
        <Card className="border-border/80 bg-card shadow-xs">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Solver Status
              </span>
              {statusInfo.icon}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span
                className={cn(
                  "px-2 py-0.5 text-xs font-bold rounded-md border",
                  statusInfo.badgeClass
                )}
              >
                {statusInfo.label}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground line-clamp-1">
              {statusInfo.description}
            </p>
          </CardContent>
        </Card>

        {/* Solve Duration */}
        <Card className="border-border/80 bg-card shadow-xs">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Solve Time
              </span>
              <Clock className="w-4 h-4 text-primary" />
            </div>
            <div className="mt-2 text-xl font-bold text-foreground">
              {result.solve_duration_ms.toFixed(1)}
              <span className="text-xs font-normal text-muted-foreground ml-1">ms</span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Engine execution latency
            </p>
          </CardContent>
        </Card>

        {/* Assigned vs Required Sessions */}
        <Card className="border-border/80 bg-card shadow-xs">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Assigned / Required
              </span>
              <Layers className="w-4 h-4 text-primary" />
            </div>
            <div className="mt-2 text-xl font-bold text-foreground">
              {assignedCount}
              <span className="text-xs font-normal text-muted-foreground ml-1">
                / {requiredCount}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              {isFullyComplete ? (
                <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                  Complete (100%)
                </span>
              ) : (
                <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
                  Incomplete ({requiredCount > 0 ? Math.round((assignedCount / requiredCount) * 100) : 0}%)
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Violations & Score */}
        <Card className="border-border/80 bg-card shadow-xs">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Violations
              </span>
              <ShieldCheck
                className={cn(
                  "w-4 h-4",
                  result.hard_constraint_violations === 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400"
                )}
              />
            </div>
            <div className="mt-2 text-xl font-bold text-foreground">
              {result.hard_constraint_violations}
              <span className="text-xs font-normal text-muted-foreground ml-1">hard</span>
              <span className="text-xs font-normal text-muted-foreground ml-1">
                / {result.soft_constraint_violations} soft
              </span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {typeof result.objective_score === "number"
                ? `Score: ${result.objective_score}`
                : result.hard_constraint_violations === 0
                ? "Zero conflicting assignments"
                : "Constraint penalties detected"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Solver Metadata Header Bar */}
      <div className="flex items-center justify-between px-3.5 py-2 rounded-lg bg-muted/40 border border-border/60 text-xs text-muted-foreground flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Cpu className="w-3.5 h-3.5 text-primary" />
          <span>
            Optimization Engine:{" "}
            <strong className="text-foreground">{result.solver_name || "Google OR-Tools CP-SAT"}</strong>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-300 font-semibold text-[10px] border border-amber-500/20">
            Preview Mode (In-Memory)
          </span>
          {result.solver_version && (
            <div className="font-mono text-[11px]">
              v{result.solver_version}
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. WARNINGS PANEL                                                         */}
      {/* ========================================================================= */}
      {warningsCount > 0 && result.warnings && (
        <Card className="border-amber-300 dark:border-amber-800/80 bg-amber-50/60 dark:bg-amber-950/20 shadow-xs">
          <CardHeader className="py-3 px-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <CardTitle className="text-xs font-bold text-amber-900 dark:text-amber-200 uppercase tracking-wider">
                Solver Warnings ({warningsCount})
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0">
            <ul className="space-y-1 text-xs text-amber-900 dark:text-amber-200 list-disc list-inside">
              {result.warnings.map((w, idx) => (
                <li key={idx} className="break-words">
                  {w}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* ========================================================================= */}
      {/* 2. VALIDATION ERRORS PANEL                                                */}
      {/* ========================================================================= */}
      {validationErrorsCount > 0 && result.validation_errors && (
        <Card className="border-rose-300 dark:border-rose-800/80 bg-rose-50/60 dark:bg-rose-950/20 shadow-xs">
          <CardHeader className="py-3 px-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
              <CardTitle className="text-xs font-bold text-rose-900 dark:text-rose-200 uppercase tracking-wider">
                Validation Errors ({validationErrorsCount})
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0">
            <ul className="space-y-1.5 text-xs text-rose-900 dark:text-rose-200">
              {result.validation_errors.map((err, idx) => (
                <li key={idx} className="flex items-start gap-1.5 p-2 rounded bg-rose-100/50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900">
                  <XCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                  <span className="font-mono">{err}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* ========================================================================= */}
      {/* 3. UNASSIGNED SESSIONS PANEL                                              */}
      {/* ========================================================================= */}
      {result.unassigned_sessions && result.unassigned_sessions.length > 0 && (
        <Card className="border-amber-300 dark:border-amber-800/80 bg-amber-50/60 dark:bg-amber-950/20 shadow-xs">
          <CardHeader className="py-3 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <CardTitle className="text-xs font-bold text-amber-900 dark:text-amber-200 uppercase tracking-wider">
                  Unassigned Sessions ({result.unassigned_sessions.length})
                </CardTitle>
              </div>
              <span className="text-[11px] text-amber-800 dark:text-amber-300">
                Sessions omitted due to constraints
              </span>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {result.unassigned_sessions.map((sess, idx) => (
                <div
                  key={idx}
                  className="p-2.5 rounded-lg bg-background/80 border border-amber-200 dark:border-amber-900/60 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between font-semibold text-foreground">
                    <span>Subject ID: {sess.subject_id}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 font-mono">
                      Block #{sess.block_index}
                    </span>
                  </div>
                  {sess.faculty_id && (
                    <div className="text-[11px] text-muted-foreground">
                      Faculty ID: {sess.faculty_id}
                    </div>
                  )}
                  <div className="text-[11px] text-muted-foreground">
                    Required Periods: {sess.required_periods}
                  </div>
                  {sess.reason && (
                    <div className="text-[11px] text-amber-700 dark:text-amber-300 italic">
                      Reason: {sess.reason}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ========================================================================= */}
      {/* 4. INFEASIBILITY OR DIAGNOSTICS BANNER                                    */}
      {/* ========================================================================= */}
      {(isInfeasible || isInvalid || isError || isTimeLimit || (result.diagnostics && result.diagnostics.length > 0)) && (
        <div
          className={cn(
            "p-4 rounded-xl border space-y-3",
            isInfeasible && "bg-rose-50/70 dark:bg-rose-950/20 border-rose-300 dark:border-rose-800/80",
            isInvalid && "bg-rose-50/70 dark:bg-rose-950/20 border-rose-300 dark:border-rose-800/80",
            isError && "bg-rose-50/70 dark:bg-rose-950/20 border-rose-300 dark:border-rose-800/80",
            isTimeLimit && "bg-purple-50/70 dark:bg-purple-950/20 border-purple-300 dark:border-purple-800/80",
            (isOptimal || isFeasible || isPartial) && "bg-blue-50/70 dark:bg-blue-950/20 border-blue-300 dark:border-blue-800/80"
          )}
        >
          <div className="flex items-start gap-2.5">
            {isInfeasible && (
              <XCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            )}
            {isInvalid && (
              <AlertOctagon className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            )}
            {isError && (
              <AlertOctagon className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            )}
            {isTimeLimit && (
              <Hourglass className="w-5 h-5 text-purple-600 dark:text-purple-400 shrink-0 mt-0.5" />
            )}
            {(isOptimal || isFeasible || isPartial) && (
              <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            )}
            <div>
              <h4 className="text-sm font-bold text-foreground">
                {isInfeasible
                  ? "Timetable Problem Is Infeasible"
                  : isInvalid
                  ? "Invalid Model Specifications"
                  : isError
                  ? "Solver Execution Error"
                  : isTimeLimit
                  ? "Solver Time Limit Reached"
                  : "Solver Diagnostic Output"}
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isInfeasible
                  ? "The CP-SAT mathematical solver proved that no valid conflict-free timetable exists under the current constraints."
                  : isInvalid
                  ? "The scheduling input could not be solved due to inconsistent parameters or requirements. Please review generation input."
                  : isError
                  ? (result.error_message || "An unexpected solver execution error occurred.")
                  : isTimeLimit
                  ? `The solver reached its timeout (${result.solve_duration_ms.toFixed(0)} ms) before optimality was mathematically proven.`
                  : "Diagnostic logs returned from the optimization engine."}
              </p>
            </div>
          </div>

          {/* Diagnostic Messages */}
          {result.diagnostics && result.diagnostics.length > 0 && (
            <div className="pl-7 space-y-1.5">
              <span className="text-[11px] font-semibold text-foreground uppercase tracking-wider">
                Root Cause Analysis:
              </span>
              <ul className="space-y-1 list-disc list-inside text-xs text-foreground/90 font-mono bg-background/60 p-2.5 rounded-lg border border-border/50">
                {result.diagnostics.map((msg, idx) => (
                  <li key={idx} className="break-words">
                    {msg}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Actionable Adjustment Advice for Infeasible */}
          {isInfeasible && (
            <div className="pl-7 text-xs text-muted-foreground space-y-1">
              <div className="font-semibold text-foreground flex items-center gap-1.5">
                <SlidersHorizontal className="w-3.5 h-3.5 text-primary" />
                <span>Suggested Review Areas:</span>
              </div>
              <ul className="list-disc list-inside space-y-0.5 pl-1">
                <li><strong>Faculty availability:</strong> Check if assigned faculty have active teaching availability during scheduled periods.</li>
                <li><strong>Room capacity:</strong> Ensure classroom capacities accommodate cohort size without violations.</li>
                <li><strong>Lab-room availability:</strong> Verify dedicated LABORATORY rooms are available for lab courses.</li>
                <li><strong>Section requirements:</strong> Confirm total weekly periods required do not exceed active calendar period slots.</li>
                <li><strong>Working periods:</strong> Verify that active periods and working days match curricular requirements.</li>
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
