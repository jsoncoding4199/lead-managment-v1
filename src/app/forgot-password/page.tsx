import Link from "next/link";
import { ForgotPasswordForm } from "@/components/ForgotPasswordForm";

export default function ForgotPasswordPage() {
  return (
    <div className="min-h-screen grid place-items-center p-6">
      <div className="w-full max-w-md">
        <div className="card p-8 animate-in">
          <Link href="/login" className="text-xs text-ink-500 hover:text-ink-700">← Back to sign in</Link>
          <h1 className="mt-3 text-2xl font-semibold text-ink-900">Reset your password</h1>
          <p className="mt-1 text-sm text-ink-500">
            Enter your username and we&apos;ll send a request to the master to issue you a new password.
          </p>
          <div className="mt-6">
            <ForgotPasswordForm />
          </div>
        </div>
        <p className="mt-4 text-center text-xs text-ink-500">
          Your master will reach out with a temporary password once approved.
        </p>
      </div>
    </div>
  );
}
