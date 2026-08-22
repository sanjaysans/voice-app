# Voice Code Architecture Diagram

This document describes the initial code architecture for the Voice app starter.
It is intentionally shaped for local-first development, mock-first product iteration,
and clean separation between future production services.

## Top-Level Repo Structure

```mermaid
flowchart TB
    repo["voice-app repo"]

    repo --> mock["mock_design<br/>clickable product prototype"]
    repo --> fe["frontend<br/>future production UI"]
    repo --> be["backend<br/>control-plane API"]
    repo --> pipe["pipeline<br/>realtime call runtime"]
    repo --> jobs["jobs<br/>async workflows + analytics"]
    repo --> mig["migrator<br/>schema migrations + seeds"]
    repo --> docs["docs<br/>architecture + process"]
    repo --> skills["skills<br/>Codex execution playbooks"]
```

## Runtime Architecture

```mermaid
flowchart LR
    user["Tenant user / operator"] --> mock["mock_design or frontend"]

    mock --> backend["backend<br/>FastAPI"]
    frontend["future frontend"] --> backend

    backend --> db[("PostgreSQL")]
    backend --> jobs["jobs<br/>Temporal worker APIs"]
    backend --> pipeline["pipeline<br/>LiveKit-based runtime"]

    pipeline --> livekit["LiveKit rooms / media transport"]
    pipeline --> stt["STT vendor adapter"]
    pipeline --> llm["LLM vendor adapter"]
    pipeline --> tts["TTS vendor adapter"]
    pipeline --> telephony["Telephony vendor adapter"]
    pipeline --> db

    jobs --> temporal["Temporal dev server"]
    jobs --> db

    migrator["migrator<br/>Alembic + seed CLI"] --> db
```

## Internal Package Structure

```mermaid
flowchart TB
    subgraph backend_pkg["backend"]
        be_src["src/voice_backend"]
        be_tests["tests/unit"]
        be_src --> be_app["app.py"]
        be_src --> be_cfg["config.py"]
        be_src --> be_log["logging.py"]
        be_src --> be_dev["dev.py"]
        be_tests --> be_test_app["endpoint + readiness tests"]
        be_tests --> be_test_cfg["config edge-case tests"]
    end

    subgraph pipeline_pkg["pipeline"]
        pipe_src["src/voice_pipeline"]
        pipe_tests["tests/unit"]
        pipe_src --> pipe_app["app.py"]
        pipe_src --> pipe_cfg["config.py"]
        pipe_src --> pipe_log["logging.py"]
        pipe_src --> pipe_dev["dev.py"]
        pipe_tests --> pipe_test_app["mode + readiness tests"]
        pipe_tests --> pipe_test_cfg["config tests"]
    end

    subgraph jobs_pkg["jobs"]
        jobs_src["src/voice_jobs"]
        jobs_tests["tests/unit"]
        jobs_src --> jobs_app["app.py"]
        jobs_src --> jobs_cfg["config.py"]
        jobs_src --> jobs_log["logging.py"]
        jobs_src --> jobs_dev["dev.py"]
        jobs_tests --> jobs_test_app["workflow readiness tests"]
        jobs_tests --> jobs_test_cfg["temporal config tests"]
    end

    subgraph migrator_pkg["migrator"]
        mig_src["src/voice_migrator"]
        mig_alembic["alembic"]
        mig_tests["tests/unit"]
        mig_src --> mig_cli["cli.py"]
        mig_src --> mig_cfg["config.py"]
        mig_src --> mig_seed["seed.py"]
        mig_src --> mig_log["logging.py"]
        mig_alembic --> mig_rev["versions/*"]
        mig_tests --> mig_test_cli["command dispatch tests"]
        mig_tests --> mig_test_seed["seed helper tests"]
        mig_tests --> mig_test_cfg["project-root tests"]
    end
```

## Third-Party Tools And Frameworks

```mermaid
flowchart TB
    root["voice-app"]

    root --> next["Next.js + React + Tailwind<br/>UI layers"]
    root --> fastapi["FastAPI<br/>backend, pipeline, jobs HTTP shells"]
    root --> pydantic["Pydantic Settings<br/>typed local config"]
    root --> structlog["structlog<br/>consistent service logging"]
    root --> postgres["PostgreSQL<br/>core relational datastore"]
    root --> sqlalchemy["SQLAlchemy + Alembic<br/>schema + migration layer"]
    root --> uv["uv<br/>Python workspace + package runner"]
    root --> pytest["pytest<br/>unit test runner"]
    root --> ruff["Ruff<br/>lint + formatting"]
    root --> temporal["Temporal<br/>async workflow engine"]
    root --> livekit["LiveKit Agents<br/>realtime voice runtime foundation"]
    root --> docker["Docker Compose<br/>local Postgres/Adminer bootstrap"]
```

## Design Intent

- `mock_design` remains the stakeholder-facing, high-fidelity demo surface.
- `frontend` stays available for future production implementation without contaminating the mock.
- `backend` owns tenant, workspace, agent, connection, and operational state.
- `pipeline` owns media/session orchestration and future vendor adapter composition.
- `jobs` owns post-call processing, sync, and analytics workflows.
- `migrator` is the only package allowed to mutate schema shape directly.
- Each Python package owns its own unit test layer so coverage can grow with the service boundary.
