import { buildDefaultRuntimeProfile, type AgentRuntimeProfile } from "@/lib/voice-stack";

export type Tone = "neutral" | "success" | "warning" | "danger";

export type VendorStack = {
  stt: string;
  llm: string;
  tts: string;
};

export type FlowNode = {
  id: string;
  label: string;
  x: number;
  y: number;
  tone: Exclude<Tone, "danger">;
  state: string;
  prompt: string;
  tools: string[];
  knowledge: string[];
  vendors: VendorStack;
};

export type AgentTool = {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
};

export type KnowledgeSource = {
  id: string;
  name: string;
  description: string;
  status: "Connected" | "Syncing";
  enabled: boolean;
};

export type Agent = {
  id: string;
  name: string;
  description: string;
  status: "Draft" | "Published";
  statusTone: "warning" | "success";
  lastEdited: string;
  segment: string;
  goal: string;
  stack: VendorStack;
  runtimeProfile: AgentRuntimeProfile;
  flowNodes: FlowNode[];
  flowEdges: Array<[string, string]>;
  toolsCatalog: AgentTool[];
  knowledgeSources: KnowledgeSource[];
};

export type DemoScenario = {
  id: string;
  name: string;
  summary: string;
  outcome: "Qualified" | "Meeting booked" | "Follow-up" | "Voicemail";
  tone: Exclude<Tone, "danger">;
  leadName: string;
  company: string;
  phone: string;
  timeline: string[];
  transcriptSeed: Array<{
    speaker: "Lead" | "Voice";
    text: string;
  }>;
  extractedVariables: Array<{ key: string; value: string }>;
  toolCalls: Array<{ name: string; result: string }>;
  guardrails: string[];
  nextStep: string;
};

export type ActiveCall = {
  id: string;
  agentId: string;
  agentName: string;
  scenarioId: string;
  scenarioName: string;
  leadName: string;
  company: string;
  phone: string;
  phaseIndex: number;
  phases: string[];
  timeline: string[];
  transcript: Array<{
    speaker: "Lead" | "Voice";
    timestamp: string;
    text: string;
  }>;
  extractedVariables: Array<{ key: string; value: string }>;
  toolCalls: Array<{ name: string; result: string }>;
  guardrails: string[];
  nextStep: string;
};

export type CallRecord = {
  id: string;
  agentId: string;
  agentName: string;
  leadName: string;
  company: string;
  phone: string;
  scenarioName: string;
  status: "Completed" | "Follow-up" | "Dropped";
  statusTone: Tone;
  duration: string;
  time: string;
  summary: string;
  outcome: string;
  nextStep: string;
  vendorTrace: string;
  syncedToCrm: boolean;
  extractedVariables: Array<{ key: string; value: string }>;
  toolCalls: Array<{ name: string; result: string }>;
  guardrails: string[];
  transcript: Array<{
    speaker: "Lead" | "Voice";
    timestamp: string;
    text: string;
  }>;
};

export type Connection = {
  id: string;
  name: string;
  category:
    | "Telephony"
    | "Speech to text"
    | "Reasoning"
    | "Text to speech"
    | "CRM"
    | "Calendar"
    | "Knowledge";
  vendor: string;
  description: string;
  status: "Connected" | "Needs setup" | "Warning";
  tone: Exclude<Tone, "danger">;
  detail: string;
  lastChecked: string;
};

export type NotificationItem = {
  id: string;
  title: string;
  message: string;
  tone: Exclude<Tone, "neutral">;
  href: string;
};

export const rangeMultipliers = {
  Today: 1,
  "7D": 4,
  "30D": 11,
  Quarter: 28
} as const;

const defaultStack: VendorStack = {
  stt: "Deepgram",
  llm: "GPT-4.1",
  tts: "Cartesia"
};

export const dateRanges = ["Today", "7D", "30D", "Quarter"];

