import { redirect } from "next/navigation";

export default function SecretsRedirectPage() {
  redirect("/connections");
}
