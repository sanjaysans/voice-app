"use client";

import { type ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  Cable,
  FolderKanban,
  KeyRound,
  LayoutDashboard,
  LineChart,
  LogOut,
  Mic,
  Phone,
  Puzzle,
  Radio,
  ScrollText,
  Shield,
  Sparkles,
  Settings2,
  Users,
  Webhook,
} from "lucide-react";
import { useApiActivity } from "@/lib/api-activity";
import { useMockApp } from "@/lib/mock-app";
import { useAsyncAction } from "@/lib/use-async-action";
import { cn } from "@/lib/utils";
import { Badge, Button, ConfirmActionModal, Select, SurfaceLoader } from "@/components/ui";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  soon?: boolean;
};

const navSections = [
  {
    label: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/calls/logs", label: "Call logs", icon: ScrollText },
      { href: "/live", label: "Live", icon: Radio },
      { href: "/evaluations", label: "Evaluations", icon: Shield },
      { href: "/calls", label: "Calls", icon: Phone },
      { href: "/qa-review", label: "QA review", icon: Shield, soon: true },
      { href: "/analytics", label: "Analytics", icon: LineChart, soon: true }
    ] satisfies NavItem[]
  },
  {
    label: "Build",
    items: [
      { href: "/agents", label: "Agents", icon: Mic },
      { href: "/knowledge-base", label: "Knowledge", icon: FolderKanban, soon: true },
      { href: "/tools", label: "Tools", icon: Puzzle, soon: true },
      { href: "/releases", label: "Releases", icon: Sparkles, soon: true },
      { href: "/guardrails", label: "Guardrails", icon: Shield, soon: true }
    ] satisfies NavItem[]
  },
  {
    label: "Admin",
    items: [
      { href: "/connections", label: "Connections", icon: Cable },
      { href: "/team", label: "Team", icon: Users },
      { href: "/workspaces", label: "Workspaces", icon: FolderKanban },
      { href: "/webhooks", label: "Webhooks", icon: Webhook },
      { href: "/secrets", label: "Secrets", icon: KeyRound },
      { href: "/compliance", label: "Compliance", icon: Shield, soon: true }
    ] satisfies NavItem[]
  }
];

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const content = (
    <>
      <item.icon size={18} className={active ? "text-accent-soft" : undefined} />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.soon ? (
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]",
            active
              ? "border-[rgba(255,255,255,0.18)] bg-[rgba(255,255,255,0.08)] text-[rgba(255,255,255,0.84)]"
              : "border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.04)] text-[rgba(255,255,255,0.5)]"
          )}
        >
          Soon
        </span>
      ) : null}
    </>
  );
  const className = cn(
    "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition",
    active
      ? "bg-[rgba(102,89,255,0.18)] text-white"
      : "text-[rgba(255,255,255,0.7)] hover:bg-[rgba(255,255,255,0.04)] hover:text-white",
    item.soon && "cursor-not-allowed opacity-70"
  );

  if (item.soon) {
    return <div aria-disabled="true" className={className} title="This surface is on the roadmap">{content}</div>;
  }

  return (
    <Link
      className={className}
      href={item.href}
    >
      {content}
    </Link>
  );
}

function isNavItemActive(pathname: string, href: string) {
  if (href === "/agents") {
    return pathname === "/agents" || pathname.startsWith("/agents/");
  }
  return pathname === href;
}