export const demoScenarios: DemoScenario[] = [
  {
    id: "scenario_inbound_demo",
    name: "Inbound qualification",
    summary: "A warm lead wants to understand fit, timeline, and next steps.",
    outcome: "Meeting booked",
    tone: "success",
    leadName: "Maya Patel",
    company: "Northstar Clinics",
    phone: "+1 415 555 0188",
    timeline: ["Dialing", "Connected", "Qualification", "Booking"],
    transcriptSeed: [
      {
        speaker: "Lead",
        text: "We run six clinics and want to know whether your calling system can handle intake and follow-up."
      },
      {
        speaker: "Voice",
        text: "It can. I can confirm your workflow, call volume, and whether you want qualification, reminders, or conversion support."
      },
      {
        speaker: "Lead",
        text: "We need all three, and we want to launch next quarter if the integrations look simple."
      },
      {
        speaker: "Voice",
        text: "You look like a strong fit. I found an opening on Tuesday at 11:00 AM Pacific and booked a solutions call."
      }
    ],
    extractedVariables: [
      { key: "Lead score", value: "91 / 100" },
      { key: "Seats", value: "6 clinics" },
      { key: "Timeline", value: "Next quarter" },
      { key: "Priority workflow", value: "Intake + follow-up" }
    ],
    toolCalls: [
      { name: "crm_lookup", result: "Matched existing account owner: West region SDR" },
      { name: "calendar_hold", result: "Booked consultation on Tue 11:00 AM PT" }
    ],
    guardrails: ["Consent notice delivered", "PII redaction active"],
    nextStep: "Meeting confirmed and CRM owner notified."
  },
  {
    id: "scenario_outbound_followup",
    name: "Outbound reactivation",
    summary: "A stale opportunity answers and needs lightweight re-qualification.",
    outcome: "Follow-up",
    tone: "warning",
    leadName: "Jordan Lee",
    company: "Peak Home Services",
    phone: "+1 212 555 0164",
    timeline: ["Dialing", "Connected", "Objection handling", "Follow-up queued"],
    transcriptSeed: [
      {
        speaker: "Lead",
        text: "We looked at automation last year, but timing was bad and our team was too busy."
      },
      {
        speaker: "Voice",
        text: "That makes sense. I can keep this brief and understand whether your priorities or volume changed."
      },
      {
        speaker: "Lead",
        text: "We are expanding to two new markets, but I need something my sales reps can trust."
      },
      {
        speaker: "Voice",
        text: "I captured the expansion plan and assigned a human follow-up with the full summary so your team gets a tailored proposal."
      }
    ],
    extractedVariables: [
      { key: "Lead score", value: "74 / 100" },
      { key: "Expansion", value: "2 new markets" },
      { key: "Buying confidence", value: "Needs proof" },
      { key: "Next touch", value: "Human follow-up" }
    ],
    toolCalls: [
      { name: "crm_lookup", result: "Recovered dormant opportunity from 2025 pipeline" },
      { name: "task_create", result: "Assigned follow-up to account executive" }
    ],
    guardrails: ["Consent notice delivered", "Do-not-call check passed"],
    nextStep: "AE follow-up queued with objection summary."
  },
  {
    id: "scenario_voicemail",
    name: "Voicemail recovery",
    summary: "No live pickup, so the system leaves a compliant callback and queues retry logic.",
    outcome: "Voicemail",
    tone: "warning",
    leadName: "Avery Brooks",
    company: "Harbor Legal",
    phone: "+1 646 555 0190",
    timeline: ["Dialing", "Voicemail reached", "Message left", "Retry scheduled"],
    transcriptSeed: [
      {
        speaker: "Voice",
        text: "Hi Avery, this is Voice calling with a quick follow-up on your inquiry."
      },
      {
        speaker: "Voice",
        text: "I am sharing a callback note with your team and will try again during the approved calling window."
      }
    ],
    extractedVariables: [
      { key: "Disposition", value: "Voicemail" },
      { key: "Retry window", value: "Tomorrow 10:00 AM local" }
    ],
    toolCalls: [
      { name: "voicemail_log", result: "Compliant voicemail recorded" },
      { name: "retry_schedule", result: "Retry added for tomorrow" }
    ],
    guardrails: ["Calling window respected", "Voicemail disclaimer included"],
    nextStep: "Retry scheduled for next approved window."
  }
];

