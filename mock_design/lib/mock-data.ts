export const dashboardStats = [
  { label: "Active calls", value: "28", change: "+6 from last hour", trend: "up" as const },
  { label: "Calls today", value: "1,284", change: "+14% vs yesterday", trend: "up" as const },
  { label: "Avg handle time", value: "4m 12s", change: "-22s vs baseline", trend: "up" as const },
  { label: "Escalation rate", value: "7.8%", change: "-1.2% week over week", trend: "up" as const }
];

export const navigationSpotlight = [
  { title: "Prompt Studio", href: "/prompts", group: "Build", copy: "Tune scoped prompts, variables, and first-message behavior." },
  { title: "Live Monitoring", href: "/live", group: "Operate", copy: "Watch active calls, partial transcripts, and escalation state." },
  { title: "Secrets", href: "/secrets", group: "Admin", copy: "Review tenant credentials and validation posture." }
];

export const recentCalls = [
  {
    id: "rc_1",
    caller: "+1 415 555 0188",
    agent: "Billing concierge",
    status: "Completed",
    statusTone: "success" as const,
    duration: "03:22",
    time: "2 minutes ago",
    resolution: "Invoice sent via SMS"
  },
  {
    id: "rc_2",
    caller: "+1 212 555 0164",
    agent: "Support triage",
    status: "Escalated",
    statusTone: "warning" as const,
    duration: "06:54",
    time: "13 minutes ago",
    resolution: "Routed to live operator"
  },
  {
    id: "rc_3",
    caller: "+44 20 7946 0958",
    agent: "Sales concierge",
    status: "Dropped",
    statusTone: "danger" as const,
    duration: "00:49",
    time: "28 minutes ago",
    resolution: "Network interruption"
  }
];

export const agents = [
  {
    id: "agent_billing",
    name: "Billing concierge",
    description: "Handles invoices, payment failures, and refund policy questions.",
    status: "Published",
    statusTone: "success" as const,
    lastEdited: "2 hours ago",
    stack: { stt: "Deepgram", llm: "GPT-4.1", tts: "ElevenLabs" }
  },
  {
    id: "agent_support",
    name: "Support triage",
    description: "Performs issue intake, routes to knowledge, and escalates edge cases.",
    status: "Published",
    statusTone: "success" as const,
    lastEdited: "Yesterday",
    stack: { stt: "AssemblyAI", llm: "Claude Sonnet", tts: "Cartesia" }
  },
  {
    id: "agent_sales",
    name: "Sales concierge",
    description: "Qualifies prospects and schedules demos with CRM tool calls.",
    status: "Draft",
    statusTone: "warning" as const,
    lastEdited: "3 days ago",
    stack: { stt: "Deepgram", llm: "GPT-4.1", tts: "Azure TTS" }
  }
];

export const builderNodes = [
  {
    id: "router",
    label: "Router agent",
    x: 56,
    y: 260,
    state: "Intent classification",
    tone: "success" as const,
    prompt: "Classify the caller intent in under 2 turns and hand off to the best specialist agent.",
    tools: ["intent_classifier", "language_detector"],
    kb: ["Global routing policy"],
    vendors: { stt: "Deepgram", llm: "GPT-4.1", tts: "ElevenLabs" }
  },
  {
    id: "billing",
    label: "Billing specialist",
    x: 360,
    y: 90,
    state: "Payment and refund flows",
    tone: "success" as const,
    prompt: "Verify billing identity and assist with invoices, payment methods, and refund windows.",
    tools: ["fetch_invoice", "payment_status", "refund_policy"],
    kb: ["Billing policy", "Refund FAQ"],
    vendors: { stt: "Deepgram", llm: "GPT-4.1", tts: "ElevenLabs" }
  },
  {
    id: "support",
    label: "Support specialist",
    x: 360,
    y: 260,
    state: "Knowledge-led troubleshooting",
    tone: "warning" as const,
    prompt: "Use the troubleshooting knowledge base first, then escalate if confidence stays low.",
    tools: ["search_kb", "create_ticket", "device_lookup"],
    kb: ["Troubleshooting KB", "Incident library"],
    vendors: { stt: "AssemblyAI", llm: "Claude Sonnet", tts: "Cartesia" }
  },
  {
    id: "sales",
    label: "Sales specialist",
    x: 360,
    y: 430,
    state: "Lead qualification",
    tone: "success" as const,
    prompt: "Qualify company size, timeline, and deployment scope before offering a meeting.",
    tools: ["crm_lookup", "book_demo"],
    kb: ["Pricing matrix", "Objection handling"],
    vendors: { stt: "Deepgram", llm: "GPT-4.1", tts: "Azure TTS" }
  },
  {
    id: "escalation",
    label: "Human escalation",
    x: 670,
    y: 260,
    state: "Fallback or policy escalation",
    tone: "warning" as const,
    prompt: "Prepare concise handoff notes with intent, summary, sentiment, and open actions.",
    tools: ["page_operator", "create_summary"],
    kb: ["Escalation policy"],
    vendors: { stt: "AssemblyAI", llm: "Claude Sonnet", tts: "Cartesia" }
  }
];

