"use client";
// Structural scaffold for the tap-only intake wizard.
//   - MalaRail  : a flowing "river thread" progress track with rudraksha-bead
//                 dots the operator can tap to jump back; shows step N of M.
//   - StepHeader: a big localized prompt with a read-aloud button.
//   - WizardFooter: a sticky one-handed action bar that floats ABOVE the mobile
//                 bottom tab bar and respects the safe-area inset.
// All chrome is operator-facing; the pilgrim only watches the big content.
import type { ReactNode } from "react";
import { clsx } from "clsx";
import { ArrowLeft, ArrowRight, Volume2, Check } from "lucide-react";

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
  const total = steps.length;
  const pct = Math.round(((current + 1) / total) * 100);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wide text-muted">
        <span>
          Step {current + 1} of {total}
        </span>
        <span>{pct}%</span>
      </div>

      {/* flowing track with progress fill */}
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className="river-thread flow-thread absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* bead row — scrollable, tappable to jump back */}
      <div className="no-scrollbar -mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-0.5">
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
              aria-label={`Step ${i + 1}: ${s.label}`}
              className="shrink-0"
            >
              <span
                className={clsx(
                  "grid place-items-center rounded-full text-[11px] font-bold transition",
                  active
                    ? "h-7 w-7 scale-105 bg-saffron text-white shadow ring-4 ring-saffron/20"
                    : done
                      ? "h-6 w-6 bg-saffron/85 text-white"
                      : canJump
                        ? "h-6 w-6 bg-surface text-muted ring-1 ring-border"
                        : "h-5 w-5 bg-surface-2 text-muted/40 ring-1 ring-border"
                )}
              >
                {done ? <Check size={13} strokeWidth={3} /> : i + 1}
              </span>
            </button>
          );
        })}
      </div>
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
        <h2 className="font-display text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">
          {title}
        </h2>
        {hint && <p className="mt-1 text-base text-muted">{hint}</p>}
      </div>
      {canSpeak && onSpeak && (
        <button
          type="button"
          onClick={onSpeak}
          className={clsx(
            "grid h-12 w-12 shrink-0 place-items-center rounded-full transition active:scale-95",
            speaking ? "bg-indigo text-white shadow" : "bg-indigo/10 text-indigo"
          )}
          aria-label="Read this question aloud"
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
    <div
      className="sticky z-30 -mx-4 mt-2 border-t border-border bg-surface/92 px-4 py-3 backdrop-blur-md sm:mx-0 sm:rounded-2xl sm:border sm:px-5"
      style={{ bottom: "calc(var(--tabbar-h))" }}
    >
      <div className="mx-auto flex max-w-3xl items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={backDisabled}
          className="inline-flex h-12 items-center gap-2 rounded-2xl border border-border bg-surface px-4 font-bold text-foreground/80 transition active:scale-95 disabled:opacity-40"
        >
          <ArrowLeft size={18} /> <span className="hidden sm:inline">Back</span>
        </button>

        {optional && onSkip && (
          <button
            type="button"
            onClick={onSkip}
            className="h-12 rounded-2xl px-3 font-semibold text-muted underline-offset-2 hover:underline"
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
              className="inline-flex h-12 items-center gap-2 rounded-2xl bg-saffron px-7 text-lg font-bold text-white shadow-md transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {nextLabel} <ArrowRight size={20} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
