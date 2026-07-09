"use client";

/**
 * Offline fallback shell. Served by the SW when a navigation request
 * fails without a network. Deliberately static — no data fetches, no
 * server actions — so it can be precached at install time and paint
 * without any backend.
 */
export default function OfflinePage() {
  return (
    <main className="min-h-[100dvh] grid place-items-center bg-ink-50 px-6 py-12 text-ink-800">
      <div className="max-w-sm text-center space-y-4">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-white shadow-sm">
          <span aria-hidden className="text-2xl">📡</span>
        </div>
        <h1 className="text-xl font-semibold text-ink-900">You&apos;re offline</h1>
        <p className="text-sm text-ink-600">
          Leadboard needs a live connection to fetch leads and updates. Your
          shell is cached so the app opens instantly — reconnect to load
          data.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
