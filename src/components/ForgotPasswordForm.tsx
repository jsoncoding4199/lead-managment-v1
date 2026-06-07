"use client";

import { useActionState } from "react";
import { requestResetAction, type RequestState } from "@/app/forgot-password/actions";

const initial: RequestState = {};

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestResetAction, initial);

  if (state?.ok) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 animate-in">
        If that account exists, your master has been notified. You&apos;ll be contacted with a temporary password.
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="username" className="label">Username</label>
        <input id="username" name="username" required className="input" placeholder="your username" />
      </div>
      {state?.error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {state.error}
        </div>
      )}
      <button type="submit" disabled={pending} className="btn btn-primary w-full">
        {pending ? "Sending…" : "Request reset"}
      </button>
    </form>
  );
}
