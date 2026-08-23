import { AgentStudioScreen } from "@/components/agent-studio-screen";

export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = await params;
  return <AgentStudioScreen agentId={agentId} />;
}
