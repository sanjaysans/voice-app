from types import SimpleNamespace

import pytest

from voice_backend.schemas import ProviderAccountCreateInput
from voice_backend.services.evaluation import _merge_semantic_judge, _score_case
from voice_backend.services.evaluation_judge import EvaluationJudge, EvaluationJudgeResult
from voice_backend.services.provider_account_admin import ProviderAccountAdminService


def _case_version(*, critical: bool = False):
    return SimpleNamespace(
        case=SimpleNamespace(name="Callback handling"),
        scenario={"initial_utterance": "Please call me tomorrow."},
        expected_behavior={"outcome": "callback requested"},
        assertions=[
            {
                "key": "callback",
                "type": "contains",
                "expected": {"text": "callback"},
                "critical": critical,
            }
        ],
        rubric=[],
        case_id="case-1",
    )


def test_semantic_judge_can_accept_equivalent_text_for_noncritical_assertion():
    case_version = _case_version()
    trace = {
        "assistant_text": "I will call you tomorrow evening.",
        "transcript": [],
        "outcome": "callback requested",
    }
    deterministic = _score_case(case_version, trace)
    judge = EvaluationJudgeResult(
        score=0.92,
        passed=True,
        threshold=0.7,
        model="gpt-4.1-mini",
        provider_account_id="provider-1",
        reason="The agent clearly confirmed the requested callback.",
        assertions=[
            {
                "key": "callback",
                "score": 1.0,
                "passed": True,
                "reason": "The wording is semantically equivalent.",
                "evidence": ["I will call you tomorrow evening."],
            }
        ],
        metrics=[],
    )

    score, passed, assertions, metrics = _merge_semantic_judge(
        case_version, deterministic[2], judge
    )

    assert passed is True
    assert score == 0.92
    assert assertions[0]["passed"] is True
    assert metrics[0]["metric_key"] == "semantic_quality"
    assert metrics[0]["judge_metadata"]["judge"] == "llm"


@pytest.mark.asyncio
async def test_semantic_judge_reuses_agent_llm_without_exposing_api_key(
    session, seeded_domain, monkeypatch
):
    account = ProviderAccountAdminService(session).create_account(
        "voice-demo",
        ProviderAccountCreateInput(
            provider_kind="llm",
            vendor_name="openai",
            label="Evaluator LLM",
            status="active",
            config={"api_key": "judge-key"},
        ),
    )
    agent_version = seeded_domain["latest_version"]
    agent_version.vendor_config = {
        "runtime_profile": {
            "llm": {
                "providerAccountId": str(account.provider_account_id),
                "model": "gpt-4.1-mini",
            }
        }
    }
    captured: dict[str, object] = {}

    class FakeResponse:
        status_code = 200

        @staticmethod
        def json():
            return {
                "output_text": (
                    '{"score":0.9,"passed":true,"reason":"Good response",'
                    '"assertions":[{"key":"callback","score":1,"passed":true,'
                    '"reason":"Confirmed callback","evidence":["I will call you tomorrow"]}],'
                    '"metrics":[]}'
                )
            }

    class FakeClient:
        def __init__(self, **_kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def post(self, *_args, **kwargs):
            captured.update(kwargs)
            return FakeResponse()

    monkeypatch.setattr("voice_backend.services.evaluation_judge.httpx.AsyncClient", FakeClient)
    result = await EvaluationJudge(session).judge(
        seeded_domain["tenant"].id,
        agent_version,
        _case_version(),
        {
            "assistant_text": "I will call you tomorrow.",
            "transcript": [{"speaker": "agent", "text": "I will call you tomorrow."}],
        },
    )

    body = captured["json"]
    assert result.passed is True
    assert result.model == "gpt-4.1-mini"
    assert body["max_output_tokens"] == 600
    assert "judge-key" not in str(body)
