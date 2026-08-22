import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { MockAppProvider } from "@/lib/mock-app";

export default function WorkspaceLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <MockAppProvider>
      <AppShell>{children}</AppShell>
    </MockAppProvider>
  );
}
