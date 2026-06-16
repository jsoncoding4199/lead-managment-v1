"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createUserAction } from "@/app/dashboard/admin/actions";

export function CreateUserForm() {
  const [state, action, pending] = useActionState(createUserAction, null);
  const ref = useRef<HTMLFormElement>(null);
  const [channel, setChannel] = useState<"DEFAULT" | "AHA" | "AHB">("DEFAULT");

  useEffect(() => {
    if (state?.ok) {
      ref.current?.reset();
      setChannel("DEFAULT");
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
          name="channel"
          value={channel}
          onChange={(e) => setChannel(e.target.value as "DEFAULT" | "AHA" | "AHB")}
          className="input h-11 sm:h-10"
        >
          <option value="DEFAULT">Normal user — public pipeline</option>
          <option value="AHA">Private channel · AHA</option>
          <option value="AHB">Private channel · AHB</option>
        </select>
        <p className="mt-1 text-[10px] text-ink-500">
          Private channel users only see leads in their own channel.
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
