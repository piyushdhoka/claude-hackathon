"use client";
// Icon resolvers for clothing types and distinguishing marks. We lean on
// lucide-react for generic shapes and fall back to a friendly emoji glyph when a
// concept (saree, tilak, rudraksha) has no clean line icon. Always paired with a
// label, so the emoji is reinforcement, not the sole signal.
import { Shirt, Glasses, Briefcase, Baby, Ear, Footprints } from "lucide-react";
import type { ReactNode } from "react";

function Emoji({ char, size = 32 }: { char: string; size?: number }) {
  return (
    <span style={{ fontSize: size, lineHeight: 1 }} aria-hidden>
      {char}
    </span>
  );
}

const CLOTHING: Record<string, ReactNode> = {
  kurta: <Shirt />,
  saree: <Emoji char="🥻" />,
  "silk saree": <Emoji char="🥻" />,
  dhoti: <Emoji char="🩲" />,
  "dhoti kurta": <Emoji char="🧎" />,
  shirt: <Shirt />,
  "full pants shirt": <Emoji char="👔" />,
  "school dress": <Emoji char="🎒" />,
  "school uniform": <Emoji char="🎒" />,
  vest: <Emoji char="🦺" />,
  frock: <Emoji char="👗" />,
  burqa: <Emoji char="🧕" />,
};

const MARKS: Record<string, ReactNode> = {
  "rudraksha mala": <Emoji char="📿" />,
  tilak: <Emoji char="🔺" />,
  bindi: <Emoji char="🔴" />,
  spectacles: <Glasses />,
  "walking stick": <Emoji char="🦯" />,
  "hearing aid": <Ear />,
  turban: <Emoji char="👳" />,
  bag: <Briefcase />,
  "widow marks": <Emoji char="🤍" />,
  bald: <Emoji char="👴" />,
  "grey hair": <Emoji char="🧓" />,
  pigtails: <Emoji char="👧" />,
};

const FLAGS: Record<string, ReactNode> = {
  memory_loss: <Emoji char="🧠" />,
  asks_for_landmark: <Emoji char="📍" />,
  hard_of_hearing: <Ear />,
  cannot_speak: <Emoji char="🤐" />,
  crying: <Emoji char="😢" />,
  has_child: <Baby />,
};

export const clothingGlyph = (k: string): ReactNode => CLOTHING[k] ?? <Shirt />;
export const markGlyph = (k: string): ReactNode => MARKS[k] ?? <Emoji char="✨" />;
export const flagGlyph = (k: string): ReactNode => FLAGS[k] ?? <Footprints />;
