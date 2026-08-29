import uvicorn

from voice_backend.config import get_settings


def main() -> None:
    settings = get_settings()
    uvicorn.run(
        "voice_backend.app:create_app",
        factory=True,
        host=settings.host,
        port=settings.port,
        reload=settings.environment == "dev",
    )
