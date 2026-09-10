from typing import Dict
from pydantic import BaseModel, Field


class CalibrationConfig(BaseModel):
    match_threshold: float = Field(..., description="Cosine similarity threshold for confirmed attendance")
    review_threshold: float = Field(..., description="Cosine similarity threshold for flagged review")
    detection_confidence: float = Field(..., description="Face detector minimum confidence")


class SystemCapabilities(BaseModel):
    or_tools_enabled: bool = True
    vision_enabled: bool = True
    pgvector_ready: bool = True


class HealthResponse(BaseModel):
    status: str = Field(default="healthy", description="Overall service status")
    service: str = Field(default="sams-ai-service")
    version: str
    environment: str
    uptime_seconds: float
    calibration: CalibrationConfig
    capabilities: SystemCapabilities
    meta: Dict[str, str] = Field(default_factory=dict)
