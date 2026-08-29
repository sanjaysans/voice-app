#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENVIRONMENT="${1:-dev}"
MODE="${2:-start}"
PID_DIR="$ROOT_DIR/.local/pids"
LOG_DIR="$ROOT_DIR/.local/logs"

mkdir -p "$PID_DIR" "$LOG_DIR"

load_env_value() {
  local name="$1"
  local value=""

  if [[ -f "$ROOT_DIR/.env" ]]; then
    value="$(sed -n -E "s/^${name}=//p" "$ROOT_DIR/.env" | head -n 1)"
  fi

  if [[ -n "$value" ]]; then
    export "$name=$value"
  fi
}

load_env_value "VOICE_LIVEKIT_URL"
load_env_value "VOICE_LIVEKIT_API_KEY"
load_env_value "VOICE_LIVEKIT_API_SECRET"

BACKEND_RELOAD=""
if [[ "$ENVIRONMENT" == "dev" ]]; then
  BACKEND_RELOAD="--reload --reload-dir '$ROOT_DIR/backend/src'"
fi

services=()
if [[ -z "${VOICE_LIVEKIT_URL:-}" || "${VOICE_LIVEKIT_URL}" == ws://127.0.0.1:* || "${VOICE_LIVEKIT_URL}" == ws://localhost:* ]]; then
  services+=("livekit|livekit-server --dev")
else
  echo "Using hosted LiveKit at ${VOICE_LIVEKIT_URL}; local LiveKit server will not start."
fi

services+=(
  "backend|VOICE_ENVIRONMENT=$ENVIRONMENT VOICE_LIVEKIT_URL=\${VOICE_LIVEKIT_URL:-ws://127.0.0.1:7880} VOICE_LIVEKIT_API_KEY=\${VOICE_LIVEKIT_API_KEY:-devkey} VOICE_LIVEKIT_API_SECRET=\${VOICE_LIVEKIT_API_SECRET:-secret} uv run --package voice-backend uvicorn voice_backend.app:create_app --factory --host 0.0.0.0 --port 8100 $BACKEND_RELOAD"
  "pipeline|VOICE_ENVIRONMENT=$ENVIRONMENT VOICE_LIVEKIT_URL=\${VOICE_LIVEKIT_URL:-ws://127.0.0.1:7880} VOICE_LIVEKIT_API_KEY=\${VOICE_LIVEKIT_API_KEY:-devkey} VOICE_LIVEKIT_API_SECRET=\${VOICE_LIVEKIT_API_SECRET:-secret} uv run --package voice-pipeline uvicorn voice_pipeline.app:create_app --factory --host 0.0.0.0 --port 8101"
  "pipeline-worker|VOICE_ENVIRONMENT=$ENVIRONMENT VOICE_LIVEKIT_STARTUP_MODE=dispatch VOICE_LIVEKIT_URL=\${VOICE_LIVEKIT_URL:-ws://127.0.0.1:7880} VOICE_LIVEKIT_API_KEY=\${VOICE_LIVEKIT_API_KEY:-devkey} VOICE_LIVEKIT_API_SECRET=\${VOICE_LIVEKIT_API_SECRET:-secret} uv run --package voice-pipeline voice-pipeline-worker dev"
  "pipeline-eval-caller|VOICE_ENVIRONMENT=$ENVIRONMENT VOICE_LIVEKIT_STARTUP_MODE=dispatch VOICE_LIVEKIT_AGENT_NAME=voice-eval-caller VOICE_LIVEKIT_URL=\${VOICE_LIVEKIT_URL:-ws://127.0.0.1:7880} VOICE_LIVEKIT_API_KEY=\${VOICE_LIVEKIT_API_KEY:-devkey} VOICE_LIVEKIT_API_SECRET=\${VOICE_LIVEKIT_API_SECRET:-secret} VOICE_BACKEND_BASE_URL=\${VOICE_BACKEND_BASE_URL:-http://127.0.0.1:8100} VOICE_INTERNAL_API_KEY=\${VOICE_INTERNAL_API_KEY:-voice-local-internal-key} uv run --package voice-pipeline voice-pipeline-eval-caller dev"
  "jobs|VOICE_ENVIRONMENT=$ENVIRONMENT uv run --package voice-jobs uvicorn voice_jobs.app:create_app --factory --host 0.0.0.0 --port 8200"
  "frontend|npm --workspace frontend run dev"
)

service_pattern() {
  local name="$1"
  case "$name" in
    livekit) echo "livekit-server --dev" ;;
    backend) echo "uvicorn voice_backend.app:create_app --factory --host 0.0.0.0 --port 8100" ;;
    pipeline) echo "uvicorn voice_pipeline.app:create_app --factory --host 0.0.0.0 --port 8101" ;;
    pipeline-worker) echo "voice-pipeline-worker dev" ;;
    pipeline-eval-caller) echo "voice-pipeline-eval-caller dev" ;;
    jobs) echo "uvicorn voice_jobs.app:create_app --factory --host 0.0.0.0 --port 8200" ;;
    frontend) echo "$ROOT_DIR/node_modules/.bin/next dev" ;;
    *) return 1 ;;
  esac
}

