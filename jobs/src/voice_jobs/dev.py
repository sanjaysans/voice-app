import uvicorn

from voice_jobs.config import get_settings


def main() -> None:
    settings = get_settings()
    uvicorn.run(
        "voice_jobs.app:create_app",
        factory=True,
        host=settings.host,
        port=settings.port,
        reload=True,
    )
