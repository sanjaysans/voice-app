"use client";

import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useMockApp } from "@/lib/mock-app";
import { Badge, Button, Card, Input, Modal, PageHeader, Select } from "@/components/ui";

type TeamMember = {
  membership_id: string;
  email: string;
  display_name: string;
  role: "admin" | "editor" | "viewer";
};

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8100";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

export default function TeamPage() {
  const { tenantSlug, workspaceId } = useMockApp();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<"admin" | "editor" | "viewer">("viewer");

  async function loadMembers() {
    const items = await request<TeamMember[]>(
      `/api/v1/tenants/${tenantSlug}/workspaces/${workspaceId}/members`
    );
    setMembers(items);
  }

  useEffect(() => {
    void loadMembers();
  }, [tenantSlug, workspaceId]);

  async function inviteMember() {
    setIsOpen(false);
    await request(`/api/v1/tenants/${tenantSlug}/workspaces/${workspaceId}/members`, {
      method: "POST",
      body: JSON.stringify({ email, display_name: displayName, role }),
    });
    setEmail("");
    setDisplayName("");
    setRole("viewer");
    await loadMembers();
  }

  async function updateRole(membershipId: string, nextRole: TeamMember["role"]) {
    await request(
      `/api/v1/tenants/${tenantSlug}/workspaces/${workspaceId}/members/${membershipId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ role: nextRole }),
      }
    );
    await loadMembers();
  }

  async function saveMember() {
    if (!editingMember) {
      return;
    }
    await request(
      `/api/v1/tenants/${tenantSlug}/workspaces/${workspaceId}/members/${editingMember.membership_id}`,
      {
        method: "PATCH",
        body: JSON.stringify({ display_name: displayName, role }),
      }
    );
    setEditingMember(null);
    setDisplayName("");
    setRole("viewer");
    await loadMembers();
  }

  async function removeMember(membershipId: string) {
    await request(
      `/api/v1/tenants/${tenantSlug}/workspaces/${workspaceId}/members/${membershipId}`,
      {
        method: "DELETE",
      }
    );
    await loadMembers();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Team"
        description="Invite admins, editors, and viewers into the current workspace and keep roles visible before real auth arrives."
        actions={
          <Button onClick={() => setIsOpen(true)}>
            <Plus size={16} />
            Invite member
          </Button>
        }
      />

      <Card>
        <div className="space-y-3">
          {members.map((member) => (
            <div key={member.membership_id} className="rounded-2xl border border-border bg-[#fcfcff] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{member.display_name}</p>
                  <p className="mt-1 text-sm text-[#6D6D78]">{member.email}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge tone={member.role === "admin" ? "success" : member.role === "editor" ? "warning" : "neutral"}>
                    {member.role}
                  </Badge>
                  <Select
                    value={member.role}
                    options={["admin", "editor", "viewer"]}
                    onChange={(event) => void updateRole(member.membership_id, event.target.value as TeamMember["role"])}
                  />
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setEditingMember(member);
                      setDisplayName(member.display_name);
                      setRole(member.role);
                    }}
                  >
                    <Pencil size={16} />
                    Edit
                  </Button>
                  <Button variant="ghost" onClick={() => void removeMember(member.membership_id)}>
                    <Trash2 size={16} />
                    Remove
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Modal
        title="Invite member"
        description="Add a teammate to the current workspace with a lightweight role model for the prototype."
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
      >
        <div className="space-y-4">
          <Input label="Email" value={email} onChange={(event) => setEmail(event.target.value)} />
          <Input label="Display name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
          <Select
            label="Role"
            value={role}
            options={["admin", "editor", "viewer"]}
            onChange={(event) => setRole(event.target.value as "admin" | "editor" | "viewer")}
          />
          <Button className="w-full justify-center" onClick={() => void inviteMember()}>
            Send invite
          </Button>
        </div>
      </Modal>

      <Modal
        title="Edit member"
        description="Refine workspace role or display label for the current teammate."
        isOpen={Boolean(editingMember)}
        onClose={() => setEditingMember(null)}
      >
        <div className="space-y-4">
          <Input label="Display name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
          <Select
            label="Role"
            value={role}
            options={["admin", "editor", "viewer"]}
            onChange={(event) => setRole(event.target.value as "admin" | "editor" | "viewer")}
          />
          <Button className="w-full justify-center" onClick={() => void saveMember()}>
            Save changes
          </Button>
        </div>
      </Modal>
    </div>
  );
}
