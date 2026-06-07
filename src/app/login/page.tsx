import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { LoginForm } from "@/components/LoginForm";

export default async function LoginPage() {
  const user = await currentUser();
  if (user) redirect("/dashboard");

  return (
    <div className="min-h-screen flex">
      {/* Brand panel */}
      <aside className="hidden lg:flex w-1/2 relative overflow-hidden bg-ink-900 text-white p-12 flex-col justify-between">
        <div className="absolute inset-0 opacity-60"
             style={{
               backgroundImage:
                 "radial-gradient(at 20% 20%, rgba(94,135,255,.45) 0, transparent 50%), radial-gradient(at 80% 60%, rgba(180,120,255,.35) 0, transparent 50%), radial-gradient(at 40% 90%, rgba(94,235,200,.25) 0, transparent 50%)",
             }}
        />
        <div className="relative">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 ring-1 ring-white/20">
              <span className="block h-3 w-3 rounded-sm bg-gradient-to-br from-brand-300 to-brand-500" />
            </span>
            Leadboard
          </div>
        </div>
        <div className="relative space-y-6">
          <h1 className="text-4xl font-semibold leading-tight">
            One pipeline.<br />
            One team.<br />
            <span className="text-brand-300">Total visibility.</span>
          </h1>
          <p className="text-white/70 max-w-md">
            Everyone drops new leads in. The master sees every move, assigns
            them across the team, and watches the pipeline close.
          </p>
        </div>
        <div className="relative text-xs text-white/40">
          © {new Date().getFullYear()} Leadboard
        </div>
      </aside>

      {/* Form panel */}
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden flex items-center gap-2 text-lg font-semibold text-ink-900">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-ink-900">
              <span className="block h-3 w-3 rounded-sm bg-brand-400" />
            </span>
            Leadboard
          </div>
          <h2 className="text-2xl font-semibold text-ink-900">Welcome back</h2>
          <p className="mt-1 text-sm text-ink-500">Sign in to continue to your pipeline.</p>

          <div className="mt-8">
            <LoginForm />
          </div>

          <div className="mt-6 text-center text-sm text-ink-500">
            Forgot your password?{" "}
            <Link href="/forgot-password" className="font-medium text-brand-700 hover:underline">
              Request a reset
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
