import Link from "next/link";
import { ArrowLeft, KeyRound } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();
  return (
    <div className="max-w-2xl space-y-4 md:space-y-6">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to leads
      </Link>

      <div className="card p-4 md:p-6 space-y-2">
        <h1 className="text-base font-semibold text-ink-900">Settings</h1>
        <p className="text-xs text-ink-500">
          Signed in as <span className="font-medium text-ink-800">{user.displayName}</span>{" "}
          (<span className="font-mono">@{user.username}</span>).
        </p>
      </div>

      <div className="card p-4 md:p-6">
        <div className="flex items-start gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-100 text-brand-700">
            <KeyRound className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-ink-900">Change password</h2>
            <p className="mt-0.5 text-xs text-ink-500">
              You&apos;ll need your current password to set a new one.
            </p>
          </div>
        </div>
        <div className="mt-4">
          <ChangePasswordForm />
        </div>
      </div>
    </div>
  );
}
