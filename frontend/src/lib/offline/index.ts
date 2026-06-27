// Public surface of the Setu offline-first layer.
//
//   db.ts     — Dexie/IndexedDB schema (cases mirror + outbox).
//   sync.ts   — enqueue/flush engine + read mirror + status store.
//   hooks.ts  — React hooks (useSync/useOnline) + global connectivity watcher.
export { getDB, dbAvailable, type OutboxItem, type MirrorCase } from "./db";
export {
  enqueueEvents,
  flushOutbox,
  pullCases,
  readMirroredCases,
  readMirroredCase,
  refreshPendingCount,
  useSyncStatus,
} from "./sync";
export {
  useSync,
  useOnline,
  startSyncWatcher,
  type SyncState,
} from "./hooks";
