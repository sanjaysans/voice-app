"use client";

import type {
  ButtonHTMLAttributes,
  ComponentType,
  InputHTMLAttributes,
  KeyboardEvent,
  ReactNode,
  TextareaHTMLAttributes
} from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, LoaderCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  asChild?: boolean;
  href?: string;
  loading?: boolean;
  loadingText?: string;
};

export function Button({
  children,
  className,
  variant = "primary",
  size = "md",
  asChild,
  href,
  loading = false,
  loadingText,
  disabled,
  ...props
}: ButtonProps) {
  const styles = cn(
    "inline-flex items-center gap-2 rounded-2xl font-medium transition focus:outline-none focus:ring-2 focus:ring-[rgba(102,89,255,0.22)] focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-60",
    variant === "primary" && "bg-accent text-white hover:bg-[#5A4EF5]",
    variant === "secondary" && "border border-border bg-white text-[#17171F] hover:bg-[#fafafe]",
    variant === "ghost" && "text-[#6D6D78] hover:text-[#17171F]",
    size === "sm" && "px-3 py-2 text-sm",
    size === "md" && "px-4 py-2.5 text-sm",
    size === "lg" && "px-5 py-3 text-sm",
    className
  );
  const content = (
    <>
      {loading ? <Loader className="text-current" size={16} /> : null}
      {loading && loadingText ? loadingText : children}
    </>
  );

  if (asChild && href) {
    return (
      <Link className={styles} href={href} prefetch={false}>
        {content}
      </Link>
    );
  }

  return (
    <button className={styles} disabled={disabled || loading} {...props}>
      {content}
    </button>
  );
}

export function Loader({
  className,
  label = "Loading",
  size = 16
}: {
  className?: string;
  label?: string;
  size?: number;
}) {
  return (
    <>
      <LoaderCircle aria-hidden="true" className={cn("animate-spin", className)} size={size} />
      <span className="sr-only">{label}</span>
    </>
  );
}

export function SurfaceLoader({
  message,
  className
}: {
  message: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "absolute inset-0 z-20 flex items-start justify-center rounded-[24px] bg-[rgba(247,247,249,0.72)] px-6 py-16 backdrop-blur-sm",
        className
      )}
    >
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-white px-5 py-3 shadow-surface">
        <Loader className="text-accent" />
        <p className="text-sm font-medium text-[#17171F]">{message}</p>
      </div>
    </div>
  );
}

