// Sync engine: drains the Dexie outbox to the backend, mirrors reads for offline.
//
// Design (offline-first, idempotent):
//   1. WRITE  — submitEvents() enqueues every SetuEvent into `outbox` FIRST
//                (instant, never blocks the operator) and optimistically applies
//                it to the local `cases` mirror so the UI updates immediately.
//   2. FLUSH  — flushOutbox() reads the queue oldest-first and POSTs in one batch
//                to api.postEvents. Events carry client UUIDs, so a partial or
//                duplicated delivery is harmless: the backend de-dupes on
//                event_id. Only items confirmed delivered are removed.
//   3. TRIGGER— the React hook (./hooks) calls flush whenever connectivity
//                returns (navigator.onLine OR the demo useApp.online toggle).
//
// A tiny zustand store exposes { pending, syncing, lastError, lastSyncedAt } so
// the UI can show a pending badge without prop-drilling.
import { create } from "zustand";
import { api } from "@/lib/api";
import type { Case, SetuEvent } from "@/lib/types";
import { getDB, dbAvailable, type MirrorCase, type OutboxItem } from "./db";

// ---------------------------------------------------------------------------
// Status store
// ---------------------------------------------------------------------------
interface SyncStatus {
  pending: number;
  syncing: boolean;
  lastError: string | null;
  lastSyncedAt: number | null;
  setPending: (n: number) => void;
  setSyncing: (s: boolean) => void;
  setLastError: (e: string | null) => void;
  setLastSyncedAt: (t: number) => void;
}

export const useSyncStatus = create<SyncStatus>((set) => ({
  pending: 0,
  syncing: false,
  lastError: null,
  lastSyncedAt: null,
  setPending: (pending) => set({ pending }),
  setSyncing: (syncing) => set({ syncing }),
  setLastError: (lastError) => set({ lastError }),
  setLastSyncedAt: (lastSyncedAt) => set({ lastSyncedAt }),
}));

/** Recompute the pending count from the DB and push it into the store. */
export async function refreshPendingCount(): Promise<number> {
  if (!dbAvailable()) return 0;
  const n = await getDB().outbox.count();
  useSyncStatus.getState().setPending(n);
  return n;
}

// ---------------------------------------------------------------------------
// Write path
// ---------------------------------------------------------------------------

/** Apply a `case.created` / update event onto the local mirror, optimistically. */
async function applyEventToMirror(ev: SetuEvent): Promise<void> {
  if (!dbAvailable()) return;
  const db = getDB();
  const existing = await db.cases.get(ev.case_id);
  // The payload for case.created is (a Partial of) the full Case projection.
  const patch = ev.payload as Partial<Case>;
  const merged: MirrorCase = {
    ...(existing ?? ({} as MirrorCase)),
    ...(patch as Case),
    case_id: ev.case_id,
    _mirrored_at: Date.now(),
  };
  await db.cases.put(merged);
}

/**
 * Enqueue events into the outbox (instant). Returns once persisted locally.
 * Callers (cases.ts) then trigger a flush attempt; failures stay queued.
 */
export async function enqueueEvents(events: SetuEvent[]): Promise<void> {
  if (!dbAvailable()) return;
  const db = getDB();
  const now = Date.now();
  const items: OutboxItem[] = events.map((event) => ({
    event_id: event.event_id,
    event,
    queued_at: now,
    attempts: 0,
    last_error: null,
  }));
  // bulkPut is idempotent on event_id — re-enqueuing the same event is a no-op
  // overwrite, never a duplicate row.
  await db.outbox.bulkPut(items);
  for (const ev of events) await applyEventToMirror(ev);
  await refreshPendingCount();
}

// ---------------------------------------------------------------------------
// Flush path
// ---------------------------------------------------------------------------
let _flushing = false;

/**
 * Drain the outbox to the backend. Safe to call repeatedly / concurrently
 * (guarded). Returns the number of events delivered. Throws nothing — errors
 * are captured into the status store and the items remain queued.
 */
export async function flushOutbox(): Promise<{ delivered: number; remaining: number }> {
  if (!dbAvailable()) return { delivered: 0, remaining: 0 };
  if (_flushing) return { delivered: 0, remaining: await getDB().outbox.count() };

  _flushing = true;
  const status = useSyncStatus.getState();
  status.setSyncing(true);
  const db = getDB();

  try {
    const items = await db.outbox.orderBy("queued_at").toArray();
    if (items.length === 0) {
      status.setLastError(null);
      return { delivered: 0, remaining: 0 };
    }

    const events = items.map((i) => i.event);
    try {
      // One batched POST. The backend is idempotent on event_id, so even if a
      // previous attempt partially succeeded, replaying the full batch is safe.
      await api.postEvents(events);
      // Confirmed delivered -> remove from queue.
      await db.outbox.bulkDelete(items.map((i) => i.event_id));
      status.setLastError(null);
      status.setLastSyncedAt(Date.now());
      const remaining = await db.outbox.count();
      status.setPending(remaining);
      return { delivered: events.length, remaining };
    } catch (err) {
      // Still offline / server down: keep everything queued, bump attempts.
      const msg = err instanceof Error ? err.message : String(err);
      await db.transaction("rw", db.outbox, async () => {
        for (const item of items) {
          await db.outbox.update(item.event_id, {
            attempts: item.attempts + 1,
            last_error: msg,
          });
        }
      });
      status.setLastError(msg);
      const remaining = await db.outbox.count();
      status.setPending(remaining);
      return { delivered: 0, remaining };
    }
  } finally {
    status.setSyncing(false);
    _flushing = false;
  }
}

// ---------------------------------------------------------------------------
// Pull path (mirror reads so the registry is browsable offline)
// ---------------------------------------------------------------------------

/**
 * Pull cases from the backend into the local mirror. Best-effort: on failure we
 * silently fall back to whatever is already mirrored.
 */
export async function pullCases(
  params: { case_type?: string; status?: string; limit?: number } = {},
  role?: "operator" | "supervisor"
): Promise<number> {
  if (!dbAvailable()) return 0;
  try {
    const cases = await api.listCases(params, role);
    const db = getDB();
    const now = Date.now();
    const rows: MirrorCase[] = cases.map((c) => ({ ...c, _mirrored_at: now }));
    await db.cases.bulkPut(rows);
    return rows.length;
  } catch {
    return 0;
  }
}

/** Read cases from the local mirror (works offline). */
export async function readMirroredCases(filter?: {
  case_type?: string;
  status?: string;
}): Promise<Case[]> {
  if (!dbAvailable()) return [];
  const db = getDB();
  let rows = await db.cases.toArray();
  if (filter?.case_type) rows = rows.filter((r) => r.case_type === filter.case_type);
  if (filter?.status) rows = rows.filter((r) => r.status === filter.status);
  // newest mirror first; strip the bookkeeping field on the way out.
  rows.sort((a, b) => b._mirrored_at - a._mirrored_at);
  return rows.map(({ _mirrored_at: _ignored, ...c }) => c);
}

/** Read a single mirrored case (works offline). */
export async function readMirroredCase(caseId: string): Promise<Case | null> {
  if (!dbAvailable()) return null;
  const row = await getDB().cases.get(caseId);
  if (!row) return null;
  const { _mirrored_at: _ignored, ...c } = row;
  return c;
}
