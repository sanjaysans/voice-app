import { describe, expect, it } from "vitest";
import {
  buildDefaultConnectionConfig,
  resolveProviderHealthCheckEndpoint,
} from "@/lib/voice-stack";

describe("voice-stack helpers", () => {
  it("keeps runtime fields out of connection defaults", () => {
    const config = buildDefaultConnectionConfig("tts", "cartesia");

    expect(config.api_key).toBe("");
    expect(config.voiceId).toBeUndefined();
    expect(config.language).toBeUndefined();
    expect(config.model).toBeUndefined();
  });

  it("resolves the provider health-check endpoint from the definition", () => {
    expect(
      resolveProviderHealthCheckEndpoint("llm", "openai", {
        tenantSlug: "voice-demo",
        providerAccountId: "provider-123",
      })
    ).toBe("/api/v1/tenants/voice-demo/provider-accounts/provider-123/health-check");
  });
});
