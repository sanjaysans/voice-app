"use client";

import { ArrowRight, Radio, ScrollText } from "lucide-react";
import { Button, Card, PageHeader } from "@/components/ui";

export default function CallsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operate"
        title="Calls"
        description="Telephony launch is still deferred, so this surface now points operators to the supported browser-live validation path and the persisted review trail."
      />
      <Card className="border-dashed bg-[#fcfcff]">
        <div className="mx-auto max-w-2xl text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[rgba(102,89,255,0.12)] text-accent">
            <Radio size={20} />
          </div>
          <h2 className="mt-4 text-lg font-semibold">Telephony launch is not configured yet</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#6D6D78]">
            Use Live for the supported no-telephony browser demo, then review the persisted transcript and outcome details in call logs.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button asChild href="/live">
              <Radio size={16} />
              Open Live
            </Button>
            <Button asChild href="/calls/logs" variant="secondary">
              <ScrollText size={16} />
              Open call logs
            </Button>
          </div>
          <div className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-accent">
            Browser demo path
            <ArrowRight size={15} />
            <span className="text-[#4B4B59]">{"Live -> Call logs"}</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
