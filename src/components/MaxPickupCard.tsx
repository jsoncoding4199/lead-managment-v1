"use client";

import { useActionState, useEffect, useState } from "react";
import { Save, Loader2, Users } from "lucide-react";
import { updateMaxPickupAction } from "@/app/dashboard/actions";

type State = { error?: string; ok?: boolean };
const initial: State = {};

export function MaxPickupCard({ current }: { current: number }) {
  const [state, action, pending] = useActionState(updateMaxPickupAction, initial);
  const [value, setValue] = useState<number>(current);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    if (state?.ok) {
      setSavedFlash(true);
      const id = setTimeout(() => setSavedFlash(false), 1800);
      return () => clearTimeout(id);
    }
  }, [state]);

  return (
    <section className="card p-6">
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-full bg-brand-100 text-brand-700">
          <Users className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-ink-900">Pickup capacity</h3>
          <p className="text-xs text-ink-500 mt-0.5">
            How many users can pick up the same lead before it gets hidden from the rest of
            the team. Change anytime — it applies to all leads instantly.
          </p>

          <form action={action} className="mt-4 flex items-end gap-3 flex-wrap">
            <div>
              <label htmlFor="maxPickup" className="label">Max users per lead</label>
              <input
                id="maxPickup"
                name="maxPickup"
                type="number"
                min={1}
                max={10}
                value={value}
                onChange={(e) => setValue(Number(e.target.value))}
                className="input w-24 text-center text-base font-semibold"
              />
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-[10px] uppercase tracking-wider text-ink-400">Current</span>
              <span className="text-2xl font-bold text-ink-900 tabular-nums">{current}</span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {savedFlash && (
                <span className="text-xs text-emerald-700">Saved.</span>
              )}
              <button
                type="submit"
                disabled={pending || value === current}
                className="btn btn-primary h-10 text-xs"
              >
                {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Update
              </button>
            </div>
          </form>

          {state?.error && (
            <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {state.error}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
