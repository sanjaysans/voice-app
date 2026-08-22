"use client";

import { api } from "@/lib/api-client";

export type BrowserRtcSessionPayload = {
  dispatch_agent_name?: string;
  prompt?: {
    system_prompt?: string;
    opening_message?: string | null;
  };
  room?: {
    room_name?: string | null;
    participant_identity?: string | null;
  };
  stt: {
    api_key: string;
    model?: string;
    language?: string;
    keyterms?: string[];
  };
  llm: {
    api_key: string;
    model?: string;
    temperature?: number;
    max_output_tokens?: number | null;
  };
  tts: {
    api_key: string;
    model?: string;
    voice?: string;
    language?: string;
    speed?: number;
    emotion?: string;
    volume?: number;
    sample_rate?: number;
  };
  metadata?: Record<string, string>;
};

export type BrowserRtcSessionResponse = {
  room_name: string;
  participant_identity: string;
  participant_name: string;
  server_url: string;
  access_token: string;
  dispatch_id: string;
  dispatch_agent_name: string;
  session: Record<string, unknown>;
  runtime: Record<string, unknown>;
  warnings: string[];
  errors: string[];
};

export async function createBrowserRtcSession(
  tenantSlug: string,
  workspaceId: string,
  payload: BrowserRtcSessionPayload
) {
  return api<BrowserRtcSessionResponse>(
    `/api/v1/tenants/${tenantSlug}/workspaces/${workspaceId}/live/sessions`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}
