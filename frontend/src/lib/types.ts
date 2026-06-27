// Shared types mirroring backend/app/models.py. Keep in sync.

export type CaseType = "missing" | "found";

export type CaseStatus =
  | "Pending"
  | "Matched"
  | "Reunited"
  | "Transferred to hospital"
  | "Unresolved"
  | "Duplicate";

export interface Attributes {
  clothing_colors: string[];
  clothing_type?: string | null;
  marks: string[];
  mobility_confusion_flags: string[];
  apparent_gender?: string | null;
  apparent_age_band?: string | null;
  desc_quality?: string | null;
  contradicts_structured: boolean;
  // Visual features (from Claude vision analysis of a photo)
  build?: string | null;
  hair?: string | null;
  complexion?: string | null;
  headwear?: string | null;
  footwear?: string | null;
  accessories?: string[];
  visual_quality?: string | null;
  source?: string | null;
}

export interface Case {
  case_id: string;
  case_type: CaseType;
  reported_at: string;
  reporting_center: string;
  name?: string | null;
  gender: string;
  age_band: string;
  state?: string | null;
  district?: string | null;
  language?: string | null;
  mobile?: string | null; // masked unless supervisor
  last_seen_location?: string | null;
  lat?: number | null;
  lng?: number | null;
  zone_id?: string | null;
  description?: string | null;
  visual_description?: string | null;
  attributes: Attributes;
  photo_ref?: string | null;
  status: CaseStatus;
  resolution_hours?: number | null;
  is_duplicate_report: boolean;
  remarks?: string | null;
  consent: boolean;
  created_by?: string | null;
  purged: boolean;
}

export interface MatchCandidate {
  case_id: string;
  score: number; // 0..100
  contributions: Record<string, number>;
  rationale?: string | null;
  case?: Partial<Case> | null;
}

// Append-only event = the sync unit and the audit trail.
export interface SetuEvent {
  event_id: string; // client UUID (idempotent)
  type: string;
  case_id: string;
  ts: string;
  device_id?: string | null;
  actor?: string | null;
  payload: Record<string, unknown>;
}

export type Role = "operator" | "supervisor";

// ── Feature-extension types (mirror the new backend routers) ──────────────

// F3 — triage queue item: a Case annotated by app/triage/service.py
export interface TriageItem extends Case {
  vulnerability: number; // 0..1
  eta_hours: number | null;
  sla_breach: boolean;
}

// F2 — CCTV search corridor (app/geo/corridor.py)
export interface CorridorCamera {
  camera_id: string;
  lat: number;
  lng: number;
  distance_m: number;
  on_corridor: boolean;
  score: number;
}
export interface CorridorResult {
  origin: { lat: number; lng: number; zone_id: string | null; last_seen_location: string };
  drift_target: { name: string; lat: number; lng: number; category: string } | null;
  cameras: CorridorCamera[];
}

// F5 — reunion handoff routing (app/geo/route.py)
export interface HandoffPoint {
  name: string;
  kind: string; // "police" | "center"
  lat: number;
  lng: number;
  distance_m: number;
  bearing_deg: number;
  heading: string; // N / NE / E ...
}
export interface HandoffResult {
  origin: { lat: number; lng: number; zone_id: string | null; location: string };
  destination: HandoffPoint;
  options: HandoffPoint[];
}

// F1 — SMS/IVR notify-on-match (app/notify/service.py)
export interface NotifyResult {
  sent: boolean;
  reason?: string;
  channel?: string;
  masked_to: string | null;
  language?: string;
  message?: string;
}

// F6 — claim-fraud guard (app/claim/service.py)
export interface ClaimVerdict {
  claim_id?: string | null;
  case_id?: string | null;
  risk: number;
  band: "clear" | "review" | "block";
  flags: string[];
  requires_guardian_consent: boolean;
  requires_supervisor: boolean;
  allow_auto_reveal: boolean;
}
