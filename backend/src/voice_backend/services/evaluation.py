from __future__ import annotations

import asyncio
import json
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.orm import Session

from voice_backend.models import (
    CallEvent,
    EvalAssertionResult,
    EvalCase,
    EvalCaseRun,
    EvalCaseVersion,
    EvalMetricResult,
    EvalRun,
    EvalSuite,
    EvalSuiteVersion,
)
from voice_backend.repositories import (
    AgentRepository,
    CallRepository,
    EvalRepository,
    TenantRepository,
    WorkspaceRepository,
)
from voice_backend.schemas import (
    BrowserRtcSessionCreateInput,
    EvalAssertionInput,
    EvalAssertionResultRecord,
    EvalCaseCreateInput,
    EvalCaseRecord,
    EvalCaseRunRecord,
    EvalCaseUpdateInput,
    EvalMetricResultRecord,
    EvalRunCreateInput,
    EvalRunRecord,
    EvalRunSummaryRecord,
    EvalSuiteCreateInput,
    EvalSuiteDetailRecord,
    EvalSuiteRecord,
    EvalSuiteUpdateInput,
)

SUPPORTED_EXECUTION_MODES = {"scripted_text", "live_audio"}
LIVE_CASE_TIMEOUT_SECONDS = 180


@dataclass
class LiveCaseWaiter:
    future: asyncio.Future[dict[str, object]]


_LIVE_CASE_WAITERS: dict[str, LiveCaseWaiter] = {}


def register_live_case(execution_id: str) -> asyncio.Future[dict[str, object]]:
    future: asyncio.Future[dict[str, object]] = asyncio.get_running_loop().create_future()
    _LIVE_CASE_WAITERS[execution_id] = LiveCaseWaiter(future)
    return future


def resolve_live_case(execution_id: str, evidence: dict[str, object]) -> bool:
    waiter = _LIVE_CASE_WAITERS.get(execution_id)
    if waiter is None or waiter.future.done():
        return False
    waiter.future.set_result(evidence)
    return True


def _now() -> datetime:
    return datetime.now(UTC)


def _latest(items: list[Any]) -> Any | None:
    return items[-1] if items else None


def _as_dict(value: object) -> dict[str, object]:
    return dict(value) if isinstance(value, dict) else {}


def _as_list(value: object) -> list[object]:
    return list(value) if isinstance(value, list) else []


def _as_float(
    value: object, fallback: float, *, minimum: float = 0.0, maximum: float = 1.0
) -> float:
    try:
        resolved = float(value)
    except (TypeError, ValueError):
        return fallback
    return min(max(resolved, minimum), maximum)


def _case_record(case: EvalCase) -> EvalCaseRecord:
    version = _latest(case.versions)
    if version is None:
        raise ValueError("evaluation case has no version")
    return EvalCaseRecord(
        case_id=case.id,
        suite_id=case.suite_id,
        case_key=case.case_key,
        name=case.name,
        sort_order=case.sort_order,
        status=case.status,
        version_number=version.version_number,
        scenario=_as_dict(version.scenario),
        expected_behavior=_as_dict(version.expected_behavior),
        assertions=[EvalAssertionInput.model_validate(item) for item in version.assertions],
        rubric=version.rubric,
        caller_config=_as_dict(version.caller_config),
    )


def _suite_record(suite: EvalSuite) -> EvalSuiteRecord:
    version = _latest(suite.versions)
    if version is None:
        raise ValueError("evaluation suite has no version")
    last_run = max(version.runs, key=lambda item: item.created_at or datetime.min, default=None)
    return EvalSuiteRecord(
        suite_id=suite.id,
        tenant_id=suite.tenant_id,
        workspace_id=suite.workspace_id,
        agent_id=suite.agent_definition_id,
        suite_key=suite.suite_key,
        name=suite.name,
        description=suite.description,
        status=suite.status,
        latest_version_number=version.version_number,
        agent_version_id=version.agent_version_id,
        case_count=len(suite.cases),
        last_run_status=last_run.status if last_run else None,
        last_run_score=last_run.score if last_run else None,
        created_at=suite.created_at,
        updated_at=suite.updated_at,
    )


