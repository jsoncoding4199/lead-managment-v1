"use client";

import { useRef, useState, useTransition } from "react";
import { Plus, ClipboardPaste, Loader2 } from "lucide-react";
import { createLeadAction } from "@/app/dashboard/actions";

type Props = {
  /** Private-channel user id to drop the lead into. Omitted = public pipeline. */
  privateChannelUserId?: number;
  /** Display label for the private channel (the user's displayName). */
  privateChannelLabel?: string;
};

export function LeadComposer({ privateChannelUserId, privateChannelLabel }: Props = {}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const isPrivate = privateChannelUserId !== undefined;
  const ctaLabel = isPrivate
    ? `Drop a new lead into ${privateChannelLabel}'s pipeline`
    : "Drop a new lead";
  const ctaHint = isPrivate
    ? `Goes into ${privateChannelLabel}'s private pipeline — only they and master see it.`
    : "Paste any text — contact info, message, or notes.";

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
          <span className="block text-sm font-semibold text-ink-900">{ctaLabel}</span>
          <span className="block text-xs text-ink-500">{ctaHint}</span>
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
          {isPrivate ? `New private lead for ${privateChannelLabel}` : "New lead"}
        </div>
        <span className="text-xs text-ink-400">
          {isPrivate ? (
            <>Pipeline: <strong className="text-ink-700">{privateChannelLabel}</strong></>
          ) : (
            <>Status starts as <strong className="text-ink-700">New</strong></>
          )}
        </span>
      </div>
      {isPrivate && (
        <input type="hidden" name="privateChannelUserId" value={privateChannelUserId} />
      )}
      {isPrivate && (
        <div className="mb-3">
          <label className="label">Initial status</label>
          <select name="initialNote" defaultValue="" className="input h-11">
            <option value="">New (no prior contact)</option>
            <option value="CALLED_BEFORE">Called before</option>
            <option value="WHATSAPP_BEFORE">WhatsApp before</option>
          </select>
          <p className="mt-1 text-[10px] text-ink-500">
            Saved as the first thread message so the assignee knows what was already tried.
          </p>
        </div>
      )}
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
