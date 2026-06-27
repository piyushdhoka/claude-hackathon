"use client";
// F4 — Family self-search. A walk-in family describes their lost person with
// tap-only inputs (no typing/literacy needed); we run that partial description
// through the SAME match engine against the pool of FOUND people and show ranked,
// masked candidates. The brief's core cross-center reunion path, family-driven.
import { useState } from "react";
import { Loader2, Search, Users, MapPin, Building2, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { useApp } from "@/store/app";
import type { MatchCandidate } from "@/lib/types";
import { TapCard, TapGrid, Swatch, Chip } from "@/components/common/ui";

const GENDERS = ["Female", "Male", "Unknown"];
const AGE_BANDS = ["0-12", "13-17", "18-40", "41-60", "61-70", "71-80", "80+"];
const COLORS: { label: string; hex: string }[] = [
  { label: "White", hex: "#F8F8F8" },
  { label: "Saffron", hex: "#E2660F" },
  { label: "Green", hex: "#2E7D32" },
  { label: "Red", hex: "#C62828" },
  { label: "Blue", hex: "#1565C0" },
  { label: "Yellow", hex: "#F2C200" },
  { label: "Black", hex: "#1c1917" },
  { label: "Pink", hex: "#D81B60" },
];
const LOCATIONS = [
  "Ramkund Ghat",
  "Panchavati Circle",
  "Trimbakeshwar Approach",
  "Madsangvi Transit",
  "Nashik Road Station",
  "Takli Sangam",
];

export default function FamilyPage() {
  const { language } = useApp();
  const [gender, setGender] = useState<string>("");
  const [ageBand, setAgeBand] = useState<string>("");
  const [colors, setColors] = useState<string[]>([]);
  const [location, setLocation] = useState<string>("");

  const [results, setResults] = useState<MatchCandidate[] | null>(null);
  const [loading, setLoading] = useState(false);

  const canSearch = gender || ageBand || location || colors.length > 0;

  function toggleColor(label: string) {
    setColors((c) => (c.includes(label) ? c.filter((x) => x !== label) : [...c, label]));
  }

  async function search() {
    if (!canSearch) return;
    setLoading(true);
    setResults(null);
    const payload: Record<string, unknown> = { language };
    if (gender) payload.gender = gender;
    if (ageBand) payload.age_band = ageBand;
    if (location) payload.last_seen_location = location;
    if (colors.length) payload.clothing_colors = colors.map((c) => c.toLowerCase());
    try {
      setResults(await api.searchFamily(payload, 8));
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="animate-rise">
        <div className="flex items-center gap-3">
          <h1 className="flex items-center gap-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-saffron/12 text-saffron-dark">
              <Users size={20} />
            </span>
            Find my family member
          </h1>
          <span className="river-rule hidden flex-1 sm:block" />
        </div>
        <p className="mt-1 text-sm text-muted sm:text-base">
          Tap what you remember. We search everyone <b>found</b> at every center.
        </p>
      </header>

      {/* gender */}
      <Section title="Who is lost?">
        <TapGrid cols={3}>
          {GENDERS.map((g) => (
            <TapCard key={g} label={g} selected={gender === g} onClick={() => setGender(g === gender ? "" : g)} />
          ))}
        </TapGrid>
      </Section>

      {/* age */}
      <Section title="About how old?">
        <TapGrid cols={4}>
          {AGE_BANDS.map((a) => (
            <TapCard key={a} label={a} selected={ageBand === a} onClick={() => setAgeBand(a === ageBand ? "" : a)} />
          ))}
        </TapGrid>
      </Section>

      {/* clothing colors */}
      <Section title="Clothing colour">
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {COLORS.map((c) => (
            <Swatch key={c.label} hex={c.hex} label={c.label} selected={colors.includes(c.label)} onClick={() => toggleColor(c.label)} />
          ))}
        </div>
      </Section>

      {/* last seen */}
      <Section title="Where last seen?">
        <div className="flex flex-wrap gap-2.5">
          {LOCATIONS.map((l) => (
            <Chip key={l} label={l} selected={location === l} onClick={() => setLocation(l === location ? "" : l)} />
          ))}
        </div>
      </Section>

      <button
        type="button"
        onClick={search}
        disabled={!canSearch || loading}
        className="inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl bg-saffron px-6 text-base font-bold text-white shadow-md active:scale-95 disabled:opacity-50 sm:w-auto"
      >
        {loading ? <Loader2 size={20} className="animate-spin" /> : <Search size={20} />}
        Search found persons
      </button>

      {/* results */}
      {results && (
        <Section title={`Possible matches · ${results.length}`}>
          {results.length === 0 ? (
            <p className="rounded-2xl border-2 border-dashed border-border bg-surface p-8 text-center text-muted">
              <Sparkles size={28} className="mx-auto mb-2 text-saffron/50" />
              No found person matches yet. They may not be registered — try fewer details, or
              check back as new people are found.
            </p>
          ) : (
            <ul className="space-y-2.5 stagger">
              {results.map((m, i) => {
                const c = m.case || {};
                return (
                  <li key={m.case_id} className="rounded-2xl border-2 border-border bg-surface p-4 shadow-sm">
                    <div className="flex items-center gap-3">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-teal text-white">
                        <Users size={20} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-x-2 font-bold">
                          {c.name || "Found person"}
                          <span className="text-sm font-medium text-muted">
                            {c.gender} · {c.age_band}
                          </span>
                        </p>
                        <p className="flex flex-wrap items-center gap-x-3 text-sm text-muted">
                          {c.last_seen_location && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin size={13} /> {c.last_seen_location}
                            </span>
                          )}
                          {c.reporting_center && (
                            <span className="inline-flex items-center gap-1">
                              <Building2 size={13} /> {c.reporting_center}
                            </span>
                          )}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-saffron/12 px-3 py-1 text-sm font-bold text-saffron-dark">
                        {Math.round(m.score)}%
                      </span>
                    </div>
                    {i === 0 && (
                      <p className="mt-2 rounded-xl bg-teal/5 p-2.5 text-xs font-medium text-teal">
                        Best match — take this code to a supervisor to confirm and reveal contact.
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{title}</h2>
        <span className="river-rule flex-1" />
      </div>
      {children}
    </section>
  );
}
