import { expect, test } from "@playwright/test";

test("stakeholder flow stays navigable across build, operate, and admin", async ({ page }) => {
  const suffix = Date.now().toString().slice(-6);
  const connectionName = `Investor demo CRM ${suffix}`;
  const memberName = `Demo Owner ${suffix}`;
  const memberEmail = `demo-owner-${suffix}@example.com`;
  const workspaceName = `Investor sandbox ${suffix}`;
  const webhookName = `CRM event sink ${suffix}`;

  await page.goto("/login");
  await page.getByLabel("Work email").fill("investor-demo@voice.local");
  await page.getByLabel("Password").fill("VoiceDemo123!");
  await page.getByRole("button", { name: /Continue to workspace/ }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({
    timeout: 20_000,
  });

  await page.getByRole("link", { name: "Agents" }).click();
  await expect(page.getByRole("heading", { name: "Agents" })).toBeVisible();
  await page.getByRole("link", { name: "Open studio" }).first().click();
  await expect(page).toHaveURL(/\/agents\/builder$/);
  await expect(page.getByRole("heading", { name: "Agent studio" })).toBeVisible();

  await page.getByRole("link", { name: "Calls" }).click();
  await expect(page.getByRole("heading", { name: "Calls" })).toBeVisible();
  await page.getByRole("main").getByRole("button", { name: "Trigger & connect" }).last().click();
  await page.getByRole("button", { name: "In call" }).click();
  await expect(page.getByRole("heading", { name: "Live state" })).toBeVisible();
  await page.getByRole("button", { name: "Review" }).click();
  await expect(page.getByRole("heading", { name: "Call review" })).toBeVisible();

  await page.getByRole("link", { name: "Connections" }).click();
  await expect(page.getByRole("heading", { name: "Connections" })).toBeVisible();
  await page.getByRole("button", { name: "Add connection" }).click();
  await page.getByLabel("Connection label").fill(connectionName);
  await page.getByRole("button", { name: "Save connection" }).click();
  await expect(page.getByText(connectionName, { exact: true }).last()).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole("heading", { name: "Add connection" })).not.toBeVisible();

  await page.getByRole("link", { name: "Team" }).click();
  await expect(page.getByRole("heading", { name: "Team" })).toBeVisible();
  await page.getByRole("button", { name: "Invite member" }).click();
  await page.getByLabel("Email").fill(memberEmail);
  await page.getByLabel("Display name").fill(memberName);
  await page.getByRole("button", { name: "Send invite" }).click();
  await expect(page.getByText(memberName, { exact: true }).last()).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole("heading", { name: "Invite member" })).not.toBeVisible();

  await page.getByRole("link", { name: "Workspaces" }).click();
  await expect(page.getByRole("heading", { name: "Workspaces" })).toBeVisible();
  await page.getByRole("button", { name: "New workspace" }).click();
  await page.getByLabel("Workspace name").fill(workspaceName);
  await page.getByRole("button", { name: "Save workspace" }).click();
  await expect(page.getByText(workspaceName)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Create workspace" })).not.toBeVisible();

  await page.getByRole("link", { name: "Webhooks" }).click();
  await expect(page.getByRole("heading", { name: "Webhooks", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add webhook" }).click();
  await page.getByLabel("Label").fill(webhookName);
  await page.getByLabel("URL").fill("https://example.com/hooks/voice");
  await page.getByRole("button", { name: "Save webhook" }).click();
  await expect(page.getByText(webhookName, { exact: true }).last()).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole("heading", { name: "Add webhook" })).not.toBeVisible();

  await page.getByRole("link", { name: "Secrets" }).click();
  await expect(page.getByRole("heading", { name: "Secrets" })).toBeVisible();
});