def _trace_for_case(case_version: EvalCaseVersion) -> dict[str, object]:
    scenario = _as_dict(case_version.scenario)
    expected = _as_dict(case_version.expected_behavior)
    raw_turns = scenario.get("turns", [])
    turns: list[dict[str, object]] = []
    if isinstance(raw_turns, list):
        for index, raw_turn in enumerate(raw_turns, start=1):
            if not isinstance(raw_turn, dict):
                continue
            user_text = str(raw_turn.get("user", raw_turn.get("caller", ""))).strip()
            assistant_text = str(
                raw_turn.get("assistant", raw_turn.get("agent", raw_turn.get("response", "")))
            ).strip()
            if user_text:
                turns.append({"turn": index, "speaker": "caller", "text": user_text})
            if assistant_text:
                turns.append({"turn": index, "speaker": "agent", "text": assistant_text})

    if not turns and scenario.get("initial_utterance"):
        turns.append({"turn": 1, "speaker": "caller", "text": str(scenario["initial_utterance"])})
        response = str(expected.get("sample_response", "Acknowledged and ready to continue."))
        turns.append({"turn": 1, "speaker": "agent", "text": response})

    return {
        "turns": turns,
        "transcript": turns,
        "assistant_text": " ".join(
            str(turn["text"]) for turn in turns if turn.get("speaker") == "agent"
        ),
        "outcome": expected.get("outcome", scenario.get("outcome", "")),
        "transitions": scenario.get("transitions", expected.get("transitions", [])),
        "tool_calls": scenario.get("tool_calls", []),
        "variables": scenario.get("variables", {}),
        "guardrails": scenario.get("guardrails", []),
    }


def _assertion_result(assertion: EvalAssertionInput, trace: dict[str, object]) -> dict[str, object]:
    expected = _as_dict(assertion.expected)
    assertion_type = assertion.type
    assistant_text = str(trace.get("assistant_text", ""))
    passed = False
    actual: dict[str, object] = {}
    explanation = "Assertion did not match the recorded execution trace."

    if assertion_type in {"contains", "not_contains", "regex"}:
        text = str(expected.get("text", ""))
        actual = {"assistant_text": assistant_text}
        if not text:
            explanation = "Text assertions require a non-empty expected value."
        elif len(text) > 500:
            explanation = "Text assertions are limited to 500 characters."
        elif assertion_type == "contains":
            passed = text.casefold() in assistant_text.casefold()
        elif assertion_type == "not_contains":
            passed = text.casefold() not in assistant_text.casefold()
        else:
            try:
                passed = re.search(text, assistant_text, flags=re.IGNORECASE) is not None
            except re.error:
                explanation = "The configured regular expression is invalid."
        explanation = (
            "The assistant transcript matched the configured text assertion."
            if passed
            else explanation
        )
    elif assertion_type == "outcome":
        actual = {"outcome": trace.get("outcome", "")}
        expected_value = str(expected.get("value", expected.get("outcome", ""))).strip()
        if not expected_value:
            explanation = "Outcome assertions require a non-empty expected value."
        else:
            passed = str(actual["outcome"]).strip() == expected_value
        explanation = (
            "The recorded outcome matched the expected workflow outcome." if passed else explanation
        )
    elif assertion_type == "state_transition":
        actual = {"transitions": trace.get("transitions", [])}
        transitions = _as_list(trace.get("transitions"))
        expected_from = str(expected.get("from", ""))
        expected_to = str(expected.get("to", ""))
        if not expected_from or not expected_to:
            explanation = "Transition assertions require both source and target states."
        else:
            passed = any(
                isinstance(item, dict)
                and str(item.get("from", "")) == expected_from
                and str(item.get("to", "")) == expected_to
                for item in transitions
            )
        explanation = "The expected workflow transition was recorded." if passed else explanation
    elif assertion_type == "tool_call":
        calls = _as_list(trace.get("tool_calls"))
        expected_name = str(expected.get("name", ""))
        actual = {"tool_calls": calls}
        if not expected_name:
            explanation = "Tool-call assertions require a non-empty tool name."
        else:
            passed = any(
                isinstance(item, dict) and str(item.get("name", "")) == expected_name
                for item in calls
            )
        explanation = "The expected tool call was recorded." if passed else explanation
    elif assertion_type == "variable":
        variables = _as_dict(trace.get("variables"))
        key = str(expected.get("key", ""))
        actual = {"key": key, "value": variables.get(key)}
        if not key:
            explanation = "Variable assertions require a non-empty variable key."
        else:
            passed = key in variables and (
                "value" not in expected or variables.get(key) == expected.get("value")
            )
        explanation = "The expected variable was extracted." if passed else explanation
    elif assertion_type == "guardrail":
        guardrails = _as_list(trace.get("guardrails"))
        expected_name = str(expected.get("name", ""))
        actual = {"guardrails": guardrails}
        if not expected_name:
            explanation = "Guardrail assertions require a non-empty guardrail name."
        else:
            passed = expected_name in guardrails
        explanation = "The expected guardrail event was recorded." if passed else explanation
    elif assertion_type == "max_turns":
        turns = _as_list(trace.get("turns"))
        actual = {"turn_count": len({item.get("turn") for item in turns if isinstance(item, dict)})}
        try:
            max_turns = int(expected.get("value", 0))
        except (TypeError, ValueError):
            max_turns = -1
        passed = max_turns >= 0 and int(actual["turn_count"]) <= max_turns
        if max_turns < 0:
            explanation = "Turn-limit assertions require a non-negative integer value."
        explanation = (
            "The conversation completed within the configured turn limit."
            if passed
            else explanation
        )

    if passed and explanation == "Assertion did not match the recorded execution trace.":
        explanation = "The assertion passed."
    return {
        "key": assertion.key,
        "type": assertion.type,
        "passed": passed,
        "critical": assertion.critical,
        "expected": expected,
        "actual": actual,
        "explanation": explanation,
    }