service_existing_pid() {
  local name="$1"
  local pattern
  pattern="$(service_pattern "$name")" || return 1
  if [[ "$name" == "backend" ]]; then
    pgrep -f "voice-backend-dev|uvicorn voice_backend.app:create_app" | head -n 1 && return 0
  fi
  pgrep -f "$pattern" | head -n 1
}

status_service() {
  local name="$1"
  local pid_file="$PID_DIR/$name.pid"
  local pid=""
  if [[ -f "$pid_file" ]] && kill -0 "$(cat "$pid_file")" 2>/dev/null; then
    pid="$(cat "$pid_file")"
  else
    pid="$(service_existing_pid "$name" || true)"
    if [[ -n "$pid" ]]; then
      echo "$pid" >"$pid_file"
    else
      rm -f "$pid_file"
    fi
  fi

  if [[ -n "$pid" ]]; then
    printf "%-16s running (pid %s)\n" "$name" "$pid"
    return
  fi

  printf "%-16s stopped\n" "$name"
}

start_service() {
  local name="$1"
  local command="$2"
  local pid_file="$PID_DIR/$name.pid"
  local log_file="$LOG_DIR/$name.log"
  local existing_pid=""

  if [[ -f "$pid_file" ]] && kill -0 "$(cat "$pid_file")" 2>/dev/null; then
    printf "%-16s already running (pid %s)\n" "$name" "$(cat "$pid_file")"
    return
  fi

  existing_pid="$(service_existing_pid "$name" || true)"
  if [[ -n "$existing_pid" ]]; then
    echo "$existing_pid" >"$pid_file"
    printf "%-16s already running (pid %s)\n" "$name" "$existing_pid"
    return
  fi

  rm -f "$pid_file"
  nohup bash -lc "cd '$ROOT_DIR' && $command" < /dev/null >"$log_file" 2>&1 &
  local pid=$!
  disown "$pid" 2>/dev/null || true
  echo "$pid" >"$pid_file"
  sleep 1

  if kill -0 "$pid" 2>/dev/null; then
    printf "%-16s started (pid %s)\n" "$name" "$pid"
    return
  fi

  echo "failed to start $name; recent log output:"
  tail -n 40 "$log_file" || true
  exit 1
}

if [[ "$MODE" == "--status" ]]; then
  for entry in "${services[@]}"; do
    IFS="|" read -r name _ <<<"$entry"
    status_service "$name"
  done
  exit 0
fi

for entry in "${services[@]}"; do
  IFS="|" read -r name command <<<"$entry"
  start_service "$name" "$command"
done

echo
echo "Voice local stack is starting."
echo "Logs: $LOG_DIR"
echo "Status: make dev-status"
echo "Stop: make dev-down"
