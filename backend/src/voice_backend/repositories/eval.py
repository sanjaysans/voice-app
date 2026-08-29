from __future__ import annotations

from uuid import UUID

from sqlalchemy import desc, select
from sqlalchemy.orm import Session, joinedload

from voice_backend.models import (
    EvalCase,
    EvalCaseRun,
    EvalCaseVersion,
    EvalRun,
    EvalSuite,
    EvalSuiteVersion,
)


class EvalRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def list_suites(self, tenant_id, workspace_id) -> list[EvalSuite]:
        statement = (
            select(EvalSuite)
            .where(EvalSuite.tenant_id == tenant_id, EvalSuite.workspace_id == workspace_id)
            .options(joinedload(EvalSuite.versions), joinedload(EvalSuite.cases))
            .order_by(desc(EvalSuite.updated_at))
        )
        return list(self.session.scalars(statement).unique())

    def get_suite(self, tenant_id, workspace_id, suite_id: UUID) -> EvalSuite | None:
        statement = (
            select(EvalSuite)
            .where(
                EvalSuite.tenant_id == tenant_id,
                EvalSuite.workspace_id == workspace_id,
                EvalSuite.id == suite_id,
            )
            .options(
                joinedload(EvalSuite.versions),
                joinedload(EvalSuite.cases).joinedload(EvalCase.versions),
            )
        )
        return self.session.execute(statement).unique().scalar_one_or_none()

    def get_run(self, tenant_id, workspace_id, run_id: UUID) -> EvalRun | None:
        statement = (
            select(EvalRun)
            .where(
                EvalRun.tenant_id == tenant_id,
                EvalRun.workspace_id == workspace_id,
                EvalRun.id == run_id,
            )
            .options(
                joinedload(EvalRun.suite_version),
                joinedload(EvalRun.case_runs)
                .joinedload(EvalCaseRun.case_version)
                .joinedload(EvalCaseVersion.case),
                joinedload(EvalRun.case_runs).joinedload(EvalCaseRun.assertion_results),
                joinedload(EvalRun.case_runs).joinedload(EvalCaseRun.metric_results),
            )
        )
        return self.session.execute(statement).unique().scalar_one_or_none()

    def get_run_for_execution(self, run_id: UUID) -> EvalRun | None:
        statement = (
            select(EvalRun)
            .where(EvalRun.id == run_id)
            .options(
                joinedload(EvalRun.suite_version)
                .joinedload(EvalSuiteVersion.suite),
                joinedload(EvalRun.suite_version).joinedload(EvalSuiteVersion.agent_version),
                joinedload(EvalRun.case_runs)
                .joinedload(EvalCaseRun.case_version)
                .joinedload(EvalCaseVersion.case),
                joinedload(EvalRun.case_runs).joinedload(EvalCaseRun.assertion_results),
                joinedload(EvalRun.case_runs).joinedload(EvalCaseRun.metric_results),
            )
        )
        return self.session.execute(statement).unique().scalar_one_or_none()

    def list_runs(self, tenant_id, workspace_id, suite_id: UUID, limit: int = 50) -> list[EvalRun]:
        statement = (
            select(EvalRun)
            .where(
                EvalRun.tenant_id == tenant_id,
                EvalRun.workspace_id == workspace_id,
                EvalRun.suite_id == suite_id,
            )
            .order_by(desc(EvalRun.created_at))
            .limit(limit)
        )
        return list(self.session.scalars(statement))

    def create_suite(self, suite: EvalSuite) -> EvalSuite:
        self.session.add(suite)
        self.session.flush()
        return suite

    def create_suite_version(self, version: EvalSuiteVersion) -> EvalSuiteVersion:
        self.session.add(version)
        self.session.flush()
        return version

    def create_case(self, case: EvalCase) -> EvalCase:
        self.session.add(case)
        self.session.flush()
        return case

    def create_case_version(self, version: EvalCaseVersion) -> EvalCaseVersion:
        self.session.add(version)
        self.session.flush()
        return version

    def create_run(self, run: EvalRun) -> EvalRun:
        self.session.add(run)
        self.session.flush()
        return run

    def create_case_run(self, case_run: EvalCaseRun) -> EvalCaseRun:
        self.session.add(case_run)
        self.session.flush()
        return case_run
