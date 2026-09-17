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
    is_active: bool = Field(default=True, description="Flag indicating whether period slot is active")


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
    semester_id: Optional[str] = None
    academic_year_id: Optional[str] = None


class SubjectSchema(BaseModel):
    """Subject curriculum attributes."""
    id: str
    code: str
    name: str
    credits: int
    is_lab: bool = False
    subject_type: str = "THEORY"
    weekly_periods: int
    consecutive_periods: Optional[int] = 1


class FacultyAssignmentSchema(BaseModel):
    """Designated faculty assignment for subject and section."""
    id: str
    faculty_id: str
    subject_id: str
    section_id: str
    is_primary: bool = True
    faculty_name: Optional[str] = None
    max_periods_per_week: Optional[int] = None


class FacultyAvailabilitySchema(BaseModel):
    """Recurring availability window for a faculty member."""
    faculty_id: str
    day_of_week: int = Field(..., ge=1, le=7)
    period_slot: Optional[int] = Field(default=None, description="Period number (1..N)")
    period_number: Optional[int] = Field(default=None, description="Alternative alias for period slot (1..N)")
    is_available: bool = True
    availability_status: str = "AVAILABLE"


class ClassroomSchema(BaseModel):
    """Classroom or laboratory facility attributes."""
    id: str
    room_number: str
    room_type: str = "LECTURE_HALL"
    capacity: int
    is_available: bool = True
    unavailable_period_ids: List[str] = Field(default_factory=list, description="Explicit IDs of unavailable periods")


class SchedulingRequirementSchema(BaseModel):
    """Bridge contract representing specific scheduling constraints per subject."""
    id: str
    section_id: str
    subject_id: str
    faculty_id: Optional[str] = Field(default=None, description="Direct faculty ID if pre-bound")
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
    is_active: bool = Field(default=True, description="Active status of requirement")


class ObjectiveWeightsSchema(BaseModel):
    """Configurable weights for soft constraints in the CP-SAT objective function."""
    spread_across_week: int = Field(default=10, ge=0, description="Weight for distributing subject sessions across different days")
    consecutive_lab_periods: int = Field(default=20, ge=0, description="Weight for keeping lab blocks contiguous")
    minimize_faculty_idle_periods: int = Field(default=5, ge=0, description="Weight for minimizing gaps between faculty sessions")
    balance_daily_teaching_load: int = Field(default=5, ge=0, description="Weight for balancing sessions evenly per day")
    prefer_consistent_room: int = Field(default=2, ge=0, description="Weight for maintaining the same classroom for a subject")


class SolverConfigurationSchema(BaseModel):
    """Execution parameters for Google OR-Tools CP-SAT solver."""
    max_solve_time_seconds: float = Field(default=30.0, ge=0.1, le=300.0)
    random_seed: int = Field(default=42, description="Random seed for deterministic solves")
    num_workers: int = Field(default=1, ge=1, le=16, description="Parallel worker threads (1 for deterministic output)")
    log_search_progress: bool = Field(default=False, description="Enable CP-SAT search logging to stdout")
    objective_weights: Optional[ObjectiveWeightsSchema] = Field(default_factory=ObjectiveWeightsSchema)
    preview_only: bool = Field(default=True, description="Strictly compute in-memory preview without side-effects")
    allow_partial: bool = Field(default=False, description="Whether to allow partial schedule if full schedule is infeasible")


class SchedulingInputSchema(BaseModel):
    """
    Complete typed domain input contract consumed by the
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
    solver_timeout_seconds: int = Field(default=30, ge=1, le=300)
    solver_config: Optional[SolverConfigurationSchema] = None


class TimetableGenerationRequestSchema(BaseModel):
    """API Request wrapper for timetable generation."""
    configuration_id: Optional[str] = None
    problem: Optional[SchedulingInputSchema] = None
    timeout_seconds: Optional[int] = Field(default=30, ge=1, le=300)
    random_seed: Optional[int] = Field(default=42)
    objective_weights: Optional[ObjectiveWeightsSchema] = None
    preview_only: bool = Field(default=True)
    allow_partial: bool = Field(default=False)


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


class UnassignedSessionSchema(BaseModel):
    """Represents a session that could not be scheduled in a partial result."""
    section_id: str
    subject_id: str
    faculty_id: Optional[str] = None
    block_index: int = 0
    required_periods: int = 1
    reason: Optional[str] = None


class ConstraintViolationSchema(BaseModel):
    """Details of any soft or hard constraint violation detected during solve."""
    constraint_name: str
    severity: str = "SOFT"
    description: str
    entity_id: Optional[str] = None


class SchedulingOutputSchema(BaseModel):
    """
    Standardized result contract returned by the solver microservice.
    Status can be: OPTIMAL, FEASIBLE, INFEASIBLE, TIME_LIMIT, PARTIAL, ERROR, MODEL_INVALID.
    """
    status: str = Field(..., description="OPTIMAL | FEASIBLE | INFEASIBLE | TIME_LIMIT | PARTIAL | ERROR | MODEL_INVALID")
    solver_name: str = "OR-Tools CP-SAT"
    solver_version: str = "9.15.6755"
    objective_score: Optional[float] = None
    solve_duration_ms: float = 0.0
    hard_constraint_violations: int = 0
    soft_constraint_violations: int = 0
    total_assigned_sessions: int = 0
    total_required_sessions: int = 0
    is_complete: bool = True
    entries: List[ScheduledEntrySchema] = Field(default_factory=list)
    unassigned_sessions: List[UnassignedSessionSchema] = Field(default_factory=list)
    violations: List[ConstraintViolationSchema] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    validation_errors: List[str] = Field(default_factory=list)
    diagnostics: List[str] = Field(default_factory=list)
    error_message: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)

    @property
    def assignments(self) -> List[ScheduledEntrySchema]:
        """Convenience property matching solver domain nomenclature."""
        return self.entries

