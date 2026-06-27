// Global app state: operator role, selected center, pilgrim's language, online status.
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Role } from "@/lib/types";

interface AppState {
  role: Role;
  center: string; // the center this device/operator is stationed at
  language: string; // pilgrim's selected language code (e.g. "hi")
  online: boolean;
  setRole: (r: Role) => void;
  setCenter: (c: string) => void;
  setLanguage: (l: string) => void;
  setOnline: (o: boolean) => void;
}

export const useApp = create<AppState>()(
  persist(
    (set) => ({
      role: "operator",
      center: "Ramkund Kho-Ya-Paya Kendra",
      language: "hi",
      online: true,
      setRole: (role) => set({ role }),
      setCenter: (center) => set({ center }),
      setLanguage: (language) => set({ language }),
      setOnline: (online) => set({ online }),
    }),
    { name: "setu-app" }
  )
);
