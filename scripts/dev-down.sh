#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_DIR="$ROOT_DIR/.local/pids"

service_names=(
  "frontend"
  "jobs"
  "pipeline-worker"
  "pipeline-eval-caller"
  "pipeline"
  "backend"
  "livekit"
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

stop_service() {
  local name="$1"
  local pid_file="$PID_DIR/$name.pid"
  local stopped=false
  local pattern

  if [[ -f "$pid_file" ]]; then
    local pid
    pid="$(cat "$pid_file")"
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      printf "%-16s stopped (pid %s)\n" "$name" "$pid"
      stopped=true
    fi
    rm -f "$pid_file"
  fi

  pattern="$(service_pattern "$name")" || return 1

  if [[ "$name" == "backend" ]]; then
    pattern="voice-backend-dev|$pattern"
  fi

  while IFS= read -r pid; do
    [[ -n "$pid" ]] || continue
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      printf "%-16s stopped (pid %s)\n" "$name" "$pid"
      stopped=true
    fi
  done < <(pgrep -f "$pattern" || true)

  if [[ "$stopped" == false ]]; then
    printf "%-16s already stopped\n" "$name"
  fi
}

if [[ ! -d "$PID_DIR" ]]; then
  mkdir -p "$PID_DIR"
fi

stopped_any=false

for name in "${service_names[@]}"; do
  output="$(stop_service "$name")"
  printf '%s\n' "$output"
  if [[ "$output" != *"already stopped"* ]]; then
    stopped_any=true
  fi
done

if [[ "$stopped_any" == false ]]; then
  echo "No running local Voice services were found."
fi
