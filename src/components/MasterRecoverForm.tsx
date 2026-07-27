"use client";

import { useActionState, useState } from "react";
import { KeyRound } from "lucide-react";
import { masterRecoverAction, type RequestState } from "@/app/forgot-password/actions";

const initial: RequestState = {};

/**
 * Master-only self-recovery: prove identity with the secret recovery code
 * (MASTER_RECOVERY_CODE on the server) and set a new password directly.
 * Collapsed by default so it stays out of the way of the normal flow.
 */
export function MasterRecoverForm() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(masterRecoverAction, initial);

  if (state?.ok) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 animate-in">
        Password updated. You can now sign in with your new password.
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-500 hover:text-ink-700"
      >
        <KeyRound className="h-3.5 w-3.5" />
        Master locked out? Use a recovery code
      </button>
    );
  }

  return (
    <form action={action} className="space-y-3 rounded-lg border border-ink-200 bg-ink-50/60 p-4">
      <div>
        <h2 className="text-sm font-semibold text-ink-900">Master recovery</h2>
        <p className="mt-0.5 text-xs text-ink-500">
          Enter your recovery code to set a new password without approval.
        </p>
      </div>
      <div>
        <label htmlFor="mr-username" className="label">Username</label>
        <input id="mr-username" name="username" required className="input" placeholder="master username" />
      </div>
      <div>
        <label htmlFor="mr-code" className="label">Recovery code</label>
        <input id="mr-code" name="code" type="password" required autoComplete="off" className="input" />
      </div>
      <div>
        <label htmlFor="mr-new" className="label">New password</label>
        <input id="mr-new" name="newPassword" type="password" required autoComplete="new-password" className="input" />
      </div>
      <div>
        <label htmlFor="mr-confirm" className="label">Confirm new password</label>
        <input id="mr-confirm" name="confirmPassword" type="password" required autoComplete="new-password" className="input" />
      </div>
      {state?.error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {state.error}
        </div>
      )}
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className="btn btn-primary flex-1">
          {pending ? "Resetting…" : "Reset password"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost h-10 text-xs">
          Cancel
        </button>
      </div>
    </form>
  );
}
