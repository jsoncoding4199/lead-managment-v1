"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2, AlertTriangle } from "lucide-react";
import { deleteLeadAction } from "@/app/dashboard/actions";

type Props = {
  leadId: number;
};

export function DeleteLeadCard({ leadId }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const expected = `#${leadId}`;
  const canConfirm = typed.trim() === expected;

  const onDelete = () => {
    if (!canConfirm) {
      setError(`Type "${expected}" to confirm.`);
      return;
    }
    setError(null);
    const fd = new FormData();
    fd.set("leadId", String(leadId));
    startTransition(async () => {
      const res = await deleteLeadAction(fd);
      if (res?.error) {
        setError(res.error);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    });
  };

  return (
    <section className="rounded-2xl border border-rose-200 bg-rose-50/40 p-6 shadow-soft">
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-full bg-rose-100 text-rose-700">
          <AlertTriangle className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-rose-900">Danger zone</h3>
          <p className="text-xs text-rose-700/80 mt-0.5">
            Deleting this lead also removes its status history and any assignment.
            This can&apos;t be undone.
          </p>

          {!open ? (
            <button
              onClick={() => setOpen(true)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete this lead
            </button>
          ) : (
            <div className="mt-4 space-y-3">
              <label className="block text-xs font-medium text-rose-800">
                To confirm, type <code className="rounded bg-white px-1.5 py-0.5 font-mono text-rose-900">{expected}</code> below
              </label>
              <input
                autoFocus
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={expected}
                className="block w-full rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm font-mono text-ink-900 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-100"
              />
              {error && (
                <div className="rounded-md border border-rose-200 bg-white px-3 py-2 text-xs text-rose-700">
                  {error}
                </div>
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setOpen(false);
                    setTyped("");
                    setError(null);
                  }}
                  disabled={pending}
                  className="btn btn-ghost h-9 text-xs"
                >
                  Cancel
                </button>
                <button
                  onClick={onDelete}
                  disabled={pending || !canConfirm}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-rose-600 px-3 text-xs font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  Permanently delete
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
