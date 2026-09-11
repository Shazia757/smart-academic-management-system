from fastapi import APIRouter, HTTPException, status
from app.schemas.timetable import SchedulingInputSchema, SchedulingOutputSchema
from app.solver.timetable_solver import TimetableSolver

router = APIRouter(prefix="/timetable", tags=["Timetable"])
_solver = TimetableSolver()


@router.post("/solve", response_model=SchedulingOutputSchema)
async def solve_timetable(problem: SchedulingInputSchema) -> SchedulingOutputSchema:
    """
    Executes the pure Google OR-Tools CP-SAT Timetable Constraint Solver.
    
    Validates institutional scheduling input, decomposes requirements into contiguous blocks,
    and returns a conflict-free timetable satisfying all hard constraints (H1 - H9).
    Operates strictly in-memory without connecting to or writing to Supabase.
    """
    try:
        result = _solver.solve(problem)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unexpected error during timetable optimization: {str(e)}",
        )
