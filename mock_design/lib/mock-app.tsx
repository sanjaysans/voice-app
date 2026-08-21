"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import {
  createActiveCall,
  createAgent,
  createCallRecord,
  createConnection,
  dateRanges,
  demoScenarios,
  getTimeLabel,
  initialAgents,
  initialCallHistory,
  initialConnections,
  initialNotifications,
  type ActiveCall,
  type Agent,
  type CallRecord,
  type Connection,
  type DemoScenario,
  type NotificationItem
} from "@/lib/mock-data";

type CallsView = "launch" | "live" | "review";

type MockAppContextValue = {
  agents: Agent[];
  selectedAgentId: string;
  selectedAgent: Agent;
  connections: Connection[];
  activeCall: ActiveCall | null;
  callHistory: CallRecord[];
  selectedCallId: string;
  selectedCall: CallRecord;
  callsView: CallsView;
  notifications: NotificationItem[];
  scenarios: DemoScenario[];
  dateRange: string;
  selectAgent: (agentId: string) => void;
  createNewAgent: (name?: string) => Agent;
  updateAgent: (agentId: string, updater: (agent: Agent) => Agent) => void;
  updateFlowNode: (agentId: string, nodeId: string, field: "label" | "state" | "prompt", value: string) => void;
  updateNodeVendor: (agentId: string, nodeId: string, vendor: "stt" | "llm" | "tts", value: string) => void;
  toggleTool: (agentId: string, toolId: string) => void;
  toggleKnowledge: (agentId: string, sourceId: string) => void;
  publishAgent: (agentId: string) => void;
  toggleConnection: (connectionId: string) => void;
  addConnection: (payload: { category: Connection["category"]; vendor: string; name: string }) => void;
  startCall: (payload: {
    agentId: string;
    scenarioId: string;
    leadName: string;
    company: string;
    phone: string;
  }) => void;
  setCallsView: (view: CallsView) => void;
  selectCall: (callId: string) => void;
  markSynced: (callId: string) => void;
  dismissNotification: (notificationId: string) => void;
  setDateRange: (range: string) => void;
};

const MockAppContext = createContext<MockAppContextValue | null>(null);

