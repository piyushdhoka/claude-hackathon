"use client";
// The tap-only, multilingual, voice-guided intake wizard (LOST + FOUND modes).
//
// Flow: mode -> language -> who -> age -> clothing colour -> clothing type ->
//   marks -> mobility/confusion -> last-seen location -> PHOTO+VISION ->
//   optional voice note -> optional name/mobile -> spoken read-back -> confirm.
//
// Designed for phoneless, non-literate, elderly pilgrims: the OPERATOR drives the
// touch device; the pilgrim only points and speaks. Big targets, icon+photo+
// colour-first, voice read-back. Name & mobile are OPTIONAL.
import { useCallback, useEffect, useMemo, useState } from "react";
import { clsx } from "clsx";
import {
  Search as SearchIcon,
  UserPlus,
  CheckCircle2,
  Loader2,
  Phone,
  Tag,
  X,
  PartyPopper,
  WifiOff,
} from "lucide-react";

import { useApp } from "@/store/app";
import { api } from "@/lib/api";
import { createCase } from "@/lib/cases";
import type { Case, MatchCandidate } from "@/lib/types";

import { vocab, colorByKey } from "@/components/common/vocab";
import { Silhouette } from "@/components/common/Silhouette";
import { TapCard, TapGrid, Swatch, Chip, SpeakButton } from "@/components/common/ui";
import { clothingGlyph, markGlyph, flagGlyph } from "@/components/common/glyphs";
import { useI18n } from "@/components/common/useI18n";
import { useSpeech } from "@/components/common/useSpeech";

import { MalaRail, StepHeader, WizardFooter } from "./WizardShell";
import { PhotoVisionStep, type VisionResult } from "./PhotoVisionStep";
import { VoiceNoteStep, type VoiceNote } from "./VoiceNoteStep";
import { buildDescription, type DraftCase } from "./summary";
import { MatchCard } from "@/components/review/MatchCard";

type StepKey =
  | "mode"
  | "language"
  | "who"
  | "age"
  | "colors"
  | "clothing"
  | "marks"
  | "flags"
  | "location"
  | "photo"
  | "voice"
  | "contact"
  | "review";

const STEP_ORDER: { key: StepKey; titleKey: string }[] = [
  { key: "mode", titleKey: "Lost someone, or found someone?" },
  { key: "language", titleKey: "Which language does the person speak?" },
  { key: "who", titleKey: "Who are we looking for?" },
  { key: "age", titleKey: "About how old?" },
  { key: "colors", titleKey: "What colour clothes?" },
  { key: "clothing", titleKey: "What kind of clothes?" },
  { key: "marks", titleKey: "Any marks or things they carry?" },
  { key: "flags", titleKey: "How are they behaving?" },
  { key: "location", titleKey: "Where were they last seen?" },
  { key: "photo", titleKey: "Take or upload a photo" },
  { key: "voice", titleKey: "Record a short voice note (optional)" },
  { key: "contact", titleKey: "Name and phone (optional)" },
  { key: "review", titleKey: "Check, listen, and confirm" },
];

// English source labels we localize as a batch.
const UI_STRINGS: Record<string, string> = Object.fromEntries(
  STEP_ORDER.map((s) => [`title_${s.key}`, s.titleKey])
);

