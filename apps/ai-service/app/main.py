from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from app.core.config import settings
from app.api.v1.health import router as health_router
from app.api.v1.timetable import router as timetable_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Microservice startup
    print(f"[SAMS AI Service] Initialized on {settings.HOST}:{settings.PORT} in {settings.APP_ENV} mode.")
    print(f"[Calibration] Match: {settings.FACE_SIMILARITY_MATCH_THRESHOLD}, Review: {settings.FACE_SIMILARITY_REVIEW_THRESHOLD}")
    yield
    # Microservice shutdown
    print("[SAMS AI Service] Shutting down.")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.VERSION,
    description="Dedicated AI, constraint optimization (OR-Tools), and biometric processing microservice for SAMS.",
    lifespan=lifespan
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Root redirect to documentation
@app.get("/", include_in_schema=False)
async def root_redirect():
    return RedirectResponse(url="/docs")


# Direct health check alias for easy container/service ping
@app.get("/health", include_in_schema=True, tags=["Health"])
async def direct_health():
    from app.api.v1.health import get_health_check
    return await get_health_check()


# Mount versioned routers
app.include_router(health_router, prefix="/api/v1")
app.include_router(timetable_router, prefix="/api/v1")
