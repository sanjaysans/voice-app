from datetime import UTC, datetime

import httpx
from sqlalchemy.orm import Session

from voice_backend.logging import get_logger
from voice_backend.repositories import ProviderAccountRepository, TenantRepository
from voice_backend.schemas import (
    ProviderAccountCreateInput,
    ProviderAccountRecord,
    ProviderAccountUpdateInput,
)

logger = get_logger(__name__)

SAFE_PREVIEW_KEYS = {
    "kind",
    "name",
    "display_name",
    "description",
    "ui_status",
    "detail",
    "last_checked",
    "api_key",
    "account_sid",
    "auth_token",
    "phone_numbers",
    "region",
    "default_model",
    "language",
    "default_voice_id",
    "temperature",
    "max_output_tokens",
    "top_p",
    "priority_tier",
    "max_retries",
    "speed",
    "emotion",
    "volume",
    "enable_ssml",
    "sample_rate",
    "url",
    "events",
    "deliveries",
    "signing_secret_preview",
}

HEALTH_CHECK_RULES = {
    ("telephony", "twilio"): {
        "required_keys": ("account_sid", "auth_token", "phone_numbers"),
        "label": "Twilio",
        "auth": "basic",
        "url_template": "https://api.twilio.com/2010-04-01/Accounts/{account_sid}.json",
    },
    ("stt", "deepgram"): {
        "required_keys": ("api_key",),
        "label": "Deepgram",
        "auth": "deepgram_token",
        "url_template": "https://api.deepgram.com/v1/projects",
    },
    ("llm", "openai"): {
        "required_keys": ("api_key",),
        "label": "OpenAI",
        "auth": "bearer",
        "url_template": "https://api.openai.com/v1/models",
    },
    ("tts", "cartesia"): {
        "required_keys": ("api_key",),
        "label": "Cartesia",
        "auth": "cartesia_bearer",
        "url_template": "https://api.cartesia.ai/voices",
    },
}


def _parse_phone_numbers(value: object) -> list[str]:
    if not isinstance(value, str):
        return []
    return [item.strip() for item in value.replace(",", "\n").splitlines() if item.strip()]


def _format_check_time() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%d %H:%M UTC")


def _has_config_value(config: dict[str, object], key: str) -> bool:
    if key == "phone_numbers":
        return bool(_parse_phone_numbers(config.get("phone_numbers")))
    return bool(config.get(key) or config.get(f"{key}_ref"))


def _get_config_secret(config: dict[str, object], key: str) -> str | None:
    value = config.get(key)
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def _build_probe_request(account, rule: dict[str, object]) -> dict[str, object]:
    config = account.config or {}
    auth_mode = str(rule["auth"])
    url_template = str(rule["url_template"])
    url = url_template.format(account_sid=str(config.get("account_sid", "")).strip())
    headers: dict[str, str] = {}
    auth: tuple[str, str] | None = None
    params: dict[str, object] = {}

    if auth_mode == "basic":
        auth = (
            str(config.get("account_sid", "")).strip(),
            str(config.get("auth_token", "")).strip(),
        )
    elif auth_mode == "deepgram_token":
        headers["Authorization"] = f"Token {_get_config_secret(config, 'api_key')}"
    elif auth_mode == "bearer":
        headers["Authorization"] = f"Bearer {_get_config_secret(config, 'api_key')}"
    elif auth_mode == "cartesia_bearer":
        headers["Authorization"] = f"Bearer {_get_config_secret(config, 'api_key')}"
        headers["Cartesia-Version"] = "2026-08-14"
        params["limit"] = 1

    return {
        "url": url,
        "headers": headers,
        "auth": auth,
        "params": params,
    }


def _success_from_vendor_response(response: httpx.Response) -> tuple[bool, str]:
    if 200 <= response.status_code < 300:
        return True, "Provider credentials verified successfully."
    if response.status_code == 429:
        return True, "Provider credentials authenticated, but the health check was rate limited."
    return False, f"Provider returned HTTP {response.status_code} during credential verification."


