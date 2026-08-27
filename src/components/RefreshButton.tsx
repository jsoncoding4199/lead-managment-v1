"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Soft-refresh the current view — re-runs the server components so lead lists,
 * counts and badges pick up other people's changes without a full page reload.
 */
export function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [spinning, setSpinning] = useState(false);

  const refresh = () => {
    setSpinning(true);
    startTransition(() => router.refresh());
    // Let the spin run briefly even if the refresh returns instantly.
    setTimeout(() => setSpinning(false), 600);
  };

  return (
    <button
      type="button"
      onClick={refresh}
      disabled={pending}
      aria-label="Refresh"
      title="Refresh content"
      className="shrink-0 grid h-9 w-9 place-items-center rounded-lg text-ink-600 ring-1 ring-ink-200 bg-white hover:bg-ink-50 hover:text-ink-900 disabled:opacity-60"
    >
      <RefreshCw className={cn("h-4 w-4", (pending || spinning) && "animate-spin")} />
    </button>
  );
}
