"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createUserAction } from "@/app/dashboard/admin/actions";

export function CreateUserForm() {
  const [state, action, pending] = useActionState(createUserAction, null);
  const ref = useRef<HTMLFormElement>(null);
  const [isPrivate, setIsPrivate] = useState(false);

  useEffect(() => {
    if (state?.ok) {
      ref.current?.reset();
      setIsPrivate(false);
    }
  }, [state]);

  return (
    <form ref={ref} action={action} className="grid gap-3 sm:grid-cols-4">
      <div className="sm:col-span-2">
        <label className="label">Display name</label>
        <input name="displayName" required className="input h-11 sm:h-10" placeholder="Alex Tan" />
      </div>
      <div className="sm:col-span-2">
        <label className="label">Username</label>
        <input name="username" required className="input h-11 sm:h-10 font-mono" placeholder="alex" />
      </div>
      <div className="sm:col-span-2">
        <label className="label">Temporary password</label>
        <input name="password" required minLength={6} className="input h-11 sm:h-10" placeholder="min 6 chars" />
      </div>
      <div className="sm:col-span-2">
        <label className="label">User type</label>
        <select
          name="isPrivateChannel"
          value={isPrivate ? "true" : "false"}
          onChange={(e) => setIsPrivate(e.target.value === "true")}
          className="input h-11 sm:h-10"
        >
          <option value="false">Normal user — public pipeline</option>
          <option value="true">Private channel user — own pipeline</option>
        </select>
        <p className="mt-1 text-[10px] text-ink-500">
          Private channel users get their own tab on the dashboard. Only
          master and that user can see leads in their pipeline.
        </p>
      </div>

      <div className="sm:col-span-4">
        <button type="submit" disabled={pending} className="btn btn-primary w-full sm:w-auto h-11 sm:h-10">
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
