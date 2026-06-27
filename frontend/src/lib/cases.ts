// Write-path for cases. ONLINE-first today; the offline+map agent upgrades the
// internals to OFFLINE-first (Dexie mirror + outbox + Workbox background sync)
// WITHOUT changing these signatures, so the wizard never has to change.
import { api } from "./api";
import type { Case, SetuEvent } from "./types";

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
 * Submit one or more events. Returns whether they were queued locally (offline)
 * or delivered. The offline agent replaces the body with: write to Dexie outbox
 * first, then attempt sync; this stub goes straight to the network.
 */
export async function submitEvents(
  events: SetuEvent[]
): Promise<{ delivered: boolean; queued: boolean }> {
  try {
    await api.postEvents(events);
    return { delivered: true, queued: false };
  } catch {
    // online-first stub: surface failure. Offline agent will queue instead.
    return { delivered: false, queued: false };
  }
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
