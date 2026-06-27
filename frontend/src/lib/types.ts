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
  desc_quality?: string | null;
  contradicts_structured: boolean;
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
