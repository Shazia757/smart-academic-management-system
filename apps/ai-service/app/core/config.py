from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field


class Settings(BaseSettings):
    """
    Application Configuration for SAMS AI Microservice
    """
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    APP_NAME: str = "Smart Academic Management System — AI Service"
    APP_ENV: str = "development"
    HOST: str = "127.0.0.1"
    PORT: int = 8000
    VERSION: str = "1.0.0"

    # Server-to-Server Internal Security
    INTERNAL_API_KEY: str = Field(
        default="sams_dev_secret_internal_key_2026",
        description="Shared secret for authenticated requests from Next.js server"
    )
    ALLOWED_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"

    # Face Recognition Calibration Parameters
    # IMPORTANT: Configurable parameters; must be calibrated per camera and lighting
    FACE_SIMILARITY_MATCH_THRESHOLD: float = Field(
        default=0.65,
        description="Threshold above which face cosine similarity is marked PRESENT"
    )
    FACE_SIMILARITY_REVIEW_THRESHOLD: float = Field(
        default=0.45,
        description="Threshold between REVIEW and MATCH where manual review is recommended"
    )
    FACE_DETECTION_CONFIDENCE_THRESHOLD: float = Field(
        default=0.80,
        description="Minimum bounding box detector confidence score"
    )

    # Google OR-Tools Timetable Optimizer Settings
    TIMETABLE_SOLVER_MAX_SECONDS: int = 30
    TIMETABLE_SOLVER_NUM_WORKERS: int = 4

    @property
    def cors_origins(self) -> List[str]:
        return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",") if origin.strip()]


settings = Settings()
