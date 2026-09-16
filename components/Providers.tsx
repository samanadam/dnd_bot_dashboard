"use client";

import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { BotError } from "@/lib/bot/client";

let toastCounter = 0;

type Toast = { id: number; tone: "ok" | "danger"; message: string };

const ToastContext = createContext<(tone: Toast["tone"], message: string) => void>(() => {});

export const useToast = () => useContext(ToastContext);

export function Providers({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((tone: Toast["tone"], message: string) => {
    const id = ++toastCounter;
    setToasts((current) => [...current.slice(-3), { id, tone, message }]);
    setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), tone === "danger" ? 7000 : 3500);
  }, []);

  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { refetchOnWindowFocus: true, staleTime: 2_000 } },
        // Every failed action is reported. Bot messages (409 in particular)
        // are operator-written and safe to show verbatim; React escapes them.
        mutationCache: new MutationCache({
          onError: (error) => {
            if (error instanceof BotError && error.status === 401) return;
            push("danger", error instanceof BotError ? error.message : "Something went wrong.");
          },
        }),
      }),
  );

  const value = useMemo(() => push, [push]);

  return (
    <QueryClientProvider client={client}>
      <ToastContext.Provider value={value}>
        {children}
        <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-16 z-50 flex flex-col items-center gap-2 p-4 lg:top-auto lg:bottom-0 lg:pb-[max(1rem,env(safe-area-inset-bottom))]">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              role={toast.tone === "danger" ? "alert" : "status"}
              className={`pointer-events-auto flex max-w-md items-center gap-2.5 rounded-2xl border bg-surface-3/95 px-4 py-3 text-sm shadow-card backdrop-blur ${
                toast.tone === "danger" ? "border-danger/40 text-text" : "border-ok/40 text-text"
              }`}
            >
              <span className={`size-2 shrink-0 rounded-full ${toast.tone === "danger" ? "bg-danger" : "bg-ok"}`} aria-hidden />
              {toast.message}
            </div>
          ))}
        </div>
      </ToastContext.Provider>
    </QueryClientProvider>
  );
}
