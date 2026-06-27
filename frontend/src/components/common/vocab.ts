// Typed access to the tap-vocabulary contract (src/data/wizard_vocab.json).
// Centralizes the shapes so wizard steps stay terse and type-safe.
import raw from "@/data/wizard_vocab.json";

export interface LangOption {
  code: string;
  label: string;
  native: string;
}
export interface WhoOption {
  key: string;
  label: string;
  gender: string;
  age_hint: string;
  icon: string;
}
export interface ColorOption {
  key: string;
  label: string;
  hex: string;
}
export interface FlagOption {
  key: string;
  label: string;
}

interface VocabShape {
  languages: LangOption[];
  who_is_lost: WhoOption[];
  age_bands: string[];
  clothing_colors: ColorOption[];
  clothing_types: string[];
  marks: string[];
  mobility_confusion_flags: FlagOption[];
  last_seen_locations: string[];
  centers: string[];
  genders: string[];
}

export const vocab = raw as unknown as VocabShape;

export const langName = (code: string): string =>
  vocab.languages.find((l) => l.code === code)?.label ?? "English";

export const colorByKey = (key: string): ColorOption | undefined =>
  vocab.clothing_colors.find((c) => c.key === key);

export const flagLabel = (key: string): string =>
  vocab.mobility_confusion_flags.find((f) => f.key === key)?.label ?? key;