export const callLogs = [
  {
    id: "call_01",
    caller: "+1 415 555 0188",
    agent: "Billing concierge",
    intent: "Invoice dispute",
    status: "Completed",
    statusTone: "success" as const,
    duration: "03:22",
    time: "Today, 09:42",
    vendorTrace: "Deepgram -> GPT-4.1 -> ElevenLabs",
    variables: [
      { key: "Account", value: "ACME-2041" },
      { key: "Invoice", value: "INV-99214" },
      { key: "Outcome", value: "PDF sent via SMS" }
    ],
    toolCalls: [
      { name: "fetch_invoice", result: "Invoice retrieved successfully" },
      { name: "send_sms_link", result: "Delivery queued to verified mobile number" }
    ],
    guardrails: ["PII masked", "Refund policy enforced"],
    transcript: [
      { speaker: "Caller", timestamp: "00:04", text: "I need a copy of last month's invoice and I think the amount is wrong." },
      { speaker: "Voice", timestamp: "00:11", text: "I can help with that. I verified your account and found invoice INV-99214 for July." },
      { speaker: "Voice", timestamp: "01:32", text: "I have sent the invoice copy to your verified mobile number and noted the billing discrepancy for review." }
    ]
  },
  {
    id: "call_02",
    caller: "+1 212 555 0164",
    agent: "Support triage",
    intent: "Device setup failure",
    status: "Escalated",
    statusTone: "warning" as const,
    duration: "06:54",
    time: "Today, 08:17",
    vendorTrace: "AssemblyAI -> Claude Sonnet -> Cartesia",
    variables: [
      { key: "Device", value: "Sensor Hub S3" },
      { key: "Severity", value: "High" },
      { key: "Ticket", value: "SUP-4491" }
    ],
    toolCalls: [
      { name: "search_kb", result: "No high-confidence setup resolution found" },
      { name: "create_ticket", result: "Ticket SUP-4491 created" }
    ],
    guardrails: ["Escalation threshold reached", "Compliance disclaimer delivered"],
    transcript: [
      { speaker: "Caller", timestamp: "00:06", text: "The device never gets past the activation step and we've tried this on three units." },
      { speaker: "Voice", timestamp: "02:19", text: "I checked the known troubleshooting steps and this needs a human specialist." },
      { speaker: "Voice", timestamp: "06:21", text: "I have created ticket SUP-4491 and routed your case to a live operator with the summary attached." }
    ]
  },
  {
    id: "call_03",
    caller: "+44 20 7946 0958",
    agent: "Sales concierge",
    intent: "Pricing request",
    status: "Dropped",
    statusTone: "danger" as const,
    duration: "00:49",
    time: "Yesterday, 17:02",
    vendorTrace: "Deepgram -> GPT-4.1 -> Azure TTS",
    variables: [
      { key: "Region", value: "UK" },
      { key: "Lead stage", value: "Qualified" },
      { key: "Outcome", value: "Connection lost" }
    ],
    toolCalls: [{ name: "crm_lookup", result: "Lead created in outbound CRM" }],
    guardrails: ["Consent notice delivered"],
    transcript: [
      { speaker: "Caller", timestamp: "00:04", text: "Can you explain your enterprise pricing bands for international support lines?" },
      { speaker: "Voice", timestamp: "00:18", text: "Absolutely. I can outline pricing bands based on call volume, seat count, and regions." }
    ]
  }
];

