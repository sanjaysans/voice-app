"use client";

export type SupportedProviderKind = "telephony" | "stt" | "llm" | "tts";

export type ConfigFieldType =
  | "text"
  | "password"
  | "textarea"
  | "number"
  | "select"
  | "boolean";

export type ConfigFieldDefinition = {
  id: string;
  label: string;
  type: ConfigFieldType;
  description?: string;
  placeholder?: string;
  options?: Array<{ label: string; value: string }>;
  min?: number;
  max?: number;
  step?: number;
};

export type VoiceConnectionDefinition = {
  kind: SupportedProviderKind;
  vendor: string;
  label: string;
  description: string;
  healthCheck: {
    method: "POST";
    endpoint: string;
    strategy: "credential_validation";
    requiredConfigKeys: string[];
    description: string;
  };
  connectionFields: ConfigFieldDefinition[];
  runtimeFields: ConfigFieldDefinition[];
  models?: Array<{ label: string; value: string }>;
  voices?: Array<{ label: string; value: string }>;
};

export type ProviderAccountPreview = Record<string, unknown>;

export type ProviderAccountRecord = {
  id: string;
  providerKind: SupportedProviderKind;
  vendorName: string;
  label: string;
  status: "draft" | "active" | "inactive" | "error" | "configured";
  hasConfig: boolean;
  configKeys: string[];
  preview: ProviderAccountPreview;
};

export type AgentRuntimeProfile = {
  pipelineMode: "stt_llm_tts";
  prompt: {
    openingMessage: string;
  };
  telephony: {
    providerAccountId: string;
    phoneNumber: string;
    callerName: string;
    recordCalls: boolean;
  };
  stt: {
    providerAccountId: string;
    vendor: string;
    model: string;
    language: string;
    keyterms: string;
    additionalVocabulary: string;
    endpointingMs: number;
    interimResults: boolean;
    enableDiarization: boolean;
  };
  llm: {
    providerAccountId: string;
    vendor: string;
    model: string;
    temperature: number;
    maxOutputTokens: number;
    topP: number;
    priorityTier: string;
    maxRetries: number;
  };
  tts: {
    providerAccountId: string;
    vendor: string;
    model: string;
    voiceId: string;
    language: string;
    speed: number;
    emotion: string;
    volume: number;
    enableSsml: boolean;
    sampleRate: number;
  };
};

