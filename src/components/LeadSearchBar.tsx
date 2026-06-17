import Link from "next/link";
import { Search, X } from "lucide-react";

type Props = {
  activeTab: string;
  q: string;
};

export function LeadSearchBar({ activeTab, q }: Props) {
  const clearHref = activeTab === "fresh" ? "/dashboard" : `/dashboard?tab=${activeTab}`;
  return (
    <form action="/dashboard" className="relative w-full">
      {activeTab !== "fresh" && <input type="hidden" name="tab" value={activeTab} />}
      <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-ink-400" />
      <input
        type="search"
        name="q"
        defaultValue={q}
        placeholder="Search lead content, remarks, and thread messages…"
        className="input w-full pl-11 pr-24 h-12 text-sm"
        aria-label="Search leads"
      />
      <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
        {q && (
          <Link
            href={clearHref}
            className="inline-flex h-9 items-center justify-center rounded-md px-2 text-xs font-medium text-ink-500 hover:bg-ink-100 hover:text-ink-700"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </Link>
        )}
        <button
          type="submit"
          className="inline-flex h-9 items-center justify-center rounded-md bg-brand-600 px-3 text-xs font-semibold text-white shadow-sm hover:bg-brand-700 active:bg-brand-800"
        >
          Search
        </button>
      </div>
    </form>
  );
}