export function ContentLoader({
  title = "Loading",
  description = "Fetching the latest data for this surface."
}: {
  title?: string;
  description?: string;
}) {
  return (
    <Card className="border-dashed bg-[#fcfcff]">
      <div className="flex min-h-[220px] flex-col items-center justify-center px-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[rgba(102,89,255,0.12)] text-accent">
          <Loader className="text-accent" size={18} />
        </div>
        <h2 className="mt-5 text-lg font-semibold text-[#17171F]">{title}</h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-[#6D6D78]">{description}</p>
      </div>
    </Card>
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

type SelectOption = string | { label: string; value: string };

type SelectProps = BaseFieldProps & {
  ariaLabel?: string;
  className?: string;
  containerClassName?: string;
  disabled?: boolean;
  loading?: boolean;
  name?: string;
  onChange?: (event: { target: { value: string } }) => void;
  options: SelectOption[];
  placeholder?: string;
  size?: "sm" | "md";
  value?: string;
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
  ariaLabel,
  className,
  containerClassName,
  disabled = false,
  label,
  loading = false,
  name,
  onChange,
  options,
  placeholder = "Select an option",
  size = "md",
  value = ""
}: SelectProps) {
  const selectId = useId();
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const normalizedOptions = useMemo(
    () =>
      options.map((option) =>
        typeof option === "string" ? { label: option, value: option } : option
      ),
    [options]
  );
  const selectedOption = normalizedOptions.find((option) => option.value === value) ?? null;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!dropdownRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleEscape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  function handleSelect(nextValue: string) {
    if (disabled || loading || nextValue === value) {
      setIsOpen(false);
      return;
    }

    onChange?.({ target: { value: nextValue } });
    setIsOpen(false);
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!disabled && !loading) {
        setIsOpen(true);
      }
    }
  }

  return (
    <div className={cn("block", containerClassName)}>
      {label ? (
        <label className="mb-2 block text-sm font-medium text-[#17171F]" htmlFor={selectId}>
          {label}
        </label>
      ) : null}
      <div className="relative" ref={dropdownRef}>
        {name ? <input name={name} type="hidden" value={value} /> : null}
        <button
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-label={ariaLabel ?? label ?? placeholder}
          className={cn(
            "flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-white px-4 text-left text-sm text-[#17171F] outline-none transition focus:border-[rgba(102,89,255,0.32)] focus:ring-2 focus:ring-[rgba(102,89,255,0.18)] disabled:pointer-events-none disabled:bg-[#FAFAFD] disabled:text-[#9A9AAA]",
            size === "sm" ? "py-2.5" : "py-3",
            className
          )}
          disabled={disabled || loading}
          id={selectId}
          onClick={() => setIsOpen((current) => !current)}
          onKeyDown={handleTriggerKeyDown}
          type="button"
        >
          <span className="min-w-0 flex-1 truncate">
            {selectedOption?.label ?? placeholder}
          </span>
          <span className="flex items-center gap-2 text-[#8A8A97]">
            {loading ? <Loader className="text-[#8A8A97]" size={14} /> : null}
            <ChevronDown className={cn("transition", isOpen ? "rotate-180" : undefined)} size={16} />
          </span>
        </button>

        {isOpen ? (
          <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-40 overflow-hidden rounded-2xl border border-border bg-white shadow-[0_22px_44px_rgba(20,20,26,0.12)]">
            <div aria-labelledby={selectId} className="max-h-64 overflow-y-auto py-2" role="listbox">
              {normalizedOptions.map((option) => {
                const isSelected = option.value === value;

                return (
                  <button
                    key={option.value}
                    aria-selected={isSelected}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm transition",
                      isSelected
                        ? "bg-[rgba(102,89,255,0.08)] text-accent"
                        : "text-[#17171F] hover:bg-[#FAFAFD]"
                    )}
                    onClick={() => handleSelect(option.value)}
                    role="option"
                    type="button"
                  >
                    <span className="truncate">{option.label}</span>
                    {isSelected ? <Check size={16} /> : null}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </div>
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

export function Slider({
  label,
  min = 0,
  max = 100,
  step = 1,
  value = min,
  onChange,
}: {
  label?: string;
  min?: number;
  max?: number;
  step?: number;
  value?: number;
  onChange?: (event: { target: { value: string } }) => void;
}) {
  const precision = String(step).includes(".") ? String(step).split(".")[1]?.length ?? 0 : 0;
  const formattedValue = precision ? value.toFixed(precision) : String(value);

  return (
    <label className="block">
      {label ? <span className="mb-2 block text-sm font-medium text-[#17171F]">{label}</span> : null}
      <div className="rounded-2xl border border-border bg-white px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-medium text-[#8A8A97]">{min}</span>
          <span className="rounded-full bg-[rgba(102,89,255,0.08)] px-2.5 py-1 text-xs font-semibold text-accent">
            {formattedValue}
          </span>
          <span className="text-xs font-medium text-[#8A8A97]">{max}</span>
        </div>
        <input
          className="mt-4 h-2 w-full cursor-pointer appearance-none rounded-full bg-[rgba(102,89,255,0.14)] accent-accent"
          max={max}
          min={min}
          onChange={(event) => onChange?.({ target: { value: event.target.value } })}
          step={step}
          type="range"
          value={value}
        />
      </div>
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

export function ConfirmActionModal({
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  isOpen,
  isPending = false,
  onClose,
  onConfirm
}: {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isOpen: boolean;
  isPending?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      title={title}
      description={description}
      isOpen={isOpen}
      onClose={() => {
        if (isPending) {
          return;
        }
        onClose();
      }}
    >
      <div className="flex justify-end gap-3">
        <Button disabled={isPending} variant="secondary" onClick={onClose}>
          {cancelLabel}
        </Button>
        <Button loading={isPending} loadingText={confirmLabel} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
