"use client";

import { useState, useTransition } from "react";
import { Pencil, Loader2, Save, X, FileText } from "lucide-react";
import { editLeadContentAction } from "@/app/dashboard/actions";

type Props = {
  leadId: number;
  initial: string;
};

export function LeadContentEditor({ leadId, initial }: Props) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!value.trim()) {
      setError("Lead content can't be empty.");
      return;
    }
    const fd = new FormData();
    fd.set("leadId", String(leadId));
    fd.set("content", value);
    startTransition(async () => {
      const res = await editLeadContentAction(fd);
      if (res?.error) setError(res.error);
      else setEditing(false);
    });
  };

  const cancel = () => {
    setValue(initial);
    setEditing(false);
    setError(null);
  };

  return (
    <section className="card p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-brand-600" />
          <div>
            <h3 className="text-sm font-semibold text-ink-900">Lead content</h3>
            <p className="text-xs text-ink-500 mt-0.5">
              The raw lead text. Anyone on the team can update it.
            </p>
          </div>
        </div>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <form onSubmit={save} className="mt-4 space-y-3">
          <textarea
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={10}
            maxLength={8000}
            className="input resize-y font-mono text-[13px] leading-relaxed"
          />
          {error && (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-ink-400">{value.length}/8000</span>
            <div className="flex gap-2">
              <button type="button" onClick={cancel} disabled={pending} className="btn btn-ghost h-9 text-xs">
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
        <pre className="mt-4 whitespace-pre-wrap break-words rounded-lg bg-ink-50 px-4 py-3 text-[13px] leading-relaxed text-ink-800 font-mono max-h-80 overflow-y-auto overscroll-contain">
{initial}
        </pre>
      )}
    </section>
  );
}
