"use client";

import { useId, useRef } from "react";
import { Select } from "@/components/ui";
import type { AgentVariable } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const variableTokenPattern = /(\{\{[a-z][a-z0-9_]*\}\})/gi;
const variableTokenExactPattern = /^\{\{[a-z][a-z0-9_]*\}\}$/i;

function HighlightedPrompt({ value }: { value: string }) {
  return (
    <>
      {value.split(variableTokenPattern).map((part, index) =>
        variableTokenExactPattern.test(part) ? (
          <span
            key={`${part}-${index}`}
            className="rounded bg-[rgba(102,89,255,0.14)] text-[#5147D9]"
            data-testid="prompt-variable-token"
          >
            {part}
          </span>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        )
      )}
    </>
  );
}

export function PromptEditor({
  label,
  value,
  rows,
  placeholder,
  variables,
  disabled = false,
  onChange,
}: {
  label: string;
  value: string;
  rows: number;
  placeholder?: string;
  variables: AgentVariable[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const cursorPositionRef = useRef<number | null>(null);
  const promptId = useId();

  function rememberCursor() {
    cursorPositionRef.current = textareaRef.current?.selectionStart ?? value.length;
  }

  function syncPreviewScroll() {
    if (!textareaRef.current || !previewRef.current) {
      return;
    }
    previewRef.current.scrollTop = textareaRef.current.scrollTop;
    previewRef.current.scrollLeft = textareaRef.current.scrollLeft;
  }

  function insertVariable(key: string) {
    const token = "{{" + key + "}}";
    const cursor = cursorPositionRef.current ?? value.length;
    const nextValue = value.slice(0, cursor) + token + value.slice(cursor);
    onChange(nextValue);
    window.requestAnimationFrame(() => {
      const nextCursor = cursor + token.length;
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCursor, nextCursor);
      cursorPositionRef.current = nextCursor;
    });
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-[#17171F]" htmlFor={promptId}>
        {label}
      </label>
      <div
        className={cn(
          "overflow-visible rounded-2xl border border-border bg-white transition",
          disabled
            ? "bg-[#FAFAFD]"
            : "focus-within:border-[rgba(102,89,255,0.32)] focus-within:ring-2 focus-within:ring-[rgba(102,89,255,0.12)]"
        )}
      >
        <div className="relative">
          <div
            ref={previewRef}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words rounded-t-2xl px-4 py-3 text-sm leading-6 text-[#17171F]"
          >
            <HighlightedPrompt value={value} />
          </div>
          <textarea
            id={promptId}
            ref={textareaRef}
            className="relative z-10 block min-h-0 w-full resize-y rounded-t-2xl border-0 bg-transparent px-4 py-3 text-sm leading-6 text-transparent caret-[#17171F] outline-none placeholder:text-[#A5A5B1] selection:bg-[rgba(102,89,255,0.2)] selection:text-transparent"
            placeholder={placeholder}
            rows={rows}
            disabled={disabled}
            value={value}
            onBlur={rememberCursor}
            onChange={(event) => onChange(event.target.value)}
            onClick={rememberCursor}
            onKeyUp={rememberCursor}
            onScroll={syncPreviewScroll}
          />
        </div>
        <div className="flex flex-col gap-3 border-t border-border px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-5 text-[#6D6D78]">
            Use <span className="font-mono text-[#17171F]">{"{{key}}"}</span> for values supplied when a call starts.
          </p>
          <div className="sm:w-60">
            <Select
              ariaLabel={`Insert variable into ${label}`}
              className="rounded-xl px-3 py-2.5"
              containerClassName="w-full"
              disabled={disabled || !variables.length}
              label="Insert variable"
              options={variables.map((variable) => ({
                label: variable.label + " ({{" + variable.key + "}})",
                value: variable.key,
              }))}
              placeholder={variables.length ? "Choose a variable" : "No variables defined"}
              size="sm"
              onChange={(event) => insertVariable(event.target.value)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
