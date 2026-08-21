"use client";

import { useState } from "react";
import { Plus, RotateCcw, Webhook } from "lucide-react";
import { deliveries as initialDeliveries, webhooks } from "@/lib/mock-data";
import { Badge, Button, Card, Input, Modal, PageHeader, Textarea } from "@/components/ui";

export default function WebhooksPage() {
  const [isOpen, setIsOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState("call.completed, call.escalated");
  const [secret, setSecret] = useState("whsec_7c8efaf25e51d1");
  const [deliveries, setDeliveries] = useState(initialDeliveries);

  const retryDelivery = (id: string) => {
    setDeliveries((current) =>
      current.map((delivery) =>
        delivery.id === id ? { ...delivery, status: "Retried", tone: "success", response: "200 OK after retry" } : delivery
      )
    );
  };

  const createWebhook = () => {
    setSecret(`whsec_${Math.random().toString(36).slice(2, 12)}`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Integrate"
        title="Webhooks"
        description="Configure outbound event delivery, monitor retries, and verify webhook signing behavior."
        actions={
          <Button onClick={() => setIsOpen(true)}>
            <Plus size={16} />
            Add webhook
          </Button>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Endpoints</h2>
            <p className="mt-1 text-sm text-[#6D6D78]">Registered subscriber URLs and event subscriptions for outbound system events.</p>
          </div>
          <div className="space-y-3">
            {webhooks.map((item) => (
              <div key={item.url} className="rounded-2xl border border-border bg-[#fcfcff] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{item.url}</p>
                    <p className="mt-1 text-sm text-[#6D6D78]">{item.events.join(", ")}</p>
                  </div>
                  <Badge tone={item.tone}>{item.status}</Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Delivery log</h2>
              <p className="mt-1 text-sm text-[#6D6D78]">Recent deliveries across success, failure, and retry states.</p>
            </div>
            <Badge tone="neutral">{deliveries.length} events</Badge>
          </div>
          <div className="space-y-3">
            {deliveries.map((delivery) => (
              <div key={delivery.id} className="rounded-2xl border border-border bg-[#fafafe] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{delivery.event}</p>
                    <p className="mt-1 text-sm text-[#6D6D78]">
                      {delivery.time} • {delivery.response}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={delivery.tone}>{delivery.status}</Badge>
                    {delivery.status === "Failed" ? (
                      <Button size="sm" variant="secondary" onClick={() => retryDelivery(delivery.id)}>
                        <RotateCcw size={14} />
                        Retry
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Modal
        description="Create a mock endpoint and inspect the generated signing secret."
        isOpen={isOpen}
        title="Add webhook"
        onClose={() => setIsOpen(false)}
      >
        <div className="space-y-4">
          <Input label="Endpoint URL" placeholder="https://app.example.com/webhooks/voice" value={url} onChange={(event) => setUrl(event.target.value)} />
          <Textarea label="Subscribed events" rows={3} value={events} onChange={(event) => setEvents(event.target.value)} />
          <Button className="w-full justify-center" onClick={createWebhook}>
            <Webhook size={16} />
            Generate signing secret
          </Button>
          <div className="rounded-2xl border border-border bg-[#fafafe] p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-[#6D6D78]">Signing secret</p>
            <p className="mt-2 rounded-xl border border-border bg-white px-3 py-2 font-mono text-xs">{secret}</p>
          </div>
        </div>
      </Modal>
    </div>
  );
}
