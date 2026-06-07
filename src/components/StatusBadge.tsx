import type { LeadStatus } from "@prisma/client";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/leadStatus";
import { cn } from "@/lib/utils";

export function StatusBadge({ status, size = "sm" }: { status: LeadStatus; size?: "sm" | "md" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full ring-1 font-semibold",
        STATUS_TONE[status],
        size === "sm" ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs"
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {STATUS_LABEL[status]}
    </span>
  );
}
