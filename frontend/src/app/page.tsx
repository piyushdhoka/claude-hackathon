"use client";
// HOME — the calm, ceremonial entry point. Live status (online/offline +
// pending-sync count), the two-pillar story (cross-center + offline-first), and
// big thumb-reachable quick entries to every screen.
import Link from "next/link";
import {
  UserPlus,
  Search,
  Map as MapIcon,
  ShieldCheck,
  ArrowRight,
  Network,
  CloudOff,
  Languages,
} from "lucide-react";
import { useApp } from "@/store/app";
import { useSync } from "@/lib/offline/hooks";

const TILES = [
  {
    href: "/intake",
    title: "Register a person",
    sub: "Lost or found — tap-only, no typing",
    icon: UserPlus,
    tone: "saffron",
  },
  {
    href: "/review",
    title: "Search & match",
    sub: "Find matches across every center",
    icon: Search,
    tone: "indigo",
  },
  {
    href: "/map",
    title: "Hotspot map",
    sub: "Where separations cluster · kiosk gaps",
    icon: MapIcon,
    tone: "teal",
  },
  {
    href: "/supervisor",
    title: "Supervisor",
    sub: "Confirm · reveal contact · audit",
    icon: ShieldCheck,
    tone: "rose",
  },
] as const;

const TONE: Record<string, { chip: string; ring: string }> = {
  saffron: { chip: "bg-saffron text-white", ring: "group-hover:ring-saffron/30" },
  indigo: { chip: "bg-indigo text-white", ring: "group-hover:ring-indigo/30" },
  teal: { chip: "bg-teal text-white", ring: "group-hover:ring-teal/30" },
  rose: { chip: "bg-rose text-white", ring: "group-hover:ring-rose/30" },
};

export default function HomePage() {
  const { center, role, online } = useApp();
  const { pending, lastSyncedAt } = useSync();

  return (
    <div className="space-y-7">
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-3xl border border-border bg-surface p-6 shadow-sm sm:p-9 animate-rise">
        {/* atmospheric corner glow */}
        <div
          className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full opacity-50 blur-2xl"
          style={{ background: "radial-gradient(circle, rgba(226,106,18,0.28), transparent 70%)" }}
        />
        <div className="relative">
          <span className="inline-flex items-center gap-2 rounded-full bg-indigo/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-indigo">
            Simhastha Kumbh Mela 2027
          </span>
          <h1 className="mt-4 max-w-2xl font-display text-3xl font-semibold leading-[1.08] tracking-tight sm:text-5xl">
            One registry,
            <span className="block text-saffron-dark">every center.</span>
          </h1>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted sm:text-base">
            A found person at one ghat becomes instantly searchable by a family at
            any other — built for phoneless, non-literate pilgrims, and it keeps
            working when the network does not.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href="/intake"
              className="inline-flex items-center gap-2 rounded-2xl bg-saffron px-6 py-3.5 text-base font-bold text-white shadow-md transition active:scale-95"
            >
              <UserPlus size={20} /> Register a person
            </Link>
            <Link
              href="/review"
              className="inline-flex items-center gap-2 rounded-2xl border border-border bg-surface px-5 py-3.5 text-base font-bold text-foreground/80 transition active:scale-95"
            >
              <Search size={18} /> Search registry
            </Link>
          </div>
        </div>
      </section>

      {/* ── Live status strip ────────────────────────────────────────── */}
      <section className="grid gap-3 sm:grid-cols-3 stagger">
        <StatusCard
          icon={online ? <Network size={18} /> : <CloudOff size={18} />}
          tone={online ? "teal" : "rose"}
          label={online ? "Network online" : "Working offline"}
          value={
            online
              ? pending > 0
                ? `${pending} change${pending === 1 ? "" : "s"} syncing`
                : lastSyncedAt
                  ? "All changes synced"
                  : "Ready"
              : pending > 0
                ? `${pending} change${pending === 1 ? "" : "s"} queued`
                : "Changes save on this device"
          }
        />
        <StatusCard
          icon={<ShieldCheck size={18} />}
          tone="indigo"
          label="Operator role"
          value={role === "supervisor" ? "Supervisor (PII reveal)" : "Operator"}
        />
        <StatusCard
          icon={<Languages size={18} />}
          tone="saffron"
          label="This center"
          value={center}
        />
      </section>

      {/* ── Quick entries ────────────────────────────────────────────── */}
      <section>
        <div className="mb-3 flex items-center gap-3">
          <h2 className="font-display text-lg font-semibold">Where to go</h2>
          <span className="river-rule flex-1" />
        </div>
        <div className="grid gap-3.5 sm:grid-cols-2 stagger">
          {TILES.map(({ href, title, sub, icon: Icon, tone }) => (
            <Link
              key={href}
              href={href}
              className={`group relative flex items-center gap-4 overflow-hidden rounded-3xl border border-border bg-surface p-5 shadow-sm ring-0 transition hover:shadow-md hover:ring-2 ${TONE[tone].ring}`}
            >
              <span
                className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl shadow-sm transition group-hover:scale-105 ${TONE[tone].chip}`}
              >
                <Icon size={26} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-lg font-bold leading-tight">{title}</span>
                <span className="block text-sm text-muted">{sub}</span>
              </span>
              <ArrowRight
                size={20}
                className="shrink-0 text-muted/60 transition group-hover:translate-x-1 group-hover:text-foreground"
              />
            </Link>
          ))}
        </div>
      </section>

      {/* ── Pillars footnote ─────────────────────────────────────────── */}
      <section className="grid gap-3 sm:grid-cols-2">
        <Pillar
          title="Cross-center, by design"
          body="Every report joins one shared registry. The match engine searches across all centers at once — the gap that today makes a found elder invisible to a searching family."
        />
        <Pillar
          title="Offline-first, on purpose"
          body="Networks die on snan days when volume spikes. Intake, search and matching all run on-device against a local mirror, then sync the moment connectivity returns."
        />
      </section>
    </div>
  );
}

function StatusCard({
  icon,
  tone,
  label,
  value,
}: {
  icon: React.ReactNode;
  tone: "teal" | "rose" | "indigo" | "saffron";
  label: string;
  value: string;
}) {
  const toneMap: Record<string, string> = {
    teal: "bg-teal/10 text-teal",
    rose: "bg-rose/10 text-rose",
    indigo: "bg-indigo/10 text-indigo",
    saffron: "bg-saffron/12 text-saffron-dark",
  };
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${toneMap[tone]}`}>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] font-bold uppercase tracking-wide text-muted">
          {label}
        </span>
        <span className="block truncate text-sm font-bold">{value}</span>
      </span>
    </div>
  );
}

function Pillar({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-3xl border border-border bg-surface-2/60 p-5">
      <h3 className="font-display text-base font-semibold">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">{body}</p>
    </div>
  );
}
