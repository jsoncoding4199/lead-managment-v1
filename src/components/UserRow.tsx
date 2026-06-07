"use client";

import { useState, useTransition } from "react";
import { resetUserPasswordAction, setUserActiveAction } from "@/app/dashboard/admin/actions";

type User = {
  id: number;
  username: string;
  displayName: string;
  active: boolean;
  createdLeads: number;
  assignedLeads: number;
};

export function UserRow({ user }: { user: User }) {
  const [pending, startTransition] = useTransition();
  const [resetOpen, setResetOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);

  const toggleActive = () => {
    const fd = new FormData();
    fd.set("userId", String(user.id));
    fd.set("active", String(!user.active));
    startTransition(async () => {
      await setUserActiveAction(fd);
    });
  };

  const submitReset = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      setFeedback("Password must be at least 6 characters.");
      return;
    }
    const fd = new FormData();
    fd.set("userId", String(user.id));
    fd.set("password", newPassword);
    startTransition(async () => {
      const res = await resetUserPasswordAction(null, fd);
      if (res?.ok) {
        setFeedback("Password updated.");
        setNewPassword("");
        setTimeout(() => {
          setResetOpen(false);
          setFeedback(null);
        }, 1200);
      } else if (res?.error) {
        setFeedback(res.error);
      }
    });
  };

  return (
    <>
      <tr className={!user.active ? "bg-ink-50/60" : ""}>
        <td className="px-6 py-4">
          <div className="font-medium text-ink-900">{user.displayName}</div>
          <div className="text-xs text-ink-500">@{user.username}</div>
        </td>
        <td className="px-6 py-4">
          <span
            className={
              "rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 " +
              (user.active
                ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                : "bg-ink-100 text-ink-500 ring-ink-200")
            }
          >
            {user.active ? "Active" : "Disabled"}
          </span>
        </td>
        <td className="px-6 py-4 text-sm text-ink-600">{user.createdLeads}</td>
        <td className="px-6 py-4 text-sm text-ink-600">{user.assignedLeads}</td>
        <td className="px-6 py-4 text-right">
          <div className="inline-flex gap-2">
            <button
              onClick={() => setResetOpen((v) => !v)}
              disabled={pending}
              className="rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50"
            >
              {resetOpen ? "Cancel reset" : "Reset password"}
            </button>
            <button
              onClick={toggleActive}
              disabled={pending}
              className={
                "rounded-md px-2.5 py-1.5 text-xs font-medium " +
                (user.active
                  ? "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                  : "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100")
              }
            >
              {user.active ? "Disable" : "Enable"}
            </button>
          </div>
        </td>
      </tr>
      {resetOpen && (
        <tr>
          <td colSpan={5} className="px-6 pb-5 pt-0 bg-ink-50/50">
            <form onSubmit={submitReset} className="flex items-end gap-3">
              <div className="flex-1 max-w-xs">
                <label className="label">New temporary password</label>
                <input
                  type="text"
                  className="input"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="min 6 chars"
                  autoFocus
                />
              </div>
              <button type="submit" disabled={pending} className="btn btn-primary">
                {pending ? "Saving…" : "Set new password"}
              </button>
              {feedback && (
                <span className="text-sm text-ink-600">{feedback}</span>
              )}
            </form>
          </td>
        </tr>
      )}
    </>
  );
}
