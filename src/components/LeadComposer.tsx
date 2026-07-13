"use client";

import { useRef, useState, useTransition } from "react";
import { Plus, ClipboardPaste, Loader2, Check, Users, Tag, X } from "lucide-react";
import { createLeadAction, addLeadSourceAction } from "@/app/dashboard/actions";
import { cn } from "@/lib/utils";

type Assignable = {
  id: number;
  displayName: string;
  role?: "MASTER" | "USER";
};

type SourceOption = { id: number; name: string };

type Props = {
  /** Private-channel user id to drop the lead into. Omitted = public pipeline. */
  privateChannelUserId?: number;
  /** Display label for the private channel (the user's displayName). */
  privateChannelLabel?: string;
  /** Users the creator can assign to. Everyone active, master included. */
  assignableUsers?: Assignable[];
  /** Team-wide lead sources shown in the picker. */
  sources?: SourceOption[];
};

export function LeadComposer({
  privateChannelUserId,
  privateChannelLabel,
  assignableUsers = [],
  sources = [],
}: Props = {}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [assignees, setAssignees] = useState<Set<number>>(new Set());
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [localSources, setLocalSources] = useState<SourceOption[]>(sources);
  const [sourceId, setSourceId] = useState<number | null>(null);
  const [addingSource, setAddingSource] = useState(false);
  const [newSourceName, setNewSourceName] = useState("");
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [autofilled, setAutofilled] = useState<null | string[]>(null);
  const [pendingParse, setPendingParse] = useState<
    { parsedName?: string; parsedPhone?: string } | null
  >(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  /**
   * Best-effort parser: given a chunk of pasted text (e.g. a Gmail lead
   * summary), extract Name / IC / Phone. Prefers labelled lines
   * ("Name: Jane Doe"); falls back to generic regexes for IC + phone.
   */
  const parseContactFromText = (text: string) => {
    const NAME_LABELS = [
      "name",
      "nama",
      "full name",
      "customer",
      "applicant name",
      "applicant_name",
    ];
    const PHONE_LABELS = [
      "phone",
      "phone number",
      "phone_number",
      "tel",
      "tel no",
      "tel_no",
      "mobile",
      "hp",
      "no telefon",
      "no",
      "contact",
      "contact no",
      "contact number",
    ];
    // All label words we know — used to skip label-only lines in the
    // first-line fallback so a paste starting with "Name" on its own line
    // doesn't detect the literal word "Name" as the customer's name.
    const ALL_LABELS = new Set(
      [
        ...NAME_LABELS,
        ...PHONE_LABELS,
        "email",
        "employment type",
        "job title",
        "loan amount (myr)",
        "loan amount",
        "salary amount (myr)",
        "salary amount",
        "salary",
        "ic",
        "nric",
      ].map((l) => l.toLowerCase())
    );
    const lines = text.split(/\r?\n/).map((l) => l.trim());

    // Form 1: "Name: Jane Doe" — label + separator + value on one line.
    const sameLine = (labels: string[]) => {
      const re = new RegExp(
        `^\\s*(?:${labels.join("|")})\\s*[:：\\-]\\s*(.+?)\\s*$`,
        "im"
      );
      return text.match(re)?.[1]?.trim();
    };
    // Form 2 (Gmail form exports): label alone on a line, value on the
    // NEXT non-empty line:  "Name\nmuhammad fadzrin".
    const nextLine = (labels: string[]) => {
      const wanted = labels.map((l) => l.toLowerCase());
      for (let i = 0; i < lines.length - 1; i++) {
        if (!wanted.includes(lines[i].toLowerCase())) continue;
        for (let j = i + 1; j < lines.length; j++) {
          if (lines[j]) return lines[j];
        }
      }
      return undefined;
    };
    // Form 3 fallback for name: first non-empty, non-label line.
    const firstLineName = (() => {
      for (const s of lines) {
        if (!s) continue;
        if (ALL_LABELS.has(s.toLowerCase())) continue;
        if (s.length > 60) return undefined;
        if (/@/.test(s)) return undefined;
        if (/^\+?\d[\d\s\-()]{5,}$/.test(s)) return undefined;
        if (/[:：]/.test(s)) return undefined;
        return s;
      }
      return undefined;
    })();

    const parsedName =
      sameLine(NAME_LABELS) ?? nextLine(NAME_LABELS) ?? firstLineName ?? undefined;
    const parsedPhone =
      sameLine(PHONE_LABELS) ??
      nextLine(PHONE_LABELS) ??
      text.match(/(?:\+?60|0)[\s-]?\d{1,2}[\s-]?\d{3,4}[\s-]?\d{4}/)?.[0] ??
      undefined;
    return { parsedName, parsedPhone };
  };

  /**
   * On paste we don't stomp fields — instead surface a preview banner so
   * the user can approve or dismiss before Name/Phone get overwritten. If
   * nothing new was detected (both target fields already filled or parse
   * failed), we skip the banner entirely.
   */
  const autofillFromText = (text: string) => {
    const { parsedName, parsedPhone } = parseContactFromText(text);
    const willFillName = !!parsedName && !name;
    const willFillPhone = !!parsedPhone && !phone;
    if (!willFillName && !willFillPhone) {
      setPendingParse(null);
      return;
    }
    setPendingParse({
      parsedName: willFillName ? parsedName : undefined,
      parsedPhone: willFillPhone ? parsedPhone : undefined,
    });
  };

  const applyPendingParse = () => {
    if (!pendingParse) return;
    const filled: string[] = [];
    if (pendingParse.parsedName && !name) {
      setName(pendingParse.parsedName);
      filled.push("Name");
    }
    if (pendingParse.parsedPhone && !phone) {
      setPhone(pendingParse.parsedPhone);
      filled.push("Phone");
    }
    setPendingParse(null);
    if (filled.length > 0) {
      setAutofilled(filled);
      setTimeout(() => setAutofilled(null), 2500);
    }
  };

  const toggleAssignee = (id: number) => {
    setAssignees((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isPrivate = privateChannelUserId !== undefined;
  const ctaLabel = isPrivate
    ? `Drop a new lead into ${privateChannelLabel}'s pipeline`
    : "Drop a new lead";
  const ctaHint = isPrivate
    ? `Goes into ${privateChannelLabel}'s private pipeline — only they and master see it.`
    : "Paste any text — contact info, message, or notes.";

  if (!open) {
    return (
      <button
        onClick={() => {
          setOpen(true);
          setTimeout(() => ref.current?.focus(), 50);
        }}
        className="card flex w-full items-center gap-3 p-5 text-left hover:shadow-lift transition-shadow"
      >
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-600 text-white">
          <Plus className="h-5 w-5" />
        </span>
        <span>
          <span className="block text-sm font-semibold text-ink-900">{ctaLabel}</span>
          <span className="block text-xs text-ink-500">{ctaHint}</span>
        </span>
      </button>
    );
  }

  const submit = (fd: FormData) => {
    setError(null);
    // FormData.set stomps, so use append to send multiple values under the
    // same key (matches formData.getAll on the server).
    for (const uid of assignees) fd.append("assignedUserIds", String(uid));
    if (sourceId !== null) fd.set("sourceId", String(sourceId));
    startTransition(async () => {
      const res = await createLeadAction(fd);
      if (res?.error) setError(res.error);
      else {
        formRef.current?.reset();
        setAssignees(new Set());
        setName("");
        setPhone("");
        setAutofilled(null);
        setPendingParse(null);
        setSourceId(null);
        setAddingSource(false);
        setNewSourceName("");
        setSourceError(null);
        setOpen(false);
      }
    });
  };

  const addSource = () => {
    const trimmed = newSourceName.trim();
    if (!trimmed) return;
    setSourceError(null);
    const fd = new FormData();
    fd.set("name", trimmed);
    startTransition(async () => {
      const res = await addLeadSourceAction(fd);
      if (!res || res.error || !res.sourceId) {
        setSourceError(res?.error ?? "Could not add source.");
        return;
      }
      const id = res.sourceId;
      setLocalSources((prev) =>
        prev.some((s) => s.id === id) ? prev : [...prev, { id, name: trimmed }]
      );
      setSourceId(id);
      setAddingSource(false);
      setNewSourceName("");
    });
  };

  return (
    <form
      ref={formRef}
      action={submit}
      className="card p-5 animate-in"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink-900">
          <ClipboardPaste className="h-4 w-4 text-brand-600" />
          {isPrivate ? `New private lead for ${privateChannelLabel}` : "New lead"}
        </div>
        <span className="text-xs text-ink-400">
          {isPrivate ? (
            <>Pipeline: <strong className="text-ink-700">{privateChannelLabel}</strong></>
          ) : (
            <>Status starts as <strong className="text-ink-700">New</strong></>
          )}
        </span>
      </div>
      {isPrivate && (
        <input type="hidden" name="privateChannelUserId" value={privateChannelUserId} />
      )}
      {isPrivate && (
        <div className="mb-3">
          <label className="label">Initial status</label>
          <select name="initialNote" defaultValue="" className="input h-11">
            <option value="">New (no prior contact)</option>
            <option value="CALLED_BEFORE">Called before</option>
            <option value="WHATSAPP_BEFORE">WhatsApp before</option>
          </select>
          <p className="mt-1 text-[10px] text-ink-500">
            Saved as the first thread message so the assignee knows what was already tried.
          </p>
        </div>
      )}
      <div className="mb-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-ink-700">
          <Tag className="h-3.5 w-3.5 text-brand-600" />
          Source
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {localSources.map((s) => {
            const active = sourceId === s.id;
            return (
              <button
                type="button"
                key={s.id}
                onClick={() => setSourceId(active ? null : s.id)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold border transition-colors",
                  active
                    ? "border-brand-500 bg-brand-500 text-white"
                    : "border-ink-200 bg-white text-ink-700 hover:bg-ink-50"
                )}
              >
                {active && <Check className="h-3 w-3" />}
                <Tag className="h-3 w-3" />
                {s.name}
              </button>
            );
          })}
          {addingSource ? (
            <div className="flex items-center gap-1.5">
              <input
                autoFocus
                value={newSourceName}
                onChange={(e) => setNewSourceName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addSource();
                  }
                  if (e.key === "Escape") {
                    setAddingSource(false);
                    setNewSourceName("");
                  }
                }}
                maxLength={30}
                placeholder="e.g. Instagram"
                disabled={pending}
                className="rounded-full border border-ink-300 bg-white px-2.5 py-1 text-[11px] text-ink-800"
              />
              <button
                type="button"
                onClick={addSource}
                disabled={pending || !newSourceName.trim()}
                className="inline-flex items-center gap-1 rounded-full bg-brand-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setAddingSource(false);
                  setNewSourceName("");
                  setSourceError(null);
                }}
                disabled={pending}
                className="grid h-6 w-6 place-items-center rounded-full border border-ink-200 bg-white text-ink-500 hover:bg-ink-50"
                aria-label="Cancel new source"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAddingSource(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-ink-300 bg-white px-2.5 py-1 text-[11px] font-medium text-ink-700 hover:bg-ink-50"
            >
              <Plus className="h-3 w-3" />
              Add new
            </button>
          )}
        </div>
        {sourceError && (
          <div className="mt-1.5 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] text-rose-700">
            {sourceError}
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
        <label className="block">
          <span className="label">Name</span>
          <input
            type="text"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
            placeholder="Jane Doe"
            className="input h-11"
          />
        </label>
        <label className="block">
          <span className="label">Phone</span>
          <input
            type="tel"
            name="phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="off"
            placeholder="+60 12-345 6789"
            className="input h-11"
          />
        </label>
      </div>
      <div className="flex items-center justify-between mb-1">
        <label>
          <span className="label">Notes / other details</span>
        </label>
        <span className="text-[10px] text-ink-400">
          Paste a Gmail chunk — Name / IC / Phone auto-fill.
        </span>
      </div>
      <textarea
        ref={ref}
        name="content"
        rows={5}
        required
        placeholder={
          "Paste the lead here (from Gmail, WhatsApp, etc.). Any Name / IC / Phone we spot fills the boxes above."
        }
        onPaste={(e) => {
          const text = e.clipboardData.getData("text");
          if (text) autofillFromText(text);
        }}
        className="input resize-y font-mono text-sm leading-relaxed"
      />
      {pendingParse && (
        <div className="mt-2 rounded-lg border border-brand-200 bg-brand-50/60 px-3 py-2 text-[11px] text-ink-800">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-brand-700">
            Detected from paste — review before applying
          </div>
          <ul className="mt-1 space-y-0.5">
            {pendingParse.parsedName && (
              <li>
                <span className="text-ink-500">Name → </span>
                <strong className="text-ink-900">{pendingParse.parsedName}</strong>
              </li>
            )}
            {pendingParse.parsedPhone && (
              <li>
                <span className="text-ink-500">Phone → </span>
                <strong className="text-ink-900">{pendingParse.parsedPhone}</strong>
              </li>
            )}
          </ul>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={applyPendingParse}
              className="inline-flex items-center gap-1 rounded-md bg-brand-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-brand-700"
            >
              <Check className="h-3 w-3" />
              Apply
            </button>
            <button
              type="button"
              onClick={() => setPendingParse(null)}
              className="inline-flex items-center gap-1 rounded-md border border-ink-200 bg-white px-2.5 py-1 text-[11px] font-medium text-ink-600 hover:bg-ink-50"
            >
              <X className="h-3 w-3" />
              Dismiss
            </button>
          </div>
        </div>
      )}
      {autofilled && autofilled.length > 0 && (
        <div className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] text-emerald-800">
          Auto-filled from paste: <strong>{autofilled.join(", ")}</strong>. Review and adjust if needed.
        </div>
      )}
      {assignableUsers.length > 0 && (
        <div className="mt-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-ink-700">
            <Users className="h-3.5 w-3.5 text-brand-600" />
            Assign to (optional)
          </div>
          <p className="mt-0.5 text-[11px] text-ink-500">
            Skip to leave the lead in Fresh for anyone to pick up.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {assignableUsers.map((u) => {
              const checked = assignees.has(u.id);
              return (
                <button
                  type="button"
                  key={u.id}
                  onClick={() => toggleAssignee(u.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors",
                    checked
                      ? "border-brand-500 bg-brand-500 text-white"
                      : "border-ink-200 bg-white text-ink-700 hover:bg-ink-50"
                  )}
                >
                  {checked && <Check className="h-3 w-3" />}
                  {u.displayName}
                  {u.role === "MASTER" && (
                    <span
                      className={cn(
                        "rounded px-1 text-[9px] font-semibold",
                        checked ? "bg-white/20" : "bg-brand-50 text-brand-700"
                      )}
                    >
                      MASTER
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {error && (
        <div className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}
      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="btn btn-ghost"
          disabled={pending}
        >
          Cancel
        </button>
        <button type="submit" className="btn btn-accent" disabled={pending}>
          {pending ? <><Loader2 className="h-4 w-4 animate-spin" /> Adding…</> : "Add to pipeline"}
        </button>
      </div>
    </form>
  );
}
