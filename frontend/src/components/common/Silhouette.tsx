"use client";
// Hand-built pictographic silhouettes for the "who is lost" step. Photo-first /
// icon-first for non-literate pilgrims: each figure reads instantly as a person
// type by posture, hair and props (stick, sari pallu, pigtails). Stroke-only so
// they sit calmly on the warm-sand canvas and tint via `color`.
import type { CSSProperties } from "react";

type Props = { size?: number; color?: string; className?: string; style?: CSSProperties };

const wrap = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 64 64",
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 2.4,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

export function ElderMan({ size = 56, color = "currentColor", className, style }: Props) {
  return (
    <svg {...wrap(size)} className={className} style={{ color, ...style }} aria-hidden>
      <circle cx="28" cy="15" r="8" />
      <path d="M20 13c0-6 16-6 16 0" /> {/* short hair */}
      <path d="M28 23v18" />
      <path d="M18 32c4-4 16-4 20 0" /> {/* shoulders/arms */}
      <path d="M28 41l-6 16M28 41l5 16" /> {/* legs */}
      <path d="M44 26v32" /> {/* walking stick */}
      <path d="M40 26h8" />
    </svg>
  );
}

export function ElderWoman({ size = 56, color = "currentColor", className, style }: Props) {
  return (
    <svg {...wrap(size)} className={className} style={{ color, ...style }} aria-hidden>
      <circle cx="30" cy="15" r="8" />
      <path d="M22 12c2-7 14-7 16 0c1 4-2 8-2 8" /> {/* bun/dupatta */}
      <path d="M30 23v6" />
      <path d="M19 52c0-16 22-16 22 0z" /> {/* sari drape */}
      <path d="M30 29l-9 8M30 29l9 8" />
      <path d="M14 24l8 6" /> {/* pallu/stick hint */}
    </svg>
  );
}

export function Man({ size = 56, color = "currentColor", className, style }: Props) {
  return (
    <svg {...wrap(size)} className={className} style={{ color, ...style }} aria-hidden>
      <circle cx="32" cy="14" r="8" />
      <path d="M32 22v20" />
      <path d="M20 30c6-5 18-5 24 0" />
      <path d="M32 42l-7 16M32 42l7 16" />
    </svg>
  );
}

export function Woman({ size = 56, color = "currentColor", className, style }: Props) {
  return (
    <svg {...wrap(size)} className={className} style={{ color, ...style }} aria-hidden>
      <circle cx="32" cy="14" r="8" />
      <path d="M24 11c0-7 16-7 16 0c0 5-3 9-3 9" /> {/* long hair */}
      <path d="M32 22v6" />
      <path d="M21 54c0-18 22-18 22 0z" /> {/* dress/lehenga */}
      <path d="M32 28l-10 8M32 28l10 8" />
    </svg>
  );
}

export function Boy({ size = 56, color = "currentColor", className, style }: Props) {
  return (
    <svg {...wrap(size)} className={className} style={{ color, ...style }} aria-hidden>
      <circle cx="32" cy="18" r="7" />
      <path d="M32 25v16" />
      <path d="M23 31c5-4 13-4 18 0" />
      <path d="M32 41l-5 13M32 41l5 13" />
    </svg>
  );
}

export function Girl({ size = 56, color = "currentColor", className, style }: Props) {
  return (
    <svg {...wrap(size)} className={className} style={{ color, ...style }} aria-hidden>
      <circle cx="32" cy="18" r="7" />
      <path d="M25 16l-5 4M39 16l5 4" /> {/* pigtails */}
      <path d="M32 25v4" />
      <path d="M24 52c0-15 16-15 16 0z" /> {/* frock */}
      <path d="M32 29l-8 6M32 29l8 6" />
    </svg>
  );
}

export function Unsure({ size = 56, color = "currentColor", className, style }: Props) {
  return (
    <svg {...wrap(size)} className={className} style={{ color, ...style }} aria-hidden>
      <circle cx="32" cy="32" r="22" strokeDasharray="3 5" />
      <path d="M26 26c0-4 4-7 7-6c4 1 5 5 2 8c-2 2-3 3-3 6" />
      <circle cx="32" cy="44" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

const MAP: Record<string, (p: Props) => React.ReactElement> = {
  "elder-man": ElderMan,
  "elder-woman": ElderWoman,
  man: Man,
  woman: Woman,
  boy: Boy,
  girl: Girl,
  question: Unsure,
};

export function Silhouette({ icon, ...rest }: Props & { icon: string }) {
  const C = MAP[icon] ?? Unsure;
  return <C {...rest} />;
}