export function IntakeWizard() {
  const { center, language, setLanguage } = useApp();
  const online = useApp((s) => s.online);

  // ---- draft state ----
  const [mode, setMode] = useState<"missing" | "found" | null>(null);
  const [whoKey, setWhoKey] = useState<string | null>(null);
  const [gender, setGender] = useState<string | null>(null);
  const [ageBand, setAgeBand] = useState<string | null>(null);
  const [colors, setColors] = useState<string[]>([]);
  const [clothingType, setClothingType] = useState<string | null>(null);
  const [marks, setMarks] = useState<string[]>([]);
  const [flags, setFlags] = useState<string[]>([]);
  const [location, setLocation] = useState<string | null>(null);
  const [vision, setVision] = useState<VisionResult | null>(null);
  const [voice, setVoice] = useState<VoiceNote | null>(null);
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [consent, setConsent] = useState(true);

  const [stepIdx, setStepIdx] = useState(0);
  const [maxReached, setMaxReached] = useState(0);

  // submission + post-found match
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<{ case_id: string; queued: boolean } | null>(null);
  const [matches, setMatches] = useState<MatchCandidate[] | null>(null);
  const [matchLoading, setMatchLoading] = useState(false);

  const { tr } = useI18n(language, UI_STRINGS);
  const speech = useSpeech(language);

  const step = STEP_ORDER[stepIdx];

  const goto = useCallback((i: number) => {
    setStepIdx(i);
    setMaxReached((m) => Math.max(m, i));
  }, []);
  const next = useCallback(() => goto(Math.min(stepIdx + 1, STEP_ORDER.length - 1)), [goto, stepIdx]);
  const back = useCallback(() => goto(Math.max(stepIdx - 1, 0)), [goto, stepIdx]);

  // selecting "who" sets gender + a default age band hint
  const pickWho = useCallback(
    (key: string) => {
      const w = vocab.who_is_lost.find((x) => x.key === key);
      setWhoKey(key);
      if (w) {
        setGender(w.gender);
        if (w.age_hint && w.age_hint !== "Unknown" && !ageBand) setAgeBand(w.age_hint);
      }
      next();
    },
    [ageBand, next]
  );

  const toggle = (arr: string[], v: string, set: (a: string[]) => void) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  // assembled, plain-language description for read-back + the case
  const draft: DraftCase = useMemo(
    () => ({
      case_type: mode ?? "found",
      who_key: whoKey ?? undefined,
      gender: gender ?? undefined,
      age_band: ageBand ?? undefined,
      clothing_colors: colors,
      clothing_type: clothingType ?? undefined,
      marks,
      flags,
      last_seen_location: location ?? undefined,
      visual_description: vision?.visual_description ?? null,
    }),
    [mode, whoKey, gender, ageBand, colors, clothingType, marks, flags, location, vision]
  );
  const description = useMemo(() => buildDescription(draft), [draft]);

  // localize the read-back text once on the review step (best-effort)
  const [spoken, setSpoken] = useState(description);
  useEffect(() => {
    if (step.key !== "review") return;
    setSpoken(description);
    if (language === "en") return;
    let cancelled = false;
    api
      .translate({ desc: description }, language)
      .then((r) => !cancelled && r?.strings?.desc && setSpoken(r.strings.desc))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [step.key, description, language]);

  // build the merged attributes (taps + vision) for the case
  const buildCaseDoc = useCallback((): Partial<Case> => {
    const v = (vision?.attributes ?? {}) as Record<string, unknown>;
    const accessories = Array.isArray(v.accessories) ? (v.accessories as string[]) : [];
    return {
      case_type: mode ?? "found",
      gender: gender ?? "Unknown",
      age_band: ageBand ?? "Unknown",
      last_seen_location: location ?? null,
      language,
      description,
      visual_description: vision?.visual_description ?? null,
      reporting_center: center,
      name: name.trim() || null,
      mobile: mobile.trim() || null,
      consent,
      attributes: {
        clothing_colors: colors,
        clothing_type: clothingType ?? null,
        marks,
        mobility_confusion_flags: flags,
        apparent_gender: gender ?? null,
        apparent_age_band: ageBand ?? null,
        contradicts_structured: false,
        // merged vision fields
        build: (v.build as string) ?? null,
        hair: (v.hair as string) ?? null,
        complexion: (v.complexion as string) ?? null,
        headwear: (v.headwear as string) ?? null,
        footwear: (v.footwear as string) ?? null,
        accessories,
        visual_quality: (v.visual_quality as string) ?? null,
        source: vision ? "tap+vision" : "tap",
      },
    };
  }, [
    mode, gender, ageBand, location, language, description, vision, center, name, mobile,
    consent, colors, clothingType, marks, flags,
  ]);

  const submit = useCallback(async () => {
    setSubmitting(true);
    const doc = buildCaseDoc();
    try {
      const res = await createCase(doc, "operator");
      setCreated({ case_id: res.case_id, queued: res.queued });
      // After a FOUND submit, immediately search the missing registry.
      if ((mode ?? "found") === "found") {
        setMatchLoading(true);
        try {
          const cands = await api.match(doc, "missing", 5);
          setMatches(cands);
        } catch {
          setMatches([]);
        } finally {
          setMatchLoading(false);
        }
      }
    } catch {
      // createCase swallows network errors and returns queued=false; if it threw,
      // still show a created-but-offline state so the operator isn't blocked.
      setCreated({ case_id: "(queued offline)", queued: true });
    } finally {
      setSubmitting(false);
    }
  }, [buildCaseDoc, mode]);

  // ---- success screen (after confirm) ----
  if (created) {
    return (
      <SuccessScreen
        created={created}
        mode={mode ?? "found"}
        matches={matches}
        matchLoading={matchLoading}
        query={buildCaseDoc()}
        language={language}
        online={online}
      />
    );
  }

  // ---- per-step validity (Next gating) ----
  const canNext = ((): boolean => {
    switch (step.key) {
      case "mode":
        return !!mode;
      case "who":
        return !!whoKey;
      case "age":
        return !!ageBand;
      // every other step is optional / has its own action
      default:
        return true;
    }
  })();

  const optionalStep = ["colors", "clothing", "marks", "flags", "photo", "voice", "contact"].includes(
    step.key
  );

  return (
    <div className="space-y-6">
      {/* progress mala */}
      <MalaRail
        steps={STEP_ORDER.map((s) => ({ key: s.key, label: tr(`title_${s.key}`) }))}
        current={stepIdx}
        reachable={maxReached}
        onJump={goto}
      />

      <StepHeader
        title={tr(`title_${step.key}`)}
        onSpeak={() => speech.speak(tr(`title_${step.key}`))}
        canSpeak={speech.supported}
        speaking={speech.speaking}
      />

      {/* ---- STEP CONTENT ---- */}
      <div className="min-h-[18rem]">
        {step.key === "mode" && (
          <TapGrid cols={2}>
            <TapCard
              big
              selected={mode === "missing"}
              onClick={() => setMode("missing")}
              icon={<SearchIcon size={44} className="text-rose" />}
              label="I lost someone"
              sub="Report a missing person"
            />
            <TapCard
              big
              selected={mode === "found"}
              onClick={() => setMode("found")}
              icon={<UserPlus size={44} className="text-teal" />}
              label="I found someone"
              sub="Register a found person"
            />
          </TapGrid>
        )}

        {step.key === "language" && (
          <TapGrid cols={3}>
            {vocab.languages.map((l) => (
              <TapCard
                key={l.code}
                selected={language === l.code}
                onClick={() => {
                  setLanguage(l.code);
                  next();
                }}
                label={<span className="text-2xl">{l.native}</span>}
                sub={l.label}
              />
            ))}
          </TapGrid>
        )}

        {step.key === "who" && (
          <TapGrid cols={3}>
            {vocab.who_is_lost.map((w) => (
              <TapCard
                key={w.key}
                selected={whoKey === w.key}
                onClick={() => pickWho(w.key)}
                icon={<Silhouette icon={w.icon} size={56} />}
                label={w.label}
              />
            ))}
          </TapGrid>
        )}

        {step.key === "age" && (
          <TapGrid cols={4}>
            {vocab.age_bands.map((a) => (
              <TapCard
                key={a}
                selected={ageBand === a}
                onClick={() => {
                  setAgeBand(a);
                  next();
                }}
                label={<span className="text-2xl">{a}</span>}
                sub="years"
              />
            ))}
          </TapGrid>
        )}

        {step.key === "colors" && (
          <>
            <p className="mb-3 text-sm text-muted">Tap all that apply.</p>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
              {vocab.clothing_colors.map((c) => (
                <Swatch
                  key={c.key}
                  hex={c.hex}
                  label={c.label}
                  selected={colors.includes(c.key)}
                  onClick={() => toggle(colors, c.key, setColors)}
                />
              ))}
            </div>
          </>
        )}

        {step.key === "clothing" && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {vocab.clothing_types.map((t) => (
              <Chip
                key={t}
                selected={clothingType === t}
                onClick={() => setClothingType(clothingType === t ? null : t)}
                icon={clothingGlyph(t)}
                label={t}
              />
            ))}
          </div>
        )}

        {step.key === "marks" && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {vocab.marks.map((m) => (
              <Chip
                key={m}
                selected={marks.includes(m)}
                onClick={() => toggle(marks, m, setMarks)}
                icon={markGlyph(m)}
                label={m}
              />
            ))}
          </div>
        )}

        {step.key === "flags" && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {vocab.mobility_confusion_flags.map((f) => (
              <Chip
                key={f.key}
                selected={flags.includes(f.key)}
                onClick={() => toggle(flags, f.key, setFlags)}
                icon={flagGlyph(f.key)}
                label={f.label}
              />
            ))}
          </div>
        )}

        {step.key === "location" && (
          <TapGrid cols={3}>
            {vocab.last_seen_locations.map((loc) => (
              <TapCard
                key={loc}
                selected={location === loc}
                onClick={() => setLocation(location === loc ? null : loc)}
                label={<span className="text-base">{loc}</span>}
              />
            ))}
          </TapGrid>
        )}

        {step.key === "photo" && (
          <PhotoVisionStep
            language={language}
            gender={gender ?? undefined}
            ageBand={ageBand ?? undefined}
            value={vision}
            onChange={setVision}
          />
        )}

        {step.key === "voice" && <VoiceNoteStep value={voice} onChange={setVoice} />}

        {step.key === "contact" && (
          <div className="max-w-md space-y-5">
            <p className="rounded-xl bg-saffron/10 p-3 text-sm font-medium text-saffron-dark">
              Both are optional. Many pilgrims have no phone — skip if unknown.
            </p>
            <label className="block">
              <span className="mb-1 flex items-center gap-2 text-sm font-bold text-muted">
                <Tag size={15} /> Name (if known)
              </span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Ramesh"
                className="w-full rounded-2xl border-2 border-border bg-card p-4 text-lg outline-none focus:border-saffron"
              />
            </label>
            <label className="block">
              <span className="mb-1 flex items-center gap-2 text-sm font-bold text-muted">
                <Phone size={15} /> Mobile (if known)
              </span>
              <input
                value={mobile}
                onChange={(e) => setMobile(e.target.value.replace(/[^\d+ ]/g, ""))}
                inputMode="tel"
                placeholder="+91 …"
                className="w-full rounded-2xl border-2 border-border bg-card p-4 text-lg outline-none focus:border-saffron"
              />
            </label>
            <label className="flex items-start gap-3 rounded-2xl border-2 border-border bg-card p-4">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-1 h-6 w-6 accent-saffron"
              />
              <span className="text-sm">
                <span className="font-bold">Consent given</span> to store these details for
                reunification. Contact is revealed only to a supervisor on a confirmed match.
              </span>
            </label>
          </div>
        )}

        {step.key === "review" && (
          <ReviewStep
            draft={draft}
            description={description}
            spoken={spoken}
            speech={speech}
            name={name}
            mobile={mobile}
            center={center}
            visionImg={vision?.image_b64 ?? null}
          />
        )}
      </div>

      {/* ---- FOOTER ---- */}
      {step.key === "review" ? (
        <WizardFooter
          onBack={back}
          primary={
            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-2xl bg-teal px-8 py-3 text-lg font-bold text-white shadow transition active:scale-95 disabled:opacity-60"
            >
              {submitting ? <Loader2 size={20} className="animate-spin" /> : <CheckCircle2 size={20} />}
              Confirm &amp; save
            </button>
          }
        />
      ) : (
        <WizardFooter
          onBack={back}
          backDisabled={stepIdx === 0}
          onNext={next}
          nextDisabled={!canNext}
          optional={optionalStep}
          onSkip={next}
        />
      )}
    </div>
  );
}

