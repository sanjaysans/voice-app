import uuid

from voice_migrator.seed import build_default_provider_rows, tenant_slug_from_name


def test_tenant_slug_from_name_trims_spaces_and_normalizes_case() -> None:
    assert tenant_slug_from_name("  Voice Demo Tenant  ") == "voice-demo-tenant"


def test_build_default_provider_rows_creates_one_row_per_provider_kind() -> None:
    tenant_id = uuid.uuid4()

    rows = build_default_provider_rows(tenant_id)

    assert len(rows) == 4
    assert {row["provider_kind"] for row in rows} == {"stt", "llm", "tts", "telephony"}
    assert all(row["tenant_id"] == tenant_id for row in rows)
    assert all(row["config"] == {"mode": "local"} for row in rows)
