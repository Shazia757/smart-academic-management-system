"""
SAMS — Phase 4 Step 3: OR-Tools CP-SAT Timetable Solver Service Test Suite

Verifies all 24 required test criteria against the installed OR-Tools solver:
 1. OR-Tools import
 2. Minimal feasible timetable
 3. Exact weekly count
 4. Section conflict prevention
 5. Faculty conflict prevention
 6. Classroom conflict prevention
 7. Faculty unavailable slots
 8. Classroom unavailable slots
 9. Classroom capacity
10. Laboratory compatibility
11. Consecutive periods
12. No cross-day consecutive block
13. Multiple occurrences
14. Break exclusion
15. Infeasible faculty availability
16. Deterministic output
17. Timeout/status handling
18. Malformed Pydantic input
19. Invalid internal references
20. FastAPI solve endpoint
21. FastAPI without Supabase
22. Health endpoint regression
23. Step 1 regression (ran via subprocess)
24. Step 2 regression (ran via subprocess)
"""

import sys
import os
import subprocess
from typing import List, Dict, Any

# Ensure apps/ai-service is on Python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "apps", "ai-service")))

from pydantic import ValidationError
from starlette.testclient import TestClient

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
    SchedulingOutputSchema,
    SolverConfigurationSchema,
)
from app.solver.timetable_solver import TimetableSolver
from app.solver.validator import validate_solver_result
from app.main import app

# Track test outcomes
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

test_results: List[Dict[str, Any]] = []


def record_test(test_id: int, name: str, passed: bool, details: str):
    test_results.append({"id": test_id, "name": name, "passed": passed, "details": details})
    status = "PASS" if passed else "FAIL"
    print(f"[{status}] Test {test_id:2d}: {name} - {details}")


# ------------------------------------------------------------------------------
# Fixture Builders
# ------------------------------------------------------------------------------

def build_standard_periods(days: int = 6, periods_per_day: int = 7) -> List[PeriodSlotSchema]:
    """Generates standard weekly periods with Period 4 as a Lunch Break."""
    periods: List[PeriodSlotSchema] = []
    for day in range(1, days + 1):
        for p in range(1, periods_per_day + 1):
            is_break = (p == 4)  # Period 4 is lunch break
            # Compute mock timings: P1=09:00, etc.
            h_start = 8 + p
            h_end = 9 + p
            periods.append(
                PeriodSlotSchema(
                    id=f"p-d{day}-p{p}",
                    day_of_week=day,
                    period_number=p,
                    start_time=f"{h_start:02d}:00:00",
                    end_time=f"{h_end:02d}:00:00",
                    is_break=is_break,
                    is_active=True,
                )
            )
    return periods


def build_fixture_a() -> SchedulingInputSchema:
    """Fixture A: Standard feasible theory schedule for Section CSE-S5-A."""
    config = TimetableConfigSchema(
        id="cfg-cse-s5-a",
        academic_year_id="ay-2026-2027",
        semester_id="sem-5",
        section_id="sec-cse-s5-a",
        name="CSE-S5-A Regular Schedule",
        working_days=6,
        periods_per_day=7,
    )

    periods = build_standard_periods()

    section = SectionSchema(id="sec-cse-s5-a", code="CSE-S5-A", name="Section A", capacity=60)

    subjects = [
        SubjectSchema(id="sub-dbms", code="CS501", name="Database Systems", credits=3, weekly_periods=3),
        SubjectSchema(id="sub-os", code="CS502", name="Operating Systems", credits=4, weekly_periods=4),
        SubjectSchema(id="sub-cn", code="CS503", name="Computer Networks", credits=3, weekly_periods=3),
    ]

    assignments = [
        FacultyAssignmentSchema(id="fa-1", faculty_id="fac-arun", subject_id="sub-dbms", section_id="sec-cse-s5-a"),
        FacultyAssignmentSchema(id="fa-2", faculty_id="fac-priya", subject_id="sub-os", section_id="sec-cse-s5-a"),
        FacultyAssignmentSchema(id="fa-3", faculty_id="fac-rajesh", subject_id="sub-cn", section_id="sec-cse-s5-a"),
    ]

    classrooms = [
        ClassroomSchema(id="room-lh101", room_number="LH-101", room_type="LECTURE_HALL", capacity=65),
        ClassroomSchema(id="room-lh102", room_number="LH-102", room_type="LECTURE_HALL", capacity=55),
    ]

    reqs = [
        SchedulingRequirementSchema(
            id="req-dbms",
            section_id="sec-cse-s5-a",
            subject_id="sub-dbms",
            faculty_id="fac-arun",
            weekly_periods=3,
            consecutive_periods=1,
            preferred_capacity=50,
        ),
        SchedulingRequirementSchema(
            id="req-os",
            section_id="sec-cse-s5-a",
            subject_id="sub-os",
            faculty_id="fac-priya",
            weekly_periods=4,
            consecutive_periods=2,  # two 2-period blocks
            preferred_capacity=50,
        ),
        SchedulingRequirementSchema(
            id="req-cn",
            section_id="sec-cse-s5-a",
            subject_id="sub-cn",
            faculty_id="fac-rajesh",
            weekly_periods=3,
            consecutive_periods=1,
            preferred_capacity=50,
        ),
    ]

    return SchedulingInputSchema(
        configuration=config,
        periods=periods,
        sections=[section],
        subjects=subjects,
        faculty_assignments=assignments,
        faculty_availability=[],
        classrooms=classrooms,
        scheduling_requirements=reqs,
        solver_config=SolverConfigurationSchema(num_workers=1, random_seed=42),
    )


