"use client";

import { useState } from "react";
import { Plus, Users } from "lucide-react";
import { teamMembers } from "@/lib/mock-data";
import { Badge, Button, Card, Input, Modal, PageHeader, Select } from "@/components/ui";

export default function TeamPage() {
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [role, setRole] = useState("Editor");
  const [pendingInvites, setPendingInvites] = useState<string[]>([]);

  const sendInvite = () => {
    if (!inviteEmail) {
      return;
    }

    setPendingInvites((current) => [inviteEmail, ...current]);
    setInviteEmail("");
    setRole("Editor");
    setIsInviteOpen(false);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Collaborate"
        title="Users & team"
        description="Manage workspace membership, roles, and operator access before tenancy and auth are integrated."
        actions={
          <Button onClick={() => setIsInviteOpen(true)}>
            <Plus size={16} />
            Invite member
          </Button>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold">Workspace members</h2>
              <p className="mt-1 text-sm text-[#6D6D78]">Admin, editor, and viewer access for the shared operator console.</p>
            </div>
            <Badge tone="neutral">{teamMembers.length} members</Badge>
          </div>
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[#fbfbfd] text-[#6D6D78]">
              <tr>
                {["Name", "Role", "Team", "Last active"].map((header) => (
                  <th key={header} className="px-5 py-3 font-medium">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {teamMembers.map((member) => (
                <tr key={member.email} className="border-t border-border">
                  <td className="px-5 py-4">
                    <div className="font-medium">{member.name}</div>
                    <div className="mt-1 text-xs text-[#6D6D78]">{member.email}</div>
                  </td>
                  <td className="px-5 py-4">
                    <Badge tone={member.roleTone}>{member.role}</Badge>
                  </td>
                  <td className="px-5 py-4">{member.team}</td>
                  <td className="px-5 py-4 text-[#6D6D78]">{member.lastActive}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <div className="space-y-6">
          <Card>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[rgba(102,89,255,0.12)] text-accent">
                <Users size={20} />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Pending invites</h2>
                <p className="mt-1 text-sm text-[#6D6D78]">Demo state for role assignment and onboarding.</p>
              </div>
            </div>
            <div className="mt-5 space-y-3">
              {pendingInvites.length ? (
                pendingInvites.map((email) => (
                  <div key={email} className="rounded-xl border border-border bg-[#fafafe] px-4 py-3">
                    <p className="font-medium">{email}</p>
                    <p className="mt-1 text-sm text-[#6D6D78]">Invite pending acceptance</p>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-[#6D6D78]">
                  No pending invites yet. Send one to validate the invite flow.
                </div>
              )}
            </div>
          </Card>

          <Card>
            <h2 className="text-lg font-semibold">Role model</h2>
            <div className="mt-4 space-y-3 text-sm leading-6 text-[#6D6D78]">
              <p><span className="font-medium text-[#17171F]">Admin</span> can configure connections, webhooks, and vendor credentials.</p>
              <p><span className="font-medium text-[#17171F]">Editor</span> can build agents, review call logs, and operate daily workflows.</p>
              <p><span className="font-medium text-[#17171F]">Viewer</span> can inspect dashboards and observability without making changes.</p>
            </div>
          </Card>
        </div>
      </div>

      <Modal
        description="Invite an operator into the workspace with a predefined role."
        isOpen={isInviteOpen}
        title="Invite team member"
        onClose={() => setIsInviteOpen(false)}
      >
        <div className="space-y-4">
          <Input
            label="Email"
            placeholder="new-teammate@voicehq.ai"
            value={inviteEmail}
            onChange={(event) => setInviteEmail(event.target.value)}
          />
          <Select label="Role" value={role} options={["Admin", "Editor", "Viewer"]} onChange={(event) => setRole(event.target.value)} />
          <Button className="w-full justify-center" onClick={sendInvite}>
            Send invite
          </Button>
        </div>
      </Modal>
    </div>
  );
}
