// Setu offline store (Dexie / IndexedDB).
//
// Two tables make the console work fully offline on snan days:
//   - `cases`  : a local *mirror* of the registry so reads work with no backend.
//   - `outbox` : append-only queue of pending SetuEvents waiting to be POSTed.
//
// The event log is the source of truth (see ARCHITECTURE.md). Every event carries
// a client UUID (`event_id`), so replaying the outbox after reconnect is safe and
// idempotent — the backend de-dupes on event_id.
import Dexie, { type Table } from "dexie";
import type { Case, SetuEvent } from "@/lib/types";

/** A queued event plus local bookkeeping for the sync engine. */
export interface OutboxItem {
  /** Same value as the wrapped event's event_id — the idempotency key. */
  event_id: string;
  event: SetuEvent;
  /** epoch ms when first enqueued. */
  queued_at: number;
  /** how many flush attempts have been made (for backoff / diagnostics). */
  attempts: number;
  /** last error message, if the most recent flush failed. */
  last_error?: string | null;
}

/** A mirrored case + the epoch ms it was last written locally. */
export interface MirrorCase extends Case {
  _mirrored_at: number;
}

class SetuDB extends Dexie {
  cases!: Table<MirrorCase, string>;
  outbox!: Table<OutboxItem, string>;

  constructor() {
    super("setu-offline");
    this.version(1).stores({
      // Primary key + a few indexes used by offline reads/filters.
      cases: "case_id, case_type, status, reporting_center, _mirrored_at",
      outbox: "event_id, queued_at, case_id",
    });
  }
}

/**
 * Lazily-created singleton. We avoid constructing Dexie during SSR / build:
 * IndexedDB only exists in the browser. Server-side callers get a thrown error
 * if they touch it, but in practice every caller is a client component / hook.
 */
let _db: SetuDB | null = null;

export function getDB(): SetuDB {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") {
    throw new Error("Setu offline DB is only available in the browser.");
  }
  if (!_db) _db = new SetuDB();
  return _db;
}

/** True when IndexedDB is usable (browser, not a locked-down context). */
export function dbAvailable(): boolean {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}
