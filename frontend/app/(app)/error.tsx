"use client";

import { useEffect } from "react";
import { Button, Card } from "@/components/ui";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("app route failed", error);
  }, [error]);

  return (
    <Card className="mx-auto mt-12 max-w-xl text-center">
      <p className="eyebrow">Surface error</p>
      <h1 className="mt-3 text-2xl font-semibold">This view needs a refresh</h1>
      <p className="mt-3 text-sm leading-6 text-muted">
        The workspace view could not finish rendering. Your session is safe; retry the surface or return to the dashboard.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <Button onClick={reset}>Retry surface</Button>
        <Button href="/dashboard" asChild variant="secondary">Dashboard</Button>
      </div>
    </Card>
  );
}
