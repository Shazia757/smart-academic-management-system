import time
from typing import Dict, List, Tuple, Optional, Set
import ortools
from ortools.sat.python import cp_model

from app.schemas.timetable import (
    SchedulingInputSchema,
    SchedulingOutputSchema,
    ScheduledEntrySchema,
    PeriodSlotSchema,
    ClassroomSchema,
    SubjectSchema,
    SchedulingRequirementSchema,
    SolverConfigurationSchema,
)


class TimetableSolver:
    """
    Production-grade Google OR-Tools CP-SAT Timetable Constraint Optimization Solver.
    
    Transforms a normalized academic scheduling problem into a conflict-free, deterministic
    timetable satisfying institutional hard constraints (H1 - H9).
    Does NOT connect to or query Supabase.
    """

    def __init__(self):
        self.solver_version = getattr(ortools, "__version__", "9.15.6755")

    def solve(self, problem: SchedulingInputSchema) -> SchedulingOutputSchema:
        start_time = time.perf_counter()

        # 1. Configuration & defaults
        cfg = problem.solver_config or SolverConfigurationSchema(
            max_solve_time_seconds=float(problem.solver_timeout_seconds),
            random_seed=42,
            num_workers=1,
            log_search_progress=False,
        )

        # 2. Reference Validation
        val_errors = self._validate_references(problem)
        if val_errors:
            duration_ms = (time.perf_counter() - start_time) * 1000.0
            return SchedulingOutputSchema(
                status="MODEL_INVALID",
                solver_name="OR-Tools CP-SAT",
                solver_version=self.solver_version,
                solve_duration_ms=round(duration_ms, 2),
                entries=[],
                diagnostics=val_errors,
                error_message="; ".join(val_errors),
            )

        # 3. Filter and Index Periods
        # Only active, non-break periods (H2)
        valid_periods: List[PeriodSlotSchema] = [
            p for p in problem.periods if p.is_active and not p.is_break
        ]

        if not valid_periods:
            duration_ms = (time.perf_counter() - start_time) * 1000.0
            return SchedulingOutputSchema(
                status="MODEL_INVALID",
                solver_name="OR-Tools CP-SAT",
                solver_version=self.solver_version,
                solve_duration_ms=round(duration_ms, 2),
                entries=[],
                diagnostics=["No active, non-break timetable period slots provided."],
                error_message="No active, non-break timetable periods provided.",
            )

        # Group periods by day and index by (day, period_number)
        periods_by_id: Dict[str, PeriodSlotSchema] = {p.id: p for p in valid_periods}
        periods_by_day_num: Dict[Tuple[int, int], PeriodSlotSchema] = {
            (p.day_of_week, p.period_number): p for p in valid_periods
        }
        days_present: Set[int] = {p.day_of_week for p in valid_periods}

        # 4. Lookup Maps
        sections_by_id = {s.id: s for s in problem.sections}
        subjects_by_id: Dict[str, SubjectSchema] = {s.id: s for s in problem.subjects}
        classrooms_by_id: Dict[str, ClassroomSchema] = {c.id: c for c in problem.classrooms if c.is_available}

        # Faculty assignments map: (section_id, subject_id) -> faculty_id
        fac_assign_map: Dict[Tuple[str, str], str] = {}
        for fa in problem.faculty_assignments:
            fac_assign_map[(fa.section_id, fa.subject_id)] = fa.faculty_id

        # Faculty unavailable slots: (faculty_id, day, period_number)
        fac_unavailable: Set[Tuple[str, int, int]] = set()
        for fa in problem.faculty_availability:
            slot = fa.period_slot if fa.period_slot is not None else fa.period_number
            if slot is not None and (not fa.is_available or fa.availability_status == "UNAVAILABLE"):
                fac_unavailable.add((fa.faculty_id, fa.day_of_week, slot))

        # Active scheduling requirements
        active_reqs = [r for r in problem.scheduling_requirements if r.is_active]
        if not active_reqs:
            duration_ms = (time.perf_counter() - start_time) * 1000.0
            return SchedulingOutputSchema(
                status="OPTIMAL",
                solver_name="OR-Tools CP-SAT",
                solver_version=self.solver_version,
                solve_duration_ms=round(duration_ms, 2),
                entries=[],
                diagnostics=["No active scheduling requirements to schedule."],
            )

        # 5. Build CP-SAT Model
        model = cp_model.CpModel()

        # Variable structure:
        # req_id -> list of blocks -> list of candidates:
        # candidate = (start_period_obj, classroom_obj, covered_period_objs, bool_var)
        req_blocks_candidates: Dict[str, List[List[Tuple[PeriodSlotSchema, ClassroomSchema, List[PeriodSlotSchema], cp_model.IntVar]]]] = {}

        # Conflict aggregation structures:
        # (section_id, period_id) -> list of bool vars
        section_period_vars: Dict[Tuple[str, str], List[cp_model.IntVar]] = {}
        # (faculty_id, period_id) -> list of bool vars
        faculty_period_vars: Dict[Tuple[str, str], List[cp_model.IntVar]] = {}
        # (classroom_id, period_id) -> list of bool vars
        classroom_period_vars: Dict[Tuple[str, str], List[cp_model.IntVar]] = {}
        # (req_id, day) -> list of (block_size, bool_var)
        req_day_vars: Dict[Tuple[str, int], List[Tuple[int, cp_model.IntVar]]] = {}
        # (req_id, day) -> list of (start_period_number, block_size, bool_var) for min gap
        req_day_start_vars: Dict[Tuple[str, int], List[Tuple[int, int, cp_model.IntVar]]] = {}

        presolve_infeasible_reasons: List[str] = []

        for req in active_reqs:
            w = req.weekly_periods
            c = req.consecutive_periods
            num_blocks = w // c

            # Resolve assigned faculty
            faculty_id = req.faculty_id or fac_assign_map.get((req.section_id, req.subject_id))
            if not faculty_id:
                presolve_infeasible_reasons.append(
                    f"No faculty assignment found for section '{req.section_id}' and subject '{req.subject_id}'."
                )
                continue

            subject = subjects_by_id[req.subject_id]
            is_lab_req = req.requires_lab or subject.is_lab

            # Filter candidate classrooms based on capacity (H8) and lab compatibility (H9)
            candidate_rooms: List[ClassroomSchema] = []
            for room in classrooms_by_id.values():
                # H8: Capacity check
                if req.preferred_capacity and room.capacity < req.preferred_capacity:
                    continue
                # H9: Laboratory compatibility
                if is_lab_req:
                    if "lab" not in room.room_type.lower() and room.room_type != "LABORATORY":
                        continue
                else:
                    # Non-lab requirements prefer non-lab rooms unless no other option
                    pass
                candidate_rooms.append(room)

            if not candidate_rooms:
                presolve_infeasible_reasons.append(
                    f"Requirement '{req.id}' (Subject '{subject.code}', Lab={is_lab_req}, Cap={req.preferred_capacity}) "
                    f"has zero compatible classrooms."
                )

            # Find all valid same-day consecutive start periods of length c
            valid_block_starts: List[Tuple[PeriodSlotSchema, List[PeriodSlotSchema]]] = []
            for day in sorted(days_present):
                # Check candidate days
                for p_idx in range(1, problem.configuration.periods_per_day + 1):
                    start_p = periods_by_day_num.get((day, p_idx))
                    if not start_p:
                        continue
                    # Check if all c periods exist, are contiguous, and on the same day
                    consecutive_slots: List[PeriodSlotSchema] = []
                    all_contiguous = True
                    for offset in range(c):
                        target_p = periods_by_day_num.get((day, p_idx + offset))
                        if not target_p:
                            all_contiguous = False
                            break
                        consecutive_slots.append(target_p)

                    if all_contiguous and len(consecutive_slots) == c:
                        valid_block_starts.append((start_p, consecutive_slots))

            # Build candidates for each block of this requirement
            req_blocks: List[List[Tuple[PeriodSlotSchema, ClassroomSchema, List[PeriodSlotSchema], cp_model.IntVar]]] = []

            for b in range(num_blocks):
                block_candidates = []
                for start_p, slots in valid_block_starts:
                    # Check H6: Faculty availability across all slots in block
                    fac_ok = True
                    for slot_p in slots:
                        if (faculty_id, slot_p.day_of_week, slot_p.period_number) in fac_unavailable:
                            fac_ok = False
                            break
                    if not fac_ok:
                        continue

                    for room in candidate_rooms:
                        # Check H7: Classroom availability across all slots in block
                        room_ok = True
                        for slot_p in slots:
                            if slot_p.id in room.unavailable_period_ids:
                                room_ok = False
                                break
                        if not room_ok:
                            continue

                        # Feasible candidate found! Create boolean decision variable
                        var_name = f"Y_{req.id}_{b}_{start_p.id}_{room.id}"
                        var = model.NewBoolVar(var_name)
                        block_candidates.append((start_p, room, slots, var))

                        # Map to conflict trackers
                        for slot_p in slots:
                            section_period_vars.setdefault((req.section_id, slot_p.id), []).append(var)
                            faculty_period_vars.setdefault((faculty_id, slot_p.id), []).append(var)
                            classroom_period_vars.setdefault((room.id, slot_p.id), []).append(var)

                        req_day_vars.setdefault((req.id, start_p.day_of_week), []).append((c, var))
                        req_day_start_vars.setdefault((req.id, start_p.day_of_week), []).append((start_p.period_number, c, var))

                if not block_candidates:
                    presolve_infeasible_reasons.append(
                        f"Requirement '{req.id}' (Subject '{subject.code}', Faculty '{faculty_id}') block {b+1}/{num_blocks} "
                        f"has zero feasible (slot, classroom) candidates."
                    )

                req_blocks.append(block_candidates)

            req_blocks_candidates[req.id] = req_blocks

        # If any requirement has zero candidates, the problem is provably infeasible
        if presolve_infeasible_reasons:
            duration_ms = (time.perf_counter() - start_time) * 1000.0
            return SchedulingOutputSchema(
                status="INFEASIBLE",
                solver_name="OR-Tools CP-SAT",
                solver_version=self.solver_version,
                solve_duration_ms=round(duration_ms, 2),
                entries=[],
                diagnostics=presolve_infeasible_reasons,
                error_message="No feasible assignment exists for the supplied constraints.",
            )

        # ----------------------------------------------------------------------
        # Hard Constraints Implementation
        # ----------------------------------------------------------------------

        # H1: Exactly one assignment candidate chosen per block
        for req_id, blocks in req_blocks_candidates.items():
            for b_idx, candidates in enumerate(blocks):
                vars_in_block = [cand[3] for cand in candidates]
                model.AddExactlyOne(vars_in_block)

        # H3: Section conflict — at most one assignment per section and period
        for (sec_id, p_id), vars_list in section_period_vars.items():
            model.AddAtMostOne(vars_list)

        # H4: Faculty conflict — at most one assignment per faculty and period
        for (fac_id, p_id), vars_list in faculty_period_vars.items():
            model.AddAtMostOne(vars_list)

        # H5: Classroom conflict — at most one assignment per classroom and period
        for (room_id, p_id), vars_list in classroom_period_vars.items():
            model.AddAtMostOne(vars_list)

        # Max periods per day (per requirement)
        for req in active_reqs:
            max_limit = max(req.max_periods_per_day, req.consecutive_periods) if req.max_periods_per_day else req.consecutive_periods
            if max_limit and max_limit > 0:
                for day in days_present:
                    day_terms = req_day_vars.get((req.id, day), [])
                    if day_terms:
                        model.Add(sum(sz * v for sz, v in day_terms) <= max_limit)

        # Minimum period gap between separate blocks of the same subject on the same day
        for req in active_reqs:
            if req.min_period_gap and req.min_period_gap > 0 and req.weekly_periods > req.consecutive_periods:
                gap = req.min_period_gap
                for day in days_present:
                    starts = req_day_start_vars.get((req.id, day), [])
                    # If two candidates on the same day would overlap or violate gap
                    for i in range(len(starts)):
                        p1_num, c1, v1 = starts[i]
                        for j in range(i + 1, len(starts)):
                            p2_num, c2, v2 = starts[j]
                            # Distance between blocks
                            if p1_num <= p2_num:
                                if p2_num - (p1_num + c1) < gap:
                                    model.Add(v1 + v2 <= 1)
                            else:
                                if p1_num - (p2_num + c2) < gap:
                                    model.Add(v1 + v2 <= 1)

        # ----------------------------------------------------------------------
        # Configure & Execute CP-SAT Solver
        # ----------------------------------------------------------------------
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = float(cfg.max_solve_time_seconds)
        solver.parameters.random_seed = int(cfg.random_seed)
        solver.parameters.num_search_workers = int(cfg.num_workers)
        solver.parameters.log_search_progress = bool(cfg.log_search_progress)

        status = solver.Solve(model)
        duration_ms = (time.perf_counter() - start_time) * 1000.0

        if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            status_str = "OPTIMAL" if status == cp_model.OPTIMAL else "FEASIBLE"
            entries: List[ScheduledEntrySchema] = []

            for req in active_reqs:
                faculty_id = req.faculty_id or fac_assign_map.get((req.section_id, req.subject_id))
                subject = subjects_by_id[req.subject_id]
                blocks = req_blocks_candidates[req.id]
                c = req.consecutive_periods

                for b_idx, candidates in enumerate(blocks):
                    for start_p, room, slots, var in candidates:
                        if solver.BooleanValue(var):
                            for k, slot_p in enumerate(slots):
                                occ_idx = b_idx * c + k + 1
                                entries.append(
                                    ScheduledEntrySchema(
                                        section_id=req.section_id,
                                        subject_id=req.subject_id,
                                        faculty_id=faculty_id,
                                        classroom_id=room.id,
                                        timetable_period_id=slot_p.id,
                                        occurrence_index=occ_idx,
                                        session_type=subject.subject_type,
                                        is_lab=req.requires_lab or subject.is_lab,
                                        notes=f"Block {b_idx + 1}, slot {k + 1}/{c}",
                                    )
                                )
                            break

            # Sort entries deterministically by section, day, period_number, subject
            def sort_key(e: ScheduledEntrySchema):
                p = periods_by_id[e.timetable_period_id]
                return (e.section_id, p.day_of_week, p.period_number, e.subject_id)

            entries.sort(key=sort_key)

            return SchedulingOutputSchema(
                status=status_str,
                solver_name="OR-Tools CP-SAT",
                solver_version=self.solver_version,
                objective_score=solver.ObjectiveValue() if model.HasObjective() else None,
                solve_duration_ms=round(duration_ms, 2),
                entries=entries,
                hard_constraint_violations=0,
                soft_constraint_violations=0,
                diagnostics=[f"Successfully solved with status {status_str} in {round(duration_ms, 2)}ms."],
                metadata={
                    "total_assigned_periods": len(entries),
                    "total_requirements": len(active_reqs),
                    "random_seed": cfg.random_seed,
                    "num_workers": cfg.num_workers,
                },
            )

        elif status == cp_model.INFEASIBLE:
            return SchedulingOutputSchema(
                status="INFEASIBLE",
                solver_name="OR-Tools CP-SAT",
                solver_version=self.solver_version,
                solve_duration_ms=round(duration_ms, 2),
                entries=[],
                diagnostics=["No feasible assignment exists for the supplied constraints."],
                error_message="No feasible assignment exists for the supplied constraints.",
                metadata={"random_seed": cfg.random_seed, "num_workers": cfg.num_workers},
            )

        elif status == cp_model.MODEL_INVALID:
            return SchedulingOutputSchema(
                status="MODEL_INVALID",
                solver_name="OR-Tools CP-SAT",
                solver_version=self.solver_version,
                solve_duration_ms=round(duration_ms, 2),
                entries=[],
                diagnostics=["CP-SAT model is invalid."],
                error_message="CP-SAT model is invalid.",
            )

        else:  # UNKNOWN / TIMEOUT
            return SchedulingOutputSchema(
                status="UNKNOWN",
                solver_name="OR-Tools CP-SAT",
                solver_version=self.solver_version,
                solve_duration_ms=round(duration_ms, 2),
                entries=[],
                diagnostics=["Solver timed out or stopped before establishing feasibility."],
                error_message="Solver timed out or stopped before establishing feasibility.",
                metadata={"random_seed": cfg.random_seed, "num_workers": cfg.num_workers},
            )

    def _validate_references(self, problem: SchedulingInputSchema) -> List[str]:
        """Validates internal referential integrity before building CP-SAT model."""
        errors: List[str] = []
        section_ids = {s.id for s in problem.sections}
        subject_ids = {s.id for s in problem.subjects}
        classroom_ids = {c.id for c in problem.classrooms}
        period_ids = {p.id for p in problem.periods}

        fac_assign_keys = {(fa.section_id, fa.subject_id): fa.faculty_id for fa in problem.faculty_assignments}

        for r in problem.scheduling_requirements:
            if not r.is_active:
                continue

            if r.section_id not in section_ids:
                errors.append(f"Requirement '{r.id}' references unknown section ID '{r.section_id}'.")

            if r.subject_id not in subject_ids:
                errors.append(f"Requirement '{r.id}' references unknown subject ID '{r.subject_id}'.")

            faculty_id = r.faculty_id or fac_assign_keys.get((r.section_id, r.subject_id))
            if not faculty_id:
                errors.append(
                    f"Requirement '{r.id}' for section '{r.section_id}' and subject '{r.subject_id}' has no designated faculty."
                )

            # Block decomposition integrity: weekly_periods must be evenly divisible by consecutive_periods
            w = r.weekly_periods
            c = r.consecutive_periods
            if c > 0 and w % c != 0:
                errors.append(
                    f"Requirement '{r.id}' has weekly_periods={w} which is not evenly divisible by consecutive_periods={c}."
                )

        # Verify classrooms unavailable period IDs
        for c in problem.classrooms:
            for pid in c.unavailable_period_ids:
                if pid not in period_ids:
                    errors.append(f"Classroom '{c.id}' references unknown unavailable period ID '{pid}'.")

        return errors
