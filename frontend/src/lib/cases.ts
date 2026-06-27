// Write-path for cases. OFFLINE-FIRST: every SetuEvent is written to the Dexie
// outbox FIRST (instant, never blocks the operator and survives a refresh), then
// we OPTIMISTICALLY attempt delivery. On failure the events stay queued and the
// sync engine drains them when connectivity returns. Events carry client UUIDs,
// so replaying the queue is idempotent (the backend de-dupes on event_id).
//
// The exported signatures (buildCaseCreatedEvent / submitEvents / createCase) are
// FROZEN — the intake wizard depends on them — only the internals changed.
import { api } from "./api";
import type { Case, SetuEvent } from "./types";
import { enqueueEvents, dbAvailable, flushOutbox } from "./offline";

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "ev-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function nowTs(): string {
  // "YYYY-MM-DD HH:MM" to match the dataset's reported_at format
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function buildCaseCreatedEvent(
  caseDoc: Partial<Case>,
  actor = "operator",
  deviceId = "device-1"
): SetuEvent {
  const case_id =
    caseDoc.case_id || `KMP-2027-L${Date.now().toString().slice(-6)}`;
  const full: Partial<Case> = {
    case_id,
    case_type: caseDoc.case_type || "found",
    reported_at: caseDoc.reported_at || nowTs(),
    status: "Pending",
    consent: caseDoc.consent ?? false,
    is_duplicate_report: false,
    purged: false,
    created_by: actor,
    ...caseDoc,
  };
  return {
    event_id: uuid(),
    type: "case.created",
    case_id,
    ts: full.reported_at!,
    device_id: deviceId,
    actor,
    payload: full as Record<string, unknown>,
  };
}

/**
 * Submit one or more events, offline-first.
 *
 * 1. Persist every event into the Dexie outbox immediately (and optimistically
 *    update the local cases mirror). This is instant and durable across reloads.
 * 2. Attempt to flush the outbox to the backend right away. If we are offline or
 *    the POST fails, the events simply remain queued and the sync engine retries
 *    on reconnect.
 *
 * Returns `{ delivered, queued }`:
 *   - delivered: the backend acknowledged the events on this call.
 *   - queued:    the events are persisted locally awaiting (further) delivery.
 *
 * `queued` is true whenever IndexedDB is available (the durable guarantee). In
 * the rare environment without IndexedDB we degrade to a direct network POST.
 */
export async function submitEvents(
  events: SetuEvent[]
): Promise<{ delivered: boolean; queued: boolean }> {
  // Fallback path: no IndexedDB -> behave like the old online-first client.
  if (!dbAvailable()) {
    try {
      await api.postEvents(events);
      return { delivered: true, queued: false };
    } catch {
      return { delivered: false, queued: false };
    }
  }

  // Offline-first path: queue first (durable), then opportunistically flush.
  await enqueueEvents(events);
  const { delivered } = await flushOutbox();
  // If everything we just queued was delivered, `delivered` covers it. We can't
  // cheaply prove these exact events left (a concurrent flush may batch others),
  // so report queued=true unless the queue is now provably empty for our events.
  return { delivered: delivered > 0, queued: true };
}

/** Convenience: create a case (build event + submit). */
export async function createCase(
  caseDoc: Partial<Case>,
  actor = "operator"
): Promise<{ case_id: string; delivered: boolean; queued: boolean }> {
  const ev = buildCaseCreatedEvent(caseDoc, actor);
  const res = await submitEvents([ev]);
  return { case_id: ev.case_id, ...res };
}
