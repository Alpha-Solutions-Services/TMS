"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import clsx from "clsx";

type ToastKind = "success" | "error" | "info";

type Toast = {
  id: string;
  kind: ToastKind;
  title: string;
  message?: string;
};

type ConfirmOpts = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

type UiContextValue = {
  toast: (opts: { kind?: ToastKind; title: string; message?: string }) => void;
  confirm: (opts: ConfirmOpts) => Promise<boolean>;
};

const UiContext = createContext<UiContextValue | null>(null);

export function useUi() {
  const ctx = useContext(UiContext);
  if (!ctx) throw new Error("useUi must be used within UiProvider");
  return ctx;
}

/** Safe hook when provider may be missing during early render */
export function useUiOptional() {
  return useContext(UiContext);
}

export function UiProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<
    (ConfirmOpts & { resolve: (v: boolean) => void }) | null
  >(null);

  const toast = useCallback(
    (opts: { kind?: ToastKind; title: string; message?: string }) => {
      const id = crypto.randomUUID();
      setToasts((t) => [
        ...t,
        {
          id,
          kind: opts.kind || "info",
          title: opts.title,
          message: opts.message,
        },
      ]);
      window.setTimeout(() => {
        setToasts((t) => t.filter((x) => x.id !== id));
      }, 4200);
    },
    []
  );

  const confirm = useCallback((opts: ConfirmOpts) => {
    return new Promise<boolean>((resolve) => {
      setConfirmState({ ...opts, resolve });
    });
  }, []);

  const value = useMemo(() => ({ toast, confirm }), [toast, confirm]);

  return (
    <UiContext.Provider value={value}>
      {children}

      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-4 sm:items-end"
        aria-live="polite"
      >
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              className={clsx(
                "pointer-events-auto flex w-full max-w-sm gap-3 rounded-xl border px-4 py-3 shadow-[var(--glow-sm)] backdrop-blur-md",
                t.kind === "success" &&
                  "border-emerald-500/30 bg-[var(--color-surface)]/95",
                t.kind === "error" &&
                  "border-red-500/35 bg-[var(--color-surface)]/95",
                t.kind === "info" &&
                  "border-[var(--color-border-glow)] bg-[var(--color-surface)]/95"
              )}
            >
              {t.kind === "success" ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
              ) : t.kind === "error" ? (
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
              ) : (
                <Info className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-accent)]" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[var(--color-text)]">
                  {t.title}
                </p>
                {t.message ? (
                  <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                    {t.message}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                className="shrink-0 rounded-lg p-1 text-[var(--color-muted)] hover:bg-[var(--color-accent-dim)] hover:text-[var(--color-text)]"
                onClick={() =>
                  setToasts((list) => list.filter((x) => x.id !== t.id))
                }
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {confirmState ? (
          <motion.div
            className="fixed inset-0 z-[110] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
          >
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              className="w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--glow-md)]"
            >
              <div className="mb-3 flex items-start gap-3">
                <div
                  className={clsx(
                    "rounded-xl p-2",
                    confirmState.danger
                      ? "bg-red-500/10 text-red-400"
                      : "bg-[var(--color-accent-dim)] text-[var(--color-accent)]"
                  )}
                >
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <h2
                    id="confirm-title"
                    className="text-lg font-semibold text-[var(--color-text)]"
                    style={{ fontFamily: "var(--font-display), sans-serif" }}
                  >
                    {confirmState.title}
                  </h2>
                  <p className="mt-1 text-sm text-[var(--color-muted)]">
                    {confirmState.message}
                  </p>
                </div>
              </div>
              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  className="rounded-xl border border-[var(--color-border)] px-4 py-2.5 text-sm font-medium text-[var(--color-muted)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text)]"
                  onClick={() => {
                    confirmState.resolve(false);
                    setConfirmState(null);
                  }}
                >
                  {confirmState.cancelLabel || "Cancel"}
                </button>
                <button
                  type="button"
                  className={clsx(
                    "rounded-xl px-4 py-2.5 text-sm font-semibold",
                    confirmState.danger
                      ? "bg-red-500 text-white hover:bg-red-400"
                      : "bg-[var(--color-accent)] text-[#05080f] hover:brightness-110"
                  )}
                  onClick={() => {
                    confirmState.resolve(true);
                    setConfirmState(null);
                  }}
                >
                  {confirmState.confirmLabel || "Confirm"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </UiContext.Provider>
  );
}
