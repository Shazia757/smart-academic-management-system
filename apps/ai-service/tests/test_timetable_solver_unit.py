"""
Unit tests for Google OR-Tools CP-SAT Timetable Solver (Phase 6.3).

Covers Hard Constraints 5.1 to 5.13 and Soft Constraints:
1. Minimal feasible timetable
2. Faculty collision prevention (5.2)
3. Section collision prevention (5.3)
4. Classroom collision prevention (5.4)
5. Faculty availability constraint (5.5)
6. Classroom availability constraint (5.6)
7. Classroom capacity constraint (5.7)
8. Lab-room requirement constraint (5.8)
9. Break-period exclusion (5.11)
10. Invalid faculty-subject assignment (5.9)
11. Invalid section-subject assignment (5.10)
12. Infeasible input detection
13. Solver timeout behavior (TIME_LIMIT)
14. Deterministic seed behavior
15. Output validation agreement
16. Partial / unassigned session reporting (5.1)
17. Empty input handling
18. Soft constraint objective optimization (spread across week)
"""

import time
import pytest
from app.schemas.timetable import (
    PeriodSlotSchema,
    TimetableConfigSchema,
    SectionSchema,
    SubjectSchema,
    FacultyAssignmentSchema,
    FacultyAvailabilitySchema,
    ClassroomSchema,
    SchedulingRequirementSchema,
    SchedulingInputSchema,
    ScheduledEntrySchema,
    SolverConfigurationSchema,
    ObjectiveWeightsSchema,
)
from app.solver.timetable_solver import TimetableSolver
from app.solver.validator import validate_solver_result


def make_base_problem() -> SchedulingInputSchema:
    """Creates a base 2-day scheduling problem with 4 periods per day."""
    config = TimetableConfigSchema(
        id="cfg-unit-test",
        academic_year_id="ay-unit-2026",
        semester_id="sem-unit-1",
        section_id="sec-unit-1",
        name="Unit Test Config",
        working_days=2,
        periods_per_day=4,
        period_duration_minutes=55,
    )

    periods = []
    for day in (1, 2):
        for p in range(1, 5):
            periods.append(
                PeriodSlotSchema(
                    id=f"p-d{day}-p{p}",
                    day_of_week=day,
                    period_number=p,
                    start_time=f"0{8+p}:00:00",
                    end_time=f"0{9+p}:00:00",
                    is_break=False,
                    is_active=True,
                )
            )

    section = SectionSchema(
        id="sec-unit-1",
        code="CS-A",
        name="Computer Science A",
        capacity=40,
    )

    subject = SubjectSchema(
        id="sub-math",
        code="MATH101",
        name="Calculus I",
        credits=3,
        weekly_periods=2,
        consecutive_periods=1,
        is_lab=False,
        subject_type="THEORY",
    )

    assignment = FacultyAssignmentSchema(
        id="fa-math-1",
        faculty_id="fac-alice",
        subject_id="sub-math",
        section_id="sec-unit-1",
    )

    classroom = ClassroomSchema(
        id="room-lecture-1",
        room_number="R101",
        room_type="LECTURE_HALL",
        capacity=50,
        is_available=True,
    )

    requirement = SchedulingRequirementSchema(
        id="req-math-1",
        section_id="sec-unit-1",
        subject_id="sub-math",
        faculty_id="fac-alice",
        weekly_periods=2,
        consecutive_periods=1,
        max_periods_per_day=2,
        requires_lab=False,
        preferred_capacity=40,
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
        ),
    )


# 1. Minimal feasible timetable
def test_1_minimal_feasible_timetable():
    prob = make_base_problem()
    solver = TimetableSolver()
    res = solver.solve(prob)

    assert res.status in ("OPTIMAL", "FEASIBLE")
    assert len(res.entries) == 2
    assert res.hard_constraint_violations == 0
    assert res.is_complete is True
    assert res.total_assigned_sessions == 2
    val_errors = validate_solver_result(prob, res)
    assert val_errors == []


