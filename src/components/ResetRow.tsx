"use client";

import { useState, useTransition } from "react";
import { resetUserPasswordAction } from "@/app/dashboard/admin/actions";
import { timeAgo } from "@/lib/utils";

type Request = {
  id: number;
  userId: number;
  displayName: string;
  username: string;
  createdAt: string;
};

export function ResetRow({ request }: { request: Request }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      setFeedback("Password must be at least 6 characters.");
      return;
    }
    const fd = new FormData();
    fd.set("userId", String(request.userId));
    fd.set("password", password);
    fd.set("resetRequestId", String(request.id));
    startTransition(async () => {
      const res = await resetUserPasswordAction(null, fd);
      if (res?.ok) {
        setFeedback("Resolved. Share the new password with the user.");
      } else if (res?.error) {
        setFeedback(res.error);
      }
    });
  };

  return (
    <li className="px-6 py-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-medium text-ink-900">{request.displayName}</div>
          <div className="text-xs text-ink-500">@{request.username} · requested {timeAgo(request.createdAt)}</div>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="btn btn-primary h-9 text-xs"
        >
          {open ? "Close" : "Set new password"}
        </button>
      </div>

      {open && (
        <form onSubmit={submit} className="mt-3 flex items-end gap-2">
          <div className="flex-1 max-w-xs">
            <label className="label">New password</label>
            <input
              type="text"
              className="input"
              autoFocus
              placeholder="min 6 chars"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button type="submit" disabled={pending} className="btn btn-accent">
            {pending ? "Saving…" : "Save & resolve"}
          </button>
          {feedback && <span className="ml-2 text-sm text-ink-600">{feedback}</span>}
        </form>
      )}
    </li>
  );
}
