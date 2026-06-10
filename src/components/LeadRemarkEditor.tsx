"use client";

import { useState, useTransition } from "react";
import { Pencil, Loader2, Save, X } from "lucide-react";
import { updateRemarkAction } from "@/app/dashboard/actions";

type Props = {
  leadId: number;
  initial: string | null;
};

export function LeadRemarkEditor({ leadId, initial }: Props) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initial ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const fd = new FormData();
    fd.set("leadId", String(leadId));
    fd.set("remark", value);
    startTransition(async () => {
      const res = await updateRemarkAction(fd);
      if (res?.error) setError(res.error);
      else setEditing(false);
    });
  };

  const cancel = () => {
    setValue(initial ?? "");
    setEditing(false);
    setError(null);
  };

  return (
    <section className="card p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-ink-900">Remark</h3>
          <p className="text-xs text-ink-500 mt-0.5">
            A short note about the lead&apos;s current state — visible to the whole team.
          </p>
        </div>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50"
          >
            <Pencil className="h-3.5 w-3.5" />
            {initial ? "Edit" : "Add remark"}
          </button>
        )}
      </div>

      {editing ? (
        <form onSubmit={save} className="mt-4 space-y-3">
          <textarea
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={4}
            maxLength={2000}
            placeholder="e.g. Waiting on KYC docs, next follow-up Mon morning…"
            className="input resize-y text-sm leading-relaxed"
          />
          {error && (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-ink-400">{value.length}/2000</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={cancel}
                disabled={pending}
                className="btn btn-ghost h-9 text-xs"
              >
                <X className="h-3.5 w-3.5" />
                Cancel
              </button>
              <button type="submit" disabled={pending} className="btn btn-primary h-9 px-3 text-xs">
                {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save
              </button>
            </div>
          </div>
        </form>
      ) : (
        <div className="mt-4">
          {initial ? (
            <p className="whitespace-pre-wrap break-words rounded-lg bg-ink-50 px-4 py-3 text-sm text-ink-800 max-h-64 overflow-y-auto overscroll-contain">
              {initial}
            </p>
          ) : (
            <p className="text-sm text-ink-400 italic">No remark yet. Add one to keep the team in the loop.</p>
          )}
        </div>
      )}
    </section>
  );
}