# 2. Faculty collision prevention (5.2)
def test_2_faculty_collision_prevention():
    prob = make_base_problem()
    # Add second section also assigned to fac-alice
    sec2 = SectionSchema(id="sec-unit-2", code="CS-B", name="Computer Science B", capacity=40)
    prob.sections.append(sec2)

    sub2 = SubjectSchema(id="sub-algebra", code="MATH102", name="Algebra", credits=2, weekly_periods=2)
    prob.subjects.append(sub2)

    fa2 = FacultyAssignmentSchema(id="fa-alg", faculty_id="fac-alice", subject_id="sub-algebra", section_id="sec-unit-2")
    prob.faculty_assignments.append(fa2)

    req2 = SchedulingRequirementSchema(
        id="req-alg", section_id="sec-unit-2", subject_id="sub-algebra", faculty_id="fac-alice",
        weekly_periods=2, consecutive_periods=1, preferred_capacity=40
    )
    prob.scheduling_requirements.append(req2)

    # Add second classroom so room availability isn't the limiting factor
    room2 = ClassroomSchema(id="room-lecture-2", room_number="R102", room_type="LECTURE_HALL", capacity=50)
    prob.classrooms.append(room2)

    solver = TimetableSolver()
    res = solver.solve(prob)

    assert res.status in ("OPTIMAL", "FEASIBLE")
    assert len(res.entries) == 4

    # Verify fac-alice never teaches both sections in the same period
    fac_slots = set()
    for e in res.entries:
        if e.faculty_id == "fac-alice":
            assert e.timetable_period_id not in fac_slots
            fac_slots.add(e.timetable_period_id)


# 3. Section collision prevention (5.3)
def test_3_section_collision_prevention():
    prob = make_base_problem()
    # Add second subject for the same section with different faculty
    sub2 = SubjectSchema(id="sub-physics", code="PHYS101", name="Physics I", credits=3, weekly_periods=2)
    prob.subjects.append(sub2)

    fa2 = FacultyAssignmentSchema(id="fa-phys", faculty_id="fac-bob", subject_id="sub-physics", section_id="sec-unit-1")
    prob.faculty_assignments.append(fa2)

    req2 = SchedulingRequirementSchema(
        id="req-phys", section_id="sec-unit-1", subject_id="sub-physics", faculty_id="fac-bob",
        weekly_periods=2, consecutive_periods=1, preferred_capacity=40
    )
    prob.scheduling_requirements.append(req2)

    room2 = ClassroomSchema(id="room-lecture-2", room_number="R102", room_type="LECTURE_HALL", capacity=50)
    prob.classrooms.append(room2)

    solver = TimetableSolver()
    res = solver.solve(prob)

    assert res.status in ("OPTIMAL", "FEASIBLE")
    assert len(res.entries) == 4

    # Verify sec-unit-1 never has 2 classes in the same period
    sec_slots = set()
    for e in res.entries:
        if e.section_id == "sec-unit-1":
            assert e.timetable_period_id not in sec_slots
            sec_slots.add(e.timetable_period_id)


# 4. Classroom collision prevention (5.4)
def test_4_classroom_collision_prevention():
    prob = make_base_problem()
    # 2 different sections, 2 different faculty, but only 1 classroom
    sec2 = SectionSchema(id="sec-unit-2", code="CS-B", name="Computer Science B", capacity=40)
    prob.sections.append(sec2)

    sub2 = SubjectSchema(id="sub-physics", code="PHYS101", name="Physics", credits=2, weekly_periods=2)
    prob.subjects.append(sub2)

    fa2 = FacultyAssignmentSchema(id="fa-phys", faculty_id="fac-bob", subject_id="sub-physics", section_id="sec-unit-2")
    prob.faculty_assignments.append(fa2)

    req2 = SchedulingRequirementSchema(
        id="req-phys", section_id="sec-unit-2", subject_id="sub-physics", faculty_id="fac-bob",
        weekly_periods=2, consecutive_periods=1, preferred_capacity=40
    )
    prob.scheduling_requirements.append(req2)

    solver = TimetableSolver()
    res = solver.solve(prob)

    assert res.status in ("OPTIMAL", "FEASIBLE")
    assert len(res.entries) == 4

    # Verify room-lecture-1 is never assigned twice in the same period
    room_slots = set()
    for e in res.entries:
        assert (e.classroom_id, e.timetable_period_id) not in room_slots
        room_slots.add((e.classroom_id, e.timetable_period_id))