export const PROVIDER_DEFINITIONS: Record<SupportedProviderKind, VoiceConnectionDefinition[]> = {
  telephony: [
    {
      kind: "telephony",
      vendor: "twilio",
      label: "Twilio",
      description: "Manage voice numbers and caller identity for telephony launches.",
      healthCheck: {
        method: "POST",
        endpoint: "/api/v1/tenants/:tenantSlug/provider-accounts/:providerAccountId/health-check",
        strategy: "credential_validation",
        requiredConfigKeys: ["account_sid", "auth_token", "phone_numbers"],
        description: "Validate the Twilio account credentials and confirm at least one launch number is saved."
      },
      connectionFields: [
        { id: "display_name", label: "Connection label", type: "text", placeholder: "Primary telephony" },
        { id: "account_sid", label: "Account SID", type: "text", placeholder: "AC..." },
        { id: "auth_token", label: "Auth token", type: "password", placeholder: "Twilio auth token" },
        {
          id: "phone_numbers",
          label: "Phone numbers",
          type: "textarea",
          description: "One number per line. The first number becomes the default caller ID.",
          placeholder: "+1 415 555 0101\n+1 415 555 0102"
        },
        {
          id: "region",
          label: "Region",
          type: "select",
          options: [
            { label: "US1", value: "us1" },
            { label: "IE1", value: "ie1" },
            { label: "AU1", value: "au1" }
          ]
        }
      ],
      runtimeFields: [
        { id: "phoneNumber", label: "Launch number", type: "select" },
        { id: "callerName", label: "Caller name", type: "text", placeholder: "Voice operator" },
        { id: "recordCalls", label: "Record calls", type: "boolean" }
      ]
    }
  ],
  stt: [
    {
      kind: "stt",
      vendor: "deepgram",
      label: "Deepgram",
      description: "Streaming speech recognition with keyword and endpointing controls.",
      healthCheck: {
        method: "POST",
        endpoint: "/api/v1/tenants/:tenantSlug/provider-accounts/:providerAccountId/health-check",
        strategy: "credential_validation",
        requiredConfigKeys: ["api_key"],
        description: "Validate that the Deepgram API key is present and ready for agent runtime binding."
      },
      connectionFields: [
        { id: "display_name", label: "Connection label", type: "text", placeholder: "Primary STT" },
        { id: "api_key", label: "API key", type: "password", placeholder: "Deepgram API key" }
      ],
      runtimeFields: [
        {
          id: "model",
          label: "Model",
          type: "select",
          options: [
            { label: "Flux General English", value: "flux-general-en" },
            { label: "Nova 3 General", value: "nova-3-general" }
          ]
        },
        { id: "language", label: "Language", type: "text", placeholder: "en-US" },
        {
          id: "keyterms",
          label: "Key terms",
          type: "textarea",
          description: "Comma-separated product names, proper nouns, or high-value phrases.",
          placeholder: "pipecat, Voice, LiveKit"
        },
        {
          id: "additionalVocabulary",
          label: "Additional vocabulary",
          type: "textarea",
          description: "Custom biasing terms or domain vocabulary.",
          placeholder: "intake, booking, escalation"
        },
        { id: "endpointingMs", label: "Endpointing (ms)", type: "number", min: 0, max: 3000, step: 25 },
        { id: "interimResults", label: "Interim results", type: "boolean" },
        { id: "enableDiarization", label: "Speaker diarization", type: "boolean" }
      ]
    }
  ],
  llm: [
    {
      kind: "llm",
      vendor: "openai",
      label: "OpenAI",
      description: "Response generation and reasoning configuration for the agent core.",
      healthCheck: {
        method: "POST",
        endpoint: "/api/v1/tenants/:tenantSlug/provider-accounts/:providerAccountId/health-check",
        strategy: "credential_validation",
        requiredConfigKeys: ["api_key"],
        description: "Validate that the OpenAI API key is present before agents bind a model at runtime."
      },
      connectionFields: [
        { id: "display_name", label: "Connection label", type: "text", placeholder: "Primary LLM" },
        { id: "api_key", label: "API key", type: "password", placeholder: "OpenAI API key" }
      ],
      runtimeFields: [
        {
          id: "model",
          label: "Model",
          type: "select",
          options: [
            { label: "GPT-4.1 mini", value: "gpt-4.1-mini" },
            { label: "GPT-4.1", value: "gpt-4.1" }
          ]
        },
        { id: "temperature", label: "Temperature", type: "number", min: 0, max: 2, step: 0.1 },
        { id: "maxOutputTokens", label: "Max output tokens", type: "number", min: 50, max: 4096, step: 50 },
        { id: "topP", label: "Top P", type: "number", min: 0, max: 1, step: 0.05 },
        {
          id: "priorityTier",
          label: "Priority tier",
          type: "select",
          options: [
            { label: "Standard", value: "standard" },
            { label: "Priority", value: "priority" }
          ]
        },
        { id: "maxRetries", label: "Retry attempts", type: "number", min: 0, max: 5, step: 1 }
      ]
    }
  ],
  tts: [
    {
      kind: "tts",
      vendor: "cartesia",
      label: "Cartesia",
      description: "Real-time voice synthesis with voice, emotion, and delivery controls.",
      healthCheck: {
        method: "POST",
        endpoint: "/api/v1/tenants/:tenantSlug/provider-accounts/:providerAccountId/health-check",
        strategy: "credential_validation",
        requiredConfigKeys: ["api_key"],
        description: "Validate that the Cartesia API key is present before voices are selected per agent."
      },
      connectionFields: [
        { id: "display_name", label: "Connection label", type: "text", placeholder: "Primary TTS" },
        { id: "api_key", label: "API key", type: "password", placeholder: "Cartesia API key" }
      ],
      runtimeFields: [
        {
          id: "model",
          label: "Model",
          type: "select",
          options: [{ label: "Sonic 3", value: "sonic-3" }]
        },
        {
          id: "voiceId",
          label: "Voice",
          type: "select",
          options: [
            { label: "Sage", value: "f786b574-daa5-4673-aa0c-cbe3e8534c02" },
            { label: "Alloy", value: "07e0f2c1-06f1-47e0-9d84-3f2eb7b1cb55" },
            { label: "Nova", value: "f2b2d1dc-3f4c-4d92-9c07-62c9c9b8a661" }
          ]
        },
        { id: "language", label: "Language", type: "text", placeholder: "en" },
        { id: "speed", label: "Speed", type: "number", min: 0.25, max: 2, step: 0.05 },
        {
          id: "emotion",
          label: "Emotion",
          type: "select",
          options: [
            { label: "Neutral", value: "neutral" },
            { label: "Friendly", value: "friendly" },
            { label: "Confident", value: "confident" }
          ]
        },
        { id: "volume", label: "Volume", type: "number", min: 0, max: 1.5, step: 0.05 },
        { id: "enableSsml", label: "Enable SSML", type: "boolean" },
        { id: "sampleRate", label: "Sample rate", type: "number", min: 8000, max: 48000, step: 1000 }
      ]
    }
  ]
};

