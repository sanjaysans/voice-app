import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "on-first-retry",
  },
  webServer: [
    {
      command:
        "VOICE_BACKEND_HOST=127.0.0.1 VOICE_BACKEND_PORT=8110 VOICE_BACKEND_CORS_ORIGINS='[\"http://127.0.0.1:3100\",\"http://localhost:3100\"]' uv run --package voice-backend voice-backend-dev",
      port: 8110,
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command:
        "NEXT_PUBLIC_BACKEND_URL=http://127.0.0.1:8110 npm --workspace frontend run dev -- --hostname 127.0.0.1 --port 3100",
      port: 3100,
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
