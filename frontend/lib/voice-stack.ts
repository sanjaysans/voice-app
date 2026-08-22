"use client";

export type SupportedProviderKind = "telephony" | "stt" | "llm" | "tts";

export type ConfigFieldType =
  | "text"
  | "password"
  | "textarea"
  | "number"
  | "slider"
  | "select"
  | "boolean";

export type ConfigFieldDefinition = {
  id: string;
  label: string;
  type: ConfigFieldType;
  description?: string;
  placeholder?: string;
  options?: Array<{ label: string; value: string }>;
  allowDirectInput?: boolean;
  directInputLabel?: string;
  directInputPlaceholder?: string;
  min?: number;
  max?: number;
  step?: number;
  valueSuffix?: string;
};

export type WorkflowLanguage =
  | "english"
  | "tamil"
  | "hindi"
  | "marathi"
  | "malayalam"
  | "telugu";

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
  workflow: {
    defaultLanguage: WorkflowLanguage;
    sampleRate: 8000 | 16000 | 24000;
  };
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
  };
};

export const WORKFLOW_LANGUAGE_OPTIONS: Array<{ label: string; value: WorkflowLanguage }> = [
  { label: "English", value: "english" },
  { label: "Tamil", value: "tamil" },
  { label: "Hindi", value: "hindi" },
  { label: "Marathi", value: "marathi" },
  { label: "Malayalam", value: "malayalam" },
  { label: "Telugu", value: "telugu" },
];

export const WORKFLOW_SAMPLE_RATE_OPTIONS = [
  { label: "8 kHz", value: "8000" },
  { label: "16 kHz", value: "16000" },
  { label: "24 kHz", value: "24000" },
] as const;

const VENDOR_LANGUAGE_CODES: Partial<
  Record<SupportedProviderKind, Record<string, Record<WorkflowLanguage, string>>>
> = {
  stt: {
    deepgram: {
      english: "en-US",
      tamil: "ta",
      hindi: "hi",
      marathi: "mr",
      malayalam: "ml",
      telugu: "te",
    },
  },
  tts: {
    cartesia: {
      english: "en",
      tamil: "ta",
      hindi: "hi",
      marathi: "mr",
      malayalam: "ml",
      telugu: "te",
    },
  },
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
          allowDirectInput: true,
          directInputLabel: "Model name or ID",
          directInputPlaceholder: "Enter a Deepgram model directly"
        },
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
      ],
      models: [
        { label: "Flux General English", value: "flux-general-en" },
        { label: "Nova 3 General", value: "nova-3-general" }
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
          allowDirectInput: true,
          directInputLabel: "Model name or ID",
          directInputPlaceholder: "Enter an OpenAI model directly"
        },
        { id: "temperature", label: "Temperature", type: "slider", min: 0, max: 2, step: 0.1 },
        { id: "topP", label: "Top P", type: "slider", min: 0, max: 1, step: 0.05 },
        {
          id: "priorityTier",
          label: "Priority tier",
          type: "select",
          options: [
            { label: "Standard", value: "standard" },
            { label: "Priority", value: "priority" }
          ]
        },
        {
          id: "maxRetries",
          label: "Retry attempts",
          type: "select",
          options: [
            { label: "0", value: "0" },
            { label: "1", value: "1" },
            { label: "2", value: "2" },
            { label: "3", value: "3" }
          ]
        }
      ],
      models: [
        { label: "GPT-4.1 mini", value: "gpt-4.1-mini" },
        { label: "GPT-4.1", value: "gpt-4.1" }
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
          allowDirectInput: true,
          directInputLabel: "Model name or ID",
          directInputPlaceholder: "Enter a Cartesia model directly"
        },
        {
          id: "voiceId",
          label: "Voice",
          type: "select",
          allowDirectInput: true,
          directInputLabel: "Voice ID",
          directInputPlaceholder: "Enter a Cartesia voice ID directly"
        },
        { id: "speed", label: "Speed", type: "slider", min: 0.6, max: 1.5, step: 0.05 },
        {
          id: "emotion",
          label: "Emotion",
          type: "select",
          options: [
            { label: "Neutral", value: "neutral" },
            { label: "Happy", value: "happy" },
            { label: "Excited", value: "excited" },
            { label: "Enthusiastic", value: "enthusiastic" },
            { label: "Elated", value: "elated" },
            { label: "Euphoric", value: "euphoric" },
            { label: "Triumphant", value: "triumphant" },
            { label: "Amazed", value: "amazed" },
            { label: "Surprised", value: "surprised" },
            { label: "Flirtatious", value: "flirtatious" },
            { label: "Curious", value: "curious" },
            { label: "Content", value: "content" },
            { label: "Peaceful", value: "peaceful" },
            { label: "Serene", value: "serene" },
            { label: "Calm", value: "calm" },
            { label: "Grateful", value: "grateful" },
            { label: "Affectionate", value: "affectionate" },
            { label: "Trust", value: "trust" },
            { label: "Sympathetic", value: "sympathetic" },
            { label: "Anticipation", value: "anticipation" },
            { label: "Mysterious", value: "mysterious" },
            { label: "Angry", value: "angry" },
            { label: "Mad", value: "mad" },
            { label: "Outraged", value: "outraged" },
            { label: "Frustrated", value: "frustrated" },
            { label: "Agitated", value: "agitated" },
            { label: "Threatened", value: "threatened" },
            { label: "Disgusted", value: "disgusted" },
            { label: "Contempt", value: "contempt" },
            { label: "Envious", value: "envious" },
            { label: "Sarcastic", value: "sarcastic" },
            { label: "Ironic", value: "ironic" },
            { label: "Sad", value: "sad" },
            { label: "Dejected", value: "dejected" },
            { label: "Melancholic", value: "melancholic" },
            { label: "Disappointed", value: "disappointed" },
            { label: "Hurt", value: "hurt" },
            { label: "Guilty", value: "guilty" },
            { label: "Bored", value: "bored" },
            { label: "Tired", value: "tired" },
            { label: "Rejected", value: "rejected" },
            { label: "Nostalgic", value: "nostalgic" },
            { label: "Wistful", value: "wistful" },
            { label: "Apologetic", value: "apologetic" },
            { label: "Hesitant", value: "hesitant" },
            { label: "Insecure", value: "insecure" },
            { label: "Confused", value: "confused" },
            { label: "Resigned", value: "resigned" },
            { label: "Anxious", value: "anxious" },
            { label: "Panicked", value: "panicked" },
            { label: "Alarmed", value: "alarmed" },
            { label: "Scared", value: "scared" },
            { label: "Proud", value: "proud" },
            { label: "Confident", value: "confident" },
            { label: "Distant", value: "distant" },
            { label: "Skeptical", value: "skeptical" },
            { label: "Contemplative", value: "contemplative" },
            { label: "Determined", value: "determined" }
          ]
        },
        { id: "volume", label: "Volume", type: "slider", min: 0.5, max: 2, step: 0.05 },
        { id: "enableSsml", label: "Enable SSML", type: "boolean" },
      ],
      models: [
        { label: "Sonic 3.5", value: "sonic-3.5" },
        { label: "Sonic 3", value: "sonic-3" }
      ],
      voices: [
        { label: "Leo", value: "0834f3df-e650-4766-a20c-5a93a43aa6e3" },
        { label: "Jace", value: "6776173b-fd72-460d-89b3-d85812ee518d" },
        { label: "Kyle", value: "c961b81c-a935-4c17-bfb3-ba2239de8c2f" },
        { label: "Gavin", value: "f4a3a8e4-694c-4c45-9ca0-27caf97901b5" },
        { label: "Maya", value: "cbaf8084-f009-4838-a096-07ee2e6612b1" },
        { label: "Tessa", value: "6ccbfb76-1fc6-48f7-b71d-91ac6298247b" },
        { label: "Dana", value: "cc00e582-ed66-4004-8336-0175b85c85f6" },
        { label: "Marian", value: "26403c37-80c1-4a1a-8692-540551ca2ae5" }
      ]
    }
  ]
};

