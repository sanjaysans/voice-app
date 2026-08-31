import { Button, Card } from "@/components/ui";

export default function NotFound() {
  return (
    <Card className="mx-auto mt-12 max-w-xl text-center">
      <p className="eyebrow">Not found</p>
      <h1 className="mt-3 text-2xl font-semibold">That workspace view does not exist</h1>
      <p className="mt-3 text-sm leading-6 text-muted">Use the dashboard to return to an available operating surface.</p>
      <div className="mt-6"><Button href="/dashboard" asChild>Open dashboard</Button></div>
    </Card>
  );
}