export const teamMembers = [
  {
    name: "Sanjay Kumar",
    email: "sanjay@voicehq.ai",
    role: "Admin",
    roleTone: "danger" as const,
    team: "Platform",
    lastActive: "Now"
  },
  {
    name: "Nadia Stone",
    email: "nadia@voicehq.ai",
    role: "Editor",
    roleTone: "warning" as const,
    team: "Ops",
    lastActive: "14 minutes ago"
  },
  {
    name: "Luis Chen",
    email: "luis@voicehq.ai",
    role: "Viewer",
    roleTone: "neutral" as const,
    team: "QA",
    lastActive: "2 hours ago"
  }
];

export const phoneNumbers = [
  {
    label: "Primary support line",
    number: "+1 415 555 0188",
    vendor: "Twilio",
    tenant: "Acme Health",
    type: "Local",
    status: "Healthy",
    statusTone: "success" as const,
    health: "99.98% uptime"
  },
  {
    label: "Outbound sales trunk",
    number: "sip:sales-west@carrier.voice",
    vendor: "Telnyx",
    tenant: "Acme Health",
    type: "SIP trunk",
    status: "Warning",
    statusTone: "warning" as const,
    health: "Intermittent auth failures"
  },
  {
    label: "After-hours line",
    number: "+1 212 555 0164",
    vendor: "Twilio",
    tenant: "Pilot tenant",
    type: "Toll-free",
    status: "Provisioning",
    statusTone: "neutral" as const,
    health: "Awaiting verification"
  }
];

export const vendorCredentials = [
  { vendor: "Deepgram", type: "STT", maskedKey: "dg_live_xxxx_xxxx_41af", status: "Validated", tone: "success" as const },
  { vendor: "GPT-4.1", type: "LLM", maskedKey: "sk-proj-xxxx-92hz", status: "Validated", tone: "success" as const },
  { vendor: "ElevenLabs", type: "TTS", maskedKey: "elv_xxxx_8k3m", status: "Validated", tone: "success" as const },
  { vendor: "Twilio", type: "Telephony", maskedKey: "ACf8...3e1 / token pending rotation", status: "Expiring soon", tone: "warning" as const }
];

export const webhooks = [
  {
    url: "https://ops.acmehealth.ai/webhooks/voice",
    events: ["call.completed", "call.escalated", "guardrail.triggered"],
    status: "Active",
    tone: "success" as const
  },
  {
    url: "https://sandbox.partner.io/hooks/voice",
    events: ["call.failed", "call.dropped"],
    status: "Retrying",
    tone: "warning" as const
  }
];

export const deliveries = [
  { id: "d_1", event: "call.completed", time: "09:42", response: "200 OK", status: "Delivered", tone: "success" as const },
  { id: "d_2", event: "call.escalated", time: "08:19", response: "503 Service Unavailable", status: "Failed", tone: "danger" as const },
  { id: "d_3", event: "guardrail.triggered", time: "07:51", response: "202 Accepted", status: "Queued", tone: "warning" as const }
];

export const promptConfigs = [
  {
    id: "prompt_router",
    name: "Router opening",
    scope: "Router agent / initial turn classification",
    status: "Published",
    tone: "success" as const,
    voice: "Neutral concierge",
    lastEdited: "45 minutes ago",
    fallback: "Escalate after 2 low-confidence turns",
    variables: ["{{caller_name}}", "{{language}}"],
    firstMessage: "Thanks for calling Acme Health. I can help with billing, support, or scheduling.",
    prompt:
      "You are the Voice router agent. Classify intent quickly, keep the opening concise, and pass a structured summary to the correct downstream specialist."
  },
  {
    id: "prompt_support",
    name: "Support troubleshooting",
    scope: "Support node / device troubleshooting",
    status: "Draft",
    tone: "warning" as const,
    voice: "Technical calm",
    lastEdited: "Yesterday",
    fallback: "Offer human transfer after 3 failed clarifications",
    variables: ["{{device_model}}", "{{account_tier}}"],
    firstMessage: "I can help troubleshoot your device issue. Tell me what happened right before the failure.",
    prompt:
      "Use troubleshooting KB results first. Ask only one diagnostic question at a time, and never invent unsupported steps if retrieval confidence is low."
  }
];

export const knowledgeBases = [
  {
    name: "Support troubleshooting KB",
    description: "Hardware activation, deployment runbooks, known outages, and field issue playbooks.",
    status: "Healthy",
    tone: "success" as const,
    sources: 18,
    chunks: "12.4k",
    recall: "92%",
    updated: "2 hours ago"
  },
  {
    name: "Billing & refund policy",
    description: "Refund rules, invoice FAQ, payment failure SOPs, and jurisdiction-specific policy text.",
    status: "Refreshing",
    tone: "warning" as const,
    sources: 7,
    chunks: "3.1k",
    recall: "88%",
    updated: "Sync in progress"
  }
];

