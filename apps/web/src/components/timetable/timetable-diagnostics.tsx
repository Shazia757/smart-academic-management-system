"use client";

import React from "react";
import { GeneratedTimetableResult } from "@/types/database";
import { Card, CardContent } from "@/components/ui/card";
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
} from "lucide-react";
import { cn } from "@/lib/utils";

interface TimetableDiagnosticsProps {
  result: GeneratedTimetableResult;
}

export function TimetableDiagnostics({ result }: TimetableDiagnosticsProps) {
  const isSuccess = result.status === "OPTIMAL" || result.status === "FEASIBLE";
  const isInfeasible = result.status === "INFEASIBLE";
  const isInvalid = result.status === "MODEL_INVALID";

  const getStatusBadge = () => {
    switch (result.status) {
      case "OPTIMAL":
        return {
          label: "Optimal",
          description: "All hard & soft constraints satisfied",
          badgeClass: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800",
          icon: <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />,
        };
      case "FEASIBLE":
        return {
          label: "Feasible",
          description: "All hard constraints satisfied without conflicts",
          badgeClass: "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border-blue-300 dark:border-blue-800",
          icon: <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />,
        };
      case "INFEASIBLE":
        return {
          label: "Infeasible",
          description: "Conflicting constraints prevented a valid timetable",
          badgeClass: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300 dark:border-amber-800",
          icon: <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />,
        };
      case "MODEL_INVALID":
        return {
          label: "Model Invalid",
          description: "Scheduling requirement schema or parameters inconsistent",
          badgeClass: "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-300 dark:border-rose-800",
          icon: <AlertOctagon className="w-4 h-4 text-rose-600 dark:text-rose-400" />,
        };
      default:
        return {
          label: result.status,
          description: "Solver terminated without reaching proof",
          badgeClass: "bg-muted text-muted-foreground border-border",
          icon: <Info className="w-4 h-4 text-muted-foreground" />,
        };
    }
  };

  const statusInfo = getStatusBadge();

  return (
    <div className="space-y-4">
      {/* Metric Cards Row */}
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

        {/* Scheduled Entries */}
        <Card className="border-border/80 bg-card shadow-xs">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Scheduled Slots
              </span>
              <Layers className="w-4 h-4 text-primary" />
            </div>
            <div className="mt-2 text-xl font-bold text-foreground">
              {result.entries.length}
              <span className="text-xs font-normal text-muted-foreground ml-1">assigned</span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Weekly periods placed
            </p>
          </CardContent>
        </Card>

        {/* Constraint Violations */}
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
              <span className="text-xs font-normal text-muted-foreground ml-2">
                / {result.soft_constraint_violations} soft
              </span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {result.hard_constraint_violations === 0
                ? "Zero conflicting assignments"
                : "Constraint penalties detected"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Solver Metadata Header Bar */}
      <div className="flex items-center justify-between px-3.5 py-2 rounded-lg bg-muted/40 border border-border/60 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <Cpu className="w-3.5 h-3.5 text-primary" />
          <span>
            Optimization Engine:{" "}
            <strong className="text-foreground">{result.solver_name || "Google OR-Tools CP-SAT"}</strong>
          </span>
        </div>
        {result.solver_version && (
          <div className="font-mono text-[11px]">
            v{result.solver_version}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* INFEASIBILITY OR ERROR DIAGNOSTICS BANNER                                 */}
      {/* ========================================================================= */}
      {(isInfeasible || isInvalid || (result.diagnostics && result.diagnostics.length > 0)) && (
        <div
          className={cn(
            "p-4 rounded-xl border space-y-3",
            isInfeasible && "bg-amber-50/70 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800/80",
            isInvalid && "bg-rose-50/70 dark:bg-rose-950/20 border-rose-300 dark:border-rose-800/80",
            isSuccess && "bg-blue-50/70 dark:bg-blue-950/20 border-blue-300 dark:border-blue-800/80"
          )}
        >
          <div className="flex items-start gap-2.5">
            {isInfeasible && (
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            )}
            {isInvalid && (
              <AlertOctagon className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            )}
            {isSuccess && (
              <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            )}
            <div>
              <h4 className="text-sm font-bold text-foreground">
                {isInfeasible
                  ? "Timetable Problem Is Infeasible"
                  : isInvalid
                  ? "Invalid Model Specifications"
                  : "Solver Diagnostic Output"}
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isInfeasible
                  ? "The CP-SAT mathematical solver proved that no valid conflict-free timetable exists under the current constraints."
                  : isInvalid
                  ? "The scheduling input could not be solved due to inconsistent parameters or requirements."
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

          {/* Actionable Adjustment Advice */}
          {isInfeasible && (
            <div className="pl-7 text-xs text-muted-foreground space-y-1">
              <div className="font-semibold text-foreground flex items-center gap-1.5">
                <SlidersHorizontal className="w-3.5 h-3.5 text-primary" />
                <span>Recommended Adjustments:</span>
              </div>
              <ul className="list-disc list-inside space-y-0.5 pl-1">
                <li>Check classroom capacity vs section size (ensure rooms have sufficient seats).</li>
                <li>Verify lab room requirements (ensure laboratories are available if required).</li>
                <li>Verify faculty availability windows (check if assigned faculty are available for required periods).</li>
                <li>Ensure the total weekly periods required do not exceed available teaching period slots.</li>
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
