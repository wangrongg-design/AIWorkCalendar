"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { AuthUser } from "./types";

type AuthState = {
  token: string | null;
  user: AuthUser | null;
  hasHydrated: boolean;
  setSession: (token: string, user: AuthUser) => void;
  clearSession: () => void;
  setHasHydrated: (value: boolean) => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      hasHydrated: false,
      setSession: (token, user) => set({ token, user }),
      clearSession: () => set({ token: null, user: null }),
      setHasHydrated: (value) => set({ hasHydrated: value })
    }),
    {
      name: "work-calendar-ai-auth",
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      }
    }
  )
);

export function hasAnyRole(user: AuthUser | null, roles: string[]) {
  return Boolean(user?.roles.some((role) => roles.includes(role)));
}
