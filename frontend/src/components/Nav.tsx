"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import { useApp } from "@/store/app";
import { Search, UserPlus, Map, ShieldCheck, Wifi, WifiOff } from "lucide-react";

const links = [
  { href: "/intake", label: "Intake", icon: UserPlus },
  { href: "/review", label: "Search & Match", icon: Search },
  { href: "/map", label: "Hotspot Map", icon: Map },
  { href: "/supervisor", label: "Supervisor", icon: ShieldCheck },
];

export function Nav() {
  const pathname = usePathname();
  const { role, center, online, setRole, setOnline } = useApp();

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-card/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-saffron font-bold text-white">
            से
          </span>
          <div className="leading-tight">
            <div className="text-lg font-bold">Setu</div>
            <div className="text-[11px] text-muted">one registry, every center</div>
          </div>
        </Link>

        <nav className="ml-4 hidden gap-1 md:flex">
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={clsx(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition",
                pathname?.startsWith(href)
                  ? "bg-saffron/10 text-saffron-dark"
                  : "text-muted hover:bg-background"
              )}
            >
              <Icon size={16} /> {label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="hidden text-muted sm:inline">{center}</span>
          {/* Demo toggle: simulate snan-day network loss */}
          <button
            onClick={() => setOnline(!online)}
            className={clsx(
              "flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold",
              online ? "bg-teal/10 text-teal" : "bg-rose/10 text-rose"
            )}
            title="Toggle network (demo)"
          >
            {online ? <Wifi size={14} /> : <WifiOff size={14} />}
            {online ? "Online" : "Offline"}
          </button>
          <button
            onClick={() => setRole(role === "operator" ? "supervisor" : "operator")}
            className="rounded-full border border-border px-3 py-1 text-xs font-semibold"
            title="Switch role"
          >
            {role}
          </button>
        </div>
      </div>
    </header>
  );
}