export function buildDefaultRuntimeProfile(): AgentRuntimeProfile {
  return {
    pipelineMode: "stt_llm_tts",
    prompt: {
      openingMessage: "Hello, this is Voice. How can I help you today?"
    },
    telephony: {
      providerAccountId: "",
      phoneNumber: "",
      callerName: "Voice",
      recordCalls: true
    },
    stt: {
      providerAccountId: "",
      vendor: "deepgram",
      model: "flux-general-en",
      language: "en-US",
      keyterms: "",
      additionalVocabulary: "",
      endpointingMs: 25,
      interimResults: true,
      enableDiarization: false
    },
    llm: {
      providerAccountId: "",
      vendor: "openai",
      model: "gpt-4.1-mini",
      temperature: 0.2,
      maxOutputTokens: 500,
      topP: 1,
      priorityTier: "standard",
      maxRetries: 2
    },
    tts: {
      providerAccountId: "",
      vendor: "cartesia",
      model: "sonic-3",
      voiceId: "f786b574-daa5-4673-aa0c-cbe3e8534c02",
      language: "en",
      speed: 1,
      emotion: "neutral",
      volume: 1,
      enableSsml: false,
      sampleRate: 24000
    }
  };
}

export function getProviderDefinition(kind: SupportedProviderKind, vendor: string) {
  return PROVIDER_DEFINITIONS[kind].find((definition) => definition.vendor === vendor) ?? null;
}

export function getProviderOptions(kind: SupportedProviderKind) {
  return PROVIDER_DEFINITIONS[kind].map((definition) => ({
    label: definition.label,
    value: definition.vendor
  }));
}

export function getProviderLabel(kind: SupportedProviderKind, vendor: string) {
  return getProviderDefinition(kind, vendor)?.label ?? vendor;
}

export function resolveProviderHealthCheckEndpoint(
  kind: SupportedProviderKind,
  vendor: string,
  params: { tenantSlug: string; providerAccountId: string }
) {
  const definition = getProviderDefinition(kind, vendor);
  return (definition?.healthCheck.endpoint ?? "")
    .replace(":tenantSlug", params.tenantSlug)
    .replace(":providerAccountId", params.providerAccountId);
}

export function buildDefaultConnectionConfig(kind: SupportedProviderKind, vendor: string) {
  const definition = getProviderDefinition(kind, vendor);
  const defaults: Record<string, unknown> = {
    kind,
    vendor,
    ui_status: "Connected",
    last_checked: "Configured now",
    detail: `${getProviderLabel(kind, vendor)} is configured and ready for agent setup.`
  };

  for (const field of definition?.connectionFields ?? []) {
    if (field.id === "display_name") {
      defaults[field.id] = definition?.label ?? vendor;
      continue;
    }
    if (field.type === "boolean") {
      defaults[field.id] = false;
      continue;
    }
    if (field.type === "number") {
      defaults[field.id] = field.min ?? 0;
      continue;
    }
    defaults[field.id] = "";
  }

  if (kind === "telephony") {
    defaults.phone_numbers = "+1 415 555 0101";
    defaults.region = "us1";
  }
  return defaults;
}

export function parsePhoneNumbers(value: unknown) {
  if (typeof value !== "string") {
    return [];
  }
  return value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function summarizeConnection(record: ProviderAccountRecord) {
  const config = record.preview;

  if (record.providerKind === "telephony") {
    const numbers = parsePhoneNumbers(config.phone_numbers);
    return `${numbers.length} numbers ready`;
  }
  return config.api_key ? "Credentials saved" : "Credentials missing";
}

export function getAccountsByKind(
  accounts: ProviderAccountRecord[],
  kind: SupportedProviderKind
) {
  return accounts.filter((account) => account.providerKind === kind);
}

export function getAccountOptions(accounts: ProviderAccountRecord[], kind: SupportedProviderKind) {
  return getAccountsByKind(accounts, kind).map((account) => ({
    label: account.label,
    value: account.id
  }));
}
