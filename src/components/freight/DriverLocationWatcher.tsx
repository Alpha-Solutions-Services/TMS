"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MapPin, Smartphone } from "lucide-react";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Continuous GPS while the driver app is open (watchPosition + screen wake lock),
 * plus push subscription so dispatch can wake the phone when the app is backgrounded.
 * Browsers cannot read GPS with the browser fully closed — push/email opens the app.
 */
export function DriverLocationWatcher() {
  const lastPingAt = useRef(0);
  const busy = useRef(false);
  const watchId = useRef<number | null>(null);
  const wakeLock = useRef<WakeLockSentinel | null>(null);
  const [trackingOn, setTrackingOn] = useState(true);
  const [status, setStatus] = useState<string>("Starting live tracking…");

  const postLocation = useCallback(
    async (
      coords: { lat: number; lng: number; accuracyM?: number },
      loadId?: string | null,
    ) => {
      if (busy.current) return;
      busy.current = true;
      try {
        await fetch("/api/freight/driver/location", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lat: coords.lat,
            lng: coords.lng,
            accuracyM: coords.accuracyM,
            loadId: loadId || null,
          }),
        });
        lastPingAt.current = Date.now();
        setStatus("Live tracking on — location updating");
      } catch {
        setStatus("Could not send location — check connection");
      } finally {
        busy.current = false;
      }
    },
    [],
  );

  const captureOnce = useCallback(
    async (loadId?: string | null) => {
      if (!navigator.geolocation) {
        setStatus("Location not supported on this phone");
        return;
      }
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 20000,
            maximumAge: 5000,
          });
        });
        await postLocation(
          {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracyM: pos.coords.accuracy,
          },
          loadId,
        );
      } catch {
        setStatus("Allow location permission for live tracking");
      }
    },
    [postLocation],
  );

  const checkPending = useCallback(async () => {
    try {
      const res = await fetch("/api/freight/driver/location/pending", {
        cache: "no-store",
      });
      if (!res.ok) return;
      const json = (await res.json()) as {
        requests?: { id: string; loadId: string | null }[];
      };
      if (json.requests?.length) {
        await captureOnce(json.requests[0].loadId);
      }
    } catch {
      /* ignore */
    }
  }, [captureOnce]);

  const subscribePush = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    try {
      const keyRes = await fetch("/api/freight/driver/push");
      const keyJson = (await keyRes.json()) as {
        enabled?: boolean;
        publicKey?: string | null;
      };
      if (!keyJson.enabled || !keyJson.publicKey) {
        setStatus((s) => s); // push not configured — email wake still works
        return;
      }
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return;

      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(keyJson.publicKey),
        });
      }
      await fetch("/api/freight/driver/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
    } catch {
      /* optional */
    }
  }, []);

  const requestWakeLock = useCallback(async () => {
    try {
      if (!("wakeLock" in navigator)) return;
      wakeLock.current = await navigator.wakeLock.request("screen");
      wakeLock.current.addEventListener("release", () => {
        wakeLock.current = null;
      });
    } catch {
      /* unsupported / denied */
    }
  }, []);

  // Continuous watch while tracking is on and page visible
  useEffect(() => {
    if (!trackingOn || !navigator.geolocation) return;

    void requestWakeLock();
    void subscribePush();
    void captureOnce(null);
    void checkPending();

    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        if (Date.now() - lastPingAt.current < 20000) return; // throttle posts
        void postLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyM: pos.coords.accuracy,
        });
      },
      () => setStatus("Allow location permission for live tracking"),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
    );

    const pendingTimer = window.setInterval(() => void checkPending(), 8000);

    const onVis = () => {
      if (document.visibilityState === "visible") {
        void requestWakeLock();
        void checkPending();
        void captureOnce(null);
      }
    };
    document.addEventListener("visibilitychange", onVis);

    const onMsg = (event: MessageEvent) => {
      if (event.data?.type === "LIVE_LOCATION_REQUEST") {
        void captureOnce(null);
      }
    };
    navigator.serviceWorker?.addEventListener("message", onMsg);

    // Deep link from email / push: ?live=1
    if (typeof window !== "undefined") {
      const q = new URLSearchParams(window.location.search);
      if (q.get("live") === "1") {
        void captureOnce(null);
        setStatus("Responding to dispatch live-location request…");
      }
    }

    return () => {
      if (watchId.current != null) {
        navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
      }
      window.clearInterval(pendingTimer);
      document.removeEventListener("visibilitychange", onVis);
      navigator.serviceWorker?.removeEventListener("message", onMsg);
      void wakeLock.current?.release();
      wakeLock.current = null;
    };
  }, [
    trackingOn,
    captureOnce,
    checkPending,
    postLocation,
    requestWakeLock,
    subscribePush,
  ]);

  return (
    <div className="sticky top-0 z-30 border-b border-[var(--color-border)] bg-[var(--color-surface)]/95 px-3 py-2 backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-xs text-[var(--color-muted)]">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-[var(--color-accent)]" />
          <span className="truncate">{status}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setTrackingOn((v) => {
                const next = !v;
                setStatus(next ? "Starting live tracking…" : "Live tracking paused");
                return next;
              });
            }}
            className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold ${
              trackingOn
                ? "bg-emerald-500/20 text-emerald-200"
                : "border border-[var(--color-border)] text-[var(--color-muted)]"
            }`}
          >
            {trackingOn ? "Live tracking ON" : "Live tracking OFF"}
          </button>
          <button
            type="button"
            onClick={() => void subscribePush()}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-2 py-1 text-[11px] text-[var(--color-muted)]"
            title="Enable push so dispatch can wake this phone"
          >
            <Smartphone className="h-3 w-3" />
            Alerts
          </button>
        </div>
      </div>
      <p className="mt-1 text-[10px] text-[var(--color-muted)]">
        Add this site to your home screen and keep Live tracking ON during loads.
        Phones block GPS when the browser is fully closed — Dispatch will push/email
        you to reopen when they need a ping.
      </p>
    </div>
  );
}
