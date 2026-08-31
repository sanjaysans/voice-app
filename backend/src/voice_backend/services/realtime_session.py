from __future__ import annotations

import asyncio
import ssl
from contextlib import asynccontextmanager
from datetime import timedelta
from time import perf_counter
from uuid import UUID, uuid4

import aiohttp
import certifi
import httpx
from livekit.api import AccessToken, LiveKitAPI, VideoGrants
from livekit.protocol.agent_dispatch import CreateAgentDispatchRequest
from livekit.protocol.room import DeleteRoomRequest

from voice_backend.config import Settings
from voice_backend.logging import get_logger
from voice_backend.schemas import BrowserRtcSessionRecord, BrowserRtcSessionResolvedInput

logger = get_logger(__name__)


class RealtimeSessionError(RuntimeError):
    pass


class RealtimeSessionService:
    def __init__(self, settings: Settings):
        self._settings = settings

    async def create_browser_session(
        self,
        payload: BrowserRtcSessionResolvedInput,
        *,
        user_id: UUID,
        display_name: str,
    ) -> BrowserRtcSessionRecord:
        if not self._settings.livekit_configured:
            raise RealtimeSessionError("local LiveKit runtime is not configured")

        participant_identity = payload.room.participant_identity or self._participant_identity(
            user_id
        )
        participant_name = payload.participant_name or display_name
        pipeline_payload = payload.model_dump(mode="json", exclude_none=True)
        pipeline_payload["room"]["participant_identity"] = participant_identity
        pipeline_payload["dispatch_agent_name"] = (
            payload.dispatch_agent_name or self._settings.livekit_agent_name
        )

        started_at = perf_counter()
        manifest = await self._build_pipeline_manifest(pipeline_payload)
        if manifest["errors"]:
            raise RealtimeSessionError("pipeline session validation failed")
        logger.info(
            "realtime.session.step",
            step="manifest_ready",
            duration_ms=round((perf_counter() - started_at) * 1000, 2),
        )

        room_name = str(manifest["session"]["room_name"])
        dispatch_started_at = perf_counter()
        dispatch = await self._create_room_dispatch(
            room_name=room_name,
            agent_name=str(manifest["dispatch_agent_name"]),
            metadata=str(manifest["dispatch_metadata"]),
        )
        logger.info(
            "realtime.session.step",
            step="room_and_dispatch_ready",
            duration_ms=round((perf_counter() - dispatch_started_at) * 1000, 2),
        )
        try:
            token_started_at = perf_counter()
            access_token = self._create_access_token(
                room_name=room_name,
                participant_identity=participant_identity,
                participant_name=participant_name,
            )
            logger.info(
                "realtime.session.step",
                step="browser_token_ready",
                duration_ms=round((perf_counter() - token_started_at) * 1000, 2),
            )
        except Exception as exc:
            await self.cleanup_browser_session(room_name=room_name, dispatch_id=dispatch.id)
            raise RealtimeSessionError("live session access token generation failed") from exc

        return BrowserRtcSessionRecord(
            room_name=room_name,
            participant_identity=participant_identity,
            participant_name=participant_name,
            server_url=self._settings.livekit_url or "",
            access_token=access_token,
            dispatch_id=dispatch.id,
            dispatch_agent_name=str(manifest["dispatch_agent_name"]),
            session=dict(manifest["session"]),
            runtime=dict(manifest["runtime"]),
            warnings=[str(item) for item in manifest["warnings"]],
            errors=[str(item) for item in manifest["errors"]],
        )

    async def cleanup_browser_session(self, *, room_name: str, dispatch_id: str | None) -> None:
        if not room_name:
            return
        async with self._livekit_api() as livekit_api:
            if dispatch_id:
                await self._cleanup_resource(
                    "dispatch",
                    lambda: livekit_api.agent_dispatch.delete_dispatch(dispatch_id, room_name),
                )
            await self._cleanup_resource(
                "room",
                lambda: livekit_api.room.delete_room(DeleteRoomRequest(room=room_name)),
            )

    async def _cleanup_resource(self, resource: str, operation) -> None:
        for attempt in range(2):
            try:
                await operation()
                return
            except Exception as exc:
                if attempt == 1:
                    logger.warning(
                        "realtime.cleanup.failed",
                        resource=resource,
                        error=exc.__class__.__name__,
                    )
                else:
                    await asyncio.sleep(0.2)

    async def create_server_session(
        self,
        payload: BrowserRtcSessionResolvedInput,
        *,
        room_name: str,
    ) -> tuple[dict[str, object], str]:
        """Create the room and production agent dispatch without a browser token."""
        if not self._settings.livekit_configured:
            raise RealtimeSessionError("LiveKit runtime is not configured")
        pipeline_payload = payload.model_dump(mode="json", exclude_none=True)
        pipeline_payload["room"]["room_name"] = room_name
        pipeline_payload["room"]["participant_identity"] = None
        pipeline_payload["dispatch_agent_name"] = (
            payload.dispatch_agent_name or self._settings.livekit_agent_name
        )
        manifest = await self._build_pipeline_manifest(pipeline_payload)
        if manifest["errors"]:
            raise RealtimeSessionError("pipeline session validation failed")
        dispatch = await self._create_room_dispatch(
            room_name=room_name,
            agent_name=str(manifest["dispatch_agent_name"]),
            metadata=str(manifest["dispatch_metadata"]),
        )
        return manifest, str(dispatch.id)

    async def dispatch_agent(self, *, room_name: str, agent_name: str, metadata: str) -> str:
        if not self._settings.livekit_configured:
            raise RealtimeSessionError("LiveKit runtime is not configured")
        async with self._livekit_api() as livekit_api:
            try:
                dispatch = await livekit_api.agent_dispatch.create_dispatch(
                    CreateAgentDispatchRequest(
                        room=room_name,
                        agent_name=agent_name,
                        metadata=metadata,
                    )
                )
            except Exception as exc:
                raise RealtimeSessionError("agent dispatch creation failed") from exc
        return str(dispatch.id)

    async def _build_pipeline_manifest(self, payload: dict[str, object]) -> dict[str, object]:
        endpoint = self._settings.pipeline_base_url.rstrip("/") + "/webrtc/session"
        started_at = perf_counter()
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                endpoint,
                json=payload,
                headers={"X-Voice-Internal-Key": self._settings.internal_api_key},
            )
        if response.status_code >= 400:
            raise RealtimeSessionError(
                f"pipeline session build failed with status {response.status_code}"
            )
        logger.info(
            "realtime.session.step",
            step="pipeline_manifest_request",
            duration_ms=round((perf_counter() - started_at) * 1000, 2),
            status_code=response.status_code,
        )
        manifest = response.json()
        required_keys = {"session", "dispatch_agent_name", "dispatch_metadata", "runtime"}
        if not required_keys.issubset(manifest):
            raise RealtimeSessionError("pipeline manifest response is incomplete")
        manifest.setdefault("warnings", [])
        manifest.setdefault("errors", [])
        return manifest

    async def _create_room_dispatch(
        self,
        *,
        room_name: str,
        agent_name: str,
        metadata: str,
    ):
        async with self._livekit_api() as livekit_api:
            try:
                dispatch_started_at = perf_counter()
                dispatch = await livekit_api.agent_dispatch.create_dispatch(
                    CreateAgentDispatchRequest(
                        room=room_name,
                        agent_name=agent_name,
                        metadata=metadata,
                    )
                )
                logger.info(
                    "realtime.session.step",
                    step="livekit_dispatch_created",
                    duration_ms=round((perf_counter() - dispatch_started_at) * 1000, 2),
                )
                return dispatch
            except Exception as exc:
                raise RealtimeSessionError("live session dispatch creation failed") from exc

    @asynccontextmanager
    async def _livekit_api(self):
        ssl_context = ssl.create_default_context(cafile=certifi.where())
        session = aiohttp.ClientSession(
            connector=aiohttp.TCPConnector(ssl=ssl_context),
        )
        try:
            async with LiveKitAPI(
                url=self._settings.livekit_url,
                api_key=self._settings.livekit_api_key,
                api_secret=self._settings.livekit_api_secret,
                session=session,
            ) as livekit_api:
                yield livekit_api
        finally:
            if not session.closed:
                await session.close()

    def _create_access_token(
        self,
        *,
        room_name: str,
        participant_identity: str,
        participant_name: str,
    ) -> str:
        return (
            AccessToken(
                api_key=self._settings.livekit_api_key,
                api_secret=self._settings.livekit_api_secret,
            )
            .with_identity(participant_identity)
            .with_name(participant_name)
            .with_ttl(timedelta(minutes=self._settings.livekit_token_ttl_minutes))
            .with_grants(
                VideoGrants(
                    room_join=True,
                    room=room_name,
                    can_publish=True,
                    can_subscribe=True,
                    can_publish_data=False,
                )
            )
            .to_jwt()
        )

    @staticmethod
    def _participant_identity(user_id: UUID) -> str:
        return f"web-{str(user_id)[:8]}-{uuid4().hex[:8]}"
