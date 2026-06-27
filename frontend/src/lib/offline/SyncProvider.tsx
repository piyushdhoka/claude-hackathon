"use client";
//
// Drop-in client components for wiring the offline layer into a page.
//   <SwRegistrar/>  — registers public/sw.js (idempotent, no-op on SSR/unsupported).
//   <SyncProvider/> — mounts useSync() so the outbox drains on reconnect; renders
//                     nothing. Place once per page that should keep syncing.
//   <SyncBadge/>    — a small pill showing online state + pending/queued count.
//
// The root layout is frozen, so pages opt in by rendering these. The underlying
// connectivity watcher is global (startSyncWatcher), so a single mount anywhere
// keeps the queue flowing.
import { useEffect } from "react";
import { CloudOff, RefreshCw, CheckCircle2, Clock } from "lucide-react";
import { clsx } from "clsx";
import { useSync } from "./hooks";

/** Registers the hand-written service worker. Safe everywhere. */
export function SwRegistrar() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    // Register after load so it never competes with first paint.
    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch(() => {
          /* SW is a progressive enhancement; ignore failures (e.g. http dev). */
        });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
  return null;
}

/** Mounts the sync engine for this page. Renders nothing. */
export function SyncProvider({ pullOnMount = false }: { pullOnMount?: boolean }) {
  useSync({ pullOnMount });
  return null;
}

/** Visible status pill. Useful on owned pages (the Nav is frozen). */
export function SyncBadge({ className }: { className?: string }) {
  const { online, pending, syncing, lastSyncedAt } = useSync();

  let label: string;
  let Icon = CheckCircle2;
  let tone = "bg-teal/10 text-teal";

  if (!online) {
    Icon = CloudOff;
    tone = "bg-rose/10 text-rose";
    label = pending > 0 ? `Offline — ${pending} queued` : "Offline";
  } else if (syncing) {
    Icon = RefreshCw;
    tone = "bg-saffron/10 text-saffron-dark";
    label = "Syncing…";
  } else if (pending > 0) {
    Icon = Clock;
    tone = "bg-saffron/10 text-saffron-dark";
    label = `${pending} pending`;
  } else {
    Icon = CheckCircle2;
    tone = "bg-teal/10 text-teal";
    label = lastSyncedAt ? "All synced" : "Online";
  }

  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold",
        tone,
        className
      )}
      title={
        lastSyncedAt
          ? `Last synced ${new Date(lastSyncedAt).toLocaleTimeString()}`
          : "Offline-first: writes are queued locally and synced on reconnect"
      }
    >
      <Icon size={14} className={syncing ? "animate-spin" : undefined} />
      {label}
    </span>
  );
}
