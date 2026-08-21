"use client";

import type {
  ButtonHTMLAttributes,
  ComponentType,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes
} from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  asChild?: boolean;
  href?: string;
};

export function Button({
  children,
  className,
  variant = "primary",
  size = "md",
  asChild,
  href,
  ...props
}: ButtonProps) {
  const styles = cn(
    "inline-flex items-center gap-2 rounded-2xl font-medium transition focus:outline-none focus:ring-2 focus:ring-[rgba(102,89,255,0.22)] focus:ring-offset-2",
    variant === "primary" && "bg-accent text-white hover:bg-[#5A4EF5]",
    variant === "secondary" && "border border-border bg-white text-[#17171F] hover:bg-[#fafafe]",
    variant === "ghost" && "text-[#6D6D78] hover:text-[#17171F]",
    size === "sm" && "px-3 py-2 text-sm",
    size === "md" && "px-4 py-2.5 text-sm",
    size === "lg" && "px-5 py-3 text-sm",
    className
  );

  if (asChild && href) {
    return (
      <Link className={styles} href={href}>
        {children}
      </Link>
    );
  }

  return (
    <button className={styles} {...props}>
      {children}
    </button>
  );
}

export function Card({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={cn("rounded-[20px] border border-border bg-surface p-5 shadow-surface", className)}>{children}</section>;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-accent">{eyebrow}</p>
        <h1 className="mt-3 text-2xl font-semibold text-[#17171F]">{title}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#6D6D78]">{description}</p>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral"
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  const tones = {
    neutral: "bg-[#F0F0F5] text-[#4B4B59]",
    success: "bg-[rgba(22,163,74,0.12)] text-success",
    warning: "bg-[rgba(217,119,6,0.12)] text-warning",
    danger: "bg-[rgba(220,38,38,0.12)] text-danger"
  };

  return <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-medium", tones[tone])}>{children}</span>;
}

export function StatCard({
  label,
  value,
  change,
  trend,
  icon: Icon
}: {
  label: string;
  value: string;
  change: string;
  trend: "up" | "down";
  icon: ComponentType<{ size?: number; className?: string }>;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-[#6D6D78]">{label}</p>
          <p className="mt-3 text-[32px] font-bold leading-none">{value}</p>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[rgba(102,89,255,0.12)] text-accent">
          <Icon size={20} />
        </div>
      </div>
      <p className={cn("mt-5 text-sm font-medium", trend === "up" ? "text-success" : "text-danger")}>{change}</p>
    </Card>
  );
}

type BaseFieldProps = {
  label?: string;
  icon?: ComponentType<{ size?: number; className?: string }>;
};

export function Input({
  className,
  label,
  icon: Icon,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & BaseFieldProps) {
  return (
    <label className="block">
      {label ? <span className="mb-2 block text-sm font-medium text-[#17171F]">{label}</span> : null}
      <div className="relative">
        {Icon ? <Icon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#9A9AAA]" size={16} /> : null}
        <input
          className={cn(
            "w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm text-[#17171F] outline-none transition placeholder:text-[#A5A5B1] focus:border-[rgba(102,89,255,0.32)]",
            Icon && "pl-10",
            className
          )}
          {...props}
        />
      </div>
    </label>
  );
}

export function Select({
  className,
  label,
  options,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & BaseFieldProps & { options: string[] }) {
  return (
    <label className="block">
      {label ? <span className="mb-2 block text-sm font-medium text-[#17171F]">{label}</span> : null}
      <select
        className={cn(
          "w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm text-[#17171F] outline-none transition focus:border-[rgba(102,89,255,0.32)]",
          className
        )}
        {...props}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Textarea({
  className,
  label,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & BaseFieldProps) {
  return (
    <label className="block">
      {label ? <span className="mb-2 block text-sm font-medium text-[#17171F]">{label}</span> : null}
      <textarea
        className={cn(
          "w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm leading-6 text-[#17171F] outline-none transition placeholder:text-[#A5A5B1] focus:border-[rgba(102,89,255,0.32)]",
          className
        )}
        {...props}
      />
    </label>
  );
}

export function EmptyState({
  title,
  description,
  icon: Icon
}: {
  title: string;
  description: string;
  icon?: ComponentType<{ size?: number; className?: string }>;
}) {
  return (
    <Card className="border-dashed bg-[#fcfcff] text-center">
      {Icon ? (
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[rgba(102,89,255,0.12)] text-accent">
          <Icon size={20} />
        </div>
      ) : null}
      <h2 className="mt-4 text-lg font-semibold">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#6D6D78]">{description}</p>
    </Card>
  );
}

export function Modal({
  title,
  description,
  isOpen,
  onClose,
  children
}: {
  title: string;
  description: string;
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(20,20,26,0.45)] p-6">
      <div className="w-full max-w-lg rounded-[24px] border border-border bg-white p-6 shadow-[0_30px_80px_rgba(20,20,26,0.24)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-[#6D6D78]">{description}</p>
          </div>
          <button className="rounded-xl border border-border p-2 text-[#6D6D78]" onClick={onClose} type="button">
            <X size={16} />
          </button>
        </div>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}
