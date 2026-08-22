import { AgentStudioScreen } from "@/components/agent-studio-screen";

export default function AgentDetailPage({
  params,
}: {
  params: { agentId: string };
}) {
  return <AgentStudioScreen agentId={params.agentId} />;
}