export function createFlowNodes(name = "Lead qualification voice agent"): FlowNode[] {
  return [
    {
      id: "router",
      label: "Entry router",
      x: 56,
      y: 250,
      tone: "success",
      state: "Intent and context check",
      prompt: `Open the conversation for ${name}, confirm the caller's goal, and route to the best next step within two turns.`,
      tools: ["intent_classifier", "crm_lookup"],
      knowledge: ["Brand overview", "Calling policy"],
      vendors: { ...defaultStack }
    },
    {
      id: "qualify",
      label: "Qualification",
      x: 360,
      y: 80,
      tone: "success",
      state: "Fit and urgency scoring",
      prompt: "Capture use case, urgency, team size, and conversion signals without sounding scripted.",
      tools: ["lead_score", "crm_update"],
      knowledge: ["Qualification playbook", "Discovery prompts"],
      vendors: { ...defaultStack }
    },
    {
      id: "convert",
      label: "Conversion path",
      x: 360,
      y: 250,
      tone: "warning",
      state: "Offer next best action",
      prompt: "Move qualified callers to the right next step: booking, transfer, quote request, or human follow-up.",
      tools: ["calendar_hold", "quote_request"],
      knowledge: ["Pricing guide", "Objection handling"],
      vendors: { ...defaultStack }
    },
    {
      id: "follow_up",
      label: "Follow-up queue",
      x: 360,
      y: 420,
      tone: "warning",
      state: "Retry and nurture",
      prompt: "Handle voicemail, no-answer, or soft-interest outcomes with compliant callbacks and task creation.",
      tools: ["retry_schedule", "task_create"],
      knowledge: ["Calling window policy", "Follow-up sequences"],
      vendors: { ...defaultStack }
    },
    {
      id: "escalation",
      label: "Human escalation",
      x: 668,
      y: 250,
      tone: "warning",
      state: "Handoff and summary",
      prompt: "Escalate gracefully when the caller needs a human, and generate a tight handoff summary with next actions.",
      tools: ["page_rep", "summary_writeback"],
      knowledge: ["Escalation policy"],
      vendors: { ...defaultStack }
    }
  ];
}

const defaultEdges: Array<[string, string]> = [
  ["router", "qualify"],
  ["router", "convert"],
  ["router", "follow_up"],
  ["qualify", "escalation"],
  ["convert", "escalation"]
];

