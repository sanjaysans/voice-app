"use client";

import { api } from "@/lib/api-client";

export type BrowserRtcSessionPayload = {
  agent_id: string;
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
  call_id: string | null;
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

export type LiveTestSessionUpdatePayload = {
  lifecycle_status?: "queued" | "in_progress" | "completed" | "failed" | "cancelled";
  display_status?: "Completed" | "Follow-up" | "Dropped";
  summary?: string;
  outcome?: string;
  next_step?: string;
  synced_to_crm?: boolean;
  transcript?: Array<{ speaker: string; timestamp: string; text: string }>;
  extracted_variables?: Array<{ key: string; value: string }>;
  tool_calls?: Array<{ name: string; result: string }>;
  guardrails?: string[];
  metrics?: Record<string, unknown>;
  append_events?: Array<{
    event_type: string;
    message: string;
    occurred_at?: string;
    payload?: Record<string, unknown>;
  }>;
  started_at?: string;
  ended_at?: string;
};

export type LiveTestSessionRecord = {
  call_id: string;
  agent_id: string | null;
  agent_name: string;
  is_test: true;
  lifecycle_status: "queued" | "in_progress" | "completed" | "failed" | "cancelled";
  room_name: string;
  dispatch_id: string;
  participant_identity: string;
  participant_name: string;
  vendor_trace: string;
  summary: string;
  outcome: string;
  next_step: string;
  synced_to_crm: boolean;
  transcript: Array<{ speaker: string; timestamp: string; text: string }>;
  extracted_variables: Array<{ key: string; value: string }>;
  tool_calls: Array<{ name: string; result: string }>;
  guardrails: string[];
  metrics: Record<string, unknown>;
  event_log: Array<{
    event_type: string;
    message: string;
    occurred_at: string;
    payload?: Record<string, unknown>;
  }>;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
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

export async function updateLiveTestSession(
  tenantSlug: string,
  workspaceId: string,
  callId: string,
  payload: LiveTestSessionUpdatePayload
) {
  return api<LiveTestSessionRecord>(
    `/api/v1/tenants/${tenantSlug}/workspaces/${workspaceId}/live/sessions/${callId}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    }
  );
}
