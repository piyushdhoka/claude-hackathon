"use client";
// Shared, large-target UI primitives for the operator-driven, non-literate flow.
// Built on the "Ghat Light" tokens (saffron / indigo / teal / rose on warm
// sandstone) but composed for big tap zones, icon/photo/colour-first cards and a
// tactile, app-like feel. Every interactive target is >=48px.
import { clsx } from "clsx";
import { Volume2, Check } from "lucide-react";
import type { ReactNode } from "react";

/* ---- big selectable tap card ---- */
export function TapCard({
  selected,
  onClick,
  icon,
  label,
  sub,
  accent,
  big,
  className,
}: {
  selected?: boolean;
  onClick?: () => void;
  icon?: ReactNode;
  label: ReactNode;
  sub?: ReactNode;
  accent?: string; // optional accent color (hex)
  big?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={clsx(
        "group relative flex flex-col items-center justify-center gap-2 rounded-3xl border-2 bg-surface text-center shadow-sm transition duration-150 active:scale-[0.97]",
        big ? "p-6 min-h-44" : "p-5 min-h-32",
        selected
          ? "border-saffron shadow-md ring-4 ring-saffron/15"
          : "border-border hover:-translate-y-0.5 hover:border-saffron/50 hover:shadow-md",
        className
      )}
      style={
        accent && selected
          ? { borderColor: accent, boxShadow: `0 0 0 4px ${accent}22` }
          : undefined
      }
    >
      {selected && (
        <span
          className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-full bg-saffron text-white shadow animate-pop"
          style={accent ? { backgroundColor: accent } : undefined}
        >
          <Check size={16} strokeWidth={3} />
        </span>
      )}
      {icon && (
        <span
          className="grid place-items-center text-foreground/85 transition group-hover:scale-105"
          style={accent ? { color: accent } : undefined}
        >
          {icon}
        </span>
      )}
      <span className={clsx("font-bold leading-tight", big ? "text-xl" : "text-lg")}>
        {label}
      </span>
      {sub && <span className="text-sm font-medium text-muted">{sub}</span>}
    </button>
  );
}

export function TapGrid({
  children,
  cols = 3,
}: {
  children: ReactNode;
  cols?: 2 | 3 | 4;
}) {
  return (
    <div
      className={clsx(
        "grid gap-3 sm:gap-4 stagger",
        cols === 2 && "grid-cols-2",
        cols === 3 && "grid-cols-2 sm:grid-cols-3",
        cols === 4 && "grid-cols-2 sm:grid-cols-4"
      )}
    >
      {children}
    </div>
  );
}

/* ---- color swatch chip ---- */
export function Swatch({
  hex,
  label,
  selected,
  onClick,
}: {
  hex: string;
  label: string;
  selected?: boolean;
  onClick?: () => void;
}) {
  const light = ["#F8F8F8", "#F2C200", "#9E9E9E", "#ffffff", "#fff"].includes(
    hex.toLowerCase?.() ?? hex
  );
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={clsx(
        "relative flex flex-col items-center gap-2 rounded-3xl border-2 p-3 transition active:scale-[0.96]",
        selected
          ? "border-foreground/70 ring-4 ring-foreground/10"
          : "border-border hover:border-foreground/30"
      )}
    >
      <span
        className="grid h-16 w-16 place-items-center rounded-2xl shadow-inner"
        style={{ backgroundColor: hex, border: "1px solid rgba(0,0,0,.08)" }}
      >
        {selected && (
          <Check size={26} strokeWidth={3} color={light ? "#1c1917" : "#fff"} />
        )}
      </span>
      <span className="text-sm font-semibold">{label}</span>
    </button>
  );
}

/* ---- chip toggle (marks / flags / clothing) ---- */
export function Chip({
  selected,
  onClick,
  icon,
  label,
}: {
  selected?: boolean;
  onClick?: () => void;
  icon?: ReactNode;
  label: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={clsx(
        "flex min-h-13 items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left text-base font-semibold transition active:scale-[0.97]",
        selected
          ? "border-saffron bg-saffron/10 text-saffron-dark ring-2 ring-saffron/20"
          : "border-border bg-surface hover:border-saffron/40"
      )}
    >
      {icon && (
        <span className="grid h-9 w-9 shrink-0 place-items-center text-2xl">{icon}</span>
      )}
      <span className="leading-tight">{label}</span>
      {selected && <Check size={18} strokeWidth={3} className="ml-auto text-saffron" />}
    </button>
  );
}

/* ---- speak (read-back) button ---- */
export function SpeakButton({
  onClick,
  speaking,
  disabled,
  label = "Listen",
}: {
  onClick: () => void;
  speaking?: boolean;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        "inline-flex min-h-11 items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition active:scale-95",
        disabled
          ? "cursor-not-allowed bg-surface-2 text-muted"
          : speaking
            ? "bg-indigo text-white shadow"
            : "bg-indigo/10 text-indigo hover:bg-indigo/20"
      )}
    >
      <Volume2 size={18} className={speaking ? "animate-pulse" : ""} />
      {speaking ? "Speaking…" : label}
    </button>
  );
}