def _health_check_payload(account) -> tuple[str, dict[str, object]]:
    config = account.config or {}
    rule = HEALTH_CHECK_RULES.get((account.provider_kind, account.vendor_name))
    if rule is None:
        return "error", {
            "ui_status": "Warning",
            "detail": f"{account.label} does not have a configured health-check rule yet.",
            "last_checked": _format_check_time(),
        }

    missing_keys = [key for key in rule["required_keys"] if not _has_config_value(config, key)]

    if missing_keys:
        return "error", {
            "ui_status": "Warning",
            "detail": f"{account.label} is missing required setup fields: {', '.join(sorted(missing_keys))}.",
            "last_checked": _format_check_time(),
        }

    unresolved_secret_refs = [
        key for key in rule["required_keys"] if not _get_config_secret(config, key) and config.get(f"{key}_ref")
    ]
    if unresolved_secret_refs:
        return "error", {
            "ui_status": "Warning",
            "detail": f"{account.label} uses secret references for {', '.join(sorted(unresolved_secret_refs))}, but runtime secret resolution is not connected to health checks yet.",
            "last_checked": _format_check_time(),
        }

    probe = _build_probe_request(account, rule)
    try:
        with httpx.Client(timeout=10) as client:
            response = client.get(
                str(probe["url"]),
                headers=probe["headers"],
                auth=probe["auth"],
                params=probe["params"],
            )
    except httpx.HTTPError as exc:
        return "error", {
            "ui_status": "Warning",
            "detail": f"{account.label} could not complete the {rule['label']} health check: {exc.__class__.__name__}.",
            "last_checked": _format_check_time(),
        }

    is_valid, response_detail = _success_from_vendor_response(response)
    if is_valid:
        return "active", {
            "ui_status": "Connected",
            "detail": f"{account.label} passed the live {rule['label']} credential check. {response_detail}",
            "last_checked": _format_check_time(),
        }

    return "error", {
        "ui_status": "Warning",
        "detail": f"{account.label} failed the live {rule['label']} credential check. {response_detail}",
        "last_checked": _format_check_time(),
    }


def _to_record(account) -> ProviderAccountRecord:
    config = account.config or {}
    return ProviderAccountRecord(
        provider_account_id=account.id,
        tenant_id=account.tenant_id,
        provider_kind=account.provider_kind,
        vendor_name=account.vendor_name,
        label=account.label,
        status=account.status,
        has_config=bool(config),
        config_keys=sorted(config.keys()),
        preview={key: config[key] for key in sorted(config.keys()) if key in SAFE_PREVIEW_KEYS},
        created_at=account.created_at,
        updated_at=account.updated_at,
    )


def to_provider_account_record(account) -> ProviderAccountRecord:
    return _to_record(account)


class ProviderAccountAdminService:
    def __init__(self, session: Session) -> None:
        self.tenants = TenantRepository(session)
        self.accounts = ProviderAccountRepository(session)

    def list_accounts(
        self,
        tenant_slug: str,
        *,
        tenant_id=None,
    ) -> list[ProviderAccountRecord] | None:
        resolved_tenant_id = tenant_id
        if resolved_tenant_id is None:
            tenant = self.tenants.get_by_slug(tenant_slug)
            if tenant is None:
                return None
            resolved_tenant_id = tenant.id
        return [_to_record(account) for account in self.accounts.list_by_tenant(resolved_tenant_id)]

    def create_account(
        self,
        tenant_slug: str,
        payload: ProviderAccountCreateInput,
    ) -> ProviderAccountRecord | None:
        tenant = self.tenants.get_by_slug(tenant_slug)
        if tenant is None:
            return None
        account = self.accounts.create(
            tenant.id,
            payload.provider_kind,
            payload.vendor_name,
            payload.label,
            status=payload.status,
            config=payload.config,
        )
        logger.info(
            "provider_account.created",
            tenant_id=str(tenant.id),
            provider_account_id=str(account.id),
        )
        return _to_record(account)

    def get_account(self, tenant_slug: str, provider_account_id) -> ProviderAccountRecord | None:
        tenant = self.tenants.get_by_slug(tenant_slug)
        if tenant is None:
            return None
        account = self.accounts.get_for_tenant(tenant.id, provider_account_id)
        return _to_record(account) if account is not None else None

    def update_account(
        self,
        tenant_slug: str,
        provider_account_id,
        payload: ProviderAccountUpdateInput,
    ) -> ProviderAccountRecord | None:
        tenant = self.tenants.get_by_slug(tenant_slug)
        if tenant is None:
            return None
        account = self.accounts.get_for_tenant(tenant.id, provider_account_id)
        if account is None:
            return None
        updated = self.accounts.update(
            account,
            provider_kind=payload.provider_kind,
            vendor_name=payload.vendor_name,
            label=payload.label,
            status=payload.status,
            config=payload.config,
        )
        logger.info(
            "provider_account.updated",
            tenant_id=str(tenant.id),
            provider_account_id=str(updated.id),
        )
        return _to_record(updated)

    def run_health_check(self, tenant_slug: str, provider_account_id) -> ProviderAccountRecord | None:
        tenant = self.tenants.get_by_slug(tenant_slug)
        if tenant is None:
            return None
        account = self.accounts.get_for_tenant(tenant.id, provider_account_id)
        if account is None:
            return None

        status, config_patch = _health_check_payload(account)
        updated = self.accounts.update(account, status=status, config=config_patch)
        logger.info(
            "provider_account.health_check",
            tenant_id=str(tenant.id),
            provider_account_id=str(updated.id),
            status=status,
        )
        return _to_record(updated)

    def delete_account(self, tenant_slug: str, provider_account_id) -> bool:
        tenant = self.tenants.get_by_slug(tenant_slug)
        if tenant is None:
            return False
        account = self.accounts.get_for_tenant(tenant.id, provider_account_id)
        if account is None:
            return False
        self.accounts.delete(account)
        logger.info(
            "provider_account.deleted",
            tenant_id=str(tenant.id),
            provider_account_id=str(account.id),
        )
        return True
