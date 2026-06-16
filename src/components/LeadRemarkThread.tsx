"use client";

import { useState, useTransition } from "react";
import { Loader2, Pencil, Send, X, Check } from "lucide-react";
import { addLeadRemarkAction, editLeadRemarkAction } from "@/app/dashboard/actions";
import { formatDateTime } from "@/lib/utils";

type Remark = {
  id: number;
  body: string;
  createdAt: string;
  updatedAt: string;
  author: { id: number; displayName: string };
};

type Props = {
  leadId: number;
  viewerId: number;
  remarks: Remark[];
};

/**
 * Chat-style remark thread. Each user posts their own messages; only the
 * author can edit theirs (enforced server-side too). Messages with
 * updatedAt > createdAt show a small "edited" suffix.
 */
export function LeadRemarkThread({ leadId, viewerId, remarks }: Props) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<number | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body || pending) return;
    setError(null);
    const fd = new FormData();
    fd.set("leadId", String(leadId));
    fd.set("body", body);
    startTransition(async () => {
      const res = await addLeadRemarkAction(fd);
      if (res?.error) {
        setError(res.error);
      } else {
        setDraft("");
      }
    });
  };

  return (
    <section className="card p-6">
      <div>
        <h3 className="text-sm font-semibold text-ink-900">Remarks</h3>
        <p className="text-xs text-ink-500 mt-0.5">
          Conversation style — each user posts their own notes. You can only edit your own messages.
        </p>
      </div>

      {remarks.length === 0 ? (
        <p className="mt-5 text-sm text-ink-400 italic">
          No messages yet. Be the first to leave a note.
        </p>
      ) : (
        <ol className="mt-5 space-y-3">
          {remarks.map((r) => (
            <RemarkRow
              key={r.id}
              remark={r}
              isMine={r.author.id === viewerId}
              isEditing={editingId === r.id}
              onStartEdit={() => setEditingId(r.id)}
              onCancelEdit={() => setEditingId(null)}
              onSaved={() => setEditingId(null)}
            />
          ))}
        </ol>
      )}

      <form onSubmit={submit} className="mt-5 flex items-end gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          maxLength={2000}
          placeholder="Type a message…"
          className="input resize-none text-sm leading-relaxed flex-1"
          onKeyDown={(e) => {
            // Cmd/Ctrl+Enter submits — keyboard-friendly for desktop users.
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              submit(e as unknown as React.FormEvent);
            }
          }}
        />
        <button
          type="submit"
          disabled={pending || !draft.trim()}
          className="btn btn-primary h-10 px-3 text-xs"
          aria-label="Send"
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </button>
      </form>
      {error && (
        <p className="mt-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-1">
          {error}
        </p>
      )}
      <div className="mt-1 text-[11px] text-ink-400">{draft.length}/2000</div>
    </section>
  );
}

function RemarkRow({
  remark,
  isMine,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onSaved,
}: {
  remark: Remark;
  isMine: boolean;
  isEditing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(remark.body);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const wasEdited =
    new Date(remark.updatedAt).getTime() - new Date(remark.createdAt).getTime() > 1000;

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const body = value.trim();
    if (!body || pending) return;
    setError(null);
    const fd = new FormData();
    fd.set("remarkId", String(remark.id));
    fd.set("body", body);
    startTransition(async () => {
      const res = await editLeadRemarkAction(fd);
      if (res?.error) setError(res.error);
      else onSaved();
    });
  };

  const initials = remark.author.displayName
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <li className={"flex gap-3 " + (isMine ? "flex-row-reverse" : "")}>
      <div
        className={
          "mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full text-[10px] font-semibold " +
          (isMine ? "bg-brand-100 text-brand-700" : "bg-ink-100 text-ink-700")
        }
        title={remark.author.displayName}
      >
        {initials || "?"}
      </div>
      <div className={"min-w-0 max-w-[85%] " + (isMine ? "items-end text-right" : "")}>
        <div
          className={
            "flex items-baseline gap-2 " +
            (isMine ? "justify-end" : "")
          }
        >
          <span className="text-xs font-semibold text-ink-800">
            {isMine ? "You" : remark.author.displayName}
          </span>
          <span className="text-[11px] text-ink-400">
            {formatDateTime(remark.createdAt)}
          </span>
        </div>

        {isEditing ? (
          <form onSubmit={save} className="mt-1 space-y-2">
            <textarea
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              rows={3}
              maxLength={2000}
              className="input resize-y text-sm leading-relaxed w-full text-left"
            />
            {error && (
              <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-1 text-left">
                {error}
              </p>
            )}
            <div className={"flex gap-2 " + (isMine ? "justify-end" : "")}>
              <button
                type="button"
                onClick={() => {
                  setValue(remark.body);
                  setError(null);
                  onCancelEdit();
                }}
                disabled={pending}
                className="btn btn-ghost h-8 text-xs"
              >
                <X className="h-3.5 w-3.5" />
                Cancel
              </button>
              <button
                type="submit"
                disabled={pending || !value.trim() || value.trim() === remark.body.trim()}
                className="btn btn-primary h-8 text-xs"
              >
                {pending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                Save
              </button>
            </div>
          </form>
        ) : (
          <>
            <div
              className={
                "mt-1 inline-block whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm text-left " +
                (isMine
                  ? "bg-brand-500 text-white"
                  : "bg-ink-100 text-ink-800")
              }
            >
              {remark.body}
            </div>
            <div
              className={
                "mt-1 flex items-center gap-2 text-[11px] text-ink-400 " +
                (isMine ? "justify-end" : "")
              }
            >
              {wasEdited && <span className="italic">edited</span>}
              {isMine && (
                <button
                  type="button"
                  onClick={onStartEdit}
                  className="inline-flex items-center gap-1 hover:text-ink-700"
                >
                  <Pencil className="h-3 w-3" />
                  Edit
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </li>
  );
}