export const toolsCatalog = [
  {
    phase: "Pre-call tools",
    description: "Hydrate context before the first agent response.",
    tools: [
      {
        name: "crm_lookup",
        purpose: "Fetch caller account and priority tier from CRM.",
        write: false,
        mappings: ["account_name -> {{account_name}}", "priority -> {{priority_tier}}"]
      }
    ]
  },
  {
    phase: "In-call tools",
    description: "Live retrieval and side-effect actions during the conversation.",
    tools: [
      {
        name: "lookup_invoice",
        purpose: "Retrieve invoice status and delivery links.",
        write: false,
        mappings: ["pdf_url -> {{invoice_link}}", "balance_due -> {{balance_due}}"]
      },
      {
        name: "create_ticket",
        purpose: "Open a support ticket after failure diagnosis.",
        write: true,
        mappings: ["ticket_id -> {{ticket_id}}"]
      }
    ]
  },
  {
    phase: "Post-call tools",
    description: "Persist structured outcomes after the call ends.",
    tools: [
      {
        name: "send_summary_webhook",
        purpose: "Deliver call summary and extracted variables to client systems.",
        write: true,
        mappings: ["summary -> external webhook payload"]
      }
    ]
  }
];

export const shieldPolicies = [
  {
    stage: "Input guardrails",
    description: "User speech checks before the LLM reasons on it.",
    status: "Active",
    tone: "success" as const,
    rules: [
      { name: "PII masking", copy: "Mask card, SSN, and policy identifiers before storage and long-term logs.", lastTriggered: "6 mins ago" },
      { name: "Prompt injection scan", copy: "Detect instructions that attempt to override policy or expose hidden system behavior.", lastTriggered: "39 mins ago" }
    ]
  },
  {
    stage: "Output guardrails",
    description: "Response checks before the caller hears the answer.",
    status: "Reviewing",
    tone: "warning" as const,
    rules: [
      { name: "Refund policy verifier", copy: "Verify refund statements against active billing policy snippets.", lastTriggered: "14 mins ago" },
      { name: "Write-tool confirmation", copy: "Require structured confirmation before irreversible actions are executed.", lastTriggered: "27 mins ago" }
    ]
  },
  {
    stage: "Behavior guardrails",
    description: "Conversation-level intervention and escalation policies.",
    status: "Active",
    tone: "success" as const,
    rules: [
      { name: "Frustration escalation", copy: "Escalate when caller frustration rises alongside repeated failures.", lastTriggered: "12 mins ago" },
      { name: "Loop prevention", copy: "Trigger handoff after three repeated clarification failures in one node.", lastTriggered: "1 hour ago" }
    ]
  }
];

export const releaseItems = [
  {
    version: "Support triage v1.9",
    summary: "Updated retrieval tuning and escalation thresholds for hardware activation flows.",
    status: "Canary 10%",
    tone: "warning" as const,
    agent: "Support triage",
    traffic: "10% canary",
    evalGate: "47/49 passed",
    edited: "Today, 10:08"
  },
  {
    version: "Billing concierge v2.3",
    summary: "Published invoice-link delivery improvements and SMS fallback wording.",
    status: "Production",
    tone: "success" as const,
    agent: "Billing concierge",
    traffic: "100%",
    evalGate: "51/51 passed",
    edited: "Yesterday"
  }
];

export const activeCalls = [
  {
    id: "live_1",
    caller: "+1 212 555 0164",
    agent: "Support triage",
    phase: "Troubleshooting node",
    status: "Listening",
    tone: "success" as const,
    duration: "05:12",
    vendor: "AssemblyAI → Claude Sonnet → Cartesia",
    sentiment: "Frustration medium"
  },
  {
    id: "live_2",
    caller: "+1 415 555 0188",
    agent: "Billing concierge",
    phase: "Invoice lookup",
    status: "Tool running",
    tone: "warning" as const,
    duration: "02:08",
    vendor: "Deepgram → GPT-4.1 → ElevenLabs",
    sentiment: "Neutral"
  },
  {
    id: "live_3",
    caller: "+44 20 7946 0958",
    agent: "Sales concierge",
    phase: "Qualification",
    status: "Speaking",
    tone: "success" as const,
    duration: "01:34",
    vendor: "Deepgram → GPT-4.1 → Azure TTS",
    sentiment: "Positive"
  }
];

