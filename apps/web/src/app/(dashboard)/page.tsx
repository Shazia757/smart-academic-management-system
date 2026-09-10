import * as React from "react";
import Link from "next/link";
import {
  GraduationCap,
  Users,
  DoorOpen,
  CalendarDays,
  ScanFace,
  BarChart3,
  Cpu,
  ArrowUpRight,
  Database,
  Sliders,
  CheckCircle2,
} from "lucide-react";
import { MetricCard } from "@/components/common/metric-card";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { aiClient } from "@/lib/ai-client";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  // Probe Python FastAPI microservice health
  const aiHealth = await aiClient.checkHealth();

  return (
    <div className="space-y-8">
      {/* 1. Header Banner */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Academic Operations Hub
            </h1>
            <Badge variant="success" className="gap-1.5 py-1">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              Fall Term Active
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Smart Academic Management System • 5th Semester Production Baseline
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/audit-logs"
            className={buttonVariants({ variant: "outline", size: "sm", className: "gap-2 text-xs" })}
          >
            <Database className="h-4 w-4 text-muted-foreground" />
            Audit Ledger
          </Link>
          <Link
            href="/timetable"
            className={buttonVariants({ variant: "default", size: "sm", className: "gap-2 text-xs" })}
          >
            <CalendarDays className="h-4 w-4" />
            Generate Timetable
          </Link>
        </div>
      </div>

      {/* 2. Microservice Real-time Diagnostics Banner */}
      <div className="relative overflow-hidden rounded-xl border border-border bg-gradient-to-r from-card via-card to-primary/5 p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Cpu className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-foreground">
                  Python AI & Optimization Engine
                </h3>
                {aiHealth.online ? (
                  <Badge variant="success" className="text-[10px] uppercase tracking-wider">
                    Service Online
                  </Badge>
                ) : (
                  <Badge variant="warning" className="text-[10px] uppercase tracking-wider">
                    Microservice Standby
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground max-w-2xl">
                Google OR-Tools CP-SAT scheduler and InsightFace computer vision pipeline
                are running decoupled on FastAPI with calibrated verification thresholds.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs">
            <div className="rounded-lg border border-border/80 bg-background/80 px-3 py-2">
              <span className="text-[11px] text-muted-foreground block font-medium">
                Face Match Threshold
              </span>
              <span className="font-mono font-semibold text-foreground">
                {aiHealth.data?.calibration.match_threshold ?? "0.65 (Configurable)"}
              </span>
            </div>

            <div className="rounded-lg border border-border/80 bg-background/80 px-3 py-2">
              <span className="text-[11px] text-muted-foreground block font-medium">
                Review Threshold
              </span>
              <span className="font-mono font-semibold text-foreground">
                {aiHealth.data?.calibration.review_threshold ?? "0.45 (Configurable)"}
              </span>
            </div>

            <div className="rounded-lg border border-border/80 bg-background/80 px-3 py-2">
              <span className="text-[11px] text-muted-foreground block font-medium">
                6th Sem RAG Ready
              </span>
              <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                pgvector Enabled
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Core Operational KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Students Registered"
          value="1,248"
          description="Across 3 departments"
          trend={{ value: "+4.2%", positive: true }}
          icon={<GraduationCap className="h-5 w-5" />}
        />
        <MetricCard
          title="Active Faculty"
          value="84"
          description="100% availability configured"
          trend={{ value: "Stable", positive: true }}
          icon={<Users className="h-5 w-5" />}
        />
        <MetricCard
          title="Classrooms & Labs"
          value="42"
          description="14 dedicated computer labs"
          trend={{ value: "91% util", positive: true }}
          icon={<DoorOpen className="h-5 w-5" />}
        />
        <MetricCard
          title="Average Attendance"
          value="89.6%"
          description="Last 30-day aggregate"
          trend={{ value: "+2.1%", positive: true }}
          icon={<BarChart3 className="h-5 w-5" />}
        />
      </div>

      {/* 4. Main Grid: Module Launchpad & Architectural Integrity */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Modules Quick Launchpad (2 cols) */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Core Academic Modules</CardTitle>
                <CardDescription>
                  Direct access to 5th-semester administrative and AI features
                </CardDescription>
              </div>
              <Badge variant="outline" className="text-xs">
                Phase 1 Active
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Link
              href="/timetable"
              className="group flex flex-col justify-between rounded-xl border border-border/80 bg-background/50 p-4 transition-all hover:border-primary/40 hover:bg-muted/40 hover:shadow-sm"
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    <CalendarDays className="h-5 w-5" />
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <h4 className="mt-3 text-sm font-semibold text-foreground">
                  AI Timetable Generator
                </h4>
                <p className="mt-1 text-xs text-muted-foreground">
                  Google OR-Tools CP-SAT constraint solver for zero-conflict schedules.
                </p>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Badge variant="accent" className="text-[10px]">
                  Constraint Optimization
                </Badge>
              </div>
            </Link>

            <Link
              href="/attendance"
              className="group flex flex-col justify-between rounded-xl border border-border/80 bg-background/50 p-4 transition-all hover:border-primary/40 hover:bg-muted/40 hover:shadow-sm"
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                    <ScanFace className="h-5 w-5" />
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <h4 className="mt-3 text-sm font-semibold text-foreground">
                  Facial Recognition Kiosk
                </h4>
                <p className="mt-1 text-xs text-muted-foreground">
                  Computer vision pipeline for automated verification & anti-duplicate checks.
                </p>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Badge variant="success" className="text-[10px]">
                  OpenCV + InsightFace
                </Badge>
              </div>
            </Link>

            <Link
              href="/students"
              className="group flex flex-col justify-between rounded-xl border border-border/80 bg-background/50 p-4 transition-all hover:border-primary/40 hover:bg-muted/40 hover:shadow-sm"
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    <GraduationCap className="h-5 w-5" />
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <h4 className="mt-3 text-sm font-semibold text-foreground">
                  Student Life-Cycle
                </h4>
                <p className="mt-1 text-xs text-muted-foreground">
                  Directory, semester enrollments, sections, and biometric enrollment status.
                </p>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">
                  Management
                </Badge>
              </div>
            </Link>

            <Link
              href="/analytics"
              className="group flex flex-col justify-between rounded-xl border border-border/80 bg-background/50 p-4 transition-all hover:border-primary/40 hover:bg-muted/40 hover:shadow-sm"
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    <BarChart3 className="h-5 w-5" />
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <h4 className="mt-3 text-sm font-semibold text-foreground">
                  Attendance & Risk Analytics
                </h4>
                <p className="mt-1 text-xs text-muted-foreground">
                  Visual attendance distributions, trend alerts, and below-threshold flags.
                </p>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">
                  Recharts Analytics
                </Badge>
              </div>
            </Link>
          </CardContent>
        </Card>

        {/* System Architecture & Security Checklist (1 col) */}
        <Card>
          <CardHeader>
            <CardTitle>Foundation Checklist</CardTitle>
            <CardDescription>
              Phase 1 architecture standards verification
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3.5">
            <div className="flex items-start gap-2.5 text-xs">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-foreground block">
                  PostgreSQL Row Level Security
                </span>
                <span className="text-muted-foreground text-[11px]">
                  Enforced at database layer for all 4 roles
                </span>
              </div>
            </div>

            <div className="flex items-start gap-2.5 text-xs">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-foreground block">
                  Decoupled Python AI Service
                </span>
                <span className="text-muted-foreground text-[11px]">
                  FastAPI service with server-to-server security
                </span>
              </div>
            </div>

            <div className="flex items-start gap-2.5 text-xs">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-foreground block">
                  Configurable Biometrics
                </span>
                <span className="text-muted-foreground text-[11px]">
                  Adjustable similarity match & review thresholds
                </span>
              </div>
            </div>

            <div className="flex items-start gap-2.5 text-xs">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-foreground block">
                  Realistic Development Seed Data
                </span>
                <span className="text-muted-foreground text-[11px]">
                  Pre-configured departments, rooms, and schedules
                </span>
              </div>
            </div>

            <div className="flex items-start gap-2.5 text-xs">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-foreground block">
                  6th-Semester Extensibility
                </span>
                <span className="text-muted-foreground text-[11px]">
                  Ready for pgvector RAG & risk modeling
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-border">
              <div className="rounded-lg bg-muted/50 p-3 text-xs flex items-center justify-between">
                <span className="text-muted-foreground">Framework</span>
                <span className="font-semibold text-foreground">Next.js 15 App Router</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
