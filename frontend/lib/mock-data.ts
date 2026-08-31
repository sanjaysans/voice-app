import { buildDefaultRuntimeProfile, type AgentRuntimeProfile } from "@/lib/voice-stack";

export type Tone = "neutral" | "success" | "warning" | "danger";

export type VendorStack = {
  stt: string;
  llm: string;
  tts: string;
};

export type VariableDataType = "text" | "number" | "boolean" | "date" | "datetime" | "enum";

export type AgentVariable = {
  key: string;
  label: string;
  description: string;
  dataType: VariableDataType;
  required: boolean;
  defaultValue?: string | number | boolean;
  options: string[];
};

export type FlowNode = {
  id: string;
  label: string;
  x: number;
  y: number;
  tone: Exclude<Tone, "danger">;
  nodeType?: "state" | "end_call";
  state: string;
  prompt: string;
  tools: string[];
  knowledge: string[];
  vendors: VendorStack;
};

export type FlowEdge = {
  id: string;
  sourceId: string;
  targetId: string;
  label: string;
  condition: string;
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
  sharedPrompt: string;
  status: "Draft" | "Published";
  statusTone: "warning" | "success";
  lastEdited: string;
  segment: string;
  goal: string;
  stack: VendorStack;
  variables: AgentVariable[];
  runtimeProfile: AgentRuntimeProfile;
  flowNodes: FlowNode[];
  flowEdges: FlowEdge[];
  toolsCatalog: AgentTool[];
  knowledgeSources: KnowledgeSource[];
};

export type AgentCreationMode = "empty" | "template";


export type CallRecord = {
  id: string;
  isTest?: boolean;
  createdAt?: string;
  direction?: string;
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

const defaultStack: VendorStack = {
  stt: "Deepgram",
  llm: "GPT-4.1",
  tts: "Cartesia"
};

export const dateRanges = ["Today", "7D", "30D", "Quarter"];

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
      tools: [],
      knowledge: [],
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
      tools: [],
      knowledge: [],
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
      tools: [],
      knowledge: [],
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
      tools: [],
      knowledge: [],
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
      tools: [],
      knowledge: [],
      vendors: { ...defaultStack }
    },
    {
      id: "end_call",
      label: "End call",
      x: 668,
      y: 420,
      tone: "warning",
      nodeType: "end_call",
      state: "Generate the closing note and terminate the call",
      prompt: "Generate a concise, polite closing note, play it once, then terminate the call without waiting for another user turn.",
      tools: [],
      knowledge: [],
      vendors: { ...defaultStack }
    }
  ];
}

const defaultEdges: FlowEdge[] = [
  {
    id: "edge_router_qualify",
    sourceId: "router",
    targetId: "qualify",
    label: "Needs qualification",
    condition: "Use this when the caller intent is still being qualified and basic fit needs to be assessed."
  },
  {
    id: "edge_router_convert",
    sourceId: "router",
    targetId: "convert",
    label: "Ready for next action",
    condition: "Use this when intent is clear and the caller is ready to move toward booking, quote, or transfer."
  },
  {
    id: "edge_router_follow_up",
    sourceId: "router",
    targetId: "follow_up",
    label: "Needs later follow-up",
    condition: "Use this when there is no live resolution, voicemail is reached, or the caller asks for a callback."
  },
  {
    id: "edge_qualify_escalation",
    sourceId: "qualify",
    targetId: "escalation",
    label: "Human help required",
    condition: "Escalate when the caller requests a human, asks for exception handling, or enters a sensitive path."
  },
  {
    id: "edge_convert_escalation",
    sourceId: "convert",
    targetId: "escalation",
    label: "Cannot complete in bot",
    condition: "Escalate if the workflow cannot complete the promised next action safely."
  },
  {
    id: "edge_convert_end_call",
    sourceId: "convert",
    targetId: "end_call",
    label: "Next step complete",
    condition: "The conversion path completes its agreed next action."
  },
  {
    id: "edge_follow_up_end_call",
    sourceId: "follow_up",
    targetId: "end_call",
    label: "Follow-up captured",
    condition: "The callback or follow-up disposition is captured."
  },
  {
    id: "edge_escalation_end_call",
    sourceId: "escalation",
    targetId: "end_call",
    label: "Handoff complete",
    condition: "The handoff summary is complete and the call can be closed."
  }
];

export function createAgent(name: string, mode: AgentCreationMode = "template"): Agent {
  const id = `agent_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_${Math.random().toString(36).slice(2, 6)}`;
  const isTemplate = mode === "template";

  return {
    id,
    name,
    description: isTemplate
      ? "New reusable voice workflow for routing, service, qualification, and follow-up."
      : "",
    sharedPrompt: "",
    status: "Draft",
    statusTone: "warning",
    lastEdited: "Just now",
    segment: "",
    goal: "",
    stack: { ...defaultStack },
    variables: [],
    runtimeProfile: buildDefaultRuntimeProfile(),
    flowNodes: isTemplate ? createFlowNodes(name) : [],
    flowEdges: isTemplate ? defaultEdges : [],
    toolsCatalog: [],
    knowledgeSources: []
  };
}