export const initialAgents: Agent[] = [
  {
    id: "agent_growth",
    name: "Growth inbound",
    description: "Handles inbound qualification and routes qualified buyers into the best next action.",
    status: "Published",
    statusTone: "success",
    lastEdited: "18 minutes ago",
    segment: "Inbound acquisition",
    goal: "Qualify high-intent callers and route them to the next best action.",
    stack: { ...defaultStack },
    runtimeProfile: buildDefaultRuntimeProfile(),
    flowNodes: createFlowNodes("Growth inbound"),
    flowEdges: defaultEdges,
    toolsCatalog: [
      { id: "crm_lookup", name: "CRM lookup", description: "Pull account history and owner before responding.", enabled: true },
      { id: "lead_score", name: "Lead scoring", description: "Score fit from role, volume, urgency, and use case.", enabled: true },
      { id: "calendar_hold", name: "Calendar booking", description: "Reserve the next best meeting slot live in-call.", enabled: true },
      { id: "task_create", name: "Task creation", description: "Queue a human follow-up when the call is not ready to convert.", enabled: true }
    ],
    knowledgeSources: [
      { id: "kb_brand", name: "Brand overview", description: "Positioning, differentiation, and product intro.", status: "Connected", enabled: true },
      { id: "kb_pricing", name: "Pricing guide", description: "Packages, thresholds, and expansion scenarios.", status: "Connected", enabled: true },
      { id: "kb_objections", name: "Objection handling", description: "Approved responses for common concerns.", status: "Syncing", enabled: true }
    ]
  },
  {
    id: "agent_reactivation",
    name: "Pipeline reactivation",
    description: "Re-engages stale opportunities, updates disposition, and books a human follow-up when intent returns.",
    status: "Draft",
    statusTone: "warning",
    lastEdited: "Yesterday",
    segment: "Outbound recovery",
    goal: "Recover dormant opportunities and route promising accounts to the right follow-up.",
    stack: { stt: "Deepgram", llm: "GPT-4.1", tts: "Cartesia" },
    runtimeProfile: buildDefaultRuntimeProfile(),
    flowNodes: createFlowNodes("Pipeline reactivation").map((node) =>
      node.id === "follow_up"
        ? { ...node, state: "Reactivation cadence", prompt: "Capture why timing failed previously and tee up the right human follow-up." }
        : node
    ),
    flowEdges: defaultEdges,
    toolsCatalog: [
      { id: "crm_lookup", name: "CRM lookup", description: "Recover prior opportunity history and ownership.", enabled: true },
      { id: "task_create", name: "Task creation", description: "Create the next touchpoint automatically.", enabled: true },
      { id: "calendar_hold", name: "Calendar booking", description: "Book calls only for re-qualified opportunities.", enabled: false },
      { id: "retry_schedule", name: "Retry scheduling", description: "Set compliant retry windows for no-answer outcomes.", enabled: true }
    ],
    knowledgeSources: [
      { id: "kb_brand", name: "Brand overview", description: "Updated value proposition and market examples.", status: "Connected", enabled: true },
      { id: "kb_reactivation", name: "Reactivation scripts", description: "Lightweight openers and objection responses.", status: "Connected", enabled: true }
    ]
  },
  {
    id: "agent_multistep",
    name: "General conversion desk",
    description: "A generic calling workflow for qualification, conversion, and handoff across multiple verticals.",
    status: "Published",
    statusTone: "success",
    lastEdited: "3 days ago",
    segment: "Cross-vertical",
    goal: "Stay reusable across industries while still capturing structured outcomes.",
    stack: { stt: "Deepgram", llm: "GPT-4.1", tts: "Cartesia" },
    runtimeProfile: buildDefaultRuntimeProfile(),
    flowNodes: createFlowNodes("General conversion desk"),
    flowEdges: defaultEdges,
    toolsCatalog: [
      { id: "crm_lookup", name: "CRM lookup", description: "Bring prior context into the first turn.", enabled: true },
      { id: "lead_score", name: "Lead scoring", description: "Produce a reusable qualification score.", enabled: true },
      { id: "calendar_hold", name: "Calendar booking", description: "Book or transfer when qualified.", enabled: true },
      { id: "summary_writeback", name: "Summary writeback", description: "Save structured call outcomes after completion.", enabled: true }
    ],
    knowledgeSources: [
      { id: "kb_brand", name: "Brand overview", description: "Core positioning and product truth set.", status: "Connected", enabled: true },
      { id: "kb_policy", name: "Calling policy", description: "Consent, retries, and safe operating rules.", status: "Connected", enabled: true }
    ]
  }
];

export const initialConnections: Connection[] = [
  {
    id: "conn_telephony",
    name: "Telephony gateway",
    category: "Telephony",
    vendor: "Twilio",
    description: "Inbound and outbound calling numbers plus voice transport.",
    status: "Connected",
    tone: "success",
    detail: "2 numbers active, 1 sandbox line reserved.",
    lastChecked: "Healthy 5 minutes ago"
  },
  {
    id: "conn_crm",
    name: "CRM sync",
    category: "CRM",
    vendor: "HubSpot",
    description: "Account lookup, owner routing, and write-back after calls.",
    status: "Connected",
    tone: "success",
    detail: "Lead lookup, owner sync, and timeline notes enabled.",
    lastChecked: "Healthy 9 minutes ago"
  },
  {
    id: "conn_calendar",
    name: "Calendar scheduling",
    category: "Calendar",
    vendor: "Google Calendar",
    description: "Books meetings and handoff slots from approved calendars.",
    status: "Warning",
    tone: "warning",
    detail: "One host calendar needs refresh token rotation.",
    lastChecked: "Warning 22 minutes ago"
  },
  {
    id: "conn_knowledge",
    name: "Knowledge sync",
    category: "Knowledge",
    vendor: "Notion",
    description: "Pulls positioning, scripts, and workflow truth into the agent layer.",
    status: "Needs setup",
    tone: "neutral",
    detail: "Knowledge sources are ready to be linked to the active workflow.",
    lastChecked: "Not configured"
  }
];