export function buildDefaultRuntimeProfile(): AgentRuntimeProfile {
  return {
    pipelineMode: "stt_llm_tts",
    workflow: {
      defaultLanguage: "english",
      sampleRate: 24000
    },
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
    }
  };
}

export function getWorkflowLanguageOptions() {
  return WORKFLOW_LANGUAGE_OPTIONS;
}

export function getWorkflowSampleRateOptions() {
  return [...WORKFLOW_SAMPLE_RATE_OPTIONS];
}

export function resolveVendorLanguageCode(
  kind: "stt" | "tts",
  vendor: string,
  language: WorkflowLanguage
) {
  return VENDOR_LANGUAGE_CODES[kind]?.[vendor]?.[language] ?? "";
}

export function withResolvedRuntimeLanguages(profile: AgentRuntimeProfile): AgentRuntimeProfile {
  return {
    ...profile,
    stt: {
      ...profile.stt,
      language: resolveVendorLanguageCode("stt", profile.stt.vendor, profile.workflow.defaultLanguage),
    },
    tts: {
      ...profile.tts,
      language: resolveVendorLanguageCode("tts", profile.tts.vendor, profile.workflow.defaultLanguage),
    },
  };
}

export function mergeRuntimeProfile(
  profile?: Partial<AgentRuntimeProfile> | Record<string, unknown> | null
): AgentRuntimeProfile {
  const defaults = buildDefaultRuntimeProfile();
  const next = profile ?? {};
  const legacyPrompt = (next as { prompt?: Record<string, unknown> }).prompt ?? {};
  const legacyTts = (next as { tts?: Record<string, unknown> }).tts ?? {};

  return withResolvedRuntimeLanguages({
    ...defaults,
    ...next,
    workflow: {
      ...defaults.workflow,
      ...((next as AgentRuntimeProfile).workflow ?? {}),
      defaultLanguage:
        ((next as AgentRuntimeProfile).workflow?.defaultLanguage as WorkflowLanguage | undefined) ??
        (legacyPrompt.defaultLanguage as WorkflowLanguage | undefined) ??
        defaults.workflow.defaultLanguage,
      sampleRate:
        ((next as AgentRuntimeProfile).workflow?.sampleRate as 8000 | 16000 | 24000 | undefined) ??
        (legacyTts.sampleRate as 8000 | 16000 | 24000 | undefined) ??
        defaults.workflow.sampleRate,
    },
    prompt: {
      ...defaults.prompt,
      ...((next as AgentRuntimeProfile).prompt ?? {}),
      openingMessage:
        ((next as AgentRuntimeProfile).prompt?.openingMessage as string | undefined) ??
        (legacyPrompt.openingMessage as string | undefined) ??
        defaults.prompt.openingMessage,
    },
    telephony: {
      ...defaults.telephony,
      ...((next as AgentRuntimeProfile).telephony ?? {}),
    },
    stt: {
      ...defaults.stt,
      ...((next as AgentRuntimeProfile).stt ?? {}),
    },
    llm: {
      ...defaults.llm,
      ...((next as AgentRuntimeProfile).llm ?? {}),
    },
    tts: {
      ...defaults.tts,
      ...((next as AgentRuntimeProfile).tts ?? {}),
    },
  });
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
    if (field.type === "slider") {
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
