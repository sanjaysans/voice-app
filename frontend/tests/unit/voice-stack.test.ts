import { describe, expect, it } from "vitest";
import {
  buildDefaultConnectionConfig,
  mergeRuntimeProfile,
  pickConnectionConfig,
  resolveProviderHealthCheckEndpoint,
  resolveVendorLanguageCode,
} from "@/lib/voice-stack";

describe("voice-stack helpers", () => {
  it("keeps runtime fields out of connection defaults", () => {
    const config = buildDefaultConnectionConfig("tts", "cartesia");

    expect(config.api_key).toBe("");
    expect(config.voiceId).toBeUndefined();
    expect(config.language).toBeUndefined();
    expect(config.model).toBeUndefined();
    expect(config.ui_status).toBeUndefined();
  });

  it("only sends supported connection fields and omits blank credentials", () => {
    expect(
      pickConnectionConfig("llm", "openai", {
        display_name: "Primary LLM",
        api_key: "",
        model: "gpt-4.1",
        ui_status: "Connected",
      })
    ).toEqual({ display_name: "Primary LLM" });
  });

  it("resolves the provider health-check endpoint from the definition", () => {
    expect(
      resolveProviderHealthCheckEndpoint("llm", "openai", {
        tenantSlug: "voice-demo",
        providerAccountId: "provider-123",
      })
    ).toBe("/api/v1/tenants/voice-demo/provider-accounts/provider-123/health-check");
  });

  it("merges missing runtime profile fields and resolves vendor language codes", () => {
    const profile = mergeRuntimeProfile({
      prompt: { openingMessage: "Hello there" },
      stt: { providerAccountId: "stt-1", vendor: "deepgram", model: "nova-3-general" },
      tts: { providerAccountId: "tts-1", vendor: "cartesia", voiceId: "voice-1" },
    });

    expect(profile.workflow.defaultLanguage).toBe("english");
    expect(profile.workflow.sampleRate).toBe(24000);
    expect(profile.stt.language).toBe("en-US");
    expect(profile.tts.language).toBe("en");
  });

  it("preserves legacy language and sample rate fields when merging stored profiles", () => {
    const legacyProfile = {
      prompt: { openingMessage: "Hello there", defaultLanguage: "hindi" },
      tts: { providerAccountId: "tts-1", vendor: "cartesia", sampleRate: 16000 },
    } as Record<string, unknown>;
    const profile = mergeRuntimeProfile(legacyProfile);

    expect(profile.workflow.defaultLanguage).toBe("hindi");
    expect(profile.workflow.sampleRate).toBe(16000);
    expect(profile.tts.language).toBe("hi");
  });

  it("maps workflow languages to vendor specific codes", () => {
    expect(resolveVendorLanguageCode("stt", "deepgram", "hindi")).toBe("hi");
    expect(resolveVendorLanguageCode("tts", "cartesia", "tamil")).toBe("ta");
  });
});