export const initialCallHistory: CallRecord[] = [
  {
    id: "call_101",
    agentId: "agent_growth",
    agentName: "Growth inbound",
    leadName: "Maya Patel",
    company: "Northstar Clinics",
    phone: "+1 415 555 0188",
    scenarioName: "Inbound qualification",
    status: "Completed",
    statusTone: "success",
    duration: "04:12",
    time: "Today, 09:42",
    summary: "Qualified a multi-location healthcare prospect and booked a follow-up meeting.",
    outcome: "Meeting booked",
    nextStep: "Solutions call on Tue 11:00 AM PT.",
    vendorTrace: "Deepgram -> GPT-4.1 -> Cartesia",
    syncedToCrm: true,
    extractedVariables: [
      { key: "Lead score", value: "91 / 100" },
      { key: "Seats", value: "6 clinics" },
      { key: "Timeline", value: "Next quarter" }
    ],
    toolCalls: [
      { name: "crm_lookup", result: "Existing owner matched" },
      { name: "calendar_hold", result: "Meeting booked" }
    ],
    guardrails: ["Consent notice delivered", "PII redaction active"],
    transcript: [
      { speaker: "Lead", timestamp: "00:05", text: "We run six clinics and want to understand whether this can cover intake and follow-up." },
      { speaker: "Voice", timestamp: "00:14", text: "It can. I will confirm your workflow, urgency, and next best step." },
      { speaker: "Voice", timestamp: "03:57", text: "You are a strong fit. I booked the next meeting and sent the note to your owner." }
    ]
  },
  {
    id: "call_102",
    agentId: "agent_reactivation",
    agentName: "Pipeline reactivation",
    leadName: "Jordan Lee",
    company: "Peak Home Services",
    phone: "+1 212 555 0164",
    scenarioName: "Outbound reactivation",
    status: "Follow-up",
    statusTone: "warning",
    duration: "03:38",
    time: "Today, 08:17",
    summary: "Recovered intent from a stalled opportunity but routed to a human AE for proof-heavy follow-up.",
    outcome: "Follow-up",
    nextStep: "AE follow-up queued with objections and expansion notes.",
    vendorTrace: "Deepgram -> GPT-4.1 -> Cartesia",
    syncedToCrm: false,
    extractedVariables: [
      { key: "Lead score", value: "74 / 100" },
      { key: "Expansion", value: "2 markets" },
      { key: "Buying confidence", value: "Needs proof" }
    ],
    toolCalls: [
      { name: "crm_lookup", result: "Recovered dormant opportunity" },
      { name: "task_create", result: "Assigned follow-up to AE" }
    ],
    guardrails: ["Do-not-call check passed", "Consent notice delivered"],
    transcript: [
      { speaker: "Lead", timestamp: "00:07", text: "Timing was wrong last year and my team still worries about trust." },
      { speaker: "Voice", timestamp: "00:21", text: "I will keep this light and capture what changed." },
      { speaker: "Voice", timestamp: "03:12", text: "I logged your concerns and assigned the next step to your account executive." }
    ]
  },
  {
    id: "call_103",
    agentId: "agent_multistep",
    agentName: "General conversion desk",
    leadName: "Avery Brooks",
    company: "Harbor Legal",
    phone: "+1 646 555 0190",
    scenarioName: "Voicemail recovery",
    status: "Dropped",
    statusTone: "danger",
    duration: "00:42",
    time: "Yesterday, 17:02",
    summary: "Reached voicemail, left a compliant message, and scheduled an approved retry window.",
    outcome: "Voicemail",
    nextStep: "Retry tomorrow 10:00 AM local.",
    vendorTrace: "Deepgram -> GPT-4.1 -> Cartesia",
    syncedToCrm: true,
    extractedVariables: [{ key: "Disposition", value: "Voicemail" }],
    toolCalls: [
      { name: "voicemail_log", result: "Voicemail captured" },
      { name: "retry_schedule", result: "Retry scheduled" }
    ],
    guardrails: ["Calling window respected", "Voicemail disclaimer included"],
    transcript: [
      { speaker: "Voice", timestamp: "00:03", text: "Hi Avery, this is Voice calling with a quick follow-up on your inquiry." },
      { speaker: "Voice", timestamp: "00:18", text: "I am sharing a callback note and will try again during the approved window." }
    ]
  }
];

export const initialNotifications: NotificationItem[] = [
  {
    id: "note_1",
    title: "Calendar token needs review",
    message: "One booking host is in warning state and should be reviewed before new meetings are confirmed.",
    tone: "warning",
    href: "/connections"
  },
  {
    id: "note_2",
    title: "Latest call synced",
    message: "The latest qualification result was written to the CRM timeline.",
    tone: "success",
    href: "/calls/logs"
  }
];