export const qaQueue = [
  {
    id: "qa_1",
    caller: "+1 212 555 0164",
    agent: "Support triage",
    reason: "Escalated after unclear reset sequence",
    priority: "High priority",
    tone: "warning" as const,
    note: "Candidate to become a regression scenario for activation-code ambiguity."
  },
  {
    id: "qa_2",
    caller: "+44 20 7946 0958",
    agent: "Sales concierge",
    reason: "Dropped during pricing explanation",
    priority: "Needs review",
    tone: "danger" as const,
    note: "Review whether the first answer was too verbose before the line dropped."
  }
];

export const analyticsMetrics = [
  { label: "Task completion", value: "84.6%", change: "+3.2% WoW", trend: "up" as const },
  { label: "Median response latency", value: "742ms", change: "-68ms WoW", trend: "up" as const },
  { label: "Positive sentiment", value: "71%", change: "+4% WoW", trend: "up" as const },
  { label: "Avg cost / call", value: "$0.84", change: "-$0.05 WoW", trend: "up" as const }
];

export const analyticsBreakdowns = [
  {
    title: "By agent",
    rows: [
      { label: "Billing concierge", value: "91% completion" },
      { label: "Support triage", value: "76% completion" },
      { label: "Sales concierge", value: "68% completion" }
    ]
  },
  {
    title: "By vendor stack",
    rows: [
      { label: "Deepgram / GPT-4.1 / ElevenLabs", value: "710ms median" },
      { label: "AssemblyAI / Claude / Cartesia", value: "802ms median" },
      { label: "Deepgram / GPT-4.1 / Azure TTS", value: "786ms median" }
    ]
  },
  {
    title: "By call type",
    rows: [
      { label: "Inbound support", value: "1,028 calls" },
      { label: "Outbound billing", value: "164 calls" },
      { label: "Sales qualification", value: "92 calls" }
    ]
  }
];

export const workspaceTenants = [
  {
    name: "Acme Health",
    region: "US East",
    owner: "Enterprise operations",
    status: "Production",
    tone: "success" as const,
    volume: "12.8k",
    stack: "Twilio / Deepgram / GPT-4.1 / ElevenLabs",
    residency: "US only",
    plan: "Enterprise"
  },
  {
    name: "Pilot tenant",
    region: "EU West",
    owner: "Solutions engineering",
    status: "Sandbox",
    tone: "warning" as const,
    volume: "640",
    stack: "Telnyx / AssemblyAI / Claude / Cartesia",
    residency: "EU pinned",
    plan: "Pilot"
  }
];

export const secretsStore = [
  {
    tenant: "Acme Health",
    description: "Production-scoped credentials with rotation tracking.",
    keys: [
      { name: "Twilio account SID", value: "ACf8••••••••3e1", status: "Validated", tone: "success" as const },
      { name: "Deepgram API key", value: "dg_live_••••41af", status: "Validated", tone: "success" as const }
    ]
  },
  {
    tenant: "Pilot tenant",
    description: "Sandbox credentials and regional overrides.",
    keys: [
      { name: "Telnyx SIP credential", value: "tel_sip_••••2a9d", status: "Needs rotation", tone: "warning" as const },
      { name: "Claude API key", value: "sk-ant-••••93kf", status: "Pending validation", tone: "danger" as const }
    ]
  }
];

export const compliancePolicies = [
  {
    title: "Consent & recording",
    copy: "Model jurisdiction-aware consent prompts and recording rules.",
    status: "Configured",
    tone: "success" as const,
    items: ["Two-party consent warning enabled for regulated flows", "Disable recording when policy flag is present"]
  },
  {
    title: "Retention & redaction",
    copy: "Control transcript lifetime and sensitive data handling.",
    status: "Reviewing",
    tone: "warning" as const,
    items: ["PII redaction before long-term storage", "Auto-delete recordings after 90 days for pilot tenants"]
  },
  {
    title: "Outbound policy",
    copy: "Prepare calling windows, opt-outs, and compliance guardrails.",
    status: "Draft",
    tone: "danger" as const,
    items: ["Timezone-aware calling windows", "DNC sync required before outbound campaign launch"]
  }
];
