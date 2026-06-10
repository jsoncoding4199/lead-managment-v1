"use client";

import { useState, useTransition } from "react";
import { Crown, Pencil, Save, Loader2, X } from "lucide-react";
import { editUserAction } from "@/app/dashboard/admin/actions";

type Props = {
  master: {
    id: number;
    username: string;
    displayName: string;
  };
};

export function MasterProfileCard({ master }: Props) {
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(master.displayName);
  const [username, setUsername] = useState(master.username);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const cancel = () => {
    setDisplayName(master.displayName);
    setUsername(master.username);
    setFeedback(null);
    setEditing(false);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    if (!displayName.trim()) {
      setFeedback("Display name can't be empty.");
      return;
    }
    if (!username.trim()) {
      setFeedback("Username can't be empty.");
      return;
    }
    const fd = new FormData();
    fd.set("userId", String(master.id));
    fd.set("displayName", displayName);
    fd.set("username", username);
    startTransition(async () => {
      const res = await editUserAction(fd);
      if (res?.ok) {
        setFeedback("Saved.");
        setTimeout(() => {
          setFeedback(null);
          setEditing(false);
        }, 1000);
      } else if (res?.error) {
        setFeedback(res.error);
      }
    });
  };

  return (
    <section className="card p-6">
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-full bg-brand-100 text-brand-700">
          <Crown className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h3 className="text-sm font-semibold text-ink-900">My profile</h3>
              <p className="text-xs text-ink-500 mt-0.5">
                Your master account. Changing the username changes how you log in.
              </p>
            </div>
            {!editing && (
              <button
                onClick={() => {
                  setDisplayName(master.displayName);
                  setUsername(master.username);
                  setEditing(true);
                  setFeedback(null);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </button>
            )}
          </div>

          {editing ? (
            <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Display name</label>
                <input
                  autoFocus
                  type="text"
                  className="input"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your name"
                />
              </div>
              <div>
                <label className="label">Username</label>
                <input
                  type="text"
                  className="input font-mono"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase())}
                  placeholder="master"
                />
                <p className="mt-1 text-[10px] text-ink-500">
                  Lowercase letters, digits, and <code>. _ -</code>.
                </p>
              </div>
              {feedback && (
                <div className="sm:col-span-2 rounded-md border border-ink-200 bg-ink-50 px-3 py-2 text-xs text-ink-700">
                  {feedback}
                </div>
              )}
              <div className="sm:col-span-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={cancel}
                  disabled={pending}
                  className="btn btn-ghost h-9 text-xs"
                >
                  <X className="h-3.5 w-3.5" />
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="btn btn-primary h-9 px-3 text-xs"
                >
                  {pending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  Save
                </button>
              </div>
            </form>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 text-sm">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-ink-500">
                  Display name
                </div>
                <div className="mt-0.5 font-medium text-ink-900">{master.displayName}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-ink-500">
                  Username
                </div>
                <div className="mt-0.5 font-mono text-ink-900">@{master.username}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
