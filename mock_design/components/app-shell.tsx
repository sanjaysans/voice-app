"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  Cable,
  Database,
  Flame,
  LayoutDashboard,
  LineChart,
  LockKeyhole,
  Mic,
  Phone,
  PlaySquare,
  Route,
  ScanSearch,
  Settings2,
  ShieldCheck,
  ShieldEllipsis,
  UsersRound,
  Webhook
} from "lucide-react";
import { cn } from "@/lib/utils";

const navSections = [
  {
    label: "Build",
    items: [
      { href: "/agents", label: "Agents", icon: Mic },
      { href: "/agents/builder", label: "Builder", icon: Route },
      { href: "/prompts", label: "Prompt Studio", icon: PlaySquare },
      { href: "/knowledge-base", label: "Knowledge Base", icon: Database },
      { href: "/tools", label: "Tools & Variables", icon: ScanSearch },
      { href: "/guardrails", label: "Guardrails", icon: ShieldEllipsis },
      { href: "/releases", label: "Releases", icon: Flame }
    ]
  },
  {
    label: "Operate",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/live", label: "Live Monitoring", icon: Phone },
      { href: "/calls", label: "Trigger & Connect", icon: Phone },
      { href: "/calls/logs", label: "Call Logs", icon: Phone },
      { href: "/qa-review", label: "QA Review", icon: ShieldCheck },
      { href: "/analytics", label: "Analytics", icon: LineChart }
    ]
  },
  {
    label: "Admin",
    items: [
      { href: "/connections", label: "Connections", icon: Cable },
      { href: "/webhooks", label: "Webhooks", icon: Webhook },
      { href: "/team", label: "Team", icon: UsersRound },
      { href: "/workspaces", label: "Workspaces", icon: UsersRound },
      { href: "/secrets", label: "Secrets", icon: LockKeyhole },
      { href: "/compliance", label: "Compliance", icon: ShieldCheck }
    ]
  }
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen bg-canvas">
      <aside className="sticky top-0 hidden h-screen w-[260px] flex-col bg-sidebar px-5 py-6 text-white xl:flex">
        <div className="min-h-0 flex-1 overflow-y-auto pr-1 scrollbar-subtle">
          <div className="flex items-center gap-3 px-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent text-white">
              <Mic size={18} />
            </div>
            <div>
              <p className="text-sm font-semibold">Voice</p>
              <p className="text-xs text-[rgba(255,255,255,0.64)]">Operator workspace</p>
            </div>
          </div>

          <nav className="mt-8 space-y-6">
            {navSections.map((section) => (
              <div key={section.label}>
                <p className="px-4 text-[11px] font-semibold uppercase tracking-[0.22em] text-[rgba(255,255,255,0.38)]">
                  {section.label}
                </p>
                <div className="mt-2 space-y-2">
                  {section.items.map((item) => {
                    const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                    return (
                      <Link
                        key={item.href}
                        className={cn(
                          "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition",
                          active
                            ? "bg-[rgba(102,89,255,0.18)] text-white"
                            : "text-[rgba(255,255,255,0.68)] hover:bg-[rgba(255,255,255,0.04)] hover:text-white"
                        )}
                        href={item.href}
                      >
                        <item.icon size={18} className={active ? "text-accent-soft" : undefined} />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </div>

        <div className="mt-6 shrink-0 rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[rgba(139,127,255,0.16)] text-accent-soft">
              <Settings2 size={18} />
            </div>
            <div>
              <p className="text-sm font-medium">Tenant: Acme Health</p>
              <p className="text-xs text-[rgba(255,255,255,0.64)]">Production sandbox</p>
            </div>
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 border-b border-border bg-[rgba(247,247,249,0.9)] backdrop-blur">
          <div className="flex min-h-[76px] items-center justify-between gap-4 px-6 py-4 xl:px-8">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-[#6D6D78]">Friday, August 21, 2026</p>
              <p className="mt-2 text-sm text-[#4B4B59]">Multi-tenant telephony platform prototype</p>
            </div>
            <div className="flex items-center gap-3">
              <button className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border bg-white text-[#6D6D78]" type="button">
                <Bell size={18} />
              </button>
              <div className="rounded-2xl border border-border bg-white px-4 py-3 text-right">
                <p className="text-sm font-medium">Sanjay Kumar</p>
                <p className="text-xs text-[#6D6D78]">Admin</p>
              </div>
            </div>
          </div>
        </header>

        <main className="px-6 py-6 xl:px-8">{children}</main>
      </div>
    </div>
  );
}
