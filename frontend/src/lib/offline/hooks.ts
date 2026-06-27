// React hooks + a module-level connectivity watcher for the offline sync engine.
//
// Connectivity in Setu has TWO sources of truth that must BOTH agree we are up:
//   1. navigator.onLine            — the real browser/network signal.
//   2. useApp.online               — the demo toggle in the top nav (snan-day sim).
// We only attempt a flush when both say "online", and we flush the moment either
// transitions back to online.
"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/store/app";
import {
  flushOutbox,
  refreshPendingCount,
  useSyncStatus,
  pullCases,
} from "./sync";
import { dbAvailable } from "./db";

/** Real navigator.onLine, defaulting to true during SSR. */
function navOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
}

// ---------------------------------------------------------------------------
// Module-level watcher (runs once, independent of React mounting)
// ---------------------------------------------------------------------------
// Even if no component currently mounts useSync, we still want the outbox to
// drain the instant the device comes back online. We register native listeners
// once and keep them for the life of the tab.
let _watcherStarted = false;

function effectiveOnline(): boolean {
  // useApp is a zustand store: read its current snapshot without a subscription.
  const demoOnline = useApp.getState().online;
  return navOnline() && demoOnline;
}

async function maybeFlush(reason: string): Promise<void> {
  if (!dbAvailable()) return;
  if (!effectiveOnline()) return;
  void reason; // reserved for future logging
  await flushOutbox();
}

/**
 * Start the global connectivity watcher exactly once. Safe to call repeatedly.
 * Called from useSync() so it activates as soon as any page that cares mounts,
 * and also exported for explicit bootstrap.
 */
export function startSyncWatcher(): void {
  if (_watcherStarted || typeof window === "undefined") return;
  _watcherStarted = true;

  // Seed the pending badge from whatever is already queued.
  void refreshPendingCount();

  // Native online/offline events.
  window.addEventListener("online", () => void maybeFlush("navigator-online"));

  // The demo toggle: react to useApp.online flipping back to true.
  let prevDemo = useApp.getState().online;
  useApp.subscribe((state) => {
    if (state.online && !prevDemo) void maybeFlush("demo-online");
    prevDemo = state.online;
  });

  // One opportunistic flush on boot (in case we loaded already-online with a
  // queue left over from a previous offline session).
  void maybeFlush("bootstrap");
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** Live "are we effectively online" flag (navigator AND demo toggle). */
export function useOnline(): boolean {
  const demoOnline = useApp((s) => s.online);
  const [nav, setNav] = useState<boolean>(navOnline());

  useEffect(() => {
    const up = () => setNav(true);
    const down = () => setNav(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    setNav(navOnline());
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  return nav && demoOnline;
}

export interface SyncState {
  online: boolean;
  pending: number;
  syncing: boolean;
  lastError: string | null;
  lastSyncedAt: number | null;
  /** Force a flush attempt now (no-op if offline). */
  flushNow: () => Promise<void>;
}

/**
 * Primary sync hook. Wires connectivity -> flush, exposes the pending count and
 * sync status for badges, and triggers a flush whenever we transition online.
 * Mount it once near the top of any owned page (or via <SyncProvider/>).
 */
export function useSync(opts: { pullOnMount?: boolean } = {}): SyncState {
  const online = useOnline();
  const pending = useSyncStatus((s) => s.pending);
  const syncing = useSyncStatus((s) => s.syncing);
  const lastError = useSyncStatus((s) => s.lastError);
  const lastSyncedAt = useSyncStatus((s) => s.lastSyncedAt);

  // Ensure the global watcher is live.
  useEffect(() => {
    startSyncWatcher();
  }, []);

  // Flush whenever connectivity becomes available.
  useEffect(() => {
    if (online) void maybeFlush("hook-online");
  }, [online]);

  // Optionally warm the local mirror so reads work offline later.
  useEffect(() => {
    if (opts.pullOnMount && online) void pullCases({ limit: 500 });
  }, [opts.pullOnMount, online]);

  return {
    online,
    pending,
    syncing,
    lastError,
    lastSyncedAt,
    flushNow: () => maybeFlush("manual"),
  };
}
