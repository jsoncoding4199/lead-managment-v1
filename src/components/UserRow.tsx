"use client";

import { useState, useTransition } from "react";
import { Trash2, Pencil, Save, Loader2 } from "lucide-react";
import {
  deleteUserAction,
  editUserAction,
  resetUserPasswordAction,
  setUserActiveAction,
} from "@/app/dashboard/admin/actions";

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
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [typedConfirm, setTypedConfirm] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [editName, setEditName] = useState(user.displayName);
  const [editUsername, setEditUsername] = useState(user.username);
  const [feedback, setFeedback] = useState<string | null>(null);

  const expandedRow = resetOpen || deleteOpen || editOpen;

  const closeAllExpanders = () => {
    setResetOpen(false);
    setDeleteOpen(false);
    setEditOpen(false);
    setFeedback(null);
  };

  const submitEdit = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    if (!editName.trim()) {
      setFeedback("Display name can't be empty.");
      return;
    }
    if (!editUsername.trim()) {
      setFeedback("Username can't be empty.");
      return;
    }
    const fd = new FormData();
    fd.set("userId", String(user.id));
    fd.set("displayName", editName);
    fd.set("username", editUsername);
    startTransition(async () => {
      const res = await editUserAction(fd);
      if (res?.ok) {
        setFeedback("Saved.");
        setTimeout(() => {
          setEditOpen(false);
          setFeedback(null);
        }, 1000);
      } else if (res?.error) {
        setFeedback(res.error);
      }
    });
  };

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

  const confirmDelete = () => {
    setFeedback(null);
    if (typedConfirm.trim() !== `@${user.username}`) {
      setFeedback(`Type @${user.username} to confirm.`);
      return;
    }
    const fd = new FormData();
    fd.set("userId", String(user.id));
    startTransition(async () => {
      const res = await deleteUserAction(fd);
      if (res?.error) setFeedback(res.error);
      // On success the page will re-fetch and the row will disappear.
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
          <div className="inline-flex flex-wrap gap-2 justify-end">
            <button
              onClick={() => {
                const wasOpen = editOpen;
                closeAllExpanders();
                if (!wasOpen) {
                  setEditOpen(true);
                  setEditName(user.displayName);
                  setEditUsername(user.username);
                }
              }}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50"
            >
              <Pencil className="h-3 w-3" />
              {editOpen ? "Cancel" : "Edit"}
            </button>
            <button
              onClick={() => {
                const wasOpen = resetOpen;
                closeAllExpanders();
                if (!wasOpen) setResetOpen(true);
              }}
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
                  ? "border border-ink-200 bg-white text-ink-700 hover:bg-ink-50"
                  : "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100")
              }
            >
              {user.active ? "Disable" : "Enable"}
            </button>
            <button
              onClick={() => {
                const wasOpen = deleteOpen;
                closeAllExpanders();
                if (!wasOpen) {
                  setDeleteOpen(true);
                  setTypedConfirm("");
                }
              }}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-md border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
            >
              <Trash2 className="h-3 w-3" />
              {deleteOpen ? "Cancel" : "Delete"}
            </button>
          </div>
        </td>
      </tr>
      {expandedRow && (
        <tr>
          <td colSpan={5} className="px-6 pb-5 pt-0 bg-ink-50/50">
            {editOpen && (
              <form onSubmit={submitEdit} className="rounded-xl border border-ink-200 bg-white p-4 space-y-3">
                <h4 className="text-sm font-semibold text-ink-900">
                  Edit user details
                </h4>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label">Display name</label>
                    <input
                      autoFocus
                      type="text"
                      className="input"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="e.g. Alex Tan"
                    />
                  </div>
                  <div>
                    <label className="label">Username</label>
                    <input
                      type="text"
                      className="input font-mono"
                      value={editUsername}
                      onChange={(e) => setEditUsername(e.target.value.toLowerCase())}
                      placeholder="alex"
                    />
                    <p className="mt-1 text-[10px] text-ink-500">
                      Lowercase letters, digits, and <code>. _ -</code>. Changing this changes the login.
                    </p>
                  </div>
                </div>
                {feedback && (
                  <div className="rounded-md border border-ink-200 bg-ink-50 px-3 py-2 text-xs text-ink-700">
                    {feedback}
                  </div>
                )}
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="submit"
                    disabled={pending}
                    className="btn btn-primary h-9 px-3 text-xs"
                  >
                    {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    Save changes
                  </button>
                </div>
              </form>
            )}
            {resetOpen && (
              <form onSubmit={submitReset} className="flex items-end gap-3 flex-wrap">
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
                {feedback && <span className="text-sm text-ink-600">{feedback}</span>}
              </form>
            )}
            {deleteOpen && (
              <div className="rounded-xl border border-rose-200 bg-white p-4">
                <h4 className="text-sm font-semibold text-rose-900">
                  Delete <span className="font-mono">@{user.username}</span>?
                </h4>
                <p className="mt-1 text-xs text-rose-800/80">
                  This permanently removes the user account. Any leads they created and any
                  status-history changes they made are transferred to <strong>you</strong>.
                  Their pickup-assignments and pending password-reset requests are cleared.
                </p>
                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <div className="flex-1 min-w-[14rem] max-w-md">
                    <label className="label">
                      Type <code className="rounded bg-ink-50 px-1.5 py-0.5 font-mono text-rose-900">@{user.username}</code> to confirm
                    </label>
                    <input
                      autoFocus
                      type="text"
                      className="input font-mono"
                      value={typedConfirm}
                      onChange={(e) => setTypedConfirm(e.target.value)}
                      placeholder={`@${user.username}`}
                    />
                  </div>
                  <button
                    onClick={confirmDelete}
                    disabled={pending || typedConfirm.trim() !== `@${user.username}`}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {pending ? "Deleting…" : "Permanently delete"}
                  </button>
                </div>
                {feedback && (
                  <div className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                    {feedback}
                  </div>
                )}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
