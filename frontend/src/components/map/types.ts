// Shared types for the hotspot map layer.
import type {
  FeatureCollection,
  Polygon,
  MultiPolygon,
  Point,
} from "geojson";

// --- GeoJSON property shapes (from frontend/public/geo/*.json) ---
export interface ZoneProps {
  zone_id: string;
  name: string;
  camera_count: number;
  centroid: [number, number]; // [lng, lat]
}
export interface CameraProps {
  name: string;
  series?: string;
  zone_id: string;
}
export interface LandmarkProps {
  name: string;
  kind: string;
  category?: string;
}
export interface ChokepointProps {
  name: string;
  category: string;
  risk?: string;
  note?: string;
}
export interface PoliceProps {
  name: string;
  kind: string;
}

export type ZoneFC = FeatureCollection<Polygon | MultiPolygon, ZoneProps>;
export type CameraFC = FeatureCollection<Point, CameraProps>;
export type LandmarkFC = FeatureCollection<Point, LandmarkProps>;
export type ChokepointFC = FeatureCollection<Point, ChokepointProps>;
export type PoliceFC = FeatureCollection<Point, PoliceProps>;

// --- API shapes (backend geo service; may 501) ---
export interface Hotspot {
  name: string;
  lat: number;
  lng: number;
  score: number; // 0..1 normalised separation risk
  reports: number;
  category: string | null;
  zone_id: string | null;
}
export interface Kiosk {
  name: string;
  lat: number;
  lng: number;
  score: number; // priority = risk * coverage_deficit
  risk_score?: number;
  coverage_deficit?: number;
  reports?: number;
  nearest_help_m?: number;
  nearest_help?: string;
  why?: string;
  zone_id?: string | null;
}

export interface GeoData {
  zones: ZoneFC | null;
  cameras: CameraFC | null;
  landmarks: LandmarkFC | null;
  chokepoints: ChokepointFC | null;
  police: PoliceFC | null;
}

export type LayerKey =
  | "zones"
  | "coverage"
  | "cameras"
  | "hotspots"
  | "kiosks"
  | "chokepoints"
  | "police"
  | "landmarks";
