from voice_jobs.config import Settings


def test_jobs_settings_default_to_local_temporal_target() -> None:
    settings = Settings()

    assert settings.temporal_target == "localhost:7233"


def test_jobs_settings_default_to_default_namespace() -> None:
    settings = Settings()

    assert settings.temporal_namespace == "default"
