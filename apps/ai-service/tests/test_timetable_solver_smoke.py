"""
Smoke test suite for OR-Tools CP-SAT Timetable Solver.

Verifies:
1. Safe import of the TimetableSolver.
2. Solver execution against a minimal valid scheduling problem.
3. Solver status is OPTIMAL or FEASIBLE.
4. Returned entries are structurally valid according to ScheduledEntrySchema.
5. Independent constraint validation returns zero violations.
6. Execution without external services, Supabase, network calls, or DB writes.
"""

import pytest
from app.schemas.timetable import (
    PeriodSlotSchema,
    TimetableConfigSchema,
    SectionSchema,
    SubjectSchema,
    FacultyAssignmentSchema,
    ClassroomSchema,
    SchedulingRequirementSchema,
    SchedulingInputSchema,
    ScheduledEntrySchema,
    SolverConfigurationSchema,
)
from app.solver.timetable_solver import TimetableSolver
from app.solver.validator import validate_solver_result


def build_minimal_scheduling_input() -> SchedulingInputSchema:
    """Builds the smallest valid, deterministic scheduling problem."""
    config = TimetableConfigSchema(
        id="cfg-smoke-test",
        academic_year_id="ay-smoke-2026",
        semester_id="sem-smoke-1",
        section_id="sec-smoke-1",
        name="Smoke Test Configuration",
        working_days=1,
        periods_per_day=3,
        period_duration_minutes=55,
    )

    periods = [
        PeriodSlotSchema(
            id=f"p-d1-p{i}",
            day_of_week=1,
            period_number=i,
            start_time=f"0{8+i}:00:00",
            end_time=f"0{9+i}:00:00",
            is_break=False,
            is_active=True,
        )
        for i in range(1, 4)
    ]

    section = SectionSchema(
        id="sec-smoke-1",
        code="SMOKE-SEC-A",
        name="Section Smoke A",
        capacity=30,
    )

    subject = SubjectSchema(
        id="sub-smoke-1",
        code="SMK101",
        name="Introduction to Computing",
        subject_type="THEORY",
        credits=2,
        weekly_periods=2,
        is_lab=False,
    )

    assignment = FacultyAssignmentSchema(
        id="fa-smoke-1",
        faculty_id="fac-smoke-1",
        subject_id="sub-smoke-1",
        section_id="sec-smoke-1",
    )

    classroom = ClassroomSchema(
        id="room-smoke-1",
        room_number="R-101",
        room_type="LECTURE_HALL",
        capacity=40,
        unavailable_period_ids=[],
    )

    requirement = SchedulingRequirementSchema(
        id="req-smoke-1",
        section_id="sec-smoke-1",
        subject_id="sub-smoke-1",
        faculty_id="fac-smoke-1",
        weekly_periods=2,
        consecutive_periods=1,
        min_period_gap=0,
        max_periods_per_day=2,
        requires_lab=False,
        preferred_capacity=30,
        is_active=True,
    )

    return SchedulingInputSchema(
        configuration=config,
        periods=periods,
        sections=[section],
        subjects=[subject],
        faculty_assignments=[assignment],
        faculty_availability=[],
        classrooms=[classroom],
        scheduling_requirements=[requirement],
        solver_timeout_seconds=5,
        solver_config=SolverConfigurationSchema(
            max_solve_time_seconds=5.0,
            random_seed=42,
            num_workers=1,
            log_search_progress=False,
        ),
    )


def test_timetable_solver_import():
    """Confirms TimetableSolver can be instantiated safely."""
    solver = TimetableSolver()
    assert solver is not None
    assert hasattr(solver, "solve")
    assert callable(solver.solve)


def test_timetable_solver_smoke_minimal():
    """Executes the solver with minimal valid problem and verifies solution."""
    problem = build_minimal_scheduling_input()
    solver = TimetableSolver()

    result = solver.solve(problem)

    # Status assertion
    assert result.status in ("OPTIMAL", "FEASIBLE"), (
        f"Expected solver to find feasible/optimal solution, got {result.status}. "
        f"Diagnostics: {result.diagnostics}"
    )

    # Basic metadata & entry count
    assert len(result.entries) == 2, f"Expected 2 scheduled entries, got {len(result.entries)}"
    assert result.hard_constraint_violations == 0

    # Structural assertion on entries
    for entry in result.entries:
        assert isinstance(entry, ScheduledEntrySchema)
        assert entry.section_id == "sec-smoke-1"
        assert entry.subject_id == "sub-smoke-1"
        assert entry.faculty_id == "fac-smoke-1"
        assert entry.classroom_id == "room-smoke-1"
        assert entry.timetable_period_id in {"p-d1-p1", "p-d1-p2", "p-d1-p3"}
        assert entry.occurrence_index in (1, 2)
        assert entry.session_type == "THEORY"
        assert entry.is_lab is False

    # Independent validation check
    validation_errors = validate_solver_result(problem, result)
    assert validation_errors == [], f"Validation errors found: {validation_errors}"


def test_timetable_solver_infeasible_smoke():
    """Confirms solver cleanly handles infeasible problem without exception."""
    problem = build_minimal_scheduling_input()
    # Request 5 periods when only 3 exist in total
    problem.scheduling_requirements[0].weekly_periods = 5
    problem.scheduling_requirements[0].consecutive_periods = 1

    solver = TimetableSolver()
    result = solver.solve(problem)

    assert result.status == "INFEASIBLE"
    assert len(result.entries) == 0
    assert result.error_message is not None
