"use client";

import { useEffect, useState } from "react";
import { Download, Check } from "lucide-react";

/**
 * Renders an "Install" button when the browser has fired the
 * `beforeinstallprompt` event. Chrome / Edge / Samsung Internet on
 * Android use this for PWA installs.
 *
 * iOS Safari does not support beforeinstallprompt — the user installs
 * via Share → Add to Home Screen. The button stays hidden there; we
 * surface an instructional tooltip elsewhere.
 *
 * Once the user installs, the matchMedia(display-mode: standalone) check
 * makes the button render its "Installed" state.
 */

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function InstallButton() {
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Detect "already installed" state.
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      // Older iOS exposes a non-standard flag.
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) setInstalled(true);

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setEvt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setEvt(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const onClick = async () => {
    if (!evt) return;
    try {
      await evt.prompt();
      const choice = await evt.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
      setEvt(null);
    } catch {
      /* user dismissed — leave button visible */
    }
  };

  if (installed) {
    return (
      <span
        className="hidden md:inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200"
        title="Leadboard is installed on this device"
      >
        <Check className="h-3 w-3" />
        Installed
      </span>
    );
  }

  if (!evt) return null;

  return (
    <button
      onClick={onClick}
      title="Install Leadboard on this device"
      className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-brand-700"
    >
      <Download className="h-3 w-3" />
      Install
    </button>
  );
}
