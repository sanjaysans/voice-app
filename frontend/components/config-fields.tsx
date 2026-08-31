"use client";

import { Input, Select, Slider, Textarea } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { ConfigFieldDefinition } from "@/lib/voice-stack";

function clampNumericValue(value: number, field: ConfigFieldDefinition) {
  let nextValue = value;
  if (typeof field.min === "number") {
    nextValue = Math.max(field.min, nextValue);
  }
  if (typeof field.max === "number") {
    nextValue = Math.min(field.max, nextValue);
  }
  return nextValue;
}

export function ConfigFields({
  fields,
  values,
  onChange,
  className
}: {
  fields: ConfigFieldDefinition[];
  values: Record<string, unknown>;
  onChange: (fieldId: string, value: string | number | boolean) => void;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-4", className)}>
      {fields.map((field) => {
        const currentValue = values[field.id];

        if (field.type === "textarea") {
          return (
            <div key={field.id} className="space-y-2">
              <Textarea
                label={field.label}
                placeholder={field.placeholder}
                rows={4}
                value={typeof currentValue === "string" ? currentValue : ""}
                onChange={(event) => onChange(field.id, event.target.value)}
              />
              {field.description ? (
                <p className="text-xs leading-5 text-[#6D6D78]">{field.description}</p>
              ) : null}
            </div>
          );
        }

        if (field.type === "select") {
          const normalizedSelectValue =
            typeof currentValue === "number" ? String(currentValue) : typeof currentValue === "string" ? currentValue : "";
          return (
            <div key={field.id} className="space-y-2">
              {field.allowDirectInput ? (
                <Input
                  label={field.directInputLabel ?? `${field.label} value`}
                  placeholder={field.directInputPlaceholder ?? `Enter ${field.label.toLowerCase()} directly`}
                  value={normalizedSelectValue}
                  onChange={(event) => onChange(field.id, event.target.value)}
                />
              ) : null}
              <Select
                label={field.allowDirectInput ? `Choose from supported ${field.label.toLowerCase()}s` : field.label}
                options={field.options ?? []}
                value={normalizedSelectValue}
                onChange={(event) => {
                  const rawValue = event.target.value;
                  const numericOption = (field.options ?? []).every((option) => {
                    const optionValue = typeof option === "string" ? option : option.value;
                    return !Number.isNaN(Number(optionValue));
                  });
                  onChange(field.id, numericOption ? Number(rawValue) : rawValue);
                }}
              />
              {field.description ? (
                <p className="text-xs leading-5 text-[#6D6D78]">{field.description}</p>
              ) : null}
            </div>
          );
        }

        if (field.type === "slider") {
          const sliderValue =
            typeof currentValue === "number"
              ? clampNumericValue(currentValue, field)
              : typeof field.min === "number"
                ? field.min
                : 0;

          return (
            <div key={field.id} className="space-y-2">
              <Slider
                label={field.label}
                max={field.max}
                min={field.min}
                onChange={(event) =>
                  onChange(field.id, clampNumericValue(Number(event.target.value || 0), field))
                }
                step={field.step}
                value={sliderValue}
              />
              {field.description ? (
                <p className="text-xs leading-5 text-[#6D6D78]">{field.description}</p>
              ) : null}
            </div>
          );
        }

        if (field.type === "boolean") {
          const isChecked = Boolean(currentValue);
          return (
            <label
              key={field.id}
              className="flex items-start justify-between gap-4 rounded-2xl border border-border bg-[#fcfcff] px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium text-[#17171F]">{field.label}</p>
                {field.description ? (
                  <p className="mt-1 text-xs leading-5 text-[#6D6D78]">{field.description}</p>
                ) : null}
              </div>
              <button
                aria-pressed={isChecked}
                className={cn(
                  "relative inline-flex h-7 w-12 items-center rounded-full transition",
                  isChecked ? "bg-accent" : "bg-[#D7D7E0]"
                )}
                onClick={(event) => {
                  event.preventDefault();
                  onChange(field.id, !isChecked);
                }}
                type="button"
              >
                <span
                  className={cn(
                    "inline-block h-5 w-5 rounded-full bg-white transition",
                    isChecked ? "translate-x-6" : "translate-x-1"
                  )}
                />
              </button>
            </label>
          );
        }

        return (
          <div key={field.id} className="space-y-2">
            <Input
              label={field.label}
              max={field.type === "number" ? field.max : undefined}
              min={field.type === "number" ? field.min : undefined}
              placeholder={
                field.type === "password" && currentValue === undefined
                  ? "Leave blank to keep the saved credential"
                  : field.placeholder
              }
              step={field.type === "number" ? field.step : undefined}
              type={field.type === "password" ? "password" : field.type === "number" ? "number" : "text"}
              value={typeof currentValue === "number" ? String(currentValue) : typeof currentValue === "string" ? currentValue : ""}
              onChange={(event) =>
                onChange(
                  field.id,
                  field.type === "number"
                    ? clampNumericValue(Number(event.target.value || field.min || 0), field)
                    : event.target.value
                )
              }
            />
            {field.description ? (
              <p className="text-xs leading-5 text-[#6D6D78]">{field.description}</p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
