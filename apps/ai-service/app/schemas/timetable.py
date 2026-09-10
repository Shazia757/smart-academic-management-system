from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class PeriodSlotSchema(BaseModel):
    """Represents a discrete timetable period slot."""
    id: str = Field(..., description="Unique period slot UUID")
    day_of_week: int = Field(..., ge=1, le=7, description="Day index (1=Monday, 6=Saturday, 7=Sunday)")
    period_number: int = Field(..., gt=0, description="Period index within the day (1..N)")
    start_time: str = Field(..., description="Slot start time (HH:MM:SS)")
    end_time: str = Field(..., description="Slot end time (HH:MM:SS)")
    is_break: bool = Field(default=False, description="Flag indicating recess or lunch break")


class TimetableConfigSchema(BaseModel):
    """Represents the timetable configuration context."""
    id: str = Field(..., description="Configuration UUID")
    academic_year_id: str = Field(..., description="Academic year UUID")
    semester_id: str = Field(..., description="Semester UUID")
    section_id: str = Field(..., description="Class section UUID")
    name: str = Field(..., description="Configuration human-readable name")
    working_days: int = Field(default=6, ge=1, le=7, description="Total active working days per week")
    periods_per_day: int = Field(default=7, ge=1, le=12, description="Number of periods scheduled daily")
    period_duration_minutes: int = Field(default=55, ge=15, le=180, description="Duration in minutes per period")
    break_after_periods: Optional[List[Dict[str, Any]]] = Field(default=None, description="Metadata for recess/lunch slots")


class SectionSchema(BaseModel):
    """Academic class section target for scheduling."""
    id: str
    code: str
    name: str
    capacity: int


class SubjectSchema(BaseModel):
    """Subject curriculum attributes."""
    id: str
    code: str
    name: str
    credits: int
    is_lab: bool = False
    subject_type: str = "THEORY"
    weekly_periods: int


class FacultyAssignmentSchema(BaseModel):
    """Designated faculty assignment for subject and section."""
    id: str
    faculty_id: str
    subject_id: str
    section_id: str
    is_primary: bool = True


class FacultyAvailabilitySchema(BaseModel):
    """Recurring availability window for a faculty member."""
    faculty_id: str
    day_of_week: int
    period_slot: int
    is_available: bool
    availability_status: str = "AVAILABLE"


class ClassroomSchema(BaseModel):
    """Classroom or laboratory facility attributes."""
    id: str
    room_number: str
    room_type: str = "LECTURE_HALL"
    capacity: int
    is_available: bool = True


class SchedulingRequirementSchema(BaseModel):
    """Bridge contract representing specific scheduling constraints per subject."""
    id: str
    section_id: str
    subject_id: str
    faculty_subject_assignment_id: Optional[str] = None
    weekly_periods: int = Field(..., gt=0)
    consecutive_periods: int = Field(default=1, gt=0)
    room_type: str = "LECTURE_HALL"
    preferred_capacity: Optional[int] = None
    requires_lab: bool = False
    requires_consecutive_slots: bool = False
    preferred_days: Optional[List[int]] = None
    max_periods_per_day: int = Field(default=2, gt=0)
    min_period_gap: int = Field(default=0, ge=0)


class SchedulingInputSchema(BaseModel):
    """
    Complete typed domain input contract consumed by the future
    Google OR-Tools CP-SAT timetable optimization engine.
    """
    configuration: TimetableConfigSchema
    periods: List[PeriodSlotSchema]
    sections: List[SectionSchema]
    subjects: List[SubjectSchema]
    faculty_assignments: List[FacultyAssignmentSchema]
    faculty_availability: List[FacultyAvailabilitySchema]
    classrooms: List[ClassroomSchema]
    scheduling_requirements: List[SchedulingRequirementSchema]
    solver_timeout_seconds: int = Field(default=30, ge=5, le=300)


class ScheduledEntrySchema(BaseModel):
    """Discrete session assignment output by the solver."""
    section_id: str
    subject_id: str
    faculty_id: str
    classroom_id: str
    timetable_period_id: str
    occurrence_index: int = 1
    session_type: str = "THEORY"
    is_lab: bool = False
    notes: Optional[str] = None


class ConstraintViolationSchema(BaseModel):
    """Details of any soft or hard constraint violation detected during solve."""
    constraint_name: str
    severity: str = "SOFT"
    description: str
    entity_id: Optional[str] = None


class SchedulingOutputSchema(BaseModel):
    """
    Standardized result contract returned by the solver microservice
    to Next.js for persistence into timetable_generations and timetable_entries.
    """
    status: str = Field(..., description="PENDING | RUNNING | COMPLETED | FAILED | CANCELLED")
    solver_name: str = "OR-Tools CP-SAT"
    solver_version: str = "9.8"
    objective_score: Optional[float] = None
    solve_duration_ms: float = 0.0
    hard_constraint_violations: int = 0
    soft_constraint_violations: int = 0
    entries: List[ScheduledEntrySchema] = Field(default_factory=list)
    violations: List[ConstraintViolationSchema] = Field(default_factory=list)
    error_message: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
