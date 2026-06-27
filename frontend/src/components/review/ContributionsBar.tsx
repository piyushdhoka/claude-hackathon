"use client";
// Per-feature CONTRIBUTIONS breakdown for a MatchCandidate. Renders a single
// stacked "why this score" bar plus a labelled legend with each feature's points.
// Visual/face contributions are surfaced when the engine includes them.
import { featureLabel } from "./confidence";

// A small, fixed palette keyed by feature so the same feature reads the same
// colour across candidates. Falls back through the cycle for unknown keys.
const PALETTE = [
  "#ea7317", // saffron
  "#3730a3", // indigo
  "#0f766e", // teal
  "#be123c", // rose
  "#6366f1", // indigo-light
  "#c25d0c", // saffron-dark
  "#9333ea",
  "#0891b2",
];

function colorFor(key: string, index: number): string {
  // Distinguish the enrichment features with their semantic colours.
  if (key.startsWith("visual") || key === "face") return "#3730a3";
  return PALETTE[index % PALETTE.length];
}

export function ContributionsBar({
  contributions,
  compact = false,
}: {
  contributions: Record<string, number> | undefined | null;
  compact?: boolean;
}) {
  const entries = Object.entries(contributions ?? {})
    .filter(([, v]) => typeof v === "number" && v !== 0)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));

  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted">
        No per-feature breakdown available for this candidate.
      </p>
    );
  }

  const total = entries.reduce((s, [, v]) => s + Math.max(0, v), 0) || 1;

  return (
    <div className="space-y-3">
      {/* Stacked bar */}
      <div
        className="flex h-4 w-full overflow-hidden rounded-full bg-background ring-1 ring-border"
        role="img"
        aria-label="Score contribution breakdown"
      >
        {entries.map(([key, value], i) => {
          if (value <= 0) return null;
          const pct = (value / total) * 100;
          return (
            <span
              key={key}
              title={`${featureLabel(key)}: ${value.toFixed(0)}`}
              style={{ width: `${pct}%`, backgroundColor: colorFor(key, i) }}
            />
          );
        })}
      </div>

      {/* Legend */}
      {!compact && (
        <ul className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
          {entries.map(([key, value], i) => (
            <li key={key} className="flex items-center gap-2 text-sm">
              <span
                className="inline-block h-3 w-3 shrink-0 rounded-sm"
                style={{ backgroundColor: colorFor(key, i) }}
              />
              <span className="font-medium">{featureLabel(key)}</span>
              <span
                className={`ml-auto font-mono text-xs font-semibold ${
                  value < 0 ? "text-rose" : "text-foreground/70"
                }`}
              >
                {value > 0 ? "+" : ""}
                {value.toFixed(0)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
