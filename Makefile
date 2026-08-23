UV ?= uv
COMPOSE ?= docker compose
ENV ?= dev

.PHONY: setup node-setup infra-up infra-down infra-logs temporal-dev db-migrate db-seed db-verify backend pipeline pipeline-worker jobs mock livekit dev-up dev-down dev-status lint format test verify review-end-2-end profile-backend dev help

help:
	@echo "Available targets:"
	@echo "  make setup        - install Python workspace dependencies"
	@echo "  make node-setup   - install root and mock design npm dependencies"
	@echo "  make infra-up     - optional local PostgreSQL and Adminer via Docker"
	@echo "  make infra-down   - stop local Docker infra"
	@echo "  make temporal-dev - start Temporal local dev server"
	@echo "  make db-migrate   - apply database migrations for ENV=$(ENV)"
	@echo "  make db-seed      - seed the default admin workspace for ENV=$(ENV)"
	@echo "  make db-verify    - verify alembic head, required indexes, and seed presence for ENV=$(ENV)"
	@echo "  make backend      - run the backend API for ENV=$(ENV)"
	@echo "  make pipeline     - run the pipeline runtime shell for ENV=$(ENV)"
	@echo "  make pipeline-worker - run the LiveKit worker for ENV=$(ENV)"
	@echo "  make jobs         - run the jobs service shell for ENV=$(ENV)"
	@echo "  make mock         - run the mock design app"
	@echo "  make livekit      - run a local LiveKit server in dev mode"
	@echo "  make dev-up       - start local Voice services in the background"
	@echo "  make dev-down     - stop local Voice background services"
	@echo "  make dev-status   - show local Voice background service status"
	@echo "  make lint         - run Ruff lint checks"
	@echo "  make format       - run Ruff formatting"
	@echo "  make test         - run pytest"
	@echo "  make verify       - run frontend, lint, and pytest verification"
	@echo "  make review-end-2-end - run repo-wide verification baseline plus Playwright e2e"
	@echo "  make profile-backend - run the seeded backend API latency profile"
	@echo "  make dev          - print the recommended local startup order"

setup:
	$(UV) sync --all-packages --all-groups --no-install-workspace

node-setup:
	npm install

infra-up:
	$(COMPOSE) up -d postgres adminer

infra-down:
	$(COMPOSE) down

infra-logs:
	$(COMPOSE) logs -f postgres adminer

temporal-dev:
	temporal server start-dev --db-filename ./.local/temporal.dev.db --ui-port 8233

db-migrate:
	VOICE_ENVIRONMENT=$(ENV) $(UV) run --package voice-migrator voice-migrate upgrade head

db-seed:
	VOICE_ENVIRONMENT=$(ENV) $(UV) run --package voice-migrator voice-seed

db-verify:
	VOICE_ENVIRONMENT=$(ENV) $(UV) run --package voice-migrator voice-db-verify

backend:
	VOICE_ENVIRONMENT=$(ENV) VOICE_LIVEKIT_URL=$${VOICE_LIVEKIT_URL:-ws://127.0.0.1:7880} VOICE_LIVEKIT_API_KEY=$${VOICE_LIVEKIT_API_KEY:-devkey} VOICE_LIVEKIT_API_SECRET=$${VOICE_LIVEKIT_API_SECRET:-secret} $(UV) run --package voice-backend voice-backend-dev

pipeline:
	VOICE_ENVIRONMENT=$(ENV) VOICE_LIVEKIT_URL=$${VOICE_LIVEKIT_URL:-ws://127.0.0.1:7880} VOICE_LIVEKIT_API_KEY=$${VOICE_LIVEKIT_API_KEY:-devkey} VOICE_LIVEKIT_API_SECRET=$${VOICE_LIVEKIT_API_SECRET:-secret} $(UV) run --package voice-pipeline voice-pipeline-dev

pipeline-worker:
	VOICE_ENVIRONMENT=$(ENV) VOICE_LIVEKIT_STARTUP_MODE=dispatch VOICE_LIVEKIT_URL=$${VOICE_LIVEKIT_URL:-ws://127.0.0.1:7880} VOICE_LIVEKIT_API_KEY=$${VOICE_LIVEKIT_API_KEY:-devkey} VOICE_LIVEKIT_API_SECRET=$${VOICE_LIVEKIT_API_SECRET:-secret} $(UV) run --package voice-pipeline voice-pipeline-worker dev

jobs:
	VOICE_ENVIRONMENT=$(ENV) $(UV) run --package voice-jobs voice-jobs-dev

mock:
	npm run dev

livekit:
	livekit-server --dev

dev-up:
	./scripts/dev-up.sh $(ENV)

dev-down:
	./scripts/dev-down.sh

dev-status:
	./scripts/dev-up.sh $(ENV) --status

lint:
	$(UV) run ruff check .

format:
	$(UV) run ruff format .

test:
	$(UV) run pytest

verify:
	npm run check
	$(MAKE) lint
	$(MAKE) test

review-end-2-end:
	$(MAKE) verify
	npm run test:e2e

profile-backend:
	$(UV) run --project backend python backend/scripts/profile_api_latency.py

dev:
	@echo "Recommended local startup:"
	@echo "  1. cp .env.example .env"
	@echo "  2. make setup"
	@echo "  3. make node-setup"
	@echo "  4. Set your Supabase connection strings in .env"
	@echo "  5. make temporal-dev"
	@echo "  6. make db-migrate ENV=dev"
	@echo "  7. make db-seed ENV=dev"
	@echo "  8. make db-verify ENV=dev"
	@echo "  9. In separate terminals run: make livekit, make backend ENV=dev, make pipeline ENV=dev, make pipeline-worker ENV=dev, make jobs ENV=dev, make mock"
