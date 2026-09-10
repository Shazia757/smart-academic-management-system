import time
from fastapi import APIRouter
from app.core.config import settings
from app.schemas.health import HealthResponse, CalibrationConfig, SystemCapabilities

router = APIRouter(tags=["Health"])
_START_TIME = time.time()


@router.get("/health", response_model=HealthResponse)
async def get_health_check() -> HealthResponse:
    """
    Returns the real-time operational status of the AI Microservice,
    including current face recognition calibration thresholds and active modules.
    """
    uptime = time.time() - _START_TIME
    return HealthResponse(
        status="healthy",
        service="sams-ai-service",
        version=settings.VERSION,
        environment=settings.APP_ENV,
        uptime_seconds=round(uptime, 2),
        calibration=CalibrationConfig(
            match_threshold=settings.FACE_SIMILARITY_MATCH_THRESHOLD,
            review_threshold=settings.FACE_SIMILARITY_REVIEW_THRESHOLD,
            detection_confidence=settings.FACE_DETECTION_CONFIDENCE_THRESHOLD
        ),
        capabilities=SystemCapabilities(
            or_tools_enabled=True,
            vision_enabled=True,
            pgvector_ready=True
        ),
        meta={
            "description": "Smart Academic Management System AI & Optimization Microservice",
            "host": settings.HOST,
            "port": str(settings.PORT)
        }
    )
