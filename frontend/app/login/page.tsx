"use client";

import { type FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Mic, ShieldCheck, Sparkles } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { ApiError, api } from "@/lib/api-client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        await api("/api/v1/auth/me");
        router.replace("/dashboard");
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 401) {
          setIsCheckingSession(false);
          return;
        }
        console.error("login session check failed", cause);
        setIsCheckingSession(false);
      }
    })();
  }, [router]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!email || !password) {
      setError("Enter both email and password to continue.");
      return;
    }

    setError("");
    setIsSubmitting(true);
    try {
      await api("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      router.push("/dashboard");
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.status === 401
          ? "The email or password is incorrect."
          : "Unable to sign in right now. Try again in a moment."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="grid min-h-screen grid-cols-1 bg-canvas lg:grid-cols-[1.1fr_0.9fr]">
      <section className="flex items-center justify-center p-8 lg:p-16">
        <div className="w-full max-w-md rounded-[20px] border border-border bg-surface p-8 shadow-surface">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent text-white">
              <Mic size={20} />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-accent">Voice</p>
              <h1 className="text-2xl font-semibold text-[#17171F]">Sign in to Voice</h1>
            </div>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            <Input
              label="Work email"
              placeholder="ops@company.com"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <Input
              label="Password"
              placeholder="Enter your password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />

            {error ? (
              <div className="rounded-xl border border-[rgba(220,38,38,0.18)] bg-[rgba(220,38,38,0.08)] px-4 py-3 text-sm text-danger">
                {error}
              </div>
            ) : null}

            <Button
              className="w-full justify-center"
              disabled={isCheckingSession || isSubmitting}
              loading={isCheckingSession || isSubmitting}
              loadingText={isCheckingSession ? "Checking session..." : "Signing in..."}
              size="lg"
              type="submit"
            >
              Continue to Voice
              <ArrowRight size={16} />
            </Button>
          </form>

          <div className="mt-6 rounded-2xl border border-border bg-[#fafafe] p-4">
            <p className="text-sm font-medium text-[#17171F]">Operator note</p>
            <p className="mt-1 text-sm leading-6 text-[#6D6D78]">
              Sign in to review active workflows, call activity, and connection health.
            </p>
          </div>
        </div>
      </section>

      <aside className="hidden bg-sidebar px-12 py-14 text-white lg:flex lg:flex-col lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-accent-soft">Platform overview</p>
          <h2 className="mt-6 max-w-lg text-[32px] font-bold leading-[1.1]">
            Multi-vendor voice infrastructure, designed for operators who need speed and control.
          </h2>
          <p className="mt-5 max-w-lg text-sm leading-7 text-[rgba(255,255,255,0.72)]">
            Build, route, observe, and troubleshoot telephony agents across STT, LLM, TTS, and carrier providers from one operating surface.
          </p>
        </div>

        <div className="space-y-4">
          {[
            {
              icon: Sparkles,
              title: "Agent orchestration",
              copy: "Compose specialist agents and routing trees without losing operational clarity."
            },
            {
              icon: ShieldCheck,
              title: "Guardrails built in",
              copy: "Review tool calls, escalation paths, webhook retries, and delivery health in one place."
            }
          ].map((item) => (
            <div key={item.title} className="rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] p-5">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[rgba(139,127,255,0.16)] text-accent-soft">
                <item.icon size={18} />
              </div>
              <p className="text-base font-semibold">{item.title}</p>
              <p className="mt-2 text-sm leading-6 text-[rgba(255,255,255,0.72)]">{item.copy}</p>
            </div>
          ))}
        </div>
      </aside>
    </main>
  );
}
