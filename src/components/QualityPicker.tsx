"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { LeadQuality } from "@prisma/client";
import { Star, X, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export const QUALITY_LABEL: Record<LeadQuality, string> = {
  GOOD: "Good quality",
  MEDIUM: "Medium quality",
  LOW: "Low quality",
};

export const QUALITY_TONE: Record<LeadQuality, string> = {
  GOOD: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  MEDIUM: "bg-amber-50 text-amber-800 ring-amber-200",
  LOW: "bg-rose-50 text-rose-700 ring-rose-200",
};

const OPTIONS: { value: LeadQuality | ""; label: string; tone: "good" | "medium" | "bad" | "neutral" }[] = [
  { value: "GOOD", label: "Good quality", tone: "good" },
  { value: "MEDIUM", label: "Medium quality", tone: "medium" },
  { value: "LOW", label: "Low quality", tone: "bad" },
  { value: "", label: "Clear rating", tone: "neutral" },
];

export function QualityBadge({ quality }: { quality: LeadQuality | null }) {
  if (!quality) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-semibold text-ink-500 ring-1 ring-ink-200">
        <Star className="h-2.5 w-2.5" />
        Unrated
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1",
        QUALITY_TONE[quality]
      )}
    >
      <Sparkles className="h-2.5 w-2.5" />
      {QUALITY_LABEL[quality]}
    </span>
  );
}

type Props = {
  current: LeadQuality | null;
  onChoose: (value: LeadQuality | null) => void;
  onClose: () => void;
};

export function QualityPicker({ current, onChoose, onClose }: Props) {
  const [portalNode, setPortalNode] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setPortalNode(document.body);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!portalNode) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center">
      <button
        aria-label="Close quality picker"
        onClick={onClose}
        className="absolute inset-0 bg-ink-900/40 backdrop-blur-sm animate-in"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Rate lead quality"
        className="relative w-full md:w-[380px] max-h-[85vh] overflow-y-auto bg-white shadow-lift animate-in rounded-t-2xl md:rounded-2xl pb-[env(safe-area-inset-bottom)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="md:hidden flex justify-center pt-2">
          <span className="h-1 w-10 rounded-full bg-ink-200" aria-hidden />
        </div>
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div>
            <h3 className="text-base font-semibold text-ink-900">Lead quality</h3>
            <p className="text-xs text-ink-500 mt-0.5">How promising is this lead?</p>
          </div>
          <button
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full text-ink-500 hover:bg-ink-100"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-3 pb-4 space-y-1">
          {OPTIONS.map((opt) => {
            const isCurrent = (current ?? "") === opt.value;
            const tone =
              opt.tone === "good"
                ? "border-ink-100 hover:border-emerald-200 hover:bg-emerald-50 text-emerald-700"
                : opt.tone === "medium"
                  ? "border-ink-100 hover:border-amber-200 hover:bg-amber-50 text-amber-800"
                  : opt.tone === "bad"
                    ? "border-ink-100 hover:border-rose-200 hover:bg-rose-50 text-rose-700"
                    : "border-ink-100 hover:border-ink-300 hover:bg-ink-50 text-ink-600";
            return (
              <button
                key={opt.value || "none"}
                onClick={() => onChoose(opt.value === "" ? null : (opt.value as LeadQuality))}
                className={cn(
                  "w-full flex items-center justify-between gap-3 rounded-xl border px-3 py-3 text-sm text-left transition-colors mx-1",
                  isCurrent ? "border-brand-300 bg-brand-50 text-brand-800" : tone
                )}
              >
                <span className="font-medium">{opt.label}</span>
                {isCurrent && (
                  <span className="text-[10px] uppercase tracking-wider text-brand-700">current</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    portalNode
  );
}
