// Supervisor lifecycle actions, all through the shared offline-first write-path.
// Human-in-the-loop: only ever called from explicit supervisor actions.
//
//   confirmMatch  -> records `match.confirmed` (audit) AND reunites BOTH cases
//                    (`case.reunited` flips each to status "Reunited").
//   purgeCase     -> `case.purged` drops PII (name/mobile/photo/description) from
//                    the projection — the post-reunion "privacy by design" step.
import { submitEvents } from "@/lib/cases";
import type { SetuEvent } from "@/lib/types";

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "ev-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function ev(type: string, caseId: string, actor: string, payload: Record<string, unknown> = {}): SetuEvent {
  return {
    event_id: uuid(),
    type,
    case_id: caseId,
    ts: new Date().toISOString(),
    device_id: "device-1",
    actor,
    payload,
  };
}

/** Confirm a match: log it, and reunite BOTH the query case and the matched case. */
export async function confirmMatch(
  caseId: string,
  matchedId: string,
  actor = "supervisor"
): Promise<{ delivered: boolean; queued: boolean }> {
  return submitEvents([
    ev("match.confirmed", caseId, actor, { matched_id: matchedId }),
    ev("case.reunited", caseId, actor, { matched_id: matchedId }),
    ev("case.reunited", matchedId, actor, { matched_id: caseId }),
  ]);
}

/** Post-reunion privacy purge: drop PII from both reunited cases. */
export async function purgeCase(
  caseId: string,
  matchedId?: string,
  actor = "supervisor"
): Promise<{ delivered: boolean; queued: boolean }> {
  const events = [ev("case.purged", caseId, actor)];
  if (matchedId) events.push(ev("case.purged", matchedId, actor));
  return submitEvents(events);
}
