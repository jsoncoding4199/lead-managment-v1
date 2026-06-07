"use client";

import { useActionState, useEffect, useRef } from "react";
import { createUserAction } from "@/app/dashboard/admin/actions";

export function CreateUserForm() {
  const [state, action, pending] = useActionState(createUserAction, null);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={action} className="grid gap-3 sm:grid-cols-4">
      <div className="sm:col-span-1">
        <label className="label">Username</label>
        <input name="username" required className="input" placeholder="alex" />
      </div>
      <div className="sm:col-span-1">
        <label className="label">Display name</label>
        <input name="displayName" required className="input" placeholder="Alex Tan" />
      </div>
      <div className="sm:col-span-1">
        <label className="label">Temporary password</label>
        <input name="password" required minLength={6} className="input" placeholder="min 6 chars" />
      </div>
      <div className="sm:col-span-1 flex items-end">
        <button type="submit" disabled={pending} className="btn btn-primary w-full">
          {pending ? "Adding…" : "Add user"}
        </button>
      </div>

      {state?.error && (
        <div className="sm:col-span-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {state.error}
        </div>
      )}
      {state?.ok && (
        <div className="sm:col-span-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          User created. They can sign in now.
        </div>
      )}
    </form>
  );
}
