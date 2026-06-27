"use client";
// Searchable, filterable list of cases (open by default). The operator taps a
// case to drive the match search. Photo/colour-first row with the key facts.
import { useMemo, useState } from "react";
import { clsx } from "clsx";
import { Search, MapPin, User, ChevronRight, Building2 } from "lucide-react";
import type { Case } from "@/lib/types";

export function CaseFilters({
  value,
  onChange,
}: {
  value: { case_type: string; q: string };
  onChange: (v: { case_type: string; q: string }) => void;
}) {
  const tabs = [
    { key: "", label: "All" },
    { key: "missing", label: "Missing" },
    { key: "found", label: "Found" },
  ];
  return (
    <div className="space-y-3">
      <div className="relative">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
        <input
          value={value.q}
          onChange={(e) => onChange({ ...value, q: e.target.value })}
          placeholder="Search by name, place, ID…"
          className="w-full rounded-2xl border-2 border-border bg-surface py-3.5 pl-11 pr-4 text-base outline-none transition focus:border-saffron"
        />
      </div>
      <div className="flex gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange({ ...value, case_type: t.key })}
            className={clsx(
              "min-h-10 rounded-full px-4 py-2 text-sm font-bold transition active:scale-95",
              value.case_type === t.key
                ? "bg-saffron text-white shadow-sm"
                : "bg-surface text-muted ring-1 ring-border hover:bg-surface-2"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function CaseList({
  cases,
  selectedId,
  onSelect,
  filter,
}: {
  cases: Case[];
  selectedId?: string | null;
  onSelect: (c: Case) => void;
  filter: { case_type: string; q: string };
}) {
  const filtered = useMemo(() => {
    const q = filter.q.trim().toLowerCase();
    return cases.filter((c) => {
      if (filter.case_type && c.case_type !== filter.case_type) return false;
      if (!q) return true;
      return [c.name, c.last_seen_location, c.case_id, c.reporting_center, c.description]
        .filter(Boolean)
        .some((s) => String(s).toLowerCase().includes(q));
    });
  }, [cases, filter]);

  if (filtered.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border bg-surface p-6 text-center text-muted">
        No cases match. Try a different filter.
      </p>
    );
  }

  return (
    <ul className="max-h-[70vh] space-y-2 overflow-y-auto pr-0.5 lg:max-h-[calc(100vh-13rem)]">
      {filtered.map((c) => (
        <li key={c.case_id}>
          <button
            type="button"
            onClick={() => onSelect(c)}
            className={clsx(
              "flex w-full items-center gap-3 rounded-2xl border-2 bg-surface p-3 text-left transition active:scale-[0.99]",
              selectedId === c.case_id
                ? "border-saffron ring-2 ring-saffron/20"
                : "border-border hover:border-saffron/40"
            )}
          >
            <span
              className={clsx(
                "grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white",
                c.case_type === "found" ? "bg-teal" : "bg-rose"
              )}
            >
              <User size={20} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="truncate font-bold">{c.name || "Unnamed"}</span>
                <span
                  className={clsx(
                    "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase",
                    c.case_type === "found" ? "bg-teal/10 text-teal" : "bg-rose/10 text-rose"
                  )}
                >
                  {c.case_type}
                </span>
              </span>
              <span className="flex items-center gap-2 text-xs text-muted">
                <span>{c.gender} · {c.age_band}</span>
                {c.last_seen_location && (
                  <span className="inline-flex items-center gap-0.5 truncate">
                    <MapPin size={11} /> {c.last_seen_location}
                  </span>
                )}
              </span>
              {c.reporting_center && (
                <span className="mt-0.5 flex items-center gap-1 truncate text-[11px] font-medium text-muted/80">
                  <Building2 size={10} /> {c.reporting_center}
                </span>
              )}
            </span>
            <ChevronRight size={18} className="shrink-0 text-muted" />
          </button>
        </li>
      ))}
    </ul>
  );
}
