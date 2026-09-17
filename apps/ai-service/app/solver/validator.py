from typing import List, Dict, Set, Tuple, Any
from app.schemas.timetable import (
    SchedulingInputSchema,
    SchedulingOutputSchema,
    PeriodSlotSchema,
    ClassroomSchema,
    SchedulingRequirementSchema,
)


def validate_solver_result(
    problem: SchedulingInputSchema,
    result: SchedulingOutputSchema,
) -> List[str]:
    """
    Independently validates a timetable solution against institutional constraints (5.1 - 5.13).
    Does NOT reuse CP-SAT candidate or constraint logic to ensure genuine verification.
    Returns a list of error strings; an empty list indicates a valid, conflict-free schedule.
    """
    errors: List[str] = []

    # If status is not OPTIMAL, FEASIBLE, or PARTIAL, no assignments should be present
    if result.status not in ("OPTIMAL", "FEASIBLE", "PARTIAL"):
        if len(result.entries) > 0:
            errors.append(f"Solver status is {result.status} but returned {len(result.entries)} assignments.")
        return errors

    assignments = result.entries

    # Lookup dictionaries
    periods_by_id: Dict[str, PeriodSlotSchema] = {p.id: p for p in problem.periods}
    classrooms_by_id: Dict[str, ClassroomSchema] = {c.id: c for c in problem.classrooms}
    sections_by_id = {s.id: s for s in problem.sections}
    requirements_by_id: Dict[str, SchedulingRequirementSchema] = {
        r.id: r for r in problem.scheduling_requirements if r.is_active
    }
    faculty_assign_keys = {(fa.section_id, fa.subject_id): fa.faculty_id for fa in problem.faculty_assignments}

    # Tracking sets for uniqueness / conflict checks
    # (section_id, period_id) -> list of assignment references
    section_slots: Dict[Tuple[str, str], int] = {}
    # (faculty_id, period_id) -> list of assignment references
    faculty_slots: Dict[Tuple[str, str], int] = {}
    # (classroom_id, period_id) -> list of assignment references
    classroom_slots: Dict[Tuple[str, str], int] = {}

    # Faculty unavailable slots: (faculty_id, day_of_week, period_number)
    faculty_unavailable: Set[Tuple[str, int, int]] = set()
    for fa in problem.faculty_availability:
        slot = fa.period_slot if fa.period_slot is not None else fa.period_number
        if slot is not None and (not fa.is_available or fa.availability_status == "UNAVAILABLE"):
            faculty_unavailable.add((fa.faculty_id, fa.day_of_week, slot))

    # Assigned counts per requirement: req_id -> list of (entry, period)
    req_assignments: Dict[str, list] = {r_id: [] for r_id in requirements_by_id}

    for idx, entry in enumerate(assignments):
        # 1. 5.11 & 5.12: Period validity & No break assignment
        period = periods_by_id.get(entry.timetable_period_id)
        if not period:
            errors.append(f"Assignment {idx}: Unknown period ID '{entry.timetable_period_id}'.")
            continue

        if not period.is_active:
            errors.append(f"Assignment {idx}: Assigned to inactive period '{period.id}'.")

        if period.is_break:
            errors.append(
                f"Assignment {idx}: 5.11 BREAK VIOLATION — Assigned to break period '{period.id}' "
                f"(Day {period.day_of_week}, P{period.period_number})."
            )

        # 2. 5.3: Section collision
        sec_key = (entry.section_id, entry.timetable_period_id)
        if sec_key in section_slots:
            errors.append(
                f"5.3 SECTION COLLISION: Section '{entry.section_id}' has multiple assignments "
                f"in period '{entry.timetable_period_id}' (Day {period.day_of_week}, P{period.period_number})."
            )
        section_slots[sec_key] = idx

        # 3. 5.2: Faculty collision
        fac_key = (entry.faculty_id, entry.timetable_period_id)
        if fac_key in faculty_slots:
            errors.append(
                f"5.2 FACULTY COLLISION: Faculty '{entry.faculty_id}' has multiple assignments "
                f"in period '{entry.timetable_period_id}' (Day {period.day_of_week}, P{period.period_number})."
            )
        faculty_slots[fac_key] = idx

        # 4. 5.4: Classroom collision
        room_key = (entry.classroom_id, entry.timetable_period_id)
        if room_key in classroom_slots:
            errors.append(
                f"5.4 CLASSROOM COLLISION: Classroom '{entry.classroom_id}' has multiple assignments "
                f"in period '{entry.timetable_period_id}' (Day {period.day_of_week}, P{period.period_number})."
            )
        classroom_slots[room_key] = idx

        # 5. 5.5: Faculty availability
        if (entry.faculty_id, period.day_of_week, period.period_number) in faculty_unavailable:
            errors.append(
                f"5.5 FACULTY UNAVAILABLE: Faculty '{entry.faculty_id}' assigned during unavailable "
                f"slot (Day {period.day_of_week}, P{period.period_number})."
            )

        # 6. 5.6: Classroom availability
        room = classrooms_by_id.get(entry.classroom_id)
        if not room:
            errors.append(f"Assignment {idx}: Unknown classroom ID '{entry.classroom_id}'.")
        else:
            if not room.is_available:
                errors.append(f"5.6 CLASSROOM UNAVAILABLE: Classroom '{entry.classroom_id}' is marked inactive/unavailable.")
            if entry.timetable_period_id in room.unavailable_period_ids:
                errors.append(
                    f"5.6 CLASSROOM UNAVAILABLE: Classroom '{entry.classroom_id}' is unavailable for period '{entry.timetable_period_id}'."
                )

        # 7. 5.9: Valid Faculty Assignment
        assigned_faculty = faculty_assign_keys.get((entry.section_id, entry.subject_id))
        if assigned_faculty and entry.faculty_id != assigned_faculty:
            errors.append(
                f"5.9 INVALID FACULTY ASSIGNMENT: Subject '{entry.subject_id}' for section '{entry.section_id}' "
                f"is assigned to faculty '{entry.faculty_id}', expected '{assigned_faculty}'."
            )

        # Find matching requirement
        matching_req = None
        for r in requirements_by_id.values():
            if r.section_id == entry.section_id and r.subject_id == entry.subject_id:
                matching_req = r
                break

        if not matching_req:
            errors.append(
                f"5.10 INVALID SECTION-SUBJECT ASSIGNMENT: No active requirement exists for section '{entry.section_id}' "
                f"and subject '{entry.subject_id}'."
            )
        else:
            req_assignments[matching_req.id].append((entry, period))

            # 8. 5.7: Classroom capacity
            sec = sections_by_id.get(entry.section_id)
            required_capacity = max(matching_req.preferred_capacity or 0, sec.capacity if sec else 0)
            if room and required_capacity > 0 and room.capacity < required_capacity:
                errors.append(
                    f"5.7 CAPACITY VIOLATION: Classroom '{room.room_number}' capacity ({room.capacity}) "
                    f"is below required ({required_capacity}) for section '{entry.section_id}'."
                )

            # 9. 5.8: Laboratory room type
            is_lab_room = "lab" in (room.room_type.lower() if room else "") or (room.room_type == "LABORATORY" if room else False)
            if matching_req.requires_lab or entry.is_lab:
                if not room or not is_lab_room:
                    errors.append(
                        f"5.8 LAB ROOM MISMATCH: Requirement '{matching_req.id}' requires laboratory "
                        f"but was assigned non-lab room '{room.room_number if room else 'unknown'}' (type: {room.room_type if room else 'unknown'})."
                    )
            else:
                if is_lab_room:
                    errors.append(
                        f"5.8 LAB ROOM MISMATCH: Non-lab requirement '{matching_req.id}' was assigned laboratory room '{room.room_number if room else 'unknown'}'."
                    )

    # 10. 5.1 & 5.13: Occurrence count completeness & contiguous block integrity
    is_partial_mode = result.status == "PARTIAL"

    for req_id, req in requirements_by_id.items():
        assigned = req_assignments[req_id]
        total_assigned = len(assigned)

        if not is_partial_mode and total_assigned != req.weekly_periods:
            errors.append(
                f"5.1 REQUIRED SESSIONS COUNT: Requirement '{req_id}' (Subject: {req.subject_id}) "
                f"requires {req.weekly_periods} periods but received {total_assigned}."
            )

        # 5.13: Occurrence uniqueness
        occurrences = [e[0].occurrence_index for e in assigned]
        if len(set(occurrences)) != len(occurrences):
            errors.append(f"5.13 DUPLICATE OCCURRENCE: Duplicate occurrence indices for requirement '{req_id}': {occurrences}")

        # Check consecutive periods
        c = req.consecutive_periods
        if c > 1 and total_assigned > 0:
            by_day: Dict[int, List[Tuple[Any, PeriodSlotSchema]]] = {}
            for entry, p in assigned:
                by_day.setdefault(p.day_of_week, []).append((entry, p))

            for day, day_entries in by_day.items():
                if len(day_entries) % c != 0:
                    errors.append(
                        f"5.13 CONSECUTIVE BLOCK VIOLATION: Requirement '{req_id}' on day {day} has {len(day_entries)} "
                        f"periods, which is not a multiple of consecutive block size {c}."
                    )
                sorted_entries = sorted(day_entries, key=lambda x: x[1].period_number)
                for i in range(0, len(sorted_entries), c):
                    chunk = sorted_entries[i : i + c]
                    if len(chunk) == c:
                        rooms = {e[0].classroom_id for e in chunk}
                        if len(rooms) > 1:
                            errors.append(
                                f"5.13 CONSECUTIVE BLOCK VIOLATION: Requirement '{req_id}' block uses multiple "
                                f"classrooms across consecutive periods: {rooms}"
                            )
                        period_numbers = [e[1].period_number for e in chunk]
                        expected_numbers = list(range(period_numbers[0], period_numbers[0] + c))
                        if period_numbers != expected_numbers:
                            errors.append(
                                f"5.13 CONSECUTIVE BLOCK VIOLATION: Requirement '{req_id}' block periods on day {day} "
                                f"are not sequential: got {period_numbers}, expected {expected_numbers}."
                            )

    return errors
