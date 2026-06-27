"use client";
// Navigation chrome for Setu, mobile-first.
//
//   <TopBar/>      — slim sticky header: brand seal, always-visible sync status
//                    (offline + pending count), role switch, demo network toggle.
//                    On >=md it also shows the inline section links.
//   <BottomTabs/>  — fixed thumb-reach tab bar for phones/tablets (hidden >=md),
//                    with a raised central "Register" action. Mounts the global
//                    sync engine so the offline outbox drains app-wide.
//
// Offline-first + cross-center are the two pillars; this chrome keeps the network
// state and the role (which gates PII reveal) reachable one-handed at all times.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import { useApp } from "@/store/app";
import {
  Search,
  UserPlus,
  Map as MapIcon,
  ShieldCheck,
  Home,
  Wifi,
  WifiOff,
  UserCog,
} from "lucide-react";
import {
  SwRegistrar,
  SyncProvider,
  SyncBadge,
} from "@/lib/offline/SyncProvider";

const LINKS = [
  { href: "/", label: "Home", icon: Home, exact: true },
  { href: "/intake", label: "Register", icon: UserPlus },
  { href: "/review", label: "Search", icon: Search },
  { href: "/map", label: "Map", icon: MapIcon },
  { href: "/supervisor", label: "Supervisor", icon: ShieldCheck },
];

function isActive(pathname: string | null, href: string, exact?: boolean) {
  if (!pathname) return false;
  return exact ? pathname === href : pathname.startsWith(href);
}

/* ─────────────────────────────── Top bar ─────────────────────────────── */
export function TopBar() {
  const pathname = usePathname();
  const { role, center, online, setRole, setOnline } = useApp();

  return (
    <header className="sticky top-0 z-50">
      <div
        className="border-b border-border/70 bg-surface/85 backdrop-blur-md"
        style={{ paddingTop: "var(--safe-top)" }}
      >
        <div className="page-pad mx-auto flex h-14 max-w-6xl items-center gap-3">
          {/* Brand seal */}
          <Link href="/" className="group flex items-center gap-2.5">
            <span className="relative grid h-9 w-9 place-items-center overflow-hidden rounded-xl bg-saffron text-base font-bold text-white shadow-sm">
              <span className="relative z-10">से</span>
              <span className="absolute inset-0 bg-gradient-to-br from-white/25 to-transparent" />
            </span>
            <span className="leading-none">
              <span className="block font-display text-xl font-semibold tracking-tight">
                Setu
              </span>
              <span className="block text-[10px] font-medium uppercase tracking-[0.16em] text-muted">
                one registry · every center
              </span>
            </span>
          </Link>

          {/* Desktop inline nav */}
          <nav className="ml-5 hidden items-center gap-1 md:flex">
            {LINKS.filter((l) => l.href !== "/").map(({ href, label, icon: Icon, exact }) => {
              const active = isActive(pathname, href, exact);
              return (
                <Link
                  key={href}
                  href={href}
                  className={clsx(
                    "flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold transition",
                    active
                      ? "bg-saffron/12 text-saffron-dark"
                      : "text-muted hover:bg-surface-2 hover:text-foreground"
                  )}
                >
                  <Icon size={16} /> {label}
                </Link>
              );
            })}
          </nav>

          {/* Right controls */}
          <div className="ml-auto flex items-center gap-2">
            <SyncBadge className="hidden md:inline-flex" />
            <button
              onClick={() => setOnline(!online)}
              title="Toggle network (demo · simulate snan-day blackout)"
              className={clsx(
                "flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-bold transition active:scale-95",
                online
                  ? "bg-teal/12 text-teal"
                  : "bg-rose/12 text-rose ring-1 ring-rose/30"
              )}
            >
              {online ? <Wifi size={15} /> : <WifiOff size={15} />}
              <span className="hidden sm:inline">{online ? "Online" : "Offline"}</span>
            </button>
            <button
              onClick={() => setRole(role === "operator" ? "supervisor" : "operator")}
              title="Switch role (supervisor can reveal protected contacts)"
              className={clsx(
                "flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-bold capitalize transition active:scale-95",
                role === "supervisor"
                  ? "bg-indigo/12 text-indigo"
                  : "border border-border bg-surface text-foreground/80"
              )}
            >
              <UserCog size={15} />
              <span className="hidden sm:inline">{role}</span>
            </button>
          </div>
        </div>

        {/* Center context strip (mobile) + always-visible sync status */}
        <div className="page-pad mx-auto flex max-w-6xl items-center justify-between gap-2 pb-1.5 md:hidden">
          <span className="truncate text-[11px] font-medium text-muted">
            {center}
          </span>
          <SyncBadge />
        </div>
      </div>

      {/* Signature river thread */}
      <div className="river-thread flow-thread h-[3px] w-full" />

      {/* Global offline engine — drains the outbox app-wide on reconnect. */}
      <SwRegistrar />
      <SyncProvider />
    </header>
  );
}

/* ───────────────────────────── Bottom tabs ───────────────────────────── */
export function BottomTabs() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 md:hidden"
      style={{ paddingBottom: "var(--safe-bottom)" }}
      aria-label="Primary"
    >
      <div className="border-t border-border/70 bg-surface/92 backdrop-blur-md">
        <ul className="mx-auto grid max-w-md grid-cols-5 items-end px-1.5 pb-1 pt-1.5">
          {LINKS.map(({ href, label, icon: Icon, exact }) => {
            const active = isActive(pathname, href, exact);
            const isRegister = href === "/intake";

            if (isRegister) {
              return (
                <li key={href} className="flex justify-center">
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className="group -mt-6 flex flex-col items-center gap-1"
                  >
                    <span
                      className={clsx(
                        "grid h-14 w-14 place-items-center rounded-2xl text-white shadow-lg transition active:scale-95",
                        "bg-saffron",
                        active && "ring-4 ring-saffron/25"
                      )}
                    >
                      <Icon size={26} strokeWidth={2.2} />
                    </span>
                    <span
                      className={clsx(
                        "text-[10px] font-bold",
                        active ? "text-saffron-dark" : "text-muted"
                      )}
                    >
                      {label}
                    </span>
                  </Link>
                </li>
              );
            }

            return (
              <li key={href} className="flex justify-center">
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={clsx(
                    "flex min-h-[3rem] min-w-[3.25rem] flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 transition",
                    active ? "text-saffron-dark" : "text-muted active:bg-surface-2"
                  )}
                >
                  <span
                    className={clsx(
                      "grid h-7 w-9 place-items-center rounded-lg transition",
                      active && "bg-saffron/12"
                    )}
                  >
                    <Icon size={21} strokeWidth={active ? 2.4 : 2} />
                  </span>
                  <span className="text-[10px] font-bold leading-none">{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
