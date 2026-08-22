"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  Cable,
  ChevronRight,
  FolderKanban,
  KeyRound,
  LayoutDashboard,
  LineChart,
  Mic,
  Phone,
  Puzzle,
  Shield,
  Route,
  Settings2,
  Users,
  Webhook,
  X
} from "lucide-react";
import { useMockApp } from "@/lib/mock-app";
import { cn } from "@/lib/utils";
import { Badge, Button } from "@/components/ui";

const navSections = [
  {
    label: "Build",
    items: [
      { href: "/agents", label: "Agents", icon: Mic },
      { href: "/agents/builder", label: "Studio", icon: Route },
      { href: "/prompts", label: "Prompts", icon: Route },
      { href: "/knowledge-base", label: "Knowledge", icon: FolderKanban },
      { href: "/tools", label: "Tools", icon: Puzzle },
      { href: "/releases", label: "Releases", icon: Route },
      { href: "/guardrails", label: "Guardrails", icon: Shield }
    ]
  },
  {
    label: "Operate",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/calls", label: "Calls", icon: Phone },
      { href: "/calls/logs", label: "Call logs", icon: Phone },
      { href: "/qa-review", label: "QA review", icon: Shield },
      { href: "/analytics", label: "Analytics", icon: LineChart }
    ]
  },
  {
    label: "Admin",
    items: [
      { href: "/connections", label: "Connections", icon: Cable },
      { href: "/workspaces", label: "Workspaces", icon: FolderKanban },
      { href: "/team", label: "Team", icon: Users },
      { href: "/webhooks", label: "Webhooks", icon: Webhook },
      { href: "/secrets", label: "Secrets", icon: KeyRound },
      { href: "/compliance", label: "Compliance", icon: Shield }
    ]
  }
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { currentUser, notifications, dismissNotification, connections, workspaceName, signOut } =
    useMockApp();
  const itemsNeedingReview = connections.filter((connection) => connection.status !== "Connected").length;
  const todayLabel = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date());

  return (
    <div className="flex min-h-screen bg-canvas">
      <aside className="sticky top-0 hidden h-screen w-[248px] flex-col bg-sidebar px-5 py-6 text-white lg:flex">
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

          <div className="mt-8 rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[rgba(255,255,255,0.56)]">Active focus</p>
            <p className="mt-2 text-sm font-medium">Unified call operations</p>
            <p className="mt-2 text-sm leading-6 text-[rgba(255,255,255,0.72)]">
              Build, launch, and review voice workflows from one operating surface.
            </p>
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

        <div className="mt-6 rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[rgba(139,127,255,0.16)] text-accent-soft">
              <Settings2 size={18} />
            </div>
            <div>
              <p className="text-sm font-medium">{workspaceName || "Workspace setup pending"}</p>
              <p className="text-xs text-[rgba(255,255,255,0.64)]">Authenticated operator workspace</p>
            </div>
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 border-b border-border bg-[rgba(247,247,249,0.92)] backdrop-blur">
          <div className="flex min-h-[84px] flex-col gap-4 px-6 py-4 lg:px-8 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-[#6D6D78]">{todayLabel}</p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <p className="text-sm text-[#4B4B59]">Unified AI calling workspace for workflow design, launch, and review.</p>
                <Badge tone={itemsNeedingReview ? "warning" : "success"}>
                  {itemsNeedingReview ? `${itemsNeedingReview} items need review` : "All systems healthy"}
                </Badge>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button asChild href="/calls" variant="secondary">
                Launch call
              </Button>
              <Button asChild href="/agents/builder">
                Open studio
                <ChevronRight size={16} />
              </Button>
              <div className="rounded-2xl border border-border bg-white px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Bell size={16} className="text-accent" />
                  {notifications.length} alerts
                </div>
              </div>
              <div className="rounded-2xl border border-border bg-white px-4 py-3 text-right">
                <p className="text-sm font-medium">{currentUser?.displayName ?? "Voice user"}</p>
                <p className="text-xs text-[#6D6D78]">{currentUser?.role ?? "Admin"}</p>
              </div>
              <Button onClick={() => void signOut()} variant="secondary">
                Sign out
              </Button>
              <div className="rounded-2xl border border-border bg-white px-4 py-3 text-right">
                <p className="text-sm font-medium">{currentUser?.email ?? "No session"}</p>
                <p className="text-xs text-[#6D6D78]">
                  {currentUser?.isPlatformAdmin ? "Platform admin" : "Workspace access"}
                </p>
              </div>
            </div>
          </div>

          <div className="border-t border-border px-4 py-3 lg:hidden">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {navSections.flatMap((section) => section.items).map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    className={cn(
                      "whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition",
                      active
                        ? "bg-[rgba(102,89,255,0.12)] text-accent"
                        : "bg-white text-[#6D6D78]"
                    )}
                    href={item.href}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>

          {notifications.length ? (
            <div className="border-t border-border px-6 py-3 lg:px-8">
              <div className="flex flex-wrap gap-3">
                {notifications.slice(0, 3).map((notification) => (
                  <div
                    key={notification.id}
                    className="flex min-w-[280px] flex-1 items-start justify-between gap-3 rounded-2xl border border-border bg-white px-4 py-3"
                  >
                    <Link className="min-w-0 flex-1" href={notification.href}>
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium">{notification.title}</p>
                        <Badge tone={notification.tone}>{notification.tone === "success" ? "Live" : "Attention"}</Badge>
                      </div>
                      <p className="mt-1 text-sm leading-6 text-[#6D6D78]">{notification.message}</p>
                    </Link>
                    <button
                      className="rounded-xl border border-border p-2 text-[#8A8A97] transition hover:text-[#17171F]"
                      onClick={() => dismissNotification(notification.id)}
                      type="button"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </header>

        <main className="px-6 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