/* ---------- review step body ---------- */
function ReviewStep({
  draft,
  description,
  spoken,
  speech,
  name,
  mobile,
  center,
  visionImg,
}: {
  draft: DraftCase;
  description: string;
  spoken: string;
  speech: ReturnType<typeof useSpeech>;
  name: string;
  mobile: string;
  center: string;
  visionImg: string | null;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 rounded-3xl border-2 border-border bg-card p-5 sm:flex-row">
        {visionImg && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={visionImg}
            alt="Captured"
            className="aspect-[3/4] w-32 shrink-0 rounded-2xl border border-border object-cover"
          />
        )}
        <div className="flex-1 space-y-3">
          <div className="flex flex-wrap gap-2">
            <Pill label={draft.case_type === "found" ? "FOUND" : "MISSING"} tone={draft.case_type === "found" ? "teal" : "rose"} />
            {draft.gender && <Pill label={draft.gender} />}
            {draft.age_band && <Pill label={`${draft.age_band} yrs`} />}
            {draft.clothing_colors.map((k) => (
              <span
                key={k}
                className="inline-flex items-center gap-1.5 rounded-full bg-background px-2.5 py-1 text-sm font-semibold ring-1 ring-border"
              >
                <span
                  className="h-3.5 w-3.5 rounded-full ring-1 ring-black/10"
                  style={{ backgroundColor: colorByKey(k)?.hex }}
                />
                {colorByKey(k)?.label}
              </span>
            ))}
            {draft.clothing_type && <Pill label={draft.clothing_type} />}
            {draft.marks.map((m) => (
              <Pill key={m} label={m} />
            ))}
          </div>
          <p className="text-lg leading-relaxed">{description}</p>
          <p className="text-sm text-muted">
            {name ? `Name: ${name}. ` : "No name. "}
            {mobile ? `Mobile on file. ` : "No mobile. "}
            Center: {center}.
          </p>
        </div>
      </div>

      {/* spoken read-back */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-indigo/20 bg-indigo/5 p-4">
        <SpeakButton
          onClick={() => speech.speak(spoken)}
          speaking={speech.speaking}
          disabled={!speech.supported}
          label="Read this aloud to the person"
        />
        {!speech.supported && (
          <span className="text-sm text-muted">
            Voice read-back is not available on this device — please read it out yourself.
          </span>
        )}
        {speech.supported && !speech.voiceForLang && (
          <span className="text-sm text-muted">
            No voice for this language — using the closest available voice.
          </span>
        )}
      </div>
    </div>
  );
}

