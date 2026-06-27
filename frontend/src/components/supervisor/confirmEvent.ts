// Build a `match.confirmed` event and submit it through the shared write-path.
// Human-in-the-loop: only ever called from an explicit supervisor action.
import { submitEvents } from "@/lib/cases";
import type { SetuEvent } from "@/lib/types";

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "ev-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export async function confirmMatch(
  caseId: string,
  matchedId: string,
  actor = "supervisor"
): Promise<{ delivered: boolean; queued: boolean }> {
  const ev: SetuEvent = {
    event_id: uuid(),
    type: "match.confirmed",
    case_id: caseId,
    ts: new Date().toISOString(),
    device_id: "device-1",
    actor,
    payload: { matched_id: matchedId },
  };
  return submitEvents([ev]);
}
