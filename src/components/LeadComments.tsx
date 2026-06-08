"use client";

import { useRef, useState, useTransition } from "react";
import { MessageSquare, Send, Loader2, Trash2 } from "lucide-react";
import { timeAgo } from "@/lib/utils";
import { addCommentAction, deleteCommentAction } from "@/app/dashboard/leads/[id]/actions";

type Comment = {
  id: number;
  body: string;
  createdAt: string;
  author: { id: number; displayName: string };
};

type Props = {
  leadId: number;
  comments: Comment[];
  viewerId: number;
  viewerRole: "MASTER" | "USER";
};

export function LeadComments({ leadId, comments, viewerId, viewerRole }: Props) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLTextAreaElement>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!body.trim()) return;
    const fd = new FormData();
    fd.set("leadId", String(leadId));
    fd.set("body", body);
    startTransition(async () => {
      const res = await addCommentAction(fd);
      if (res?.error) setError(res.error);
      else {
        setBody("");
        ref.current?.focus();
      }
    });
  };

  const remove = (commentId: number) => {
    const fd = new FormData();
    fd.set("commentId", String(commentId));
    fd.set("leadId", String(leadId));
    startTransition(async () => {
      const res = await deleteCommentAction(fd);
      if (res?.error) setError(res.error);
    });
  };

  return (
    <section className="card p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-ink-900 flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-brand-600" />
            Comments
            <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-semibold text-ink-600">
              {comments.length}
            </span>
          </h3>
          <p className="text-xs text-ink-500 mt-0.5">
            Anyone on the team can leave a note. Visible to the whole team.
          </p>
        </div>
      </div>

      <form onSubmit={submit} className="mt-4 space-y-3">
        <textarea
          ref={ref}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="Add a comment for the team…"
          className="input resize-y text-sm leading-relaxed"
        />
        {error && (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] text-ink-400">{body.length}/2000</span>
          <button
            type="submit"
            disabled={pending || !body.trim()}
            className="btn btn-accent h-9 px-3 text-xs"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Post comment
          </button>
        </div>
      </form>

      <div className="mt-6 space-y-4">
        {comments.length === 0 ? (
          <p className="text-sm text-ink-500 text-center py-6">
            No comments yet. Be the first to leave one.
          </p>
        ) : (
          comments.map((c) => {
            const canDelete = c.author.id === viewerId || viewerRole === "MASTER";
            const initials = c.author.displayName
              .split(/\s+/)
              .slice(0, 2)
              .map((w) => w[0]?.toUpperCase() ?? "")
              .join("");
            return (
              <div key={c.id} className="flex gap-3">
                <div className="shrink-0 grid h-9 w-9 place-items-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                  {initials || "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-sm font-medium text-ink-900">
                      {c.author.displayName}
                    </span>
                    <span className="text-[11px] text-ink-400">{timeAgo(c.createdAt)}</span>
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => remove(c.id)}
                        disabled={pending}
                        className="ml-auto inline-flex items-center gap-1 text-[11px] text-ink-400 hover:text-rose-600"
                      >
                        <Trash2 className="h-3 w-3" />
                        Delete
                      </button>
                    )}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap break-words rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-800">
                    {c.body}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
