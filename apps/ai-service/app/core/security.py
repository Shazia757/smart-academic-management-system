from fastapi import Security, HTTPException, status
from fastapi.security.api_key import APIKeyHeader
from app.core.config import settings

API_KEY_HEADER = APIKeyHeader(name="X-Internal-API-Key", auto_error=False)


async def verify_internal_api_key(
    api_key_header: str = Security(API_KEY_HEADER)
) -> str:
    """
    Validates that incoming requests come from an authorized server component (e.g. Next.js).
    """
    if not api_key_header:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing X-Internal-API-Key authentication header."
        )
    if api_key_header != settings.INTERNAL_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid internal API key provided."
        )
    return api_key_header
