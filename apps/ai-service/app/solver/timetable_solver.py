import time
from typing import Dict, List, Tuple, Optional, Set
import ortools
from ortools.sat.python import cp_model

from app.schemas.timetable import (
    SchedulingInputSchema,
    SchedulingOutputSchema,
    ScheduledEntrySchema,
    UnassignedSessionSchema,
    PeriodSlotSchema,
    ClassroomSchema,
    SubjectSchema,
    SchedulingRequirementSchema,
    SolverConfigurationSchema,
    ObjectiveWeightsSchema,
)
from app.solver.validator import validate_solver_result


class TimetableSolver:
    """
    Production-grade Google OR-Tools CP-SAT Timetable Constraint Optimization Solver.
    
    Transforms a normalized academic scheduling problem into a conflict-free, deterministic
    timetable satisfying institutional hard constraints (5.1 - 5.13) and optimizing
    soft constraints according to configurable objective weights.
    Operates strictly in-memory without connecting to or writing to Supabase.
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
            objective_weights=ObjectiveWeightsSchema(),
            preview_only=True,
            allow_partial=False,
        )
        weights = cfg.objective_weights or ObjectiveWeightsSchema()
        allow_partial = getattr(cfg, "allow_partial", False)

        # 2. Reference Validation (5.9, 5.10, block integrity)
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
                validation_errors=val_errors,
                error_message="; ".join(val_errors),
                total_assigned_sessions=0,
                total_required_sessions=sum(r.weekly_periods for r in problem.scheduling_requirements if r.is_active),
                is_complete=False,
            )

        # 3. Filter and Index Periods (5.11, 5.12)
        # Only active, non-break periods within working schedule
        valid_periods: List[PeriodSlotSchema] = [
            p for p in problem.periods if p.is_active and not p.is_break
        ]

        active_reqs = [r for r in problem.scheduling_requirements if r.is_active]
        total_req_periods = sum(r.weekly_periods for r in active_reqs)

        if not valid_periods:
            duration_ms = (time.perf_counter() - start_time) * 1000.0
            return SchedulingOutputSchema(
                status="MODEL_INVALID",
                solver_name="OR-Tools CP-SAT",
                solver_version=self.solver_version,
                solve_duration_ms=round(duration_ms, 2),
                entries=[],
                diagnostics=["No active, non-break timetable period slots provided."],
                validation_errors=["No active, non-break timetable periods provided."],
                error_message="No active, non-break timetable periods provided.",
                total_assigned_sessions=0,
                total_required_sessions=total_req_periods,
                is_complete=False,
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

        # Faculty unavailable slots: (faculty_id, day, period_number) (5.5)
        fac_unavailable: Set[Tuple[str, int, int]] = set()
        for fa in problem.faculty_availability:
            slot = fa.period_slot if fa.period_slot is not None else fa.period_number
            if slot is not None and (not fa.is_available or fa.availability_status == "UNAVAILABLE"):
                fac_unavailable.add((fa.faculty_id, fa.day_of_week, slot))

        if not active_reqs:
            duration_ms = (time.perf_counter() - start_time) * 1000.0
            return SchedulingOutputSchema(
                status="OPTIMAL",
                solver_name="OR-Tools CP-SAT",
                solver_version=self.solver_version,
                solve_duration_ms=round(duration_ms, 2),
                entries=[],
                diagnostics=["No active scheduling requirements to schedule."],
                total_assigned_sessions=0,
                total_required_sessions=0,
                is_complete=True,
            )

        # 5. Build CP-SAT Model
        model = cp_model.CpModel()

        # Variable structure:
        # req_id -> list of blocks -> list of candidates:
        # candidate = (start_period_obj, classroom_obj, covered_period_objs, bool_var)
        req_blocks_candidates: Dict[str, List[List[Tuple[PeriodSlotSchema, ClassroomSchema, List[PeriodSlotSchema], cp_model.IntVar]]]] = {}
        # block_assigned_vars: (req_id, block_index) -> bool_var indicating if block is assigned
        block_assigned_vars: Dict[Tuple[str, int], cp_model.IntVar] = {}

        # Conflict aggregation structures:
        # (section_id, period_id) -> list of bool vars (5.3)
        section_period_vars: Dict[Tuple[str, str], List[cp_model.IntVar]] = {}
        # (faculty_id, period_id) -> list of bool vars (5.2)
        faculty_period_vars: Dict[Tuple[str, str], List[cp_model.IntVar]] = {}
        # (classroom_id, period_id) -> list of bool vars (5.4)
        classroom_period_vars: Dict[Tuple[str, str], List[cp_model.IntVar]] = {}
        # (req_id, day) -> list of (block_size, bool_var)
        req_day_vars: Dict[Tuple[str, int], List[Tuple[int, cp_model.IntVar]]] = {}
        # (req_id, day) -> list of (start_period_number, block_size, bool_var) for min gap
        req_day_start_vars: Dict[Tuple[str, int], List[Tuple[int, int, cp_model.IntVar]]] = {}
        # Faculty day period indicator: (faculty_id, day, period_number) -> list of bool_var
        faculty_day_period_vars: Dict[Tuple[str, int, int], List[cp_model.IntVar]] = {}
        # (req_id, classroom_id) -> list of bool_var for room consistency
        req_room_vars: Dict[Tuple[str, str], List[cp_model.IntVar]] = {}

        presolve_infeasible_reasons: List[str] = []

        for req in active_reqs:
            w = req.weekly_periods
            c = req.consecutive_periods
            num_blocks = w // c

            # Resolve assigned faculty (5.9)
            faculty_id = req.faculty_id or fac_assign_map.get((req.section_id, req.subject_id))
            if not faculty_id:
                presolve_infeasible_reasons.append(
                    f"No faculty assignment found for section '{req.section_id}' and subject '{req.subject_id}'."
                )
                continue

            subject = subjects_by_id[req.subject_id]
            is_lab_req = req.requires_lab or subject.is_lab
            section = sections_by_id.get(req.section_id)
            required_capacity = max(req.preferred_capacity or 0, section.capacity if section else 0)

            # Filter candidate classrooms based on capacity (5.7) and lab compatibility (5.8)
            candidate_rooms: List[ClassroomSchema] = []
            for room in classrooms_by_id.values():
                # 5.7 Capacity check
                if required_capacity > 0 and room.capacity < required_capacity:
                    continue

                # 5.8 Laboratory compatibility check
                is_lab_room = "lab" in room.room_type.lower() or room.room_type == "LABORATORY"
                if is_lab_req:
                    if not is_lab_room:
                        continue
                else:
                    # Non-lab requirements must not use labs if non-lab rooms exist
                    if is_lab_room:
                        continue

                candidate_rooms.append(room)

            if not candidate_rooms:
                presolve_infeasible_reasons.append(
                    f"Requirement '{req.id}' (Subject '{subject.code}', Lab={is_lab_req}, RequiredCap={required_capacity}) "
                    f"has zero compatible classrooms."
                )

            # Find all valid same-day consecutive start periods of length c (5.11, 5.12)
            valid_block_starts: List[Tuple[PeriodSlotSchema, List[PeriodSlotSchema]]] = []
            for day in sorted(days_present):
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

            # Build candidate variables for each block
            req_blocks: List[List[Tuple[PeriodSlotSchema, ClassroomSchema, List[PeriodSlotSchema], cp_model.IntVar]]] = []

            for b in range(num_blocks):
                block_candidates = []
                for start_p, slots in valid_block_starts:
                    # Check 5.5: Faculty availability across all slots in block
                    fac_ok = True
                    for slot_p in slots:
                        if (faculty_id, slot_p.day_of_week, slot_p.period_number) in fac_unavailable:
                            fac_ok = False
                            break
                    if not fac_ok:
                        continue

                    for room in candidate_rooms:
                        # Check 5.6: Classroom availability across all slots in block
                        room_ok = True
                        for slot_p in slots:
                            if slot_p.id in room.unavailable_period_ids:
                                room_ok = False
                                break
                        if not room_ok:
                            continue

                        # Feasible candidate found! Create boolean decision variable: x[session, day, slot, room]
                        var_name = f"x_{req.id}_{b}_{start_p.day_of_week}_{start_p.period_number}_{room.id}"
                        var = model.new_bool_var(var_name)
                        block_candidates.append((start_p, room, slots, var))

                        # Map to conflict trackers
                        for slot_p in slots:
                            section_period_vars.setdefault((req.section_id, slot_p.id), []).append(var)
                            faculty_period_vars.setdefault((faculty_id, slot_p.id), []).append(var)
                            classroom_period_vars.setdefault((room.id, slot_p.id), []).append(var)
                            faculty_day_period_vars.setdefault(
                                (faculty_id, slot_p.day_of_week, slot_p.period_number), []
                            ).append(var)

                        req_day_vars.setdefault((req.id, start_p.day_of_week), []).append((c, var))
                        req_day_start_vars.setdefault((req.id, start_p.day_of_week), []).append(
                            (start_p.period_number, c, var)
                        )
                        req_room_vars.setdefault((req.id, room.id), []).append(var)

                if not block_candidates:
                    presolve_infeasible_reasons.append(
                        f"Requirement '{req.id}' (Subject '{subject.code}', Faculty '{faculty_id}') block {b+1}/{num_blocks} "
                        f"has zero feasible (slot, classroom) candidates."
                    )

                req_blocks.append(block_candidates)

            req_blocks_candidates[req.id] = req_blocks

        # If any requirement has zero candidates and partial solve is disabled, problem is provably infeasible
        if presolve_infeasible_reasons and not allow_partial:
            duration_ms = (time.perf_counter() - start_time) * 1000.0
            return SchedulingOutputSchema(
                status="INFEASIBLE",
                solver_name="OR-Tools CP-SAT",
                solver_version=self.solver_version,
                solve_duration_ms=round(duration_ms, 2),
                entries=[],
                diagnostics=presolve_infeasible_reasons,
                validation_errors=presolve_infeasible_reasons,
                error_message="No feasible assignment exists for the supplied constraints.",
                total_assigned_sessions=0,
                total_required_sessions=total_req_periods,
                is_complete=False,
            )

        # ----------------------------------------------------------------------
        # Hard Constraints Implementation
        # ----------------------------------------------------------------------

        objective_terms = []

        # 5.1 Required Session Assignment
        for req_id, blocks in req_blocks_candidates.items():
            for b_idx, candidates in enumerate(blocks):
                vars_in_block = [cand[3] for cand in candidates]
                if allow_partial:
                    assigned_var = model.new_bool_var(f"assigned_{req_id}_{b_idx}")
                    block_assigned_vars[(req_id, b_idx)] = assigned_var
                    if vars_in_block:
                        model.add(sum(vars_in_block) == assigned_var)
                        # Big reward for assigning a required block
                        objective_terms.append(assigned_var * 1000)
                    else:
                        model.add(assigned_var == 0)
                else:
                    if vars_in_block:
                        model.add_exactly_one(vars_in_block)

        # 5.2 Faculty collision — at most one assignment per faculty and period
        for (fac_id, p_id), vars_list in faculty_period_vars.items():
            model.add_at_most_one(vars_list)

        # 5.3 Section collision — at most one assignment per section and period
        for (sec_id, p_id), vars_list in section_period_vars.items():
            model.add_at_most_one(vars_list)

        # 5.4 Classroom collision — at most one assignment per classroom and period
        for (room_id, p_id), vars_list in classroom_period_vars.items():
            model.add_at_most_one(vars_list)

        # Max periods per day (per requirement)
        for req in active_reqs:
            max_limit = max(req.max_periods_per_day, req.consecutive_periods) if req.max_periods_per_day else req.consecutive_periods
            if max_limit and max_limit > 0:
                for day in days_present:
                    day_terms = req_day_vars.get((req.id, day), [])
                    if day_terms:
                        model.add(sum(sz * v for sz, v in day_terms) <= max_limit)

        # Minimum period gap between separate blocks of the same subject on the same day
        for req in active_reqs:
            if req.min_period_gap and req.min_period_gap > 0 and req.weekly_periods > req.consecutive_periods:
                gap = req.min_period_gap
                for day in days_present:
                    starts = req_day_start_vars.get((req.id, day), [])
                    for i in range(len(starts)):
                        p1_num, c1, v1 = starts[i]
                        for j in range(i + 1, len(starts)):
                            p2_num, c2, v2 = starts[j]
                            if p1_num <= p2_num:
                                if p2_num - (p1_num + c1) < gap:
                                    model.add(v1 + v2 <= 1)
                            else:
                                if p1_num - (p2_num + c2) < gap:
                                    model.add(v1 + v2 <= 1)

        # ----------------------------------------------------------------------
        # Soft Constraints Implementation (Weighted Objective Terms)
        # ----------------------------------------------------------------------

        # Soft Constraint 1: Spread sessions across the week
        if weights.spread_across_week > 0:
            for req in active_reqs:
                if req.weekly_periods > req.consecutive_periods:
                    for day in days_present:
                        day_terms = req_day_vars.get((req.id, day), [])
                        if day_terms:
                            day_active = model.new_bool_var(f"day_active_{req.id}_{day}")
                            day_vars = [v for _, v in day_terms]
                            # day_active is true if at least one block is on this day
                            model.add_max_equality(day_active, day_vars)
                            objective_terms.append(day_active * weights.spread_across_week)

        # Soft Constraint 2: Minimize faculty idle periods (gaps between classes)
        if weights.minimize_faculty_idle_periods > 0:
            faculty_ids = {fa.faculty_id for fa in problem.faculty_assignments}
            for fac_id in faculty_ids:
                for day in days_present:
                    # Indicator whether faculty teaches in each period of day
                    p_vars: Dict[int, cp_model.IntVar] = {}
                    for p_idx in range(1, problem.configuration.periods_per_day + 1):
                        slot_vars = faculty_day_period_vars.get((fac_id, day, p_idx), [])
                        if slot_vars:
                            teaches_slot = model.new_bool_var(f"f_teach_{fac_id}_{day}_{p_idx}")
                            model.add_max_equality(teaches_slot, slot_vars)
                            p_vars[p_idx] = teaches_slot

                    # Penalize 1-period idle hole: teaches p and p+2, but not p+1
                    for p_idx in range(1, problem.configuration.periods_per_day - 1):
                        if p_idx in p_vars and (p_idx + 2) in p_vars:
                            t1 = p_vars[p_idx]
                            t3 = p_vars[p_idx + 2]
                            t2 = p_vars.get(p_idx + 1)
                            hole = model.new_bool_var(f"f_hole_{fac_id}_{day}_{p_idx}")
                            if t2 is not None:
                                # hole >= t1 + t3 - t2 - 1
                                model.add(hole >= t1 + t3 - t2 - 1)
                            else:
                                model.add(hole >= t1 + t3 - 1)
                            objective_terms.append(hole * (-weights.minimize_faculty_idle_periods))

        # Soft Constraint 3: Room consistency
        if weights.prefer_consistent_room > 0:
            for req in active_reqs:
                for room_id in classrooms_by_id:
                    rvars = req_room_vars.get((req.id, room_id), [])
                    if len(rvars) > 1:
                        # Reward using the same room across multiple blocks
                        room_used = model.new_bool_var(f"req_room_used_{req.id}_{room_id}")
                        model.add_max_equality(room_used, rvars)
                        objective_terms.append(room_used * weights.prefer_consistent_room)

        # Set combined objective
        if objective_terms:
            model.maximize(sum(objective_terms))

        # ----------------------------------------------------------------------
        # Configure & Execute CP-SAT Solver (Step 7)
        # ----------------------------------------------------------------------
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = float(min(max(cfg.max_solve_time_seconds, 0.1), 300.0))
        solver.parameters.random_seed = int(cfg.random_seed)
        solver.parameters.num_search_workers = int(cfg.num_workers)
        solver.parameters.log_search_progress = bool(cfg.log_search_progress)

        status = solver.solve(model)
        duration_ms = (time.perf_counter() - start_time) * 1000.0

        if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            status_str = "OPTIMAL" if status == cp_model.OPTIMAL else "FEASIBLE"
            entries: List[ScheduledEntrySchema] = []
            unassigned_sessions: List[UnassignedSessionSchema] = []

            for req in active_reqs:
                faculty_id = req.faculty_id or fac_assign_map.get((req.section_id, req.subject_id))
                subject = subjects_by_id[req.subject_id]
                blocks = req_blocks_candidates[req.id]
                c = req.consecutive_periods

                for b_idx, candidates in enumerate(blocks):
                    block_scheduled = False
                    for start_p, room, slots, var in candidates:
                        if solver.boolean_value(var):
                            block_scheduled = True
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

                    if not block_scheduled:
                        unassigned_sessions.append(
                            UnassignedSessionSchema(
                                section_id=req.section_id,
                                subject_id=req.subject_id,
                                faculty_id=faculty_id,
                                block_index=b_idx,
                                required_periods=c,
                                reason="No candidate slot assigned in partial solve",
                            )
                        )

            # Sort entries deterministically by section, day, period_number, subject
            def sort_key(e: ScheduledEntrySchema):
                p = periods_by_id[e.timetable_period_id]
                return (e.section_id, p.day_of_week, p.period_number, e.subject_id)

            entries.sort(key=sort_key)

            total_assigned = len(entries)
            is_complete = total_assigned == total_req_periods
            final_status = status_str
            if not is_complete and allow_partial:
                final_status = "PARTIAL"

            raw_result = SchedulingOutputSchema(
                status=final_status,
                solver_name="OR-Tools CP-SAT",
                solver_version=self.solver_version,
                objective_score=solver.objective_value if model.has_objective() else None,
                solve_duration_ms=round(duration_ms, 2),
                total_assigned_sessions=total_assigned,
                total_required_sessions=total_req_periods,
                is_complete=is_complete,
                entries=entries,
                unassigned_sessions=unassigned_sessions,
                hard_constraint_violations=0,
                soft_constraint_violations=len(unassigned_sessions),
                diagnostics=[f"Successfully solved with status {final_status} in {round(duration_ms, 2)}ms."],
                metadata={
                    "total_assigned_periods": total_assigned,
                    "total_requirements": len(active_reqs),
                    "random_seed": cfg.random_seed,
                    "num_workers": cfg.num_workers,
                    "complete": is_complete,
                },
            )

            # ------------------------------------------------------------------
            # Independent Output Validation (Step 8)
            # ------------------------------------------------------------------
            validation_errors = validate_solver_result(problem, raw_result)
            if validation_errors:
                raw_result.status = "ERROR"
                raw_result.validation_errors = validation_errors
                raw_result.hard_constraint_violations = len(validation_errors)
                raw_result.error_message = f"Post-solve validation failed: {'; '.join(validation_errors)}"
                raw_result.diagnostics.extend(validation_errors)

            return raw_result

        elif status == cp_model.INFEASIBLE:
            return SchedulingOutputSchema(
                status="INFEASIBLE",
                solver_name="OR-Tools CP-SAT",
                solver_version=self.solver_version,
                solve_duration_ms=round(duration_ms, 2),
                total_assigned_sessions=0,
                total_required_sessions=total_req_periods,
                is_complete=False,
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
                total_assigned_sessions=0,
                total_required_sessions=total_req_periods,
                is_complete=False,
                entries=[],
                diagnostics=["CP-SAT model is invalid."],
                error_message="CP-SAT model is invalid.",
            )

        else:  # UNKNOWN / TIMEOUT
            is_timeout = duration_ms >= (cfg.max_solve_time_seconds * 1000.0 * 0.95)
            final_status = "TIME_LIMIT" if is_timeout else "UNKNOWN"
            msg = (
                f"Solver reached time limit of {cfg.max_solve_time_seconds}s before finding a feasible solution."
                if is_timeout
                else "Solver stopped before establishing feasibility."
            )
            return SchedulingOutputSchema(
                status=final_status,
                solver_name="OR-Tools CP-SAT",
                solver_version=self.solver_version,
                solve_duration_ms=round(duration_ms, 2),
                total_assigned_sessions=0,
                total_required_sessions=total_req_periods,
                is_complete=False,
                entries=[],
                diagnostics=[msg],
                warnings=[msg] if is_timeout else [],
                error_message=msg,
                metadata={"random_seed": cfg.random_seed, "num_workers": cfg.num_workers},
            )

    def _validate_references(self, problem: SchedulingInputSchema) -> List[str]:
        """Validates internal referential integrity before building CP-SAT model (5.9, 5.10)."""
        errors: List[str] = []
        section_ids = {s.id for s in problem.sections}
        subject_ids = {s.id for s in problem.subjects}
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
