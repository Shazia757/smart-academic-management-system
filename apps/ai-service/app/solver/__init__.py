"""
OR-Tools CP-SAT Timetable Solver Package for SAMS
"""

from app.solver.timetable_solver import TimetableSolver
from app.solver.validator import validate_solver_result

__all__ = ["TimetableSolver", "validate_solver_result"]
