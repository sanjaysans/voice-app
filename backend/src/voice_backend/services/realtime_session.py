from __future__ import annotations

from datetime import timedelta
from uuid import UUID, uuid4

import httpx
from livekit.api import AccessToken, LiveKitAPI, VideoGrants
from livekit.protocol.agent_dispatch import CreateAgentDispatchRequest
from livekit.protocol.room import CreateRoomRequest

from voice_backend.config import Settings
from voice_backend.schemas import BrowserRtcSessionCreateInput, BrowserRtcSessionRecord


class RealtimeSessionError(RuntimeError):
    pass


class RealtimeSessionService:
    def __init__(self, settings: Settings):
        self._settings = settings

    async def create_browser_session(
        self,
        payload: BrowserRtcSessionCreateInput,
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

        manifest = await self._build_pipeline_manifest(pipeline_payload)
        if manifest["errors"]:
            raise RealtimeSessionError("pipeline session validation failed")

        room_name = str(manifest["session"]["room_name"])
        dispatch = await self._create_room_dispatch(
            room_name=room_name,
            agent_name=str(manifest["dispatch_agent_name"]),
            metadata=str(manifest["dispatch_metadata"]),
        )
        access_token = self._create_access_token(
            room_name=room_name,
            participant_identity=participant_identity,
            participant_name=participant_name,
        )

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

    async def _build_pipeline_manifest(self, payload: dict[str, object]) -> dict[str, object]:
        endpoint = self._settings.pipeline_base_url.rstrip("/") + "/webrtc/session"
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(endpoint, json=payload)
        if response.status_code >= 400:
            raise RealtimeSessionError(
                f"pipeline session build failed with status {response.status_code}"
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
        async with LiveKitAPI(
            url=self._settings.livekit_url,
            api_key=self._settings.livekit_api_key,
            api_secret=self._settings.livekit_api_secret,
        ) as livekit_api:
            await livekit_api.room.create_room(
                CreateRoomRequest(
                    name=room_name,
                    empty_timeout=self._settings.livekit_room_empty_timeout_seconds,
                    max_participants=8,
                )
            )
            return await livekit_api.agent_dispatch.create_dispatch(
                CreateAgentDispatchRequest(
                    room=room_name,
                    agent_name=agent_name,
                    metadata=metadata,
                )
            )

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
                    can_publish_data=True,
                )
            )
            .to_jwt()
        )

    @staticmethod
    def _participant_identity(user_id: UUID) -> str:
        return f"web-{str(user_id)[:8]}-{uuid4().hex[:8]}"
