import { cookies } from "next/headers";
import { getIronSession, type SessionOptions } from "iron-session";

export type SessionData = {
  userId?: number;
  username?: string;
  displayName?: string;
  role?: "MASTER" | "USER";
};

const password = process.env.SESSION_PASSWORD;
if (!password || password.length < 32) {
  // Fail fast in production — a short/missing secret means insecure sessions.
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_PASSWORD must be set and at least 32 characters.");
  }
}

export const sessionOptions: SessionOptions = {
  password: password ?? "dev-only-fallback-secret-please-change-32chars",
  cookieName: "lm_session",
  cookieOptions: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  },
};

export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}
