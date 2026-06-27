// Confidence banding for a MatchCandidate score (0..100). Pure, shared by the
// review screen, the supervisor console and the post-FOUND match flash so the
// language stays consistent everywhere.

export type ConfidenceLevel = "high" | "possible" | "weak";

export interface ConfidenceBand {
  level: ConfidenceLevel;
  label: string; // human label
  // Tailwind utility fragments for the band pill / accents.
  pill: string;
  dot: string;
  ring: string;
  hex: string;
}

export function bandForScore(score: number): ConfidenceBand {
  if (score >= 72) {
    return {
      level: "high",
      label: "High confidence",
      pill: "bg-teal/10 text-teal border-teal/30",
      dot: "bg-teal",
      ring: "ring-teal/30",
      hex: "#0f766e",
    };
  }
  if (score >= 45) {
    return {
      level: "possible",
      label: "Possible match",
      pill: "bg-saffron/10 text-saffron-dark border-saffron/30",
      dot: "bg-saffron",
      ring: "ring-saffron/30",
      hex: "#ea7317",
    };
  }
  return {
    level: "weak",
    label: "Weak — review carefully",
    pill: "bg-muted/10 text-muted border-border",
    dot: "bg-muted",
    ring: "ring-border",
    hex: "#78716c",
  };
}

// Friendly labels for the per-feature contribution keys the engine returns.
const FEATURE_LABELS: Record<string, string> = {
  gender: "Gender",
  age_band: "Age",
  age: "Age",
  last_seen_location: "Last seen place",
  location: "Location",
  clothing_colors: "Clothing colour",
  clothing_color: "Clothing colour",
  clothing_type: "Clothing type",
  marks: "Distinguishing marks",
  mobility_confusion_flags: "Behaviour / condition",
  name: "Name",
  language: "Language",
  visual: "Photo (vision)",
  visual_description: "Photo (vision)",
  face: "Face match",
  description: "Description",
  build: "Build",
  hair: "Hair",
  complexion: "Complexion",
  headwear: "Headwear",
  footwear: "Footwear",
  accessories: "Accessories",
};

export function featureLabel(key: string): string {
  return (
    FEATURE_LABELS[key] ??
    key
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
  );
}
