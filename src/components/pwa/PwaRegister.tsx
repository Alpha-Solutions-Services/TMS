"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function PwaRegister() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [show, setShow] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    const onBip = (e: Event) => {
      // Only defer the native banner when we will show our own Install UI.
      const dismissed = sessionStorage.getItem("pwa-dismiss");
      if (dismissed) return;
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", onBip);
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  if (!show || !deferred) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-[90] mx-auto max-w-md rounded-2xl border border-[var(--color-border-glow)] bg-[var(--color-surface)]/95 p-4 shadow-[var(--glow-md)] backdrop-blur-md sm:inset-x-auto sm:right-4 sm:left-auto">
      <div className="flex gap-3">
        <div className="rounded-xl bg-[var(--color-accent-dim)] p-2 text-[var(--color-accent)]">
          <Download className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p
            className="text-sm font-semibold text-[var(--color-text)]"
            style={{ fontFamily: "var(--font-display), sans-serif" }}
          >
            Install AFN TMS
          </p>
          <p className="mt-0.5 text-xs text-[var(--color-muted)]">
            Add to your home screen for quick access.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-xs font-semibold text-[#05080f]"
              onClick={async () => {
                await deferred.prompt();
                await deferred.userChoice;
                setShow(false);
                setDeferred(null);
              }}
            >
              Install
            </button>
            <button
              type="button"
              className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-muted)]"
              onClick={() => {
                sessionStorage.setItem("pwa-dismiss", "1");
                setShow(false);
              }}
            >
              Not now
            </button>
          </div>
        </div>
        <button
          type="button"
          className="self-start rounded-lg p-1 text-[var(--color-muted)]"
          onClick={() => {
            sessionStorage.setItem("pwa-dismiss", "1");
            setShow(false);
          }}
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
