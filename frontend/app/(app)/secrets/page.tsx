"use client";

import { useEffect, useState } from "react";
import { useMockApp } from "@/lib/mock-app";
import { Badge, Card, PageHeader } from "@/components/ui";

type ProviderAccountRecord = {
  provider_account_id: string;
  provider_kind: string;
  vendor_name: string;
  label: string;
  status: string;
  has_config: boolean;
  config_keys: string[];
  preview: Record<string, unknown>;
};

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8100";

async function fetchAccounts(tenantSlug: string) {
  const response = await fetch(`${API_BASE}/api/v1/tenants/${tenantSlug}/provider-accounts`, {
    cache: "no-store",
  });
  return (await response.json()) as ProviderAccountRecord[];
}

export default function SecretsPage() {
  const { tenantSlug } = useMockApp();
  const [accounts, setAccounts] = useState<ProviderAccountRecord[]>([]);

  useEffect(() => {
    void fetchAccounts(tenantSlug).then(setAccounts);
  }, [tenantSlug]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Secrets"
        description="A safe inventory of configured secret-bearing integrations without exposing actual credential values."
      />

      <Card>
        <div className="space-y-3">
          {accounts.map((account) => (
            <div key={account.provider_account_id} className="rounded-2xl border border-border bg-[#fcfcff] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{account.label}</p>
                  <p className="mt-1 text-sm text-[#6D6D78]">
                    {account.vendor_name} · {account.provider_kind}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Badge tone={account.status === "active" || account.status === "configured" ? "success" : "warning"}>
                    {account.status}
                  </Badge>
                  <Badge tone={account.has_config ? "success" : "neutral"}>
                    {account.has_config ? "Configured" : "Empty"}
                  </Badge>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {account.config_keys.map((key) => (
                  <span key={key} className="rounded-full bg-white px-3 py-1 text-xs text-[#4B4B59]">
                    {key}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