function MobileNavLink({ item, active }: { item: NavItem; active: boolean }) {
  const className = cn(
    "inline-flex items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition",
    active ? "bg-[rgba(102,89,255,0.12)] text-accent" : "bg-white text-[#6D6D78]",
    item.soon && "cursor-not-allowed opacity-60"
  );
  const content = (
    <>
      {item.label}
      {item.soon ? (
        <span className="rounded-full bg-[#F1F0FF] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-accent">
          Soon
        </span>
      ) : null}
    </>
  );

  return item.soon ? (
    <span aria-disabled="true" className={className} title="This surface is on the roadmap">{content}</span>
  ) : (
    <Link className={className} href={item.href}>{content}</Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const {
    currentUser,
    notifications,
    isRouteDataLoading,
    routeDataError,
    retryRouteData,
    signOut,
    workspaceId,
    workspaceName,
    workspaceOptions,
    reloadWorkspaceContext,
  } = useMockApp();
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");
  const [isLogoutOpen, setIsLogoutOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const workspaceSwitch = useAsyncAction();
  const signOutAction = useAsyncAction();
  const { isLoading: isApiLoading } = useApiActivity();
  const todayLabel = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date());

  useEffect(() => {
    setSelectedWorkspaceId(workspaceId);
  }, [workspaceId]);

  async function handleWorkspaceChange(nextWorkspaceId: string) {
    setSelectedWorkspaceId(nextWorkspaceId);
    await reloadWorkspaceContext(nextWorkspaceId);
  }

  async function handleSignOut() {
    setIsLogoutOpen(false);
    await signOut();
  }

  return (
    <div className="flex min-h-screen bg-canvas">
      <aside className="sticky top-0 hidden h-screen w-[262px] flex-col bg-sidebar px-5 py-6 text-white lg:flex">
        <div className="min-h-0 flex-1 overflow-y-auto pr-1 scrollbar-subtle">
          <div className="px-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent text-white">
                <Mic size={18} />
              </div>
              <div>
                <p className="text-sm font-semibold">Voice</p>
                <p className="text-xs text-[rgba(255,255,255,0.64)]">Operator console</p>
              </div>
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
                    const active = isNavItemActive(pathname, item.href);
                    return <NavLink key={item.href} item={item} active={active} />;
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
              <p className="text-sm font-medium">{currentUser?.displayName ?? "Voice user"}</p>
              <p className="text-xs text-[rgba(255,255,255,0.64)]">{currentUser?.email ?? "No session"}</p>
            </div>
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 border-b border-border bg-[rgba(247,247,249,0.94)] backdrop-blur">
          <div className="px-6 py-4 lg:px-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-[#6D6D78]">
                {todayLabel}
              </p>
              <div className="flex flex-wrap items-center justify-end gap-3">
                <Select
                  ariaLabel="Select workspace"
                  className="min-w-[220px] bg-transparent text-sm font-medium"
                  containerClassName="min-w-[220px]"
                  loading={workspaceSwitch.isPending}
                  options={
                    workspaceOptions.length
                      ? workspaceOptions.map((workspace) => ({
                          label: workspace.name,
                          value: workspace.workspace_id
                        }))
                      : [{ label: workspaceName || "Current workspace", value: workspaceId }]
                  }
                  placeholder="Current workspace"
                  size="sm"
                  value={selectedWorkspaceId}
                  onChange={(event) =>
                    void workspaceSwitch.run(() => handleWorkspaceChange(event.target.value))
                  }
                />
                <div className="relative">
                  <button
                    aria-expanded={isNotificationsOpen}
                    aria-haspopup="dialog"
                    aria-label={`Notifications${notifications.length ? `, ${notifications.length} unread` : ""}`}
                    className="relative inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-border bg-white text-[#6D6D78] transition hover:text-[#17171F]"
                    onClick={() => setIsNotificationsOpen((current) => !current)}
                    type="button"
                  >
                    <Bell size={18} />
                    <span className="absolute -right-1 top-1 inline-flex min-w-5 -translate-y-1/2 items-center justify-center rounded-full border-2 border-[rgba(247,247,249,0.94)] bg-accent px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                      {notifications.length}
                    </span>
                  </button>
                  {isNotificationsOpen ? (
                    <div className="absolute right-0 top-14 z-40 w-80 rounded-2xl border border-border bg-surface p-3 shadow-surface" role="dialog" aria-label="Notifications">
                      <p className="px-2 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted">Notifications</p>
                      {notifications.length ? notifications.map((notification) => (
                        <Link key={notification.id} className="block rounded-xl px-2 py-3 hover:bg-surface-subtle" href={notification.href} onClick={() => setIsNotificationsOpen(false)}>
                          <p className="text-sm font-medium text-text">{notification.title}</p>
                          <p className="mt-1 text-xs leading-5 text-muted">{notification.message}</p>
                        </Link>
                      )) : <p className="px-2 py-3 text-sm text-muted">You're all caught up.</p>}
                    </div>
                  ) : null}
                </div>
                <button
                  aria-label="Sign out"
                  className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-border bg-white text-[#6D6D78] transition hover:text-[#17171F] disabled:pointer-events-none disabled:opacity-60"
                  disabled={signOutAction.isPending}
                  onClick={() => setIsLogoutOpen(true)}
                  type="button"
                >
                  <LogOut size={18} />
                </button>
              </div>
            </div>
          </div>

          {isApiLoading ? (
            <div aria-hidden="true" className="overflow-hidden border-t border-border/60">
              <div className="h-0.5 w-full bg-[rgba(102,89,255,0.12)]">
                <div className="h-full w-1/3 animate-[pulse_900ms_ease-in-out_infinite] rounded-full bg-accent" />
              </div>
            </div>
          ) : null}

          <div className="border-t border-border px-4 py-3 lg:hidden">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {navSections.flatMap((section) => section.items).map((item) => {
                const active = isNavItemActive(pathname, item.href);
                return (
                  <MobileNavLink key={item.href} item={item} active={active} />
                );
              })}
            </div>
          </div>
        </header>

        <main className="relative min-h-[calc(100vh-96px)] px-6 py-6 lg:px-8">
          {routeDataError ? (
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger" role="alert">
              <span>{routeDataError}</span>
              <Button size="sm" variant="secondary" onClick={() => void retryRouteData()}>
                Retry
              </Button>
            </div>
          ) : null}
          {children}
          {isRouteDataLoading ? <SurfaceLoader message="Refreshing this surface" /> : null}
        </main>

        <ConfirmActionModal
          title="Sign out"
          description="Are you sure you want to end the current session?"
          confirmLabel="Sign out"
          isOpen={isLogoutOpen}
          isPending={signOutAction.isPending}
          onClose={() => setIsLogoutOpen(false)}
          onConfirm={() => void signOutAction.run(handleSignOut)}
        />
      </div>
    </div>
  );
}
