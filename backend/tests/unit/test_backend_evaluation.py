import pytest

from voice_backend.schemas import (
    EvalAssertionInput,
    EvalCaseCreateInput,
    EvalCaseResultInput,
    EvalMetricInput,
    EvalRunCreateInput,
    EvalSuiteCreateInput,
)
from voice_backend.services.evaluation import EvaluationService


def _suite_payload(agent_id) -> EvalSuiteCreateInput:
    return EvalSuiteCreateInput(
        suite_key="conversation-confidence",
        name="Conversation confidence",
        description="Core workflow behavior checks.",
        agent_id=agent_id,
        status="active",
        cases=[
            EvalCaseCreateInput(
                case_key="clear-request",
                name="Clear request",
                scenario={
                    "initial_utterance": "I need help today.",
                    "turns": [{"user": "I need help today.", "assistant": "I can help today."}],
                    "transitions": [{"from": "entry", "to": "support"}],
                    "variables": {"urgency": "today"},
                },
                expected_behavior={"outcome": "supported"},
                assertions=[
                    EvalAssertionInput(
                        key="response", type="contains", expected={"text": "help"}, critical=True
                    ),
                    EvalAssertionInput(
                        key="transition",
                        type="state_transition",
                        expected={"from": "entry", "to": "support"},
                        critical=True,
                    ),
                    EvalAssertionInput(
                        key="variable",
                        type="variable",
                        expected={"key": "urgency", "value": "today"},
                    ),
                ],
            )
        ],
    )


def test_live_case_result_timestamps_are_optional_for_worker_callbacks():
    result = EvalCaseResultInput(execution_id="run-id:case-id", evidence={"transcript": []})

    assert result.started_at is None
    assert result.ended_at is None


def test_create_suite_persists_versioned_case(session, seeded_domain):
    service = EvaluationService(session)
    suite = service.create_suite(
        "voice-demo", seeded_domain["workspace"].id, _suite_payload(seeded_domain["agent"].id)
    )

    assert suite is not None
    assert suite.latest_version_number == 1
    assert len(suite.cases) == 1
    assert suite.cases[0].version_number == 1
    assert suite.cases[0].assertions[0].key == "response"


def test_run_suite_creates_call_evidence_and_passes_assertions(session, seeded_domain):
    service = EvaluationService(session)
    suite = service.create_suite(
        "voice-demo", seeded_domain["workspace"].id, _suite_payload(seeded_domain["agent"].id)
    )
    session.commit()

    run = service.run_suite(
        "voice-demo",
        seeded_domain["workspace"].id,
        suite.suite_id,
        EvalRunCreateInput(execution_mode="scripted_text"),
    )

    assert run is not None
    assert run.status == "completed"
    assert run.total_cases == 1
    assert run.passed_cases == 1
    assert run.failed_cases == 0
    assert run.score == 1
    assert run.case_runs[0].call_id is not None
    assert all(item.passed for item in run.case_runs[0].assertions)


def test_run_suite_records_failed_critical_assertion(session, seeded_domain):
    payload = _suite_payload(seeded_domain["agent"].id)
    payload.cases[0].assertions[0].expected = {"text": "never present"}
    service = EvaluationService(session)
    suite = service.create_suite("voice-demo", seeded_domain["workspace"].id, payload)
    session.commit()

    run = service.run_suite(
        "voice-demo",
        seeded_domain["workspace"].id,
        suite.suite_id,
        EvalRunCreateInput(execution_mode="scripted_text"),
    )

    assert run is not None
    assert run.failed_cases == 1
    assert run.passed_cases == 0
    assert run.case_runs[0].passed is False
    assert run.case_runs[0].failure_summary


def test_run_suite_rejects_unimplemented_audio_execution_mode(session, seeded_domain):
    service = EvaluationService(session)
    suite = service.create_suite(
        "voice-demo", seeded_domain["workspace"].id, _suite_payload(seeded_domain["agent"].id)
    )
    session.commit()

    with pytest.raises(ValueError, match="not enabled in this environment"):
        service.run_suite(
            "voice-demo",
            seeded_domain["workspace"].id,
            suite.suite_id,
            EvalRunCreateInput(execution_mode="simulated_audio"),
        )


def test_run_suite_fails_closed_without_assertions(session, seeded_domain):
    payload = _suite_payload(seeded_domain["agent"].id)
    payload.cases[0].assertions = []
    service = EvaluationService(session)
    suite = service.create_suite("voice-demo", seeded_domain["workspace"].id, payload)
    session.commit()

    run = service.run_suite(
        "voice-demo",
        seeded_domain["workspace"].id,
        suite.suite_id,
        EvalRunCreateInput(execution_mode="scripted_text"),
    )

    assert run.failed_cases == 1
    assert run.score == 0


def test_run_suite_applies_metric_threshold(session, seeded_domain):
    payload = _suite_payload(seeded_domain["agent"].id)
    payload.cases[0].rubric = [
        EvalMetricInput(key="quality", description="Response quality", threshold=1.0)
    ]
    payload.cases[0].assertions[0].expected = {"text": "not present"}
    service = EvaluationService(session)
    suite = service.create_suite("voice-demo", seeded_domain["workspace"].id, payload)
    session.commit()

    run = service.run_suite(
        "voice-demo",
        seeded_domain["workspace"].id,
        suite.suite_id,
        EvalRunCreateInput(execution_mode="scripted_text"),
    )

    assert run.failed_cases == 1
    assert run.case_runs[0].metrics[0].judge_metadata["threshold"] == 1.0


def test_case_data_rejects_secret_aliases_in_scenario():
    with pytest.raises(ValueError, match="must reference secrets"):
        EvalCaseCreateInput(
            case_key="secret",
            name="Secret input",
            scenario={"apiKey": "should-not-be-persisted"},
        )


def test_non_text_assertions_fail_closed_without_selectors(session, seeded_domain):
    payload = _suite_payload(seeded_domain["agent"].id)
    payload.cases[0].assertions = [
        EvalAssertionInput(key="outcome", type="outcome", expected={}),
        EvalAssertionInput(key="transition", type="state_transition", expected={}),
        EvalAssertionInput(key="tool", type="tool_call", expected={}),
        EvalAssertionInput(key="variable", type="variable", expected={}),
        EvalAssertionInput(key="guardrail", type="guardrail", expected={}),
    ]
    service = EvaluationService(session)
    suite = service.create_suite("voice-demo", seeded_domain["workspace"].id, payload)
    session.commit()

    run = service.run_suite(
        "voice-demo",
        seeded_domain["workspace"].id,
        suite.suite_id,
        EvalRunCreateInput(execution_mode="scripted_text"),
    )

    assert run is not None
    assert run.failed_cases == 1
    assert all(item.passed is False for item in run.case_runs[0].assertions)
