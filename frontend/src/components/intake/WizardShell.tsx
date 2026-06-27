"use client";
// Structural scaffold for the tap-only intake wizard. Provides:
//   - a "mala" progress rail (rudraksha-bead dots) the operator can tap to jump
//   - a big step header with the localized prompt + a read-aloud button
//   - a sticky footer with Back / Next (or a custom primary action)
// All chrome here is operator-facing; the pilgrim only watches the big content.
import type { ReactNode } from "react";
import { clsx } from "clsx";
import { ArrowLeft, ArrowRight, Volume2 } from "lucide-react";

export function MalaRail({
  steps,
  current,
  reachable,
  onJump,
}: {
  steps: { key: string; label: string }[];
  current: number;
  reachable: number; // furthest step the operator may jump to
  onJump: (i: number) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        const canJump = i <= reachable;
        return (
          <button
            key={s.key}
            type="button"
            disabled={!canJump}
            onClick={() => canJump && onJump(i)}
            title={s.label}
            className="group flex shrink-0 items-center gap-1.5"
          >
            <span
              className={clsx(
                "grid h-7 w-7 place-items-center rounded-full text-xs font-bold transition",
                active
                  ? "scale-110 bg-saffron text-white shadow ring-4 ring-saffron/20"
                  : done
                    ? "bg-saffron/80 text-white"
                    : canJump
                      ? "bg-card text-muted ring-1 ring-border"
                      : "bg-background text-muted/50 ring-1 ring-border"
              )}
            >
              {i + 1}
            </span>
            {i < steps.length - 1 && (
              <span className={clsx("h-0.5 w-3 rounded", done ? "bg-saffron/60" : "bg-border")} />
            )}
          </button>
        );
      })}
    </div>
  );
}

export function StepHeader({
  title,
  hint,
  onSpeak,
  canSpeak,
  speaking,
}: {
  title: string;
  hint?: string;
  onSpeak?: () => void;
  canSpeak?: boolean;
  speaking?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex-1">
        <h2 className="text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">{title}</h2>
        {hint && <p className="mt-1 text-base text-muted">{hint}</p>}
      </div>
      {canSpeak && onSpeak && (
        <button
          type="button"
          onClick={onSpeak}
          className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-indigo/10 text-indigo transition active:scale-95"
          aria-label="Read aloud"
        >
          <Volume2 size={22} className={speaking ? "animate-pulse" : ""} />
        </button>
      )}
    </div>
  );
}

export function WizardFooter({
  onBack,
  onNext,
  nextLabel = "Next",
  nextDisabled,
  backDisabled,
  optional,
  onSkip,
  primary,
}: {
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  backDisabled?: boolean;
  optional?: boolean;
  onSkip?: () => void;
  primary?: ReactNode; // override the right-hand action entirely
}) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 mt-2 flex items-center gap-3 border-t border-border bg-background/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
      <button
        type="button"
        onClick={onBack}
        disabled={backDisabled}
        className="inline-flex items-center gap-2 rounded-2xl border-2 border-border bg-card px-5 py-3 font-bold text-foreground/80 transition active:scale-95 disabled:opacity-40"
      >
        <ArrowLeft size={18} /> Back
      </button>

      {optional && onSkip && (
        <button
          type="button"
          onClick={onSkip}
          className="rounded-2xl px-3 py-3 font-semibold text-muted underline-offset-2 hover:underline"
        >
          Skip
        </button>
      )}

      <div className="ml-auto">
        {primary ?? (
          <button
            type="button"
            onClick={onNext}
            disabled={nextDisabled}
            className="inline-flex items-center gap-2 rounded-2xl bg-saffron px-7 py-3 text-lg font-bold text-white shadow transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {nextLabel} <ArrowRight size={20} />
          </button>
        )}
      </div>
    </div>
  );
}
