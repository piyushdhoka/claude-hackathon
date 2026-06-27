import Link from "next/link";
import { UserPlus, Search, Map, ShieldCheck } from "lucide-react";

const tiles = [
  {
    href: "/intake",
    title: "Register a person",
    sub: "Lost or found — tap-only, no typing needed",
    icon: UserPlus,
    color: "bg-saffron",
  },
  {
    href: "/review",
    title: "Search & match",
    sub: "Find matches across every center",
    icon: Search,
    color: "bg-indigo",
  },
  {
    href: "/map",
    title: "Hotspot map",
    sub: "Where separations cluster · kiosk gaps",
    icon: Map,
    color: "bg-teal",
  },
  {
    href: "/supervisor",
    title: "Supervisor",
    sub: "Confirm matches · reveal contact · audit",
    icon: ShieldCheck,
    color: "bg-rose",
  },
];

export default function Home() {
  return (
    <div className="space-y-8">
      <section className="rounded-3xl bg-card p-8 shadow-sm">
        <h1 className="text-3xl font-bold tracking-tight">
          One registry, every center.
        </h1>
        <p className="mt-2 max-w-2xl text-muted">
          A found person at one center becomes instantly searchable by a family at
          any other — offline-capable, multilingual, and designed for phoneless,
          non-literate pilgrims.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        {tiles.map(({ href, title, sub, icon: Icon, color }) => (
          <Link
            key={href}
            href={href}
            className="group flex items-center gap-4 rounded-2xl border border-border bg-card p-6 shadow-sm transition hover:shadow-md"
          >
            <span className={`grid h-14 w-14 place-items-center rounded-2xl ${color} text-white`}>
              <Icon size={26} />
            </span>
            <span>
              <span className="block text-lg font-bold">{title}</span>
              <span className="block text-sm text-muted">{sub}</span>
            </span>
          </Link>
        ))}
      </section>
    </div>
  );
}
