import { EvaluationSuiteScreen } from "@/components/evaluation-suite-screen";

export default async function EvaluationSuitePage({
  params,
}: {
  params: Promise<{ suiteId: string }>;
}) {
  const { suiteId } = await params;
  return <EvaluationSuiteScreen suiteId={suiteId} />;
}
