"use client";

import { useActionState, useEffect, useRef } from "react";
import { Loader2, Save } from "lucide-react";
import { changeOwnPasswordAction } from "@/app/dashboard/settings/actions";

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changeOwnPasswordAction, null);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={action} className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="label">Current password</label>
        <input
          name="currentPassword"
          type="password"
          required
          autoComplete="current-password"
          className="input h-11 sm:h-10"
        />
      </div>
      <div>
        <label className="label">New password</label>
        <input
          name="newPassword"
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          className="input h-11 sm:h-10"
          placeholder="min 6 chars"
        />
      </div>
      <div>
        <label className="label">Confirm new password</label>
        <input
          name="confirmPassword"
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          className="input h-11 sm:h-10"
        />
      </div>

      {state?.error && (
        <div className="sm:col-span-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {state.error}
        </div>
      )}
      {state?.ok && (
        <div className="sm:col-span-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Password updated. Use the new one next time you sign in.
        </div>
      )}

      <div className="sm:col-span-2 flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="btn btn-primary h-11 sm:h-10 px-4 text-sm inline-flex items-center gap-2"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Update password
        </button>
      </div>
    </form>
  );
}