export function MockAppProvider({ children }: { children: ReactNode }) {
  const [agents, setAgents] = useState(initialAgents);
  const [selectedAgentId, setSelectedAgentId] = useState(initialAgents[0].id);
  const [connections, setConnections] = useState(initialConnections);
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [callHistory, setCallHistory] = useState(initialCallHistory);
  const [selectedCallId, setSelectedCallId] = useState(initialCallHistory[0].id);
  const [callsView, setCallsView] = useState<CallsView>("launch");
  const [notifications, setNotifications] = useState(initialNotifications);
  const [dateRange, setDateRange] = useState(dateRanges[1]);

  useEffect(() => {
    if (!activeCall) {
      return;
    }

    if (activeCall.phaseIndex >= activeCall.phases.length - 1) {
      const finalizeTimer = window.setTimeout(() => {
        const agent = agents.find((item) => item.id === activeCall.agentId);
        const scenario = demoScenarios.find((item) => item.id === activeCall.scenarioId);

        if (!agent || !scenario) {
          setActiveCall(null);
          return;
        }

        const record = createCallRecord(activeCall, agent, scenario);
        setCallHistory((current) => [record, ...current]);
        setSelectedCallId(record.id);
        setCallsView("review");
        setActiveCall(null);
        setNotifications((current) => [
          {
            id: `note_${Date.now()}`,
            title: `${record.agentName} completed a call`,
            message: `${record.leadName} from ${record.company} is ready for review.`,
            tone: record.statusTone === "danger" ? "warning" : "success",
            href: "/calls"
          },
          ...current
        ]);
      }, 1100);

      return () => window.clearTimeout(finalizeTimer);
    }

    const stepTimer = window.setTimeout(() => {
      setActiveCall((current) => {
        if (!current) {
          return current;
        }

        const scenario = demoScenarios.find((item) => item.id === current.scenarioId);

        if (!scenario) {
          return current;
        }

        const nextPhaseIndex = current.phaseIndex + 1;
        const nextTranscriptSeed = scenario.transcriptSeed[nextPhaseIndex];
        const transcript =
          nextTranscriptSeed && current.transcript.length <= nextPhaseIndex
            ? [
                ...current.transcript,
                {
                  ...nextTranscriptSeed,
                  timestamp: `0${Math.min(nextPhaseIndex + 1, 9)}:${(nextPhaseIndex * 14 + 5)
                    .toString()
                    .padStart(2, "0")}`
                }
              ]
            : current.transcript;

        return {
          ...current,
          phaseIndex: nextPhaseIndex,
          timeline: [...current.timeline, `${getTimeLabel()} • ${current.phases[nextPhaseIndex]}`],
          transcript
        };
      });
    }, 1300);

    return () => window.clearTimeout(stepTimer);
  }, [activeCall, agents]);

  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) ?? agents[0];
  const selectedCall = callHistory.find((call) => call.id === selectedCallId) ?? callHistory[0];

  const value = useMemo<MockAppContextValue>(
    () => ({
      agents,
      selectedAgentId,
      selectedAgent,
      connections,
      activeCall,
      callHistory,
      selectedCallId,
      selectedCall,
      callsView,
      notifications,
      scenarios: demoScenarios,
      dateRange,
      selectAgent: setSelectedAgentId,
      createNewAgent: (name = "New conversion flow") => {
        const agent = createAgent(name);
        setAgents((current) => [agent, ...current]);
        setSelectedAgentId(agent.id);
        return agent;
      },
      updateAgent: (agentId, updater) => {
        setAgents((current) => current.map((agent) => (agent.id === agentId ? updater(agent) : agent)));
      },
      updateFlowNode: (agentId, nodeId, field, value) => {
        setAgents((current) =>
          current.map((agent) =>
            agent.id === agentId
              ? {
                  ...agent,
                  lastEdited: "Just now",
                  flowNodes: agent.flowNodes.map((node) =>
                    node.id === nodeId ? { ...node, [field]: value } : node
                  )
                }
              : agent
          )
        );
      },
      updateNodeVendor: (agentId, nodeId, vendor, value) => {
        setAgents((current) =>
          current.map((agent) =>
            agent.id === agentId
              ? {
                  ...agent,
                  lastEdited: "Just now",
                  stack: { ...agent.stack, [vendor]: value },
                  flowNodes: agent.flowNodes.map((node) =>
                    node.id === nodeId
                      ? { ...node, vendors: { ...node.vendors, [vendor]: value } }
                      : node
                  )
                }
              : agent
          )
        );
      },
      toggleTool: (agentId, toolId) => {
        setAgents((current) =>
          current.map((agent) =>
            agent.id === agentId
              ? {
                  ...agent,
                  lastEdited: "Just now",
                  toolsCatalog: agent.toolsCatalog.map((tool) =>
                    tool.id === toolId ? { ...tool, enabled: !tool.enabled } : tool
                  )
                }
              : agent
          )
        );
      },
      toggleKnowledge: (agentId, sourceId) => {
        setAgents((current) =>
          current.map((agent) =>
            agent.id === agentId
              ? {
                  ...agent,
                  lastEdited: "Just now",
                  knowledgeSources: agent.knowledgeSources.map((source) =>
                    source.id === sourceId ? { ...source, enabled: !source.enabled } : source
                  )
                }
              : agent
          )
        );
      },
      publishAgent: (agentId) => {
        setAgents((current) =>
          current.map((agent) =>
            agent.id === agentId
              ? {
                  ...agent,
                  status: "Published",
                  statusTone: "success",
                  lastEdited: "Just now"
                }
              : agent
          )
        );
        setNotifications((current) => [
          {
            id: `note_${Date.now()}`,
            title: "Agent published",
            message: "The workflow is published and ready for new call traffic.",
            tone: "success",
            href: "/agents/builder"
          },
          ...current
        ]);
      },
      toggleConnection: (connectionId) => {
        setConnections((current) =>
          current.map((connection) => {
            if (connection.id !== connectionId) {
              return connection;
            }

            if (connection.status === "Connected") {
              return {
                ...connection,
                status: "Warning",
                tone: "warning",
                detail: `${connection.vendor} health check surfaced an issue that needs review.`,
                lastChecked: `Warning ${getTimeLabel()}`
              };
            }

            return {
              ...connection,
              status: "Connected",
              tone: "success",
              detail: `${connection.vendor} connection is healthy and ready for new traffic.`,
              lastChecked: `Healthy ${getTimeLabel()}`
            };
          })
        );
      },
      addConnection: ({ category, vendor, name }) => {
        const connection = createConnection({ category, vendor, name });
        setConnections((current) => [connection, ...current]);
        setNotifications((current) => [
          {
            id: `note_${Date.now()}`,
            title: "Connection added",
            message: `${connection.name} is now available in the connections workspace.`,
            tone: "success",
            href: "/connections"
          },
          ...current
        ]);
      },
      startCall: ({ agentId, scenarioId, leadName, company, phone }) => {
        const agent = agents.find((item) => item.id === agentId) ?? agents[0];
        const scenario = demoScenarios.find((item) => item.id === scenarioId) ?? demoScenarios[0];
        const call = createActiveCall({
          agent,
          scenario,
          leadName: leadName.trim() || scenario.leadName,
          company: company.trim() || scenario.company,
          phone: phone.trim() || scenario.phone
        });

        setSelectedAgentId(agent.id);
        setActiveCall(call);
        setCallsView("live");
      },
      setCallsView,
      selectCall: (callId) => {
        setSelectedCallId(callId);
        setCallsView("review");
      },
      markSynced: (callId) => {
        setCallHistory((current) =>
          current.map((call) =>
            call.id === callId ? { ...call, syncedToCrm: true, nextStep: "Synced to CRM timeline and owner notified." } : call
          )
        );
        setNotifications((current) => [
          {
            id: `note_${Date.now()}`,
            title: "CRM sync completed",
            message: "The selected call was written back to the CRM timeline.",
            tone: "success",
            href: "/calls"
          },
          ...current
        ]);
      },
      dismissNotification: (notificationId) => {
        setNotifications((current) => current.filter((notification) => notification.id !== notificationId));
      },
      setDateRange
    }),
    [
      activeCall,
      agents,
      callHistory,
      callsView,
      connections,
      dateRange,
      notifications,
      selectedAgent,
      selectedAgentId,
      selectedCall,
      selectedCallId
    ]
  );

  return <MockAppContext.Provider value={value}>{children}</MockAppContext.Provider>;
}

export function useMockApp() {
  const context = useContext(MockAppContext);

  if (!context) {
    throw new Error("useMockApp must be used within MockAppProvider");
  }

  return context;
}
