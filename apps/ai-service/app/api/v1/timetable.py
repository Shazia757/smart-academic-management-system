from typing import Optional, Union
from fastapi import APIRouter, HTTPException, Header, status, Depends
from fastapi.responses import JSONResponse
from app.core.config import settings
from app.schemas.timetable import (
    SchedulingInputSchema,
    SchedulingOutputSchema,
    TimetableGenerationRequestSchema,
)
from app.solver.timetable_solver import TimetableSolver

router = APIRouter(prefix="/timetable", tags=["Timetable"])
_solver = TimetableSolver()


def verify_internal_api_key(x_internal_api_key: Optional[str] = Header(default=None)):
    """Verifies that incoming requests present the valid shared internal API key."""
    if not x_internal_api_key or x_internal_api_key != settings.INTERNAL_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid internal API key.",
        )
    return x_internal_api_key


def _execute_solve(problem: SchedulingInputSchema) -> JSONResponse:
    """Invokes solver and maps outcome to canonical HTTP status code with structured payload."""
    try:
        result = _solver.solve(problem)
        result_dict = result.model_dump()

        if result.status in ("OPTIMAL", "FEASIBLE", "PARTIAL"):
            return JSONResponse(status_code=status.HTTP_200_OK, content=result_dict)
        elif result.status == "INFEASIBLE":
            return JSONResponse(status_code=status.HTTP_409_CONFLICT, content=result_dict)
        elif result.status == "TIME_LIMIT":
            return JSONResponse(status_code=status.HTTP_504_GATEWAY_TIMEOUT, content=result_dict)
        elif result.status == "MODEL_INVALID":
            return JSONResponse(status_code=status.HTTP_400_BAD_REQUEST, content=result_dict)
        elif result.status == "ERROR":
            return JSONResponse(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, content=result_dict)
        else:
            return JSONResponse(status_code=status.HTTP_200_OK, content=result_dict)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unexpected internal error during timetable optimization.",
        )


@router.post(
    "/solve",
    response_model=SchedulingOutputSchema,
    dependencies=[Depends(verify_internal_api_key)],
    responses={
        200: {"description": "Optimal, feasible, or partial timetable generated successfully"},
        400: {"description": "Invalid model or configuration reference error"},
        401: {"description": "Unauthorized — missing or invalid internal API key"},
        409: {"description": "Infeasible problem constraints"},
        422: {"description": "Post-solve validation failed or payload unprocessable"},
        504: {"description": "Solver execution reached time limit"},
        500: {"description": "Internal server error"},
    },
)
async def solve_timetable(
    problem: SchedulingInputSchema,
    api_key: str = Depends(verify_internal_api_key),
) -> JSONResponse:
    """
    Executes the pure Google OR-Tools CP-SAT Timetable Constraint Solver.
    
    Validates institutional scheduling input, decomposes requirements into contiguous blocks,
    and returns a conflict-free timetable satisfying all hard constraints (5.1 - 5.13).
    Operates strictly in-memory without connecting to or writing to Supabase.
    """
    return _execute_solve(problem)


@router.post(
    "/generate",
    response_model=SchedulingOutputSchema,
    dependencies=[Depends(verify_internal_api_key)],
    responses={
        200: {"description": "Optimal, feasible, or partial timetable generated successfully"},
        400: {"description": "Invalid model or configuration reference error"},
        401: {"description": "Unauthorized — missing or invalid internal API key"},
        409: {"description": "Infeasible problem constraints"},
        422: {"description": "Post-solve validation failed or payload unprocessable"},
        504: {"description": "Solver execution reached time limit"},
        500: {"description": "Internal server error"},
    },
)
async def generate_timetable(
    request: Union[SchedulingInputSchema, TimetableGenerationRequestSchema],
    api_key: str = Depends(verify_internal_api_key),
) -> JSONResponse:
    """
    Alias generation endpoint matching Step 9 REST specification.
    Supports either direct SchedulingInputSchema or wrapped TimetableGenerationRequestSchema.
    """
    if isinstance(request, TimetableGenerationRequestSchema):
        if not request.problem:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Request must contain a valid 'problem' SchedulingInputSchema payload.",
            )
        problem = request.problem
        if request.timeout_seconds:
            problem.solver_timeout_seconds = request.timeout_seconds
        if request.objective_weights and problem.solver_config:
            problem.solver_config.objective_weights = request.objective_weights
        if request.allow_partial and problem.solver_config:
            problem.solver_config.allow_partial = request.allow_partial
    else:
        problem = request

    return _execute_solve(problem)
