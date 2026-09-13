"use client";

import React, { useState, useEffect } from "react";
import { ModalDialog } from "@/components/common/modal-dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Calendar, Clock, AlertCircle } from "lucide-react";
import {
  AcademicYear,
  ClassSection,
  Subject,
  Faculty,
  Classroom,
} from "@/types/database";
import { AttendanceSession } from "@/types/attendance";
import {
  validateSessionFormInput,
  sanitizeErrorMessage,
} from "@/lib/attendance/attendance-ui-helpers";

interface CreateSessionDialogProps {
  open: boolean;
  onClose: () => void;
  onSessionCreated: (session: AttendanceSession) => void;
  academicYears: AcademicYear[];
  classSections: ClassSection[];
  subjects: Subject[];
  facultyList: Faculty[];
  classrooms?: Classroom[];
  currentFaculty?: Faculty | null;
  isAdmin: boolean;
}

export function CreateSessionDialog({
  open,
  onClose,
  onSessionCreated,
  academicYears,
  classSections,
  subjects,
  facultyList,
  classrooms = [],
  currentFaculty,
  isAdmin,
}: CreateSessionDialogProps) {
  const today = new Date().toISOString().split("T")[0];

  const defaultYearId =
    academicYears.find((y) => (y as any).is_current)?.id ||
    academicYears[0]?.id ||
    "";
  const defaultFacultyId = currentFaculty?.id || facultyList[0]?.id || "";

  const [formData, setFormData] = useState({
    academic_year_id: defaultYearId,
    section_id: classSections[0]?.id || "",
    subject_id: subjects[0]?.id || "",
    faculty_id: defaultFacultyId,
    classroom_id: "",
    session_date: today,
    start_time: "09:00",
    end_time: "09:55",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Sync default values when opening or when props arrive
  useEffect(() => {
    if (open) {
      const yearId =
        academicYears.find((y) => (y as any).is_current)?.id ||
        academicYears[0]?.id ||
        "";
      const facId = currentFaculty?.id || facultyList[0]?.id || "";

      setFormData((prev) => ({
        ...prev,
        academic_year_id: prev.academic_year_id || yearId,
        faculty_id: currentFaculty ? currentFaculty.id : prev.faculty_id || facId,
        session_date: prev.session_date || today,
      }));
      setErrors({});
      setServerError(null);
    }
  }, [open, academicYears, currentFaculty, facultyList, today]);

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);

    const validation = validateSessionFormInput({
      academic_year_id: formData.academic_year_id,
      section_id: formData.section_id,
      subject_id: formData.subject_id,
      faculty_id: formData.faculty_id,
      classroom_id: formData.classroom_id || null,
      session_date: formData.session_date,
      start_time: formData.start_time,
      end_time: formData.end_time || null,
      status: "OPEN",
    });

    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await fetch("/api/attendance/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          academic_year_id: formData.academic_year_id,
          section_id: formData.section_id,
          subject_id: formData.subject_id,
          faculty_id: formData.faculty_id,
          classroom_id: formData.classroom_id || null,
          session_date: formData.session_date,
          start_time: formData.start_time,
          end_time: formData.end_time || null,
          status: "OPEN",
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to create attendance session");
      }

      onSessionCreated(json.data);
      onClose();
    } catch (err) {
      setServerError(sanitizeErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      title="Create Attendance Session"
      description="Schedule an active attendance class session for your enrolled section."
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {serverError && (
          <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs leading-relaxed animate-in fade-in">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{serverError}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Academic Year */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              Academic Year <span className="text-rose-500">*</span>
            </label>
            <select
              value={formData.academic_year_id}
              onChange={(e) => handleChange("academic_year_id", e.target.value)}
              disabled={isSubmitting}
              className="w-full h-9 px-3 rounded-lg border border-border/70 bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-50"
            >
              {academicYears.map((year) => (
                <option key={year.id} value={year.id}>
                  {year.name} {(year as any).is_current ? "(Current)" : ""}
                </option>
              ))}
            </select>
            {errors.academic_year_id && (
              <p className="mt-1 text-xs text-rose-500">{errors.academic_year_id}</p>
            )}
          </div>

          {/* Section */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              Class Section <span className="text-rose-500">*</span>
            </label>
            <select
              value={formData.section_id}
              onChange={(e) => handleChange("section_id", e.target.value)}
              disabled={isSubmitting}
              className="w-full h-9 px-3 rounded-lg border border-border/70 bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-50"
            >
              <option value="">Select Section</option>
              {classSections.map((sec) => (
                <option key={sec.id} value={sec.id}>
                  Section {sec.name} {sec.code ? `(${sec.code})` : ""}
                </option>
              ))}
            </select>
            {errors.section_id && (
              <p className="mt-1 text-xs text-rose-500">{errors.section_id}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Subject */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              Course / Subject <span className="text-rose-500">*</span>
            </label>
            <select
              value={formData.subject_id}
              onChange={(e) => handleChange("subject_id", e.target.value)}
              disabled={isSubmitting}
              className="w-full h-9 px-3 rounded-lg border border-border/70 bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-50"
            >
              <option value="">Select Subject</option>
              {subjects.map((sub) => (
                <option key={sub.id} value={sub.id}>
                  {sub.code} – {sub.name}
                </option>
              ))}
            </select>
            {errors.subject_id && (
              <p className="mt-1 text-xs text-rose-500">{errors.subject_id}</p>
            )}
          </div>

          {/* Faculty */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              Faculty Instructor <span className="text-rose-500">*</span>
            </label>
            {isAdmin ? (
              <select
                value={formData.faculty_id}
                onChange={(e) => handleChange("faculty_id", e.target.value)}
                disabled={isSubmitting}
                className="w-full h-9 px-3 rounded-lg border border-border/70 bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-50"
              >
                <option value="">Select Faculty</option>
                {facultyList.map((fac) => (
                  <option key={fac.id} value={fac.id}>
                    {fac.profile?.first_name} {fac.profile?.last_name} ({fac.employee_id})
                  </option>
                ))}
              </select>
            ) : (
              <div className="w-full h-9 px-3 flex items-center rounded-lg border border-border/50 bg-muted/40 text-sm text-muted-foreground">
                {currentFaculty?.profile?.first_name
                  ? `${currentFaculty.profile.first_name} ${currentFaculty.profile.last_name || ""}`
                  : "Assigned Faculty"}
              </div>
            )}
            {errors.faculty_id && (
              <p className="mt-1 text-xs text-rose-500">{errors.faculty_id}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Session Date */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              Session Date <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                type="date"
                value={formData.session_date}
                onChange={(e) => handleChange("session_date", e.target.value)}
                disabled={isSubmitting}
                className="w-full h-9 px-3 rounded-lg border border-border/70 bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-50"
              />
            </div>
            {errors.session_date && (
              <p className="mt-1 text-xs text-rose-500">{errors.session_date}</p>
            )}
          </div>

          {/* Start Time */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              Start Time <span className="text-rose-500">*</span>
            </label>
            <input
              type="time"
              value={formData.start_time}
              onChange={(e) => handleChange("start_time", e.target.value)}
              disabled={isSubmitting}
              className="w-full h-9 px-3 rounded-lg border border-border/70 bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-50"
            />
            {errors.start_time && (
              <p className="mt-1 text-xs text-rose-500">{errors.start_time}</p>
            )}
          </div>

          {/* End Time */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              End Time (Optional)
            </label>
            <input
              type="time"
              value={formData.end_time}
              onChange={(e) => handleChange("end_time", e.target.value)}
              disabled={isSubmitting}
              className="w-full h-9 px-3 rounded-lg border border-border/70 bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-50"
            />
            {errors.end_time && (
              <p className="mt-1 text-xs text-rose-500">{errors.end_time}</p>
            )}
          </div>
        </div>

        {/* Classroom (Optional) */}
        {classrooms.length > 0 && (
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              Classroom / Lab Location (Optional)
            </label>
            <select
              value={formData.classroom_id}
              onChange={(e) => handleChange("classroom_id", e.target.value)}
              disabled={isSubmitting}
              className="w-full h-9 px-3 rounded-lg border border-border/70 bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-50"
            >
              <option value="">No physical room assigned</option>
              {classrooms.map((cr) => (
                <option key={cr.id} value={cr.id}>
                  {cr.room_number} {cr.building ? `(${cr.building})` : ""} – Cap: {cr.capacity}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-border/50">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
            size="sm"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting}
            size="sm"
            className="min-w-[120px]"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Session"
            )}
          </Button>
        </div>
      </form>
    </ModalDialog>
  );
}
