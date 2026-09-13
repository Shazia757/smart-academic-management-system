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
    Independently validates a timetable solution against institutional constraints.
    Does NOT reuse CP-SAT candidate or constraint logic to ensure genuine verification.
    Returns a list of error strings; an empty list indicates a valid, conflict-free schedule.
    """
    errors: List[str] = []

    # If status is not OPTIMAL or FEASIBLE, no successful assignments should be present
    if result.status not in ("OPTIMAL", "FEASIBLE"):
        if len(result.entries) > 0:
            errors.append(f"Solver status is {result.status} but returned {len(result.entries)} assignments.")
        return errors

    assignments = result.entries

    # Lookup dictionaries
    periods_by_id: Dict[str, PeriodSlotSchema] = {p.id: p for p in problem.periods}
    classrooms_by_id: Dict[str, ClassroomSchema] = {c.id: c for c in problem.classrooms}
    requirements_by_id: Dict[str, SchedulingRequirementSchema] = {
        r.id: r for r in problem.scheduling_requirements if r.is_active
    }

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

    # Assigned counts per requirement: req_id -> list of assignments
    req_assignments: Dict[str, list] = {r_id: [] for r_id in requirements_by_id}

    for idx, entry in enumerate(assignments):
        # 1. H2: Period validity & No break assignment
        period = periods_by_id.get(entry.timetable_period_id)
        if not period:
            errors.append(f"Assignment {idx}: Unknown period ID '{entry.timetable_period_id}'.")
            continue

        if not period.is_active:
            errors.append(f"Assignment {idx}: Assigned to inactive period '{period.id}'.")

        if period.is_break:
            errors.append(
                f"Assignment {idx}: H2 VIOLATION — Assigned to break period '{period.id}' "
                f"(Day {period.day_of_week}, P{period.period_number})."
            )

        # 2. H3: Section conflict
        sec_key = (entry.section_id, entry.timetable_period_id)
        if sec_key in section_slots:
            errors.append(
                f"H3 VIOLATION (Section Conflict): Section '{entry.section_id}' has multiple assignments "
                f"in period '{entry.timetable_period_id}' (Day {period.day_of_week}, P{period.period_number})."
            )
        section_slots[sec_key] = idx

        # 3. H4: Faculty conflict
        fac_key = (entry.faculty_id, entry.timetable_period_id)
        if fac_key in faculty_slots:
            errors.append(
                f"H4 VIOLATION (Faculty Conflict): Faculty '{entry.faculty_id}' has multiple assignments "
                f"in period '{entry.timetable_period_id}' (Day {period.day_of_week}, P{period.period_number})."
            )
        faculty_slots[fac_key] = idx

        # 4. H5: Classroom conflict
        room_key = (entry.classroom_id, entry.timetable_period_id)
        if room_key in classroom_slots:
            errors.append(
                f"H5 VIOLATION (Classroom Conflict): Classroom '{entry.classroom_id}' has multiple assignments "
                f"in period '{entry.timetable_period_id}' (Day {period.day_of_week}, P{period.period_number})."
            )
        classroom_slots[room_key] = idx

        # 5. H6: Faculty availability
        if (entry.faculty_id, period.day_of_week, period.period_number) in faculty_unavailable:
            errors.append(
                f"H6 VIOLATION (Faculty Availability): Faculty '{entry.faculty_id}' assigned during unavailable "
                f"slot (Day {period.day_of_week}, P{period.period_number})."
            )

        # 6. H7: Classroom availability
        room = classrooms_by_id.get(entry.classroom_id)
        if not room:
            errors.append(f"Assignment {idx}: Unknown classroom ID '{entry.classroom_id}'.")
        else:
            if not room.is_available:
                errors.append(f"H7 VIOLATION: Classroom '{entry.classroom_id}' is marked inactive/unavailable.")
            if entry.timetable_period_id in room.unavailable_period_ids:
                errors.append(
                    f"H7 VIOLATION: Classroom '{entry.classroom_id}' is unavailable for period '{entry.timetable_period_id}'."
                )

        # Find matching requirement
        matching_req = None
        for r in requirements_by_id.values():
            if r.section_id == entry.section_id and r.subject_id == entry.subject_id:
                matching_req = r
                break

        if matching_req:
            req_assignments[matching_req.id].append((entry, period))

            # 7. H8: Classroom capacity
            if room and matching_req.preferred_capacity:
                if room.capacity < matching_req.preferred_capacity:
                    errors.append(
                        f"H8 VIOLATION (Capacity): Classroom '{room.room_number}' capacity ({room.capacity}) "
                        f"is below required ({matching_req.preferred_capacity}) for requirement '{matching_req.id}'."
                    )

            # 8. H9: Laboratory compatibility
            if matching_req.requires_lab or entry.is_lab:
                if not room or ("lab" not in room.room_type.lower() and room.room_type != "LABORATORY"):
                    errors.append(
                        f"H9 VIOLATION (Lab Compatibility): Requirement '{matching_req.id}' requires laboratory "
                        f"but was assigned non-lab room '{room.room_number if room else 'unknown'}' (type: {room.room_type if room else 'unknown'})."
                    )

    # 9. H1: Exact weekly periods & Occurrence uniqueness & Consecutive blocks
    for req_id, req in requirements_by_id.items():
        assigned = req_assignments[req_id]
        total_assigned = len(assigned)

        if total_assigned != req.weekly_periods:
            errors.append(
                f"H1 VIOLATION (Weekly Count): Requirement '{req_id}' (Subject: {req.subject_id}) "
                f"requires {req.weekly_periods} periods but received {total_assigned}."
            )

        # Check occurrence uniqueness (1..weekly_periods)
        occurrences = [e[0].occurrence_index for e in assigned]
        if len(set(occurrences)) != len(occurrences):
            errors.append(f"Occurrence Violation: Duplicate occurrence indices for requirement '{req_id}': {occurrences}")

        # Check max periods per day
        by_day: Dict[int, List[Tuple[Any, PeriodSlotSchema]]] = {}
        for entry, p in assigned:
            by_day.setdefault(p.day_of_week, []).append((entry, p))

        effective_max = max(req.max_periods_per_day or 0, req.consecutive_periods)
        for day, day_entries in by_day.items():
            if effective_max and len(day_entries) > effective_max:
                errors.append(
                    f"Max Periods Per Day Violation: Requirement '{req_id}' has {len(day_entries)} periods "
                    f"on day {day}, exceeding limit of {effective_max}."
                )

        # Check consecutive periods
        c = req.consecutive_periods
        if c > 1 and total_assigned > 0:
            # Group by day and classroom to verify blocks
            for day, day_entries in by_day.items():
                if len(day_entries) % c != 0:
                    errors.append(
                        f"Consecutive Block Violation: Requirement '{req_id}' on day {day} has {len(day_entries)} "
                        f"periods, which is not a multiple of consecutive block size {c}."
                    )
                # Sort day entries by period_number
                sorted_entries = sorted(day_entries, key=lambda x: x[1].period_number)
                # Check each chunk of c entries
                for i in range(0, len(sorted_entries), c):
                    chunk = sorted_entries[i : i + c]
                    if len(chunk) == c:
                        # Must use the same classroom
                        rooms = {e[0].classroom_id for e in chunk}
                        if len(rooms) > 1:
                            errors.append(
                                f"Consecutive Block Violation: Requirement '{req_id}' block uses multiple "
                                f"classrooms across consecutive periods: {rooms}"
                            )
                        # Must be strictly sequential: p_num, p_num+1, p_num+2...
                        period_numbers = [e[1].period_number for e in chunk]
                        expected_numbers = list(range(period_numbers[0], period_numbers[0] + c))
                        if period_numbers != expected_numbers:
                            errors.append(
                                f"Consecutive Block Violation: Requirement '{req_id}' block periods on day {day} "
                                f"are not sequential: got {period_numbers}, expected {expected_numbers}."
                            )

    return errors
