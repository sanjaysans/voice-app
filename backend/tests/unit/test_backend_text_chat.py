import pytest

from voice_backend.schemas import (
    AgentStudioUpdateInput,
    ProviderAccountCreateInput,
    TextChatMessageInput,
    TextChatSessionCreateInput,
)
from voice_backend.services import (
    AgentDefinitionAdminService,
    ProviderAccountAdminService,
    TextChatService,
)


@pytest.mark.asyncio
async def test_text_chat_uses_llm_only_and_persists_transcript(session, seeded_domain, monkeypatch):
    account = ProviderAccountAdminService(session).create_account(
        "voice-demo",
        ProviderAccountCreateInput(
            provider_kind="llm",
            vendor_name="openai",
            label="Text LLM",
            status="active",
            config={"api_key": "oa-key"},
        ),
    )
    AgentDefinitionAdminService(session).update_studio(
        "voice-demo",
        seeded_domain["workspace"].id,
        seeded_domain["agent"].id,
        AgentStudioUpdateInput(
            shared_prompt="Be concise and helpful.",
            runtime_profile={
                "prompt": {"openingMessage": "Hello from text mode."},
                "llm": {
                    "providerAccountId": str(account.provider_account_id),
                    "model": "gpt-4.1-mini",
                },
            },
        ),
    )
    session.commit()

    class FakeResponse:
        status_code = 200

        @staticmethod
        def json():
            return {"output_text": '{"reply":"I can help.","end_call":false}'}

    class FakeClient:
        def __init__(self, **_kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def post(self, *_args, **_kwargs):
            return FakeResponse()

    monkeypatch.setattr("voice_backend.services.text_chat.httpx.AsyncClient", FakeClient)
    service = TextChatService(session)
    created = service.create_session(
        "voice-demo",
        seeded_domain["workspace"].id,
        TextChatSessionCreateInput(agent_id=seeded_domain["agent"].id),
        launched_by="tester",
    )
    assert created is not None
    assert created.execution_mode == "text_chat"
    assert created.transcript[0]["text"] == "Hello from text mode."

    turn = await service.send_message(
        "voice-demo",
        seeded_domain["workspace"].id,
        created.call_id,
        TextChatMessageInput(text="I need help."),
    )
    session.commit()

    assert turn.assistant_text == "I can help."
    assert turn.model == "gpt-4.1-mini"
    call = service.calls.get_for_workspace(
        seeded_domain["tenant"].id,
        seeded_domain["workspace"].id,
        created.call_id,
    )
    assert call is not None
    assert call.resolved_config["execution_mode"] == "text_chat"
    assert len(call.resolved_config["transcript"]) == 3
    assert "api_key" not in call.resolved_config
