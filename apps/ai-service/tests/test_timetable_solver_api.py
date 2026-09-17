"""
API tests for FastAPI Timetable Solver Endpoints (/api/v1/timetable/solve and /api/v1/timetable/generate).

Covers:
1. Valid generation request (200 OK)
2. Invalid request body (422 Unprocessable Entity)
3. Missing required fields (422 Unprocessable Entity)
4. Unauthorized access rejection (401 without valid API key)
5. Infeasible generation response (409 Conflict)
6. Timeout response (504 or TIME_LIMIT status)
7. Structured error response (no raw stack trace leakage)
8. Successful schedule response with valid entries and diagnostics
9. Generation request wrapper support (/generate with TimetableGenerationRequestSchema)
"""

import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.config import settings
from tests.test_timetable_solver_unit import make_base_problem

client = TestClient(app)
AUTH_HEADERS = {"X-Internal-API-Key": settings.INTERNAL_API_KEY}


# 1. Valid generation request (200 OK)
def test_api_1_valid_solve_request():
    prob = make_base_problem()
    payload = prob.model_dump()

    response = client.post("/api/v1/timetable/solve", json=payload, headers=AUTH_HEADERS)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] in ("OPTIMAL", "FEASIBLE")
    assert len(data["entries"]) == 2
    assert data["total_assigned_sessions"] == 2
    assert data["is_complete"] is True
    assert "diagnostics" in data


# 2. Invalid request body (422 Unprocessable Entity)
def test_api_2_invalid_request_body():
    response = client.post(
        "/api/v1/timetable/solve",
        json={"configuration": "not-an-object", "periods": []},
        headers=AUTH_HEADERS,
    )
    assert response.status_code == 422
    data = response.json()
    assert "detail" in data


# 3. Missing required fields (422 Unprocessable Entity)
def test_api_3_missing_required_fields():
    response = client.post(
        "/api/v1/timetable/solve",
        json={},
        headers=AUTH_HEADERS,
    )
    assert response.status_code == 422
    data = response.json()
    assert "detail" in data


# 4. Unauthorized access rejection (401 without valid API key)
def test_api_4_unauthorized_access_rejection():
    prob = make_base_problem()
    payload = prob.model_dump()

    # No header
    res1 = client.post("/api/v1/timetable/solve", json=payload)
    assert res1.status_code == 401
    assert "Missing or invalid internal API key" in res1.json()["detail"]

    # Wrong header
    res2 = client.post(
        "/api/v1/timetable/solve",
        json=payload,
        headers={"X-Internal-API-Key": "wrong_secret_key"},
    )
    assert res2.status_code == 401


# 5. Infeasible generation response (409 Conflict)
def test_api_5_infeasible_generation_response():
    prob = make_base_problem()
    # Request 20 periods when only 8 slots exist
    prob.scheduling_requirements[0].weekly_periods = 20
    payload = prob.model_dump()

    response = client.post("/api/v1/timetable/solve", json=payload, headers=AUTH_HEADERS)
    assert response.status_code == 409
    data = response.json()
    assert data["status"] == "INFEASIBLE"
    assert data["entries"] == []
    assert data["is_complete"] is False


# 6. Timeout response (504 or 200 with status TIME_LIMIT / FEASIBLE)
def test_api_6_timeout_response():
    prob = make_base_problem()
    prob.solver_config.max_solve_time_seconds = 0.1
    payload = prob.model_dump()

    response = client.post("/api/v1/timetable/solve", json=payload, headers=AUTH_HEADERS)
    # Status code can be 504 (if solver times out) or 200 (if solved before 0.1s)
    assert response.status_code in (504, 200)
    data = response.json()
    assert data["status"] in ("TIME_LIMIT", "OPTIMAL", "FEASIBLE")


# 7. Structured error response (no raw stack trace leakage)
def test_api_7_structured_error_no_stack_trace():
    prob = make_base_problem()
    prob.scheduling_requirements[0].section_id = "unknown-sec"
    payload = prob.model_dump()

    response = client.post("/api/v1/timetable/solve", json=payload, headers=AUTH_HEADERS)
    assert response.status_code in (400, 422)
    data = response.json()
    assert "Traceback" not in str(data)
    assert data["status"] == "MODEL_INVALID"


# 8. Successful schedule response via /generate endpoint
def test_api_8_generate_endpoint_direct():
    prob = make_base_problem()
    payload = prob.model_dump()

    response = client.post("/api/v1/timetable/generate", json=payload, headers=AUTH_HEADERS)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] in ("OPTIMAL", "FEASIBLE")
    assert len(data["entries"]) == 2


# 9. Wrapped TimetableGenerationRequestSchema via /generate endpoint
def test_api_9_generate_endpoint_wrapped():
    prob = make_base_problem()
    wrapper_payload = {
        "configuration_id": prob.configuration.id,
        "problem": prob.model_dump(),
        "timeout_seconds": 10,
        "preview_only": True,
    }

    response = client.post("/api/v1/timetable/generate", json=wrapper_payload, headers=AUTH_HEADERS)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] in ("OPTIMAL", "FEASIBLE")
    assert len(data["entries"]) == 2
