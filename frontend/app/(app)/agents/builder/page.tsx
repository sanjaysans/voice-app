"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ContentLoader } from "@/components/ui";
import { useMockApp } from "@/lib/mock-app";

export default function LegacyAgentBuilderPage() {
  const router = useRouter();
  const { agents, selectedAgentId } = useMockApp();

  useEffect(() => {
    const targetAgentId = selectedAgentId || agents[0]?.id;
    if (targetAgentId) {
      router.replace(`/agents/${targetAgentId}`);
      return;
    }
    router.replace("/agents");
  }, [agents, router, selectedAgentId]);

  return (
    <div className="space-y-6">
      <ContentLoader
        title="Opening agent studio"
        description="Redirecting to the selected agent workflow."
      />
    </div>
  );
}
