"use client";

import React, { useState, useEffect, useTransition } from "react";
import { UserRole, EnrichedScheduledEntry, ClassSection, Faculty } from "@/types/database";
import { TimetableGridPreview } from "./timetable-grid-preview";
import { getPublishedTimetableAction } from "@/server/actions/timetable-generation";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CalendarDays,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Users,
  GraduationCap,
  Loader2,
  Clock,
  Printer,
  RotateCcw,
  BookOpen,
} from "lucide-react";
import Link from "next/link";

interface TimetablePublishedViewerClientProps {
  userRole: UserRole;
  userProfileName: string;
  initialSections: ClassSection[];
  initialFaculty: any[];
}

export function TimetablePublishedViewerClient({
  userRole,
  userProfileName,
  initialSections,
  initialFaculty,
}: TimetablePublishedViewerClientProps) {
  const [selectedSectionId, setSelectedSectionId] = useState<string>(
    initialSections[0]?.id || ""
  );
  const [selectedFacultyId, setSelectedFacultyId] = useState<string>("");
  const [viewMode, setViewMode] = useState<"section" | "faculty">("section");

  const [isLoading, startTransition] = useTransition();
  const [timetableData, setTimetableData] = useState<{
    section_name?: string;
    academic_year_name?: string;
    semester_name?: string;
    published_at?: string;
    publisher_name?: string;
    entries: EnrichedScheduledEntry[];
    periods: any[];
  } | null>(null);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadPublishedTimetable = (sectionId?: string, facultyId?: string) => {
    startTransition(async () => {
      setErrorMessage(null);
      try {
        const query: { section_id?: string; faculty_id?: string } = {};
        if (viewMode === "faculty" && facultyId) {
          query.faculty_id = facultyId;
        } else if (sectionId) {
          query.section_id = sectionId;
        }

        const res = await getPublishedTimetableAction(query);
        if (res.success && res.data) {
          setTimetableData(res.data);
        } else {
          setTimetableData(null);
          setErrorMessage(res.error || "No published timetable found.");
        }
      } catch {
        setTimetableData(null);
        setErrorMessage("An unexpected error occurred while loading the published timetable.");
      }
    });
  };

  useEffect(() => {
    if (userRole === "student") {
      loadPublishedTimetable();
    } else if (userRole === "faculty" && viewMode === "faculty") {
      loadPublishedTimetable(undefined, selectedFacultyId || undefined);
    } else if (selectedSectionId) {
      loadPublishedTimetable(selectedSectionId);
    }
  }, [userRole, selectedSectionId, selectedFacultyId, viewMode]);

  const isAdmin = userRole === "super_admin" || userRole === "college_admin";
  const isStudent = userRole === "student";
  const isFaculty = userRole === "faculty";

  return (
    <div className="space-y-6">
      {/* 1. Header & Official Published Status Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between p-5 rounded-2xl bg-card border border-border/80 text-foreground shadow-card gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-2xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 shadow-xs">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-base text-foreground">Official Institutional Timetable</span>
              <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-wider rounded-full border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                ACTIVE
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {timetableData?.published_at ? (
                <>
                  Published on {new Date(timetableData.published_at).toLocaleDateString()} at{" "}
                  {new Date(timetableData.published_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  {timetableData.publisher_name ? ` by ${timetableData.publisher_name}` : ""}
                </>
              ) : (
                "Verified and published academic schedule"
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 self-end sm:self-auto">
          {isAdmin && (
            <Link href="/timetable/generate">
              <Button variant="outline" size="sm" className="gap-2 text-xs h-9 rounded-xl shadow-subtle">
                <CalendarDays className="h-4 w-4 text-primary" />
                Generator & Drafts
              </Button>
            </Link>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            className="gap-2 text-xs h-9 rounded-xl shadow-subtle print:hidden"
          >
            <Printer className="h-4 w-4" />
            Print Schedule
          </Button>
        </div>
      </div>

      {/* 2. Admin / Faculty Selectors */}
      {isAdmin && (
        <Card className="border-border/80 bg-card shadow-xs">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Button
                  variant={viewMode === "section" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setViewMode("section")}
                  className="gap-2 text-xs h-8"
                >
                  <Users className="h-3.5 w-3.5" />
                  View by Section
                </Button>
                <Button
                  variant={viewMode === "faculty" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setViewMode("faculty")}
                  className="gap-2 text-xs h-8"
                >
                  <GraduationCap className="h-3.5 w-3.5" />
                  View by Faculty
                </Button>
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                {viewMode === "section" ? (
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <label htmlFor="section-select" className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                      Class Section:
                    </label>
                    <select
                      id="section-select"
                      value={selectedSectionId}
                      onChange={(e) => setSelectedSectionId(e.target.value)}
                      className="h-8 rounded-lg border border-input bg-background px-2.5 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary w-full sm:w-64"
                    >
                      {initialSections.map((sec) => (
                        <option key={sec.id} value={sec.id}>
                          {sec.name} (Cap: {sec.capacity})
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <label htmlFor="faculty-select" className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                      Instructor:
                    </label>
                    <select
                      id="faculty-select"
                      value={selectedFacultyId}
                      onChange={(e) => setSelectedFacultyId(e.target.value)}
                      className="h-8 rounded-lg border border-input bg-background px-2.5 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary w-full sm:w-64"
                    >
                      <option value="">Select Instructor...</option>
                      {initialFaculty.map((fac) => {
                        const name = fac.profile
                          ? `${fac.profile.first_name || ""} ${fac.profile.last_name || ""}`.trim()
                          : fac.employee_id;
                        return (
                          <option key={fac.id} value={fac.id}>
                            {name} ({fac.employee_id})
                          </option>
                        );
                      })}
                    </select>
                  </div>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => loadPublishedTimetable(selectedSectionId, selectedFacultyId)}
                  disabled={isLoading}
                  className="h-8 px-2"
                >
                  <RotateCcw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 3. Loading State */}
      {isLoading && (
        <Card className="border-border/80 p-12 text-center">
          <div className="flex flex-col items-center justify-center gap-3">
            <Loader2 className="h-8 w-8 text-primary animate-spin" />
            <p className="text-sm font-medium text-foreground">Loading published schedule...</p>
            <p className="text-xs text-muted-foreground">Fetching assigned periods, classrooms, and instructors</p>
          </div>
        </Card>
      )}

      {/* 4. Empty / Error State */}
      {!isLoading && errorMessage && (
        <Card className="border-dashed border-border/80 p-12 text-center bg-card/50">
          <div className="flex flex-col items-center justify-center gap-3 max-w-md mx-auto">
            <div className="p-3 rounded-full bg-muted text-muted-foreground">
              <CalendarDays className="h-8 w-8" />
            </div>
            <h3 className="text-base font-semibold text-foreground">No Published Timetable</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">{errorMessage}</p>
            {isAdmin && (
              <Link href="/timetable/generate" className="mt-2">
                <Button size="sm" className="gap-2 text-xs">
                  <CalendarDays className="h-3.5 w-3.5" />
                  Generate and Publish Schedule
                </Button>
              </Link>
            )}
          </div>
        </Card>
      )}

      {/* 5. Rendered Interactive Timetable Grid Preview */}
      {!isLoading && timetableData && timetableData.entries.length > 0 && (
        <div className="space-y-4">
          <TimetableGridPreview
            entries={timetableData.entries}
            periods={timetableData.periods}
            sectionName={timetableData.section_name}
            academicYearName={timetableData.academic_year_name}
            semesterName={timetableData.semester_name}
          />
        </div>
      )}

      {!isLoading && timetableData && timetableData.entries.length === 0 && !errorMessage && (
        <Card className="border-dashed border-border/80 p-12 text-center bg-card/50">
          <div className="flex flex-col items-center justify-center gap-3 max-w-md mx-auto">
            <CalendarDays className="h-8 w-8 text-muted-foreground" />
            <h3 className="text-base font-semibold text-foreground">Zero Scheduled Sessions</h3>
            <p className="text-xs text-muted-foreground">
              The published schedule contains no active classroom sessions.
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