# 5. Faculty availability constraint (5.5)
def test_5_faculty_availability_constraint():
    prob = make_base_problem()
    # Mark fac-alice unavailable on Day 1 for all periods (1..4)
    for p in range(1, 5):
        prob.faculty_availability.append(
            FacultyAvailabilitySchema(
                faculty_id="fac-alice",
                day_of_week=1,
                period_slot=p,
                is_available=False,
                availability_status="UNAVAILABLE",
            )
        )

    solver = TimetableSolver()
    res = solver.solve(prob)

    assert res.status in ("OPTIMAL", "FEASIBLE")
    # All 2 periods must be assigned on Day 2
    for e in res.entries:
        assert "p-d2-" in e.timetable_period_id


# 6. Classroom availability constraint (5.6)
def test_6_classroom_availability_constraint():
    prob = make_base_problem()
    # Mark room unavailable for Day 1 periods
    prob.classrooms[0].unavailable_period_ids = ["p-d1-p1", "p-d1-p2", "p-d1-p3", "p-d1-p4"]

    solver = TimetableSolver()
    res = solver.solve(prob)

    assert res.status in ("OPTIMAL", "FEASIBLE")
    for e in res.entries:
        assert e.timetable_period_id not in prob.classrooms[0].unavailable_period_ids


# 7. Classroom capacity constraint (5.7)
def test_7_classroom_capacity_constraint():
    prob = make_base_problem()
    # Section has capacity 40, room has capacity 30 -> Infeasible
    prob.classrooms[0].capacity = 30

    solver = TimetableSolver()
    res = solver.solve(prob)

    assert res.status == "INFEASIBLE"
    assert len(res.entries) == 0


# 8. Lab-room requirement constraint (5.8)
def test_8_lab_room_requirement_constraint():
    prob = make_base_problem()
    prob.subjects[0].is_lab = True
    prob.scheduling_requirements[0].requires_lab = True

    # Only lecture hall available -> Infeasible
    solver = TimetableSolver()
    res = solver.solve(prob)
    assert res.status == "INFEASIBLE"

    # Add laboratory classroom -> Now feasible
    lab_room = ClassroomSchema(id="room-lab-1", room_number="L101", room_type="LABORATORY", capacity=50)
    prob.classrooms.append(lab_room)

    res2 = solver.solve(prob)
    assert res2.status in ("OPTIMAL", "FEASIBLE")
    for e in res2.entries:
        assert e.classroom_id == "room-lab-1"
        assert e.is_lab is True


# 9. Break-period exclusion (5.11)
def test_9_break_period_exclusion():
    prob = make_base_problem()
    # Mark period 2 on Day 1 as break
    for p in prob.periods:
        if p.id == "p-d1-p2":
            p.is_break = True

    solver = TimetableSolver()
    res = solver.solve(prob)

    assert res.status in ("OPTIMAL", "FEASIBLE")
    assigned_period_ids = {e.timetable_period_id for e in res.entries}
    assert "p-d1-p2" not in assigned_period_ids


# 10. Invalid faculty-subject assignment (5.9)
def test_10_invalid_faculty_subject_assignment():
    prob = make_base_problem()
    # Remove faculty assignment
    prob.faculty_assignments = []
    prob.scheduling_requirements[0].faculty_id = None

    solver = TimetableSolver()
    res = solver.solve(prob)

    assert res.status == "MODEL_INVALID"
    assert "no designated faculty" in res.error_message


