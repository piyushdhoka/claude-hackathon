// Assemble a plain-language description of the case for the read-back step and
// for the case `description` field. Operator-facing English source; the wizard
// translates it for the spoken read-back when a non-English language is selected.
import { colorByKey, flagLabel, vocab } from "@/components/common/vocab";

export interface DraftCase {
  case_type: "missing" | "found";
  who_key?: string;
  gender?: string;
  age_band?: string;
  clothing_colors: string[]; // color keys
  clothing_type?: string;
  marks: string[];
  flags: string[]; // flag keys
  last_seen_location?: string;
  visual_description?: string | null;
}

export function buildDescription(d: DraftCase): string {
  const parts: string[] = [];
  const who =
    vocab.who_is_lost.find((w) => w.key === d.who_key)?.label ??
    [d.gender, d.age_band].filter(Boolean).join(" ");
  const subject = d.case_type === "found" ? "A found person" : "A missing person";
  parts.push(`${subject}${who ? `: ${who.toLowerCase()}` : ""}.`);

  if (d.age_band) parts.push(`Age about ${d.age_band}.`);

  const colors = d.clothing_colors.map((k) => colorByKey(k)?.label ?? k);
  if (colors.length || d.clothing_type) {
    const c = colors.length ? colors.join(" and ") + " " : "";
    parts.push(`Wearing ${c}${d.clothing_type ?? "clothes"}.`);
  }

  if (d.marks.length) parts.push(`Marks: ${d.marks.join(", ")}.`);
  if (d.flags.length) parts.push(`Note: ${d.flags.map(flagLabel).join(", ")}.`);
  if (d.last_seen_location) parts.push(`Last seen near ${d.last_seen_location}.`);
  if (d.visual_description) parts.push(d.visual_description);

  return parts.join(" ");
}
