"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "@/app/login/actions";

const initial: LoginState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initial);

  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="username" className="label">Username</label>
        <input id="username" name="username" autoComplete="username" required className="input" placeholder="e.g. alex" />
      </div>
      <div>
        <label htmlFor="password" className="label">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="input" placeholder="••••••••" />
      </div>
      {state?.error && (
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 animate-in">
          {state.error}
        </div>
      )}
      <button type="submit" disabled={pending} className="btn btn-accent w-full">
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
