"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, ArrowRightLeft } from "lucide-react";
import { useSelection } from "./selection";
import { bulkMovePipelineAction } from "@/app/dashboard/actions";

type Target = { value: string; label: string };

/**
 * Floating action bar for the master's lead multi-select. Appears once one or
 * more leads are ticked (in any card list or the Bulk Edit grid); moves the
 * whole selection into the chosen pipeline in one silent call.
 */
export function BulkMoveBar({ targets }: { targets: Target[] }) {
  const sel = useSelection();
  const router = useRouter();
  const [target, setTarget] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!sel || sel.count === 0) return null;

  const move = () => {
    if (!target) {
      setError("Pick a pipeline first.");
      return;
    }
    setError(null);
    const fd = new FormData();
    for (const id of sel.ids) fd.append("leadId", String(id));
    fd.set("target", target);
    startTransition(async () => {
      const res = await bulkMovePipelineAction(fd);
      if (res?.error) {
        setError(res.error);
      } else {
        sel.clear();
        setTarget("");
        router.refresh();
      }
    });
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-[90] flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="flex w-full max-w-2xl items-center gap-2 rounded-2xl bg-ink-900 px-3 py-2.5 text-white shadow-lift">
        <span className="shrink-0 text-sm font-semibold tabular-nums">{sel.count} selected</span>
        <select
          value={target}
          onChange={(e) => {
            setTarget(e.target.value);
            setError(null);
          }}
          className="min-w-0 flex-1 rounded-lg border border-white/20 bg-ink-800 px-2 py-1.5 text-sm text-white"
          aria-label="Move selected leads to pipeline"
        >
          <option value="">Move to…</option>
          {targets.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={move}
          disabled={pending}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-brand-600 px-3 text-sm font-semibold hover:bg-brand-700 disabled:opacity-50"
        >
          <ArrowRightLeft className="h-4 w-4" />
          {pending ? "Moving…" : "Move"}
        </button>
        <button
          type="button"
          onClick={() => sel.clear()}
          aria-label="Clear selection"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {error && (
        <p className="absolute -top-6 rounded bg-rose-600 px-2 py-0.5 text-xs text-white">{error}</p>
      )}
    </div>
  );
}
