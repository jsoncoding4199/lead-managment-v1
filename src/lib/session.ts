import { cookies } from "next/headers";
import { getIronSession, type SessionOptions } from "iron-session";

export type SessionData = {
  userId?: number;
  username?: string;
  displayName?: string;
  role?: "MASTER" | "USER";
};

// Compute lazily so the module can be imported during `next build` even when
// env vars haven't been wired up yet. Validation happens at request time.
function getSessionOptions(): SessionOptions {
  let password = process.env.SESSION_PASSWORD;
  if (!password || password.length < 32) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "SESSION_PASSWORD env var must be set to a 32+ character secret. " +
          "Add it under Project Settings → Environment Variables on Vercel."
      );
    }
    password = "dev-only-fallback-secret-please-change-32chars-now";
  }
  return {
    password,
    cookieName: "lm_session",
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    },
  };
}

export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, getSessionOptions());
}
