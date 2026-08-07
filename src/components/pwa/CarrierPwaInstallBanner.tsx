"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * Carrier-only installable PWA prompt. Registers SW (already global) and
 * shows Add to Home Screen when the browser fires beforeinstallprompt.
 */
export function CarrierPwaInstallBanner() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (sessionStorage.getItem("afn-pwa-dismiss") === "1") {
        setDismissed(true);
      }
    } catch {
      /* ignore */
    }

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBip);
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  if (dismissed || !deferred) return null;

  return (
    <div className="fixed bottom-20 left-3 right-3 z-40 mx-auto max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/95 p-4 shadow-lg backdrop-blur md:bottom-6">
      <div className="flex items-start gap-3">
        <Download className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-accent)]" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--color-text)]">
            Install Alpha Freight
          </p>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            Add to your home screen for faster access — no App Store needed.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-xs font-semibold text-[#05080f]"
              onClick={() => {
                void (async () => {
                  await deferred.prompt();
                  await deferred.userChoice;
                  setDeferred(null);
                })();
              }}
            >
              Install
            </button>
            <button
              type="button"
              className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-muted)]"
              onClick={() => {
                setDismissed(true);
                try {
                  sessionStorage.setItem("afn-pwa-dismiss", "1");
                } catch {
                  /* ignore */
                }
              }}
            >
              Not now
            </button>
          </div>
        </div>
        <button
          type="button"
          aria-label="Dismiss"
          className="text-[var(--color-muted)]"
          onClick={() => setDismissed(true)}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