def _score_case(
    case_version: EvalCaseVersion, trace: dict[str, object]
) -> tuple[float, bool, list[dict[str, object]], list[dict[str, object]]]:
    assertions = [
        _assertion_result(EvalAssertionInput.model_validate(item), trace)
        for item in case_version.assertions
    ]
    rubric = [dict(item) for item in _as_list(case_version.rubric) if isinstance(item, dict)]
    metric_results: list[dict[str, object]] = []
    for metric in rubric:
        threshold = _as_float(metric.get("threshold", 0.7), 0.7)
        assertion_score = (
            sum(1 for item in assertions if item["passed"]) / len(assertions) if assertions else 0.0
        )
        metric_results.append(
            {
                "metric_key": str(metric.get("key", "quality")),
                "score": assertion_score,
                "weight": _as_float(metric.get("weight", 1.0), 1.0, minimum=0.001, maximum=100.0),
                "explanation": "V1 deterministic judge derived the score from configured assertions.",
                "judge_metadata": {
                    "judge": "deterministic",
                    "version": "v1",
                    "threshold": threshold,
                    "passed": assertion_score >= threshold,
                },
            }
        )
    if metric_results:
        weight_total = sum(float(item["weight"]) for item in metric_results)
        score = (
            sum(float(item["score"]) * float(item["weight"]) for item in metric_results)
            / weight_total
        )
    else:
        score = (
            sum(1 for item in assertions if item["passed"]) / len(assertions) if assertions else 0.0
        )
    metrics_passed = all(
        float(metric["score"]) >= float(metric["judge_metadata"].get("threshold", 0.7))
        for metric in metric_results
    )
    passed = (
        bool(assertions or metric_results)
        and score >= 0.7
        and metrics_passed
        and not any(not item["passed"] and item["critical"] for item in assertions)
    )
    return score, passed, assertions, metric_results


def _initial_utterance(scenario: dict[str, object], caller_config: dict[str, object]) -> str:
    return str(
        caller_config.get("initial_utterance")
        or scenario.get("initial_utterance")
        or "Hello, I am calling about the service."
    ).strip()


def _caller_system_prompt(
    case: EvalCase,
    scenario: dict[str, object],
    caller_config: dict[str, object],
) -> str:
    turns = scenario.get("turns", [])
    turn_instructions = json.dumps(turns, ensure_ascii=True) if isinstance(turns, list) else "[]"
    return "\n".join(
        [
            "You are an automated evaluation caller acting as the farmer in a real voice call.",
            "Speak naturally and briefly. Never describe this evaluation to the other agent.",
            f"Test case: {case.name}.",
            f"Scenario: {json.dumps(scenario, ensure_ascii=True)}",
            f"Configured caller instructions: {json.dumps(caller_config, ensure_ascii=True)}",
            f"If a turn script exists, follow it in order: {turn_instructions}",
            "Answer the production agent's questions using only the scenario context.",
            "Wait for the production agent to finish each turn unless this case explicitly tests an interruption.",
            "For an interruption case, use a short, natural correction or objection and yield once the agent acknowledges you.",
            "When the agent reaches a clear conclusion or closing, call finish_eval_case.",
            "Do not invent tools, bookings, or facts that are not in the scenario.",
        ]
    )


def _normalize_live_trace(evidence: dict[str, object]) -> dict[str, object]:
    transcript = [
        item
        for item in _as_list(evidence.get("transcript"))
        if isinstance(item, dict) and str(item.get("text", "")).strip()
    ]
    for index, item in enumerate(transcript, start=1):
        item.setdefault("turn", index)
        item.setdefault("speaker", "unknown")
    assistant_text = str(evidence.get("assistant_text", "")).strip()
    if not assistant_text:
        assistant_text = " ".join(
            str(item.get("text", "")) for item in transcript if item.get("speaker") == "agent"
        )
    return {
        "turns": transcript,
        "transcript": transcript,
        "assistant_text": assistant_text,
        "outcome": evidence.get("outcome", ""),
        "transitions": _as_list(evidence.get("transitions")),
        "tool_calls": _as_list(evidence.get("tool_calls")),
        "variables": _as_dict(evidence.get("variables")),
        "guardrails": _as_list(evidence.get("guardrails")),
        "metrics": _as_dict(evidence.get("metrics")),
        "recording": _as_dict(evidence.get("recording")),
        "error": evidence.get("error", ""),
    }