# 11. Invalid section-subject assignment (5.10)
def test_11_invalid_section_subject_assignment():
    prob = make_base_problem()
    # Point requirement to non-existent section
    prob.scheduling_requirements[0].section_id = "non-existent-sec"

    solver = TimetableSolver()
    res = solver.solve(prob)

    assert res.status == "MODEL_INVALID"
    assert "unknown section" in res.error_message


# 12. Infeasible input detection
def test_12_infeasible_input_detection():
    prob = make_base_problem()
    # Request 20 periods when only 8 slots exist in total
    prob.scheduling_requirements[0].weekly_periods = 20

    solver = TimetableSolver()
    res = solver.solve(prob)

    assert res.status == "INFEASIBLE"
    assert len(res.entries) == 0


# 13. Solver timeout behavior (TIME_LIMIT)
def test_13_solver_timeout_behavior():
    prob = make_base_problem()
    # Set extreme tiny timeout (0.00001s)
    prob.solver_timeout_seconds = 1
    prob.solver_config.max_solve_time_seconds = 0.0001

    solver = TimetableSolver()
    res = solver.solve(prob)

    # Must safely report TIME_LIMIT or FEASIBLE if instant, but never throw exception
    assert res.status in ("TIME_LIMIT", "OPTIMAL", "FEASIBLE")


# 14. Deterministic seed behavior
def test_14_deterministic_seed_behavior():
    prob = make_base_problem()
    solver = TimetableSolver()

    res1 = solver.solve(prob)
    res2 = solver.solve(prob)

    assert res1.status == res2.status
    assert len(res1.entries) == len(res2.entries)
    for e1, e2 in zip(res1.entries, res2.entries):
        assert e1.timetable_period_id == e2.timetable_period_id
        assert e1.classroom_id == e2.classroom_id


# 15. Output validation agreement
def test_15_output_validation_agreement():
    prob = make_base_problem()
    solver = TimetableSolver()
    res = solver.solve(prob)

    val_errors = validate_solver_result(prob, res)
    assert len(val_errors) == 0
    assert res.validation_errors == []


# 16. Partial / unassigned session reporting (5.1)
def test_16_partial_unassigned_session_reporting():
    prob = make_base_problem()
    # Enable partial results and request more periods than can fit comfortably
    prob.solver_config.allow_partial = True
    # Make room only available for 1 period
    prob.classrooms[0].unavailable_period_ids = [
        p.id for p in prob.periods if p.id != "p-d1-p1"
    ]

    solver = TimetableSolver()
    res = solver.solve(prob)

    assert res.status in ("PARTIAL", "OPTIMAL", "FEASIBLE")
    if res.status == "PARTIAL":
        assert len(res.unassigned_sessions) > 0
        assert res.is_complete is False
        assert res.total_assigned_sessions < res.total_required_sessions


# 17. Empty input handling
def test_17_empty_input_handling():
    prob = make_base_problem()
    prob.scheduling_requirements = []

    solver = TimetableSolver()
    res = solver.solve(prob)

    assert res.status == "OPTIMAL"
    assert len(res.entries) == 0
    assert res.total_assigned_sessions == 0


# 18. Soft constraint objective optimization (spread across week)
def test_18_soft_constraint_spread_across_week():
    prob = make_base_problem()
    # 2 periods required, 2 days available
    # High weight on spreading across week should place 1 period on Day 1 and 1 on Day 2
    prob.solver_config.objective_weights = ObjectiveWeightsSchema(spread_across_week=50)

    solver = TimetableSolver()
    res = solver.solve(prob)

    assert res.status in ("OPTIMAL", "FEASIBLE")
    assert len(res.entries) == 2
    days = {e.timetable_period_id.split("-")[1] for e in res.entries}
    assert len(days) == 2, f"Expected periods spread across 2 days, got: {days}"