function Pill({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "teal" | "rose" }) {
  return (
    <span
      className={clsx(
        "rounded-full px-2.5 py-1 text-sm font-bold ring-1",
        tone === "teal" && "bg-teal/10 text-teal ring-teal/30",
        tone === "rose" && "bg-rose/10 text-rose ring-rose/30",
        tone === "neutral" && "bg-background text-foreground/80 ring-border"
      )}
    >
      {label}
    </span>
  );
}

/* ---------- success + post-found match flash ---------- */
function SuccessScreen({
  created,
  mode,
  matches,
  matchLoading,
  query,
  language,
  online,
}: {
  created: { case_id: string; queued: boolean };
  mode: "missing" | "found";
  matches: MatchCandidate[] | null;
  matchLoading: boolean;
  query: Partial<Case>;
  language: string;
  online: boolean;
}) {
  return (
    <div className="space-y-6">
      <div className="rounded-3xl border-2 border-teal/40 bg-teal/5 p-6 text-center">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-teal text-white shadow">
          <PartyPopper size={32} />
        </span>
        <h2 className="mt-3 text-2xl font-extrabold">Saved</h2>
        <p className="mt-1 text-muted">
          Case <span className="font-mono font-bold text-foreground">{created.case_id}</span>{" "}
          registered at this center.
        </p>
        {created.queued && (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-saffron/10 px-3 py-1 text-sm font-semibold text-saffron-dark">
            <WifiOff size={14} /> Saved offline — will sync when back online.
          </p>
        )}
      </div>

      {/* QR SLOT — <CaseToken/> (owned by another agent, components/token) drops in here */}
      <section
        data-slot="case-token"
        className="rounded-3xl border-2 border-dashed border-indigo/40 bg-indigo/5 p-6 text-center"
      >
        <p className="text-sm font-bold uppercase tracking-wide text-indigo">Case token (QR)</p>
        <p className="mt-1 text-sm text-muted">
          The printable QR token for case{" "}
          <span className="font-mono font-semibold">{created.case_id}</span> appears here.
        </p>
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {/* <CaseToken caseId={created.case_id} /> — injected by the token agent */}
      </section>

      {/* FOUND -> immediate match against the missing registry */}
      {mode === "found" && (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <h3 className="text-xl font-bold">Possible matches in the missing registry</h3>
            {matchLoading && <Loader2 size={18} className="animate-spin text-muted" />}
          </div>

          {!online && (
            <p className="rounded-xl bg-saffron/10 p-3 text-sm text-saffron-dark">
              Offline — matches will run when connectivity returns.
            </p>
          )}

          {!matchLoading && matches && matches.length === 0 && (
            <p className="rounded-2xl border border-border bg-card p-5 text-muted">
              No strong matches yet. The case is searchable from every center now.
            </p>
          )}

          <div className="space-y-3">
            {matches?.map((c, i) => (
              <MatchCard
                key={c.case_id}
                candidate={c}
                query={query}
                language={language}
                rank={i + 1}
                defaultOpen={i === 0}
              />
            ))}
          </div>
        </section>
      )}

      <div className="flex flex-wrap gap-3">
        <a
          href="/intake"
          className="inline-flex items-center gap-2 rounded-2xl bg-saffron px-6 py-3 font-bold text-white shadow active:scale-95"
        >
          <X size={18} /> Register another
        </a>
        <a
          href="/review"
          className="inline-flex items-center gap-2 rounded-2xl border-2 border-border bg-card px-6 py-3 font-bold active:scale-95"
        >
          <SearchIcon size={18} /> Go to Search &amp; Match
        </a>
      </div>
    </div>
  );
}