export function createAgent(name: string): Agent {
  const id = `agent_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_${Math.random().toString(36).slice(2, 6)}`;

  return {
    id,
    name,
    description: "New reusable voice workflow for routing, service, qualification, and follow-up.",
    status: "Draft",
    statusTone: "warning",
    lastEdited: "Just now",
    segment: "New workflow",
    goal: "Shape the first working version of the workflow before production rollout.",
    stack: { ...defaultStack },
    runtimeProfile: buildDefaultRuntimeProfile(),
    flowNodes: createFlowNodes(name),
    flowEdges: defaultEdges,
    toolsCatalog: [
      { id: "crm_lookup", name: "CRM lookup", description: "Pull existing lead history into the first turn.", enabled: true },
      { id: "lead_score", name: "Lead scoring", description: "Convert conversation signals into a reusable score.", enabled: true },
      { id: "calendar_hold", name: "Calendar booking", description: "Book the next step for qualified calls.", enabled: false },
      { id: "task_create", name: "Task creation", description: "Assign the next human action when needed.", enabled: true }
    ],
    knowledgeSources: [
      { id: "kb_brand", name: "Brand overview", description: "Core positioning and promise.", status: "Connected", enabled: true },
      { id: "kb_policy", name: "Calling policy", description: "Consent and retry rules.", status: "Connected", enabled: true }
    ]
  };
}

export function getTimeLabel() {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date());
}

function toTimestamp(index: number) {
  return `0${Math.min(index + 1, 9)}:${(index * 14 + 5).toString().padStart(2, "0")}`;
}

export function createActiveCall({
  agent,
  scenario,
  leadName,
  company,
  phone
}: {
  agent: Agent;
  scenario: DemoScenario;
  leadName: string;
  company: string;
  phone: string;
}): ActiveCall {
  const transcript = scenario.transcriptSeed.slice(0, 1).map((item, index) => ({
    ...item,
    timestamp: toTimestamp(index)
  }));

  return {
    id: `active_${Date.now()}`,
    agentId: agent.id,
    agentName: agent.name,
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    leadName,
    company,
    phone,
    phaseIndex: 0,
    phases: scenario.timeline,
    timeline: [`${getTimeLabel()} • ${scenario.timeline[0]}`],
    transcript,
    extractedVariables: scenario.extractedVariables,
    toolCalls: scenario.toolCalls,
    guardrails: scenario.guardrails,
    nextStep: scenario.nextStep
  };
}

export function createCallRecord(call: ActiveCall, agent: Agent, scenario: DemoScenario): CallRecord {
  const status = scenario.outcome === "Voicemail" ? "Dropped" : scenario.outcome === "Follow-up" ? "Follow-up" : "Completed";
  const tone = status === "Completed" ? "success" : status === "Follow-up" ? "warning" : "danger";

  return {
    id: `call_${Date.now()}`,
    agentId: call.agentId,
    agentName: call.agentName,
    leadName: call.leadName,
    company: call.company,
    phone: call.phone,
    scenarioName: call.scenarioName,
    status,
    statusTone: tone,
    duration: `0${call.phases.length}:1${call.transcript.length}`,
    time: `Today, ${getTimeLabel()}`,
    summary: `${scenario.summary} This run used the ${agent.name} workflow and completed the configured next-step routing.`,
    outcome: scenario.outcome,
    nextStep: scenario.nextStep,
    vendorTrace: `${agent.stack.stt} -> ${agent.stack.llm} -> ${agent.stack.tts}`,
    syncedToCrm: false,
    extractedVariables: scenario.extractedVariables,
    toolCalls: scenario.toolCalls,
    guardrails: scenario.guardrails,
    transcript: call.transcript
  };
}

export function createConnection({
  category,
  vendor,
  name
}: {
  category: Connection["category"];
  vendor: string;
  name: string;
}): Connection {
  return {
    id: `conn_${Date.now()}`,
    name,
    category,
    vendor,
    description: `${vendor} connection for ${category.toLowerCase()} workflows.`,
    status: "Connected",
    tone: "success",
    detail: `${vendor} was added and is ready for workflow setup.`,
    lastChecked: `Healthy ${getTimeLabel()}`
  };
}
