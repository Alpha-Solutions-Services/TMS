"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Smartphone, X } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const mq = window.matchMedia("(display-mode: standalone)").matches;
  // iOS Safari
  const ios = "standalone" in navigator && (navigator as Navigator & { standalone?: boolean }).standalone;
  return Boolean(mq || ios);
}

function detectPlatform(): "ios" | "android" | "desktop" {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

/**
 * Helps carriers & drivers install TMS as an app / home-screen shortcut.
 * Chrome/Edge: native Install button via beforeinstallprompt.
 * iOS: Share → Add to Home Screen instructions (Apple blocks programmatic install).
 */
export function TmsInstallAppBanner({
  audience = "portal",
  storageKey = "afn-pwa-dismiss",
}: {
  audience?: "carrier" | "driver" | "portal" | "login";
  storageKey?: string;
}) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [howOpen, setHowOpen] = useState(false);
  const platform = useMemo(() => detectPlatform(), []);

  useEffect(() => {
    setStandalone(isStandalone());
    try {
      if (sessionStorage.getItem(storageKey) === "1") setDismissed(true);
    } catch {
      /* ignore */
    }

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBip);

    const onInstalled = () => {
      setDeferred(null);
      setStandalone(true);
    };
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [storageKey]);

  if (standalone || dismissed) return null;

  const title =
    audience === "driver"
      ? "Install driver app"
      : audience === "carrier"
        ? "Install carrier app"
        : "Install Alpha Freight TMS";

  const blurb =
    audience === "driver"
      ? "Add to your phone home screen so dispatch can reach you for live tracking — no App Store needed."
      : audience === "carrier"
        ? "Add Alpha Freight to your home screen for faster loads, docs, and chat."
        : "Create a phone or desktop shortcut for quicker sign-in.";

  const iosSteps =
    "iPhone/iPad: tap Share (□↑) → Add to Home Screen → Add.";
  const androidSteps =
    "Android: tap browser menu (⋮) → Install app / Add to Home screen.";
  const desktopSteps =
    "Computer: browser menu → Install Alpha Freight / Create shortcut.";

  const steps =
    platform === "ios"
      ? iosSteps
      : platform === "android"
        ? androidSteps
        : desktopSteps;

  return (
    <div className="fixed bottom-20 left-3 right-3 z-40 mx-auto max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/95 p-4 shadow-lg backdrop-blur md:bottom-6">
      <div className="flex items-start gap-3">
        <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-accent)]" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--color-text)]">{title}</p>
          <p className="mt-1 text-xs text-[var(--color-muted)]">{blurb}</p>

          {howOpen || !deferred ? (
            <p className="mt-2 rounded-lg border border-[var(--color-border)] bg-black/20 px-2.5 py-2 text-[11px] leading-relaxed text-[var(--color-text)]">
              {steps}
              {platform === "ios" ? (
                <>
                  {" "}
                  Then open the new AFN icon (not Safari) so live location & alerts work.
                </>
              ) : null}
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-2">
            {deferred ? (
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-xs font-semibold text-[#05080f]"
                onClick={() => {
                  void (async () => {
                    await deferred.prompt();
                    await deferred.userChoice;
                    setDeferred(null);
                  })();
                }}
              >
                <Download className="h-3.5 w-3.5" />
                Install / Add shortcut
              </button>
            ) : (
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-xs font-semibold text-[#05080f]"
                onClick={() => setHowOpen(true)}
              >
                <Download className="h-3.5 w-3.5" />
                How to install
              </button>
            )}
            {!howOpen && deferred ? (
              <button
                type="button"
                className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-muted)]"
                onClick={() => setHowOpen(true)}
              >
                Manual steps
              </button>
            ) : null}
            <button
              type="button"
              className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-muted)]"
              onClick={() => {
                setDismissed(true);
                try {
                  sessionStorage.setItem(storageKey, "1");
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

/** @deprecated use TmsInstallAppBanner */
export function CarrierPwaInstallBanner() {
  return <TmsInstallAppBanner audience="carrier" storageKey="afn-pwa-dismiss-carrier" />;
}