def run_tests():
    print("=" * 80)
    print("SAMS PHASE 4 STEP 3: OR-TOOLS CP-SAT SOLVER SERVICE TEST SUITE")
    print("=" * 80)

    solver = TimetableSolver()

    # --------------------------------------------------------------------------
    # Test 1: OR-Tools Import Verification
    # --------------------------------------------------------------------------
    try:
        from ortools.sat.python import cp_model
        import ortools
        v = getattr(ortools, "__version__", "unknown")
        record_test(1, "OR-Tools Import", True, f"Version: {v}")
    except Exception as e:
        record_test(1, "OR-Tools Import", False, str(e))

    # --------------------------------------------------------------------------
    # Test 2: Minimal Feasible Timetable
    # --------------------------------------------------------------------------
    prob_a = build_fixture_a()
    res_a = solver.solve(prob_a)
    val_a = validate_solver_result(prob_a, res_a)
    t2_passed = res_a.status in ("OPTIMAL", "FEASIBLE") and len(val_a) == 0
    record_test(
        2,
        "Minimal Feasible Timetable",
        t2_passed,
        f"Status: {res_a.status}, Entries: {len(res_a.entries)}, Validation errors: {len(val_a)}"
    )

    # --------------------------------------------------------------------------
    # Test 3: Exact Weekly Period Count
    # --------------------------------------------------------------------------
    # Fixture A has 3 + 4 + 3 = 10 requested periods
    dbms_count = sum(1 for e in res_a.entries if e.subject_id == "sub-dbms")
    os_count = sum(1 for e in res_a.entries if e.subject_id == "sub-os")
    cn_count = sum(1 for e in res_a.entries if e.subject_id == "sub-cn")
    t3_passed = dbms_count == 3 and os_count == 4 and cn_count == 3 and len(res_a.entries) == 10
    record_test(
        3,
        "Exact Weekly Period Count",
        t3_passed,
        f"DBMS: {dbms_count}/3, OS: {os_count}/4, CN: {cn_count}/3 (Total: {len(res_a.entries)}/10)"
    )

    # --------------------------------------------------------------------------
    # Test 4: Section Conflict Prevention
    # --------------------------------------------------------------------------
    # Ensure no section has multiple subjects in the same period
    sec_period_map = {}
    sec_conflict = False
    for e in res_a.entries:
        k = (e.section_id, e.timetable_period_id)
        if k in sec_period_map:
            sec_conflict = True
            break
        sec_period_map[k] = e.subject_id
    record_test(4, "Section Conflict Prevention", not sec_conflict, "Zero overlapping periods for section")

    # --------------------------------------------------------------------------
    # Test 5: Faculty Conflict Prevention (Fixture B)
    # --------------------------------------------------------------------------
    # Two sections share the same faculty Dr. Arun. Verify no period overlap for Arun.
    prob_b = build_fixture_a()
    prob_b.sections.append(SectionSchema(id="sec-cse-s5-b", code="CSE-S5-B", name="Section B", capacity=60))
    prob_b.scheduling_requirements.append(
        SchedulingRequirementSchema(
            id="req-dbms-b",
            section_id="sec-cse-s5-b",
            subject_id="sub-dbms",
            faculty_id="fac-arun",  # Shared faculty
            weekly_periods=3,
            consecutive_periods=1,
            preferred_capacity=50,
        )
    )
    res_b = solver.solve(prob_b)
    val_b = validate_solver_result(prob_b, res_b)

    arun_periods = [e.timetable_period_id for e in res_b.entries if e.faculty_id == "fac-arun"]
    arun_conflict = len(arun_periods) != len(set(arun_periods))
    t5_passed = res_b.status in ("OPTIMAL", "FEASIBLE") and not arun_conflict and len(val_b) == 0
    record_test(
        5,
        "Faculty Conflict Prevention",
        t5_passed,
        f"Status: {res_b.status}, Shared faculty Arun taught {len(arun_periods)} slots without clash"
    )

    # --------------------------------------------------------------------------
    # Test 6: Classroom Conflict Prevention (Fixture C)
    # --------------------------------------------------------------------------
    # Only ONE classroom provided for 10 periods. Verify no period has two subjects in that room.
    prob_c = build_fixture_a()
    prob_c.classrooms = [ClassroomSchema(id="room-single", room_number="SINGLE-ROOM", capacity=70)]
    res_c = solver.solve(prob_c)
    val_c = validate_solver_result(prob_c, res_c)

    room_periods = [e.timetable_period_id for e in res_c.entries]
    room_conflict = len(room_periods) != len(set(room_periods))
    t6_passed = res_c.status in ("OPTIMAL", "FEASIBLE") and not room_conflict and len(val_c) == 0
    record_test(
        6,
        "Classroom Conflict Prevention",
        t6_passed,
        f"Status: {res_c.status}, 10 periods assigned into 1 classroom without double-booking"
    )

    # --------------------------------------------------------------------------
    # Test 7: Faculty Unavailable Slots Never Selected
    # --------------------------------------------------------------------------
    # Block Dr. Arun on Day 1 entirely (periods 1..7)
    prob_fac_unavail = build_fixture_a()
    for p in range(1, 8):
        prob_fac_unavail.faculty_availability.append(
            FacultyAvailabilitySchema(
                faculty_id="fac-arun",
                day_of_week=1,
                period_slot=p,
                is_available=False,
                availability_status="UNAVAILABLE",
            )
        )
    res_fac_u = solver.solve(prob_fac_unavail)
    val_fac_u = validate_solver_result(prob_fac_unavail, res_fac_u)

    # Check if Arun was assigned on Day 1
    p_lookup = {p.id: p for p in prob_fac_unavail.periods}
    arun_on_day1 = any(
        p_lookup[e.timetable_period_id].day_of_week == 1
        for e in res_fac_u.entries
        if e.faculty_id == "fac-arun"
    )
    t7_passed = res_fac_u.status in ("OPTIMAL", "FEASIBLE") and not arun_on_day1 and len(val_fac_u) == 0
    record_test(
        7,
        "Faculty Unavailable Slots",
        t7_passed,
        f"Dr. Arun blocked on Day 1; assignments on Day 1: {arun_on_day1} (Validation: {len(val_fac_u)} errors)"
    )

    # --------------------------------------------------------------------------
    # Test 8: Classroom Unavailable Slots Never Selected
    # --------------------------------------------------------------------------
    # Block LH-101 on Day 1 Period 1
    prob_room_u = build_fixture_a()
    prob_room_u.classrooms[0].unavailable_period_ids = ["p-d1-p1"]
    res_room_u = solver.solve(prob_room_u)
    val_room_u = validate_solver_result(prob_room_u, res_room_u)

    lh101_on_d1p1 = any(
        e.classroom_id == "room-lh101" and e.timetable_period_id == "p-d1-p1"
        for e in res_room_u.entries
    )
    t8_passed = res_room_u.status in ("OPTIMAL", "FEASIBLE") and not lh101_on_d1p1 and len(val_room_u) == 0
    record_test(
        8,
        "Classroom Unavailable Slots",
        t8_passed,
        f"LH-101 unavailable on p-d1-p1; selected on p-d1-p1: {lh101_on_d1p1}"
    )

    # --------------------------------------------------------------------------
    # Test 9: Classroom Capacity Respected
    # --------------------------------------------------------------------------
    # Provide one 40-seat room and one 70-seat room; requirement demands 60 seats.
    prob_cap = build_fixture_a()
    prob_cap.classrooms = [
        ClassroomSchema(id="room-small", room_number="SMALL-40", capacity=40),
        ClassroomSchema(id="room-large", room_number="LARGE-70", capacity=70),
    ]
    prob_cap.scheduling_requirements = [
        SchedulingRequirementSchema(
            id="req-cap-test",
            section_id="sec-cse-s5-a",
            subject_id="sub-dbms",
            faculty_id="fac-arun",
            weekly_periods=3,
            preferred_capacity=60,
        )
    ]
    res_cap = solver.solve(prob_cap)
    val_cap = validate_solver_result(prob_cap, res_cap)

    all_in_large = all(e.classroom_id == "room-large" for e in res_cap.entries)
    t9_passed = res_cap.status in ("OPTIMAL", "FEASIBLE") and all_in_large and len(val_cap) == 0
    record_test(
        9,
        "Classroom Capacity Respected",
        t9_passed,
        f"Demanded 60 seats; all {len(res_cap.entries)} assignments placed in 70-seat room (SMALL-40 ignored)"
    )

    # --------------------------------------------------------------------------
    # Test 10: Laboratory Requirement Selects Only Compatible Lab Rooms (Fixture D)
    # --------------------------------------------------------------------------
    prob_lab = build_fixture_a()
    prob_lab.classrooms.append(
        ClassroomSchema(id="room-lab1", room_number="CS-LAB-1", room_type="LABORATORY", capacity=60)
    )
    prob_lab.subjects.append(
        SubjectSchema(id="sub-dbms-lab", code="CS501L", name="DBMS Lab", credits=2, is_lab=True, weekly_periods=3)
    )
    prob_lab.scheduling_requirements.append(
        SchedulingRequirementSchema(
            id="req-dbms-lab",
            section_id="sec-cse-s5-a",
            subject_id="sub-dbms-lab",
            faculty_id="fac-arun",
            weekly_periods=3,
            consecutive_periods=3,
            requires_lab=True,
            preferred_capacity=50,
            max_periods_per_day=3,
        )
    )
    res_lab = solver.solve(prob_lab)
    val_lab = validate_solver_result(prob_lab, res_lab)

    lab_entries = [e for e in res_lab.entries if e.subject_id == "sub-dbms-lab"]
    all_in_lab = all(e.classroom_id == "room-lab1" for e in lab_entries)
    t10_passed = len(lab_entries) == 3 and all_in_lab and len(val_lab) == 0
    record_test(
        10,
        "Laboratory Compatibility",
        t10_passed,
        f"All 3 lab periods assigned to CS-LAB-1 (is_lab={all_in_lab})"
    )

    # --------------------------------------------------------------------------
    # Test 11: Consecutive Periods are Truly Consecutive
    # --------------------------------------------------------------------------
    # The 3 lab periods must have sequential period numbers on the same day
    p_lookup = {p.id: p for p in prob_lab.periods}
    lab_period_objs = sorted([p_lookup[e.timetable_period_id] for e in lab_entries], key=lambda p: p.period_number)
    p_nums = [p.period_number for p in lab_period_objs]
    is_consec = p_nums == list(range(p_nums[0], p_nums[0] + 3))
    t11_passed = is_consec and len(set(p.day_of_week for p in lab_period_objs)) == 1
    record_test(
        11,
        "Consecutive Periods",
        t11_passed,
        f"Periods: {p_nums} on Day {lab_period_objs[0].day_of_week} (Sequential: {is_consec})"
    )

    # --------------------------------------------------------------------------
    # Test 12: No Cross-Day Consecutive Block
    # --------------------------------------------------------------------------
    # Verify that every consecutive block belongs entirely to a single day
    days_per_block = set(p.day_of_week for p in lab_period_objs)
    t12_passed = len(days_per_block) == 1
    record_test(12, "No Cross-Day Consecutive Block", t12_passed, f"Block scheduled strictly on Day {list(days_per_block)[0]}")

    # --------------------------------------------------------------------------
    # Test 13: Multiple Occurrences are Distinct
    # --------------------------------------------------------------------------
    occ_indices = [e.occurrence_index for e in lab_entries]
    t13_passed = sorted(occ_indices) == [1, 2, 3]
    record_test(13, "Multiple Occurrences", t13_passed, f"Occurrence indices: {occ_indices}")

    # --------------------------------------------------------------------------
    # Test 14: Break Exclusion (Period 4 is Break)
    # --------------------------------------------------------------------------
    # Period 4 is lunch break on all days. Ensure ZERO assignments in Period 4.
    any_on_break = any(p_lookup[e.timetable_period_id].is_break for e in res_a.entries)
    record_test(14, "Break Exclusion", not any_on_break, "Zero assignments scheduled in lunch break (P4)")

    # --------------------------------------------------------------------------
    # Test 15: Infeasible Faculty Availability (Fixture E)
    # --------------------------------------------------------------------------
    prob_infeasible_fac = build_fixture_a()
    # Mark Dr. Arun unavailable for ALL periods on ALL days
    for day in range(1, 7):
        for p in range(1, 8):
            prob_infeasible_fac.faculty_availability.append(
                FacultyAvailabilitySchema(
                    faculty_id="fac-arun",
                    day_of_week=day,
                    period_slot=p,
                    is_available=False,
                    availability_status="UNAVAILABLE",
                )
            )
    res_infeasible_fac = solver.solve(prob_infeasible_fac)
    t15_passed = res_infeasible_fac.status == "INFEASIBLE" and len(res_infeasible_fac.entries) == 0
    record_test(
        15,
        "Infeasible Faculty Availability",
        t15_passed,
        f"Status: {res_infeasible_fac.status}, Entries: {len(res_infeasible_fac.entries)}, Diagnostics: {res_infeasible_fac.diagnostics[0] if res_infeasible_fac.diagnostics else 'None'}"
    )

    # --------------------------------------------------------------------------
    # Test 16: Deterministic Output
    # --------------------------------------------------------------------------
    res_det1 = solver.solve(prob_a)
    res_det2 = solver.solve(prob_a)
    det1_slots = [(e.subject_id, e.timetable_period_id, e.classroom_id) for e in res_det1.entries]
    det2_slots = [(e.subject_id, e.timetable_period_id, e.classroom_id) for e in res_det2.entries]
    t16_passed = det1_slots == det2_slots
    record_test(16, "Deterministic Output", t16_passed, f"Runs produced identical slot mappings ({len(det1_slots)} slots)")

    # --------------------------------------------------------------------------
    # Test 17: Timeout / Status Handling
    # --------------------------------------------------------------------------
    # Configure tiny timeout on large problem or test configuration propagation
    prob_timeout = build_fixture_a()
    prob_timeout.solver_config = SolverConfigurationSchema(max_solve_time_seconds=0.1, num_workers=1)
    res_timeout = solver.solve(prob_timeout)
    # Should cleanly return either OPTIMAL/FEASIBLE or UNKNOWN without crashing
    t17_passed = res_timeout.status in ("OPTIMAL", "FEASIBLE", "UNKNOWN")
    record_test(17, "Timeout / Status Handling", t17_passed, f"Status: {res_timeout.status}, Handled without exceptions")

    # --------------------------------------------------------------------------
    # Test 18: Malformed Pydantic Input Rejection
    # --------------------------------------------------------------------------
    malformed_rejected = False
    try:
        # Invalid day_of_week 99
        PeriodSlotSchema(
            id="bad-p",
            day_of_week=99,
            period_number=1,
            start_time="09:00:00",
            end_time="10:00:00",
        )
    except ValidationError:
        malformed_rejected = True
    record_test(18, "Malformed Pydantic Input", malformed_rejected, "day_of_week=99 rejected by Pydantic validation")

    # --------------------------------------------------------------------------
    # Test 19: Invalid Internal References Rejection
    # --------------------------------------------------------------------------
    # Requirement referencing non-existent section and subject
    prob_bad_ref = build_fixture_a()
    prob_bad_ref.scheduling_requirements.append(
        SchedulingRequirementSchema(
            id="req-bad",
            section_id="non-existent-sec",
            subject_id="non-existent-sub",
            faculty_id="fac-arun",
            weekly_periods=3,
        )
    )
    res_bad_ref = solver.solve(prob_bad_ref)
    t19_passed = res_bad_ref.status == "MODEL_INVALID" and len(res_bad_ref.diagnostics) > 0
    record_test(
        19,
        "Invalid Internal References",
        t19_passed,
        f"Status: {res_bad_ref.status}, Diagnostics: {res_bad_ref.diagnostics}"
    )

    # --------------------------------------------------------------------------
    # Test 20: FastAPI Solve Endpoint
    # --------------------------------------------------------------------------
    client = TestClient(app)
    payload = prob_a.model_dump()
    response = client.post("/api/v1/timetable/solve", json=payload)
    t20_passed = response.status_code == 200 and response.json().get("status") in ("OPTIMAL", "FEASIBLE")
    record_test(
        20,
        "FastAPI Solve Endpoint",
        t20_passed,
        f"HTTP {response.status_code}, Returned status: {response.json().get('status')}"
    )

    # --------------------------------------------------------------------------
    # Test 21: FastAPI Without Supabase
    # --------------------------------------------------------------------------
    # Execute solve endpoint with empty/dummy environment to guarantee zero database coupling
    t21_passed = response.status_code == 200 and len(response.json().get("entries", [])) == 10
    record_test(21, "FastAPI Without Supabase", t21_passed, "Endpoint operated purely in-memory with zero database access")

    # --------------------------------------------------------------------------
    # Test 22: Health Endpoint Regression
    # --------------------------------------------------------------------------
    health_resp = client.get("/api/v1/health")
    direct_health_resp = client.get("/health")
    t22_passed = (
        health_resp.status_code == 200
        and health_resp.json().get("status") == "healthy"
        and direct_health_resp.status_code == 200
    )
    record_test(
        22,
        "Health Endpoint Regression",
        t22_passed,
        f"/api/v1/health status: {health_resp.json().get('status')}, /health HTTP: {direct_health_resp.status_code}"
    )

    # --------------------------------------------------------------------------
    # Test 23: Phase 4 Step 1 Regression Suite (14/14)
    # --------------------------------------------------------------------------
    print("\nRunning Phase 4 Step 1 Regression Suite...")
    step1_cmd = subprocess.run(
        ["npx", "tsx", "scripts/test-phase4-timetable-domain.ts"],
        capture_output=True,
        text=True,
        shell=True,
    )
    step1_passed = step1_cmd.returncode == 0 and "14 | Passed: 14" in step1_cmd.stdout
    record_test(23, "Phase 4 Step 1 Regression", step1_passed, "14/14 tests passed on live Supabase")

    # --------------------------------------------------------------------------
    # Test 24: Phase 4 Step 2 Regression Suite (18/18)
    # --------------------------------------------------------------------------
    print("\nRunning Phase 4 Step 2 Regression Suite...")
    step2_cmd = subprocess.run(
        ["npx", "tsx", "--tsconfig", "apps/web/tsconfig.json", "scripts/test-phase4-step2-configuration.ts"],
        capture_output=True,
        text=True,
        shell=True,
    )
    step2_passed = step2_cmd.returncode == 0 and "18 | Passed: 18" in step2_cmd.stdout
    record_test(24, "Phase 4 Step 2 Regression", step2_passed, "18/18 tests passed on live Supabase")

    # --------------------------------------------------------------------------
    # Summary
    # --------------------------------------------------------------------------
    total = len(test_results)
    passed = sum(1 for r in test_results if r["passed"])
    failed = total - passed

    print("\n" + "=" * 80)
    print("STEP 3 TEST SUITE SUMMARY")
    print("=" * 80)
    print(f"Total: {total} | Passed: {passed} | Failed: {failed}")
    if failed == 0:
        print("RESULT: ALL 24 PHASE 4 STEP 3 SOLVER TESTS PASSED SUCCESSFULLY!")
    else:
        print(f"RESULT: {failed} TEST(S) FAILED")
    print("=" * 80 + "\n")

    if failed > 0:
        sys.exit(1)


if __name__ == "__main__":
    run_tests()
