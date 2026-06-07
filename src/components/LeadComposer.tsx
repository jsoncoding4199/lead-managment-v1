"use client";

import { useRef, useState, useTransition } from "react";
import { Plus, ClipboardPaste, Loader2 } from "lucide-react";
import { createLeadAction } from "@/app/dashboard/actions";

export function LeadComposer() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  if (!open) {
    return (
      <button
        onClick={() => {
          setOpen(true);
          setTimeout(() => ref.current?.focus(), 50);
        }}
        className="card flex w-full items-center gap-3 p-5 text-left hover:shadow-lift transition-shadow"
      >
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-600 text-white">
          <Plus className="h-5 w-5" />
        </span>
        <span>
          <span className="block text-sm font-semibold text-ink-900">Drop a new lead</span>
          <span className="block text-xs text-ink-500">Paste any text — contact info, message, or notes.</span>
        </span>
      </button>
    );
  }

  const submit = (fd: FormData) => {
    setError(null);
    startTransition(async () => {
      const res = await createLeadAction(fd);
      if (res?.error) setError(res.error);
      else {
        formRef.current?.reset();
        setOpen(false);
      }
    });
  };

  return (
    <form
      ref={formRef}
      action={submit}
      className="card p-5 animate-in"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink-900">
          <ClipboardPaste className="h-4 w-4 text-brand-600" />
          New lead
        </div>
        <span className="text-xs text-ink-400">Status starts as <strong className="text-ink-700">New</strong></span>
      </div>
      <textarea
        ref={ref}
        name="content"
        rows={6}
        required
        placeholder={"Paste lead content here…\n\ne.g.\nName: Jane Doe\nPhone: +60 12-345 6789\nNote: interested in policy A, prefers WhatsApp"}
        className="input resize-y font-mono text-sm leading-relaxed"
      />
      {error && (
        <div className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}
      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="btn btn-ghost"
          disabled={pending}
        >
          Cancel
        </button>
        <button type="submit" className="btn btn-accent" disabled={pending}>
          {pending ? <><Loader2 className="h-4 w-4 animate-spin" /> Adding…</> : "Add to pipeline"}
        </button>
      </div>
    </form>
  );
}