def _evaluation_variables(
    agent_version: Any,
    scenario: dict[str, object],
    caller_config: dict[str, object],
) -> dict[str, object]:
    values = {
        **_as_dict(caller_config.get("variables")),
        **_as_dict(scenario.get("variables")),
    }
    routing = _as_dict(agent_version.routing_config)
    definitions = routing.get("variables", [])
    for item in definitions if isinstance(definitions, list) else []:
        if not isinstance(item, dict) or not item.get("required"):
            continue
        key = str(item.get("key", ""))
        if key and key not in values:
            values[key] = {
                "farmer_name": "Test Farmer",
                "farmer_crop": "pomegranate",
            }.get(key, "test value")
    return values


class EvaluationService:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.tenants = TenantRepository(session)
        self.workspaces = WorkspaceRepository(session)
        self.agents = AgentRepository(session)
        self.calls = CallRepository(session)
        self.evals = EvalRepository(session)

    def _tenant_workspace(self, tenant_slug: str, workspace_id):
        tenant = self.tenants.get_by_slug(tenant_slug)
        if tenant is None:
            return None
        workspace = self.workspaces.get_for_tenant(tenant.id, workspace_id)
        return (tenant, workspace) if workspace is not None else None

    def list_suites(
        self, tenant_slug: str, workspace_id, *, tenant_id=None
    ) -> list[EvalSuiteRecord] | None:
        context = self._tenant_workspace(tenant_slug, workspace_id)
        if context is None:
            return None
        tenant, workspace = context
        return [
            _suite_record(item)
            for item in self.evals.list_suites(tenant_id or tenant.id, workspace.id)
        ]

    def get_suite(self, tenant_slug: str, workspace_id, suite_id) -> EvalSuiteDetailRecord | None:
        context = self._tenant_workspace(tenant_slug, workspace_id)
        if context is None:
            return None
        tenant, workspace = context
        suite = self.evals.get_suite(tenant.id, workspace.id, suite_id)
        if suite is None:
            return None
        base = _suite_record(suite)
        return EvalSuiteDetailRecord(
            **base.model_dump(), cases=[_case_record(item) for item in suite.cases]
        )

    def list_runs(
        self, tenant_slug: str, workspace_id, suite_id, *, limit: int = 50
    ) -> list[EvalRunSummaryRecord] | None:
        context = self._tenant_workspace(tenant_slug, workspace_id)
        if context is None:
            return None
        tenant, workspace = context
        suite = self.evals.get_suite(tenant.id, workspace.id, suite_id)
        if suite is None:
            return None
        return [
            EvalRunSummaryRecord(
                run_id=run.id,
                suite_id=run.suite_id,
                suite_version_id=run.suite_version_id,
                execution_mode=run.execution_mode,
                status=run.status,
                total_cases=run.total_cases,
                passed_cases=run.passed_cases,
                failed_cases=run.failed_cases,
                score=run.score,
                summary=run.summary,
                created_at=run.created_at,
                started_at=run.started_at,
                ended_at=run.ended_at,
            )
            for run in self.evals.list_runs(tenant.id, workspace.id, suite_id, limit=limit)
        ]

    def create_suite(
        self, tenant_slug: str, workspace_id, payload: EvalSuiteCreateInput
    ) -> EvalSuiteDetailRecord | None:
        context = self._tenant_workspace(tenant_slug, workspace_id)
        if context is None:
            return None
        tenant, workspace = context
        agent = self.agents.get_definition_for_workspace(tenant.id, workspace.id, payload.agent_id)
        if agent is None or not agent.versions:
            return None
        agent_version = agent.versions[-1]
        suite = EvalSuite(
            tenant_id=tenant.id,
            workspace_id=workspace.id,
            agent_definition_id=agent.id,
            suite_key=payload.suite_key,
            name=payload.name,
            description=payload.description,
            status=payload.status,
        )
        self.evals.create_suite(suite)
        suite_version = EvalSuiteVersion(
            suite_id=suite.id,
            agent_version_id=agent_version.id,
            version_number=1,
            execution_defaults=payload.execution_defaults,
        )
        self.evals.create_suite_version(suite_version)
        for index, case_payload in enumerate(payload.cases):
            self._create_case(suite, case_payload, index)
        self.session.flush()
        return self.get_suite(tenant_slug, workspace_id, suite.id)

    def update_suite(
        self, tenant_slug: str, workspace_id, suite_id, payload: EvalSuiteUpdateInput
    ) -> EvalSuiteRecord | None:
        context = self._tenant_workspace(tenant_slug, workspace_id)
        if context is None:
            return None
        tenant, workspace = context
        suite = self.evals.get_suite(tenant.id, workspace.id, suite_id)
        if suite is None:
            return None
        for field in ("name", "description", "status"):
            value = getattr(payload, field)
            if value is not None:
                setattr(suite, field, value)
        self.session.flush()
        return _suite_record(suite)

    def create_case(
        self, tenant_slug: str, workspace_id, suite_id, payload: EvalCaseCreateInput
    ) -> EvalCaseRecord | None:
        context = self._tenant_workspace(tenant_slug, workspace_id)
        if context is None:
            return None
        tenant, workspace = context
        suite = self.evals.get_suite(tenant.id, workspace.id, suite_id)
        if suite is None:
            return None
        case = self._create_case(suite, payload, len(suite.cases))
        self.session.flush()
        return _case_record(case)

    def _create_case(
        self, suite: EvalSuite, payload: EvalCaseCreateInput, sort_order: int
    ) -> EvalCase:
        case = EvalCase(
            suite_id=suite.id, case_key=payload.case_key, name=payload.name, sort_order=sort_order
        )
        self.evals.create_case(case)
        self.evals.create_case_version(
            EvalCaseVersion(
                case_id=case.id,
                version_number=1,
                scenario=payload.scenario,
                expected_behavior=payload.expected_behavior,
                assertions=[item.model_dump(mode="json") for item in payload.assertions],
                rubric=[item.model_dump(mode="json") for item in payload.rubric],
                caller_config=payload.caller_config,
            )
        )
        return case

    def delete_case(self, tenant_slug: str, workspace_id, suite_id, case_id) -> bool | None:
        context = self._tenant_workspace(tenant_slug, workspace_id)
        if context is None:
            return None
        tenant, workspace = context
        suite = self.evals.get_suite(tenant.id, workspace.id, suite_id)
        if suite is None:
            return False
        case = next((item for item in suite.cases if item.id == case_id), None)
        if case is None:
            return False
        if any(version.case_runs for version in case.versions):
            case.status = "archived"
            self.session.flush()
            return True
        self.session.delete(case)
        self.session.flush()
        return True

    def update_case(
        self, tenant_slug: str, workspace_id, suite_id, case_id, payload: EvalCaseUpdateInput
    ) -> EvalCaseRecord | None:
        context = self._tenant_workspace(tenant_slug, workspace_id)
        if context is None:
            return None
        tenant, workspace = context
        suite = self.evals.get_suite(tenant.id, workspace.id, suite_id)
        if suite is None:
            return None
        case = next((item for item in suite.cases if item.id == case_id), None)
        if case is None or not case.versions:
            return None
        if payload.name is not None:
            case.name = payload.name
        if payload.status is not None:
            case.status = payload.status
        current = case.versions[-1]
        version_number = current.version_number + 1
        self.evals.create_case_version(
            EvalCaseVersion(
                case_id=case.id,
                version_number=version_number,
                scenario=payload.scenario if payload.scenario is not None else current.scenario,
                expected_behavior=(
                    payload.expected_behavior
                    if payload.expected_behavior is not None
                    else current.expected_behavior
                ),
                assertions=(
                    [item.model_dump(mode="json") for item in payload.assertions]
                    if payload.assertions is not None
                    else current.assertions
                ),
                rubric=(
                    [item.model_dump(mode="json") for item in payload.rubric]
                    if payload.rubric is not None
                    else current.rubric
                ),
                caller_config=(
                    payload.caller_config
                    if payload.caller_config is not None
                    else current.caller_config
                ),
            )
        )
        self.session.flush()
        return _case_record(case)

    def run_suite(
        self, tenant_slug: str, workspace_id, suite_id, payload: EvalRunCreateInput
    ) -> EvalRunRecord | None:
        if payload.execution_mode not in SUPPORTED_EXECUTION_MODES:
            supported = ", ".join(sorted(SUPPORTED_EXECUTION_MODES))
            raise ValueError(
                f"execution mode '{payload.execution_mode}' is not enabled in this environment; "
                f"supported modes: {supported}"
            )
        context = self._tenant_workspace(tenant_slug, workspace_id)
        if context is None:
            return None
        tenant, workspace = context
        suite = self.evals.get_suite(tenant.id, workspace.id, suite_id)
        if suite is None or not suite.versions:
            return None
        suite_version = suite.versions[-1]
        selected_cases = [
            case for case in suite.cases if payload.case_ids is None or case.id in payload.case_ids
        ]
        if not selected_cases:
            raise ValueError("evaluation suite has no selected cases")
        case_versions = {
            str(case.id): case.versions[-1] for case in selected_cases if case.versions
        }
        if len(case_versions) != len(selected_cases):
            raise ValueError("evaluation suite contains a case without a version")
        run = EvalRun(
            tenant_id=tenant.id,
            workspace_id=workspace.id,
            suite_id=suite.id,
            suite_version_id=suite_version.id,
            execution_mode=payload.execution_mode,
            status="running",
            total_cases=len(selected_cases) * payload.repeat_count,
            config_snapshot={
                "repeat_count": payload.repeat_count,
                "fail_fast": payload.fail_fast,
                "agent_version_id": str(suite_version.agent_version_id),
                "execution_mode": payload.execution_mode,
                "case_version_ids": {
                    case_id: str(version.id) for case_id, version in case_versions.items()
                },
            },
            started_at=_now(),
        )
        self.evals.create_run(run)
        scores: list[float] = []
        for repeat in range(payload.repeat_count):
            for case in selected_cases:
                case_version = case_versions.get(str(case.id))
                if case_version is None:
                    continue
                case_run = self._run_case(
                    tenant.id, workspace.id, run, case, case_version, payload.execution_mode, repeat
                )
                scores.append(case_run.score or 0.0)
                if payload.fail_fast and case_run.passed is False:
                    break
            else:
                continue
            break
        run.status = "completed"
        run.passed_cases = sum(1 for item in run.case_runs if item.passed)
        run.failed_cases = len(run.case_runs) - run.passed_cases
        run.score = sum(scores) / len(scores) if scores else 0.0
        run.summary = f"{run.passed_cases} of {len(run.case_runs)} executed cases passed."
        run.ended_at = _now()
        self.session.flush()
        return self.get_run(tenant_slug, workspace_id, run.id)

    def create_live_run(
        self, tenant_slug: str, workspace_id, suite_id, payload: EvalRunCreateInput
    ) -> EvalRunRecord | None:
        context = self._tenant_workspace(tenant_slug, workspace_id)
        if context is None:
            return None
        tenant, workspace = context
        suite = self.evals.get_suite(tenant.id, workspace.id, suite_id)
        if suite is None or not suite.versions:
            return None
        suite_version = suite.versions[-1]
        selected_cases = [
            case for case in suite.cases if payload.case_ids is None or case.id in payload.case_ids
        ]
        if not selected_cases:
            raise ValueError("evaluation suite has no selected cases")
        case_versions = {
            str(case.id): case.versions[-1] for case in selected_cases if case.versions
        }
        if len(case_versions) != len(selected_cases):
            raise ValueError("evaluation suite contains a case without a version")
        run = EvalRun(
            tenant_id=tenant.id,
            workspace_id=workspace.id,
            suite_id=suite.id,
            suite_version_id=suite_version.id,
            execution_mode="live_audio",
            status="queued",
            total_cases=len(selected_cases) * payload.repeat_count,
            config_snapshot={
                "repeat_count": payload.repeat_count,
                "fail_fast": payload.fail_fast,
                "agent_version_id": str(suite_version.agent_version_id),
                "execution_mode": "live_audio",
                "case_version_ids": {
                    case_id: str(version.id) for case_id, version in case_versions.items()
                },
            },
        )
        self.evals.create_run(run)
        for repeat in range(payload.repeat_count):
            for case in selected_cases:
                case_version = case_versions.get(str(case.id))
                if case_version is None:
                    continue
                self.evals.create_case_run(
                    EvalCaseRun(
                        run_id=run.id,
                        case_version_id=case_version.id,
                        status="queued",
                        evidence={"repeat": repeat + 1},
                    )
                )
        self.session.flush()
        return self.get_run(tenant_slug, workspace_id, run.id)

    async def execute_live_run(self, settings, tenant_slug: str, workspace_id, run_id) -> None:
        try:
            await self._execute_live_run(settings, tenant_slug, workspace_id, run_id)
        except Exception as exc:
            self.session.rollback()
            run = self.evals.get_run_for_execution(run_id)
            if run is not None:
                now = _now()
                run.status = "failed"
                run.failed_cases = sum(1 for item in run.case_runs if item.passed is False)
                run.passed_cases = sum(1 for item in run.case_runs if item.passed is True)
                for case_run in run.case_runs:
                    if case_run.status in {"queued", "running"}:
                        case_run.status = "failed"
                        case_run.passed = False
                        case_run.failure_summary = "Live evaluation stopped before the case completed."
                        case_run.ended_at = now
                run.failed_cases = sum(1 for item in run.case_runs if item.passed is False)
                run.summary = f"Live evaluation failed: {str(exc)[:850]}"
                run.ended_at = now
                self.session.commit()
            raise

    async def _execute_live_run(self, settings, tenant_slug: str, workspace_id, run_id) -> None:
        from voice_backend.secrets import encrypt_runtime_metadata
        from voice_backend.services.live_test_session import LiveTestSessionService
        from voice_backend.services.realtime_session import (
            RealtimeSessionError,
            RealtimeSessionService,
        )

        run = self.evals.get_run_for_execution(run_id)
        if run is None:
            return
        run.status = "running"
        run.started_at = _now()
        self.session.commit()
        realtime = RealtimeSessionService(settings)
        suite = run.suite_version.suite
        for case_run in list(run.case_runs):
            if case_run.status != "queued":
                continue
            case = case_run.case_version.case
            execution_id = f"{run.id}:{case_run.id}"
            scenario = _as_dict(case_run.case_version.scenario)
            caller_config = _as_dict(case_run.case_version.caller_config)
            variables = _evaluation_variables(
                run.suite_version.agent_version,
                scenario,
                caller_config,
            )
            case_run.status = "running"
            case_run.started_at = _now()
            case_run.evidence = {"execution_id": execution_id, "repeat": case_run.evidence.get("repeat", 1)}
            self.session.commit()
            waiter = register_live_case(execution_id)
            room_name = f"eval-{str(run.id)[:8]}-{str(case_run.id)[:8]}"
            agent_dispatch_id = None
            caller_dispatch_id = None
            try:
                prepared = LiveTestSessionService(self.session).prepare_browser_session(
                    tenant_slug,
                    workspace_id,
                    BrowserRtcSessionCreateInput(
                        agent_id=suite.agent_definition_id,
                        variables=variables,
                        participant_name="Evaluation caller",
                    ),
                )
                if prepared is None:
                    raise RealtimeSessionError("evaluation agent configuration not found")
                _manifest, agent_dispatch_id = await realtime.create_server_session(
                    prepared.session_input,
                    room_name=room_name,
                )
                caller_payload = prepared.session_input.model_dump(mode="json", exclude_none=True)
                caller_payload["session_id"] = execution_id
                caller_payload["dispatch_agent_name"] = "voice-eval-caller"
                caller_payload["prompt"] = {
                    "system_prompt": _caller_system_prompt(case, scenario, caller_config),
                    "opening_message": _initial_utterance(scenario, caller_config),
                }
                caller_payload["room"] = {
                    **caller_payload.get("room", {}),
                    "room_name": room_name,
                    "participant_identity": None,
                    "delete_room_on_close": False,
                }
                caller_payload["metadata"] = {
                    **caller_payload.get("metadata", {}),
                    "evaluation_execution_id": execution_id,
                    "evaluation_callback_url": (
                        settings.backend_base_url.rstrip("/")
                        + "/api/v1/internal/evaluations/case-results"
                    ),
                    "evaluation_case_key": case.case_key,
                }
                caller_dispatch_id = await realtime.dispatch_agent(
                    room_name=room_name,
                    agent_name="voice-eval-caller",
                    metadata=encrypt_runtime_metadata(json.dumps(caller_payload), settings),
                )
                try:
                    evidence = await asyncio.wait_for(
                        waiter,
                        timeout=LIVE_CASE_TIMEOUT_SECONDS,
                    )
                except TimeoutError:
                    evidence = {
                        "transcript": [],
                        "assistant_text": "",
                        "outcome": "evaluation_timeout",
                        "guardrails": ["caller_timeout"],
                        "error": "caller did not complete within the evaluation timeout",
                    }
                trace = _normalize_live_trace(evidence)
                self._persist_live_case_result(run, case_run, trace, settings)
                self.session.commit()
            except Exception as exc:
                self._persist_live_case_result(
                    run,
                    case_run,
                    {
                        "transcript": [],
                        "assistant_text": "",
                        "outcome": "evaluation_error",
                        "guardrails": ["evaluation_runtime_error"],
                        "error": str(exc),
                    },
                    settings,
                )
                self.session.commit()
            finally:
                _LIVE_CASE_WAITERS.pop(execution_id, None)
                try:
                    await realtime.cleanup_browser_session(
                        room_name=room_name,
                        dispatch_id=agent_dispatch_id or caller_dispatch_id,
                    )
                except Exception:
                    pass
            if run.config_snapshot.get("fail_fast") and case_run.passed is False:
                break
        run.status = "completed"
        run.passed_cases = sum(1 for item in run.case_runs if item.passed is True)
        run.failed_cases = sum(1 for item in run.case_runs if item.passed is False)
        completed_scores = [item.score for item in run.case_runs if item.score is not None]
        run.score = sum(completed_scores) / len(completed_scores) if completed_scores else 0.0
        run.summary = f"{run.passed_cases} of {run.passed_cases + run.failed_cases} executed cases passed."
        run.ended_at = _now()
        self.session.commit()

    def _persist_live_case_result(
        self,
        run: EvalRun,
        case_run: EvalCaseRun,
        trace: dict[str, object],
        settings,
    ) -> None:
        score, passed, assertions, metrics = _score_case(case_run.case_version, trace)
        now = _now()
        call = self.calls.create(
            run.tenant_id,
            run.workspace_id,
            direction="simulation",
            status="completed",
            is_test=True,
            agent_version_id=run.suite_version.agent_version_id,
            resolved_config={
                "source": "eval",
                "eval_run_id": str(run.id),
                "eval_case_id": str(case_run.case_version.case_id),
                "execution_mode": "live_audio",
                "status_label": "Completed" if passed else "Dropped",
                "summary": "LiveKit evaluation call completed.",
                "outcome": trace.get("outcome", "evaluation_failed"),
                "transcript": trace.get("transcript", []),
                "tool_calls": trace.get("tool_calls", []),
                "guardrails": trace.get("guardrails", []),
                "extracted_variables": trace.get("variables", {}),
                "metrics": {"score": score, "execution_mode": "live_audio"},
                "recording": trace.get("recording", {}),
            },
            started_at=case_run.started_at or now,
            ended_at=now,
        )
        self.session.add(
            CallEvent(
                call_id=call.id,
                tenant_id=run.tenant_id,
                event_type="eval.case.completed",
                payload={
                    "run_id": str(run.id),
                    "case_id": str(case_run.case_version.case_id),
                    "execution_mode": "live_audio",
                    "passed": passed,
                    "score": score,
                },
                occurred_at=now,
            )
        )
        case_run.call_id = call.id
        case_run.status = "completed"
        case_run.passed = passed
        case_run.score = score
        case_run.failure_summary = "" if passed else "One or more evaluation assertions failed."
        case_run.evidence = trace
        case_run.ended_at = now
        for assertion in assertions:
            self.session.add(
                EvalAssertionResult(
                    case_run_id=case_run.id,
                    assertion_key=assertion["key"],
                    assertion_type=assertion["type"],
                    passed=assertion["passed"],
                    critical=assertion["critical"],
                    expected=assertion["expected"],
                    actual=assertion["actual"],
                    explanation=assertion["explanation"],
                )
            )
        for metric in metrics:
            self.session.add(EvalMetricResult(case_run_id=case_run.id, **metric))
        self.session.flush()

    def _run_case(
        self,
        tenant_id,
        workspace_id,
        run: EvalRun,
        case: EvalCase,
        case_version: EvalCaseVersion,
        execution_mode: str,
        repeat: int,
    ) -> EvalCaseRun:
        trace = _trace_for_case(case_version)
        score, passed, assertions, metrics = _score_case(case_version, trace)
        now = _now()
        call = self.calls.create(
            tenant_id,
            workspace_id,
            direction="simulation",
            status="completed",
            is_test=True,
            agent_version_id=run.suite_version.agent_version_id,
            resolved_config={
                "source": "eval",
                "eval_run_id": str(run.id),
                "eval_case_id": str(case.id),
                "execution_mode": execution_mode,
                "repeat": repeat + 1,
                "scenario_name": case.name,
                "status_label": "Completed",
                "summary": "Evaluation simulation completed.",
                "outcome": trace.get("outcome", "") if passed else "evaluation_failed",
                "transcript": trace.get("transcript", []),
                "tool_calls": trace.get("tool_calls", []),
                "guardrails": trace.get("guardrails", []),
                "extracted_variables": trace.get("variables", {}),
                "metrics": {"score": score, "execution_mode": execution_mode},
            },
            started_at=now,
            ended_at=now,
        )
        self.session.add(
            CallEvent(
                call_id=call.id,
                tenant_id=tenant_id,
                event_type="eval.case.completed",
                payload={
                    "run_id": str(run.id),
                    "case_id": str(case.id),
                    "passed": passed,
                    "score": score,
                },
                occurred_at=now,
            )
        )
        case_run = self.evals.create_case_run(
            EvalCaseRun(
                run_id=run.id,
                case_version_id=case_version.id,
                call_id=call.id,
                status="completed",
                passed=passed,
                score=score,
                failure_summary="" if passed else "One or more evaluation assertions failed.",
                evidence=trace,
                started_at=now,
                ended_at=now,
            )
        )
        for assertion in assertions:
            self.session.add(
                EvalAssertionResult(
                    case_run_id=case_run.id,
                    assertion_key=assertion["key"],
                    assertion_type=assertion["type"],
                    passed=assertion["passed"],
                    critical=assertion["critical"],
                    expected=assertion["expected"],
                    actual=assertion["actual"],
                    explanation=assertion["explanation"],
                )
            )
        for metric in metrics:
            self.session.add(EvalMetricResult(case_run_id=case_run.id, **metric))
        self.session.flush()
        return case_run

    def get_run(self, tenant_slug: str, workspace_id, run_id) -> EvalRunRecord | None:
        context = self._tenant_workspace(tenant_slug, workspace_id)
        if context is None:
            return None
        tenant, workspace = context
        run = self.evals.get_run(tenant.id, workspace.id, run_id)
        if run is None:
            return None
        return EvalRunRecord(
            run_id=run.id,
            suite_id=run.suite_id,
            suite_version_id=run.suite_version_id,
            execution_mode=run.execution_mode,
            status=run.status,
            total_cases=run.total_cases,
            passed_cases=run.passed_cases,
            failed_cases=run.failed_cases,
            score=run.score,
            summary=run.summary,
            created_at=run.created_at,
            started_at=run.started_at,
            ended_at=run.ended_at,
            case_runs=[
                EvalCaseRunRecord(
                    case_run_id=item.id,
                    case_id=item.case_version.case_id,
                    case_name=item.case_version.case.name,
                    call_id=item.call_id,
                    status=item.status,
                    passed=item.passed,
                    score=item.score,
                    failure_summary=item.failure_summary,
                    evidence=_as_dict(item.evidence),
                    assertions=[
                        EvalAssertionResultRecord.model_validate(result, from_attributes=True)
                        for result in item.assertion_results
                    ],
                    metrics=[
                        EvalMetricResultRecord.model_validate(result, from_attributes=True)
                        for result in item.metric_results
                    ],
                )
                for item in run.case_runs
            ],
        )
